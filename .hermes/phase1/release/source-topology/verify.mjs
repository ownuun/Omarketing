#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SNAPSHOT_SCHEMA = 'omarketing.release-source-topology.snapshot.v1'
export const CANONICAL_UPSTREAM_URL =
  'https://github.com/Comfy-Org/ComfyUI_frontend'
export const EXIT_CODES = Object.freeze({
  PASS: 0,
  BLOCKED: 2,
  INPUT_ERROR: 64
})

const REQUIRED_PACKAGE_DESCRIPTION =
  'Omarketing front end, a modified ComfyUI Frontend distribution for marketing workflows'

const BRANDING_PATHS = Object.freeze([
  'index.html',
  'manifest.json',
  'package.json',
  'src/components/helpcenter/HelpCenterMenuContent.vue',
  'src/components/sidebar/ComfyMenuButton.vue',
  'src/composables/useBrowserTabTitle.test.ts',
  'src/composables/useBrowserTabTitle.ts',
  'src/composables/useExternalLink.ts',
  'src/config.ts'
])

const UPSTREAM_LINKS = Object.freeze({
  package_homepage: new Set(['https://comfy.org', 'https://www.comfy.org']),
  package_repository: new Set([CANONICAL_UPSTREAM_URL]),
  external_frontend_source: new Set([CANONICAL_UPSTREAM_URL]),
  external_issues: new Set([
    'https://github.com/Comfy-Org/ComfyUI/issues',
    `${CANONICAL_UPSTREAM_URL}/issues`
  ]),
  help_source: new Set([
    'https://github.com/Comfy-Org/ComfyUI',
    CANONICAL_UPSTREAM_URL
  ])
})

const emptyControl = () => ({
  state: 'unverified',
  origin_url: null,
  package_name: null,
  homepage_url: null,
  source_url: null,
  issues_url: null,
  evidence: null
})

const splitLines = (value) => {
  const withoutFinalNewline = value.replace(/\r?\n$/, '')
  return withoutFinalNewline === '' ? [] : withoutFinalNewline.split(/\r?\n/)
}

const shellQuote = (value) => {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}

const sanitizeUrl = (value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (trimmed === '') return trimmed

  try {
    const url = new URL(trimmed)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return trimmed.replace(/^[^/@\s]+@(?=[^:]+:)/, '')
  }
}

export const normalizeUrl = (value) => {
  const sanitized = sanitizeUrl(value)
  if (typeof sanitized !== 'string' || sanitized === '') return null

  try {
    const url = new URL(sanitized)
    const pathname = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '')
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname}`
  } catch {
    return sanitized.replace(/\/+$/, '').replace(/\.git$/i, '')
  }
}

const runGit = (repo, args, { urlOutput = false } = {}) => {
  const result = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8'
  })

  if (result.error) throw result.error

  const mapLine = urlOutput ? sanitizeUrl : (line) => line
  return {
    command: `git -C "$REPO" ${args.map(shellQuote).join(' ')}`,
    exit_code: result.status ?? 70,
    stdout: splitLines(result.stdout ?? '').map(mapLine),
    stderr: splitLines(result.stderr ?? '')
  }
}

const readOptional = async (repo, relativePath) => {
  try {
    return await readFile(path.join(repo, relativePath), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

const captureRemote = (repo, name, commands) => {
  const fetch = runGit(
    repo,
    ['config', '--local', '--get-all', `remote.${name}.url`],
    { urlOutput: true }
  )
  const explicitPush = runGit(
    repo,
    ['config', '--local', '--get-all', `remote.${name}.pushurl`],
    { urlOutput: true }
  )
  const effectivePush = runGit(
    repo,
    ['remote', 'get-url', '--push', '--all', name],
    { urlOutput: true }
  )

  commands.push(fetch, explicitPush, effectivePush)

  return {
    fetch_urls: fetch.exit_code === 0 ? fetch.stdout : [],
    explicit_push_urls: explicitPush.exit_code === 0 ? explicitPush.stdout : [],
    effective_push_urls:
      effectivePush.exit_code === 0 ? effectivePush.stdout : []
  }
}

const extractAttribute = (tag, name) => {
  if (typeof tag !== 'string') return null
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`))
  return match?.[1] ?? null
}

const extractMatch = (text, pattern) => {
  if (typeof text !== 'string') return null
  return text.match(pattern)?.[1] ?? null
}

const extractStaticUrls = (text) => {
  const block = extractMatch(
    text,
    /const\s+staticUrls\s*=\s*\{([\s\S]*?)\n\s*\}/
  )
  if (block === null) return {}

  const urls = {}
  for (const match of block.matchAll(
    /\b([A-Za-z][A-Za-z0-9_]*)\s*:\s*["']([^"']+)["']/g
  )) {
    urls[match[1]] = sanitizeUrl(match[2])
  }
  return urls
}

const extractHelpSourceKey = (text) => {
  if (typeof text !== 'string') return null
  return (
    text.match(
      /key:\s*["']github["'][\s\S]{0,2500}?openExternalLink\(staticUrls\.([A-Za-z][A-Za-z0-9_]*)\)/
    )?.[1] ?? null
  )
}

const packageRepositoryUrl = (repository) => {
  if (typeof repository === 'string') return sanitizeUrl(repository)
  if (repository && typeof repository.url === 'string') {
    return sanitizeUrl(repository.url)
  }
  return null
}

const parseChangedPaths = (lines) =>
  lines
    .map((line) => line.slice(3))
    .map((entry) => entry.split(' -> ').at(-1))
    .filter(Boolean)
    .sort()

const loadControl = async (controlPath) => {
  if (controlPath === undefined) return emptyControl()
  return JSON.parse(await readFile(controlPath, 'utf8'))
}

export const captureSnapshot = async ({
  repo,
  observedAt,
  scenario = 'current',
  control = emptyControl()
}) => {
  assertObservedAt(observedAt)

  const commands = []
  const origin = captureRemote(repo, 'origin', commands)
  const upstream = captureRemote(repo, 'upstream', commands)
  const status = runGit(repo, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    ...BRANDING_PATHS
  ])
  commands.push(status)

  const [
    indexHtml,
    manifestText,
    packageText,
    sidebar,
    tabTitle,
    config,
    links,
    help
  ] = await Promise.all([
    readOptional(repo, 'index.html'),
    readOptional(repo, 'manifest.json'),
    readOptional(repo, 'package.json'),
    readOptional(repo, 'src/components/sidebar/ComfyMenuButton.vue'),
    readOptional(repo, 'src/composables/useBrowserTabTitle.ts'),
    readOptional(repo, 'src/config.ts'),
    readOptional(repo, 'src/composables/useExternalLink.ts'),
    readOptional(repo, 'src/components/helpcenter/HelpCenterMenuContent.vue')
  ])

  const manifest = manifestText === null ? {} : JSON.parse(manifestText)
  const packageJson = packageText === null ? {} : JSON.parse(packageText)
  const staticUrls = extractStaticUrls(links)
  const helpSourceKey = extractHelpSourceKey(help)
  const splashTag =
    indexHtml?.match(/<[^>]*\bid=["']splash-loader["'][^>]*>/)?.[0] ?? null
  const logoTag = sidebar?.match(/<ComfyLogo\b[\s\S]*?>/)?.[0] ?? null

  return {
    schema_version: SNAPSHOT_SCHEMA,
    scenario,
    observed_at: observedAt,
    control,
    git: { origin, upstream },
    branding: {
      index_title: extractMatch(indexHtml, /<title>\s*([^<]+?)\s*<\/title>/),
      splash_aria_label: extractAttribute(splashTag, 'aria-label'),
      app_title: extractMatch(config, /\bapp_title:\s*["']([^"']+)["']/),
      tab_default_title: extractMatch(
        tabTitle,
        /const\s+DEFAULT_TITLE\s*=\s*["']([^"']+)["']/
      ),
      tab_title_suffix: extractMatch(
        tabTitle,
        /const\s+TITLE_SUFFIX\s*=\s*["']([^"']+)["']/
      ),
      sidebar_logo_component: logoTag === null ? null : 'ComfyLogo',
      sidebar_logo_alt: extractAttribute(logoTag, 'alt'),
      manifest: {
        name: manifest.name ?? null,
        short_name: manifest.short_name ?? null,
        description: manifest.description ?? null
      },
      package: {
        name: packageJson.name ?? null,
        description: packageJson.description ?? null,
        homepage: sanitizeUrl(packageJson.homepage ?? null),
        repository: packageRepositoryUrl(packageJson.repository)
      },
      source_links: {
        package_homepage: sanitizeUrl(packageJson.homepage ?? null),
        package_repository: packageRepositoryUrl(packageJson.repository),
        external_frontend_source: staticUrls.githubFrontend ?? null,
        external_issues: staticUrls.githubIssues ?? null,
        help_source:
          helpSourceKey === null ? null : (staticUrls[helpSourceKey] ?? null)
      }
    },
    observation: {
      changed_branding_paths: parseChangedPaths(status.stdout),
      commands
    }
  }
}

const assertObservedAt = (value) => {
  if (
    typeof value !== 'string' ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error(
      '--observed-at must be an RFC 3339 timestamp with a timezone'
    )
  }
}

const assertSnapshot = (snapshot) => {
  if (!snapshot || snapshot.schema_version !== SNAPSHOT_SCHEMA) {
    throw new Error(`snapshot schema must be ${SNAPSHOT_SCHEMA}`)
  }
  if (typeof snapshot.scenario !== 'string' || snapshot.scenario === '') {
    throw new Error('snapshot scenario must be a non-empty string')
  }
  assertObservedAt(snapshot.observed_at)
  if (!snapshot.git?.origin || !snapshot.git?.upstream) {
    throw new Error(
      'snapshot must contain origin and upstream Git observations'
    )
  }
  if (!snapshot.branding?.manifest || !snapshot.branding?.package) {
    throw new Error(
      'snapshot must contain manifest and package branding observations'
    )
  }
}

const valueText = (value) => {
  if (Array.isArray(value))
    return value.length === 0 ? '<none>' : value.join(',')
  if (value === null || value === undefined || value === '') return '<missing>'
  return String(value)
}

const addCheck = (checks, status, id, actual, expected, detail) => {
  checks.push({ status, id, actual: valueText(actual), expected, detail })
}

const exactCheck = (checks, id, actual, expected) => {
  addCheck(
    checks,
    actual === expected ? 'PASS' : 'BLOCKED',
    id,
    actual,
    expected,
    actual === expected ? 'exact match' : 'static name mismatch'
  )
}

const normalizedList = (values) =>
  Array.isArray(values) ? values.map(normalizeUrl).filter(Boolean) : []

const sameUrl = (left, right) =>
  normalizeUrl(left) !== null && normalizeUrl(left) === normalizeUrl(right)

const isCanonicalUpstream = (value) => sameUrl(value, CANONICAL_UPSTREAM_URL)

const hasVerifiedControl = (control) =>
  control?.state === 'verified' &&
  [
    control.origin_url,
    control.package_name,
    control.homepage_url,
    control.source_url,
    control.issues_url,
    control.evidence
  ].every((value) => typeof value === 'string' && value.trim() !== '')

const sourceSummary = (sourceLinks) =>
  Object.keys(UPSTREAM_LINKS)
    .map((key) => `${key}=${valueText(sourceLinks?.[key])}`)
    .join(';')

const controlledSourceExpectations = (control) => ({
  package_homepage: control.homepage_url,
  package_repository: control.origin_url,
  external_frontend_source: control.source_url,
  external_issues: control.issues_url,
  help_source: control.source_url
})

const upstreamLinksArePreserved = (sourceLinks) =>
  Object.entries(UPSTREAM_LINKS).every(([key, allowed]) => {
    const normalized = normalizeUrl(sourceLinks?.[key])
    return normalized !== null && allowed.has(normalized)
  })

const controlledLinksMatch = (sourceLinks, control) => {
  const expected = controlledSourceExpectations(control)
  return Object.entries(expected).every(([key, value]) =>
    sameUrl(sourceLinks?.[key], value)
  )
}

export const verifySnapshot = (snapshot) => {
  assertSnapshot(snapshot)

  const checks = []
  const control = snapshot.control ?? emptyControl()
  const controlVerified = hasVerifiedControl(control)
  const originFetch = normalizedList(snapshot.git.origin.fetch_urls)
  const originPush = normalizedList(snapshot.git.origin.effective_push_urls)
  const upstreamFetch = normalizedList(snapshot.git.upstream.fetch_urls)
  const upstreamPush = normalizedList(snapshot.git.upstream.effective_push_urls)
  const branding = snapshot.branding

  addCheck(
    checks,
    controlVerified ? 'PASS' : 'DEFERRED',
    'control.omarketing_destinations',
    control.state,
    'verified local control assertion with evidence reference',
    controlVerified
      ? 'local assertion present; no external URL check performed'
      : 'control is unverified; release remains blocked'
  )

  const originFetchPass =
    controlVerified &&
    originFetch.length === 1 &&
    sameUrl(originFetch[0], control.origin_url)
  addCheck(
    checks,
    originFetchPass ? 'PASS' : 'BLOCKED',
    'git.origin.fetch_controlled',
    originFetch,
    controlVerified
      ? normalizeUrl(control.origin_url)
      : 'verified Omarketing origin',
    originFetch.some(isCanonicalUpstream)
      ? 'origin currently has the canonical Comfy upstream role'
      : originFetchPass
        ? 'origin fetch is the asserted controlled Omarketing repository'
        : 'origin is absent or does not match asserted control'
  )

  const originPushPass =
    controlVerified &&
    originPush.length > 0 &&
    originPush.every((url) => sameUrl(url, control.origin_url))
  addCheck(
    checks,
    originPushPass ? 'PASS' : 'BLOCKED',
    'git.origin.push_controlled',
    originPush,
    controlVerified
      ? normalizeUrl(control.origin_url)
      : 'verified Omarketing origin',
    originPush.some(isCanonicalUpstream)
      ? 'origin push currently targets the canonical Comfy upstream'
      : originPushPass
        ? 'origin push is confined to the asserted controlled repository'
        : 'origin has no controlled push target'
  )

  const upstreamFetchPass =
    upstreamFetch.length === 1 && isCanonicalUpstream(upstreamFetch[0])
  addCheck(
    checks,
    upstreamFetchPass ? 'PASS' : 'BLOCKED',
    'git.upstream.fetch_canonical',
    upstreamFetch,
    normalizeUrl(CANONICAL_UPSTREAM_URL),
    upstreamFetchPass
      ? 'upstream fetch is canonical'
      : 'upstream remote is missing or not canonical'
  )

  const upstreamPushPass = upstreamFetchPass && upstreamPush.length === 0
  addCheck(
    checks,
    upstreamPushPass ? 'PASS' : 'BLOCKED',
    'git.upstream.push_absent',
    upstreamPush,
    '<none>',
    !upstreamFetchPass
      ? 'upstream remote is missing or invalid'
      : upstreamPushPass
        ? 'no effective upstream push URL is present'
        : 'an effective upstream push URL is present; absent pushurl fallback is unsafe'
  )

  exactCheck(checks, 'branding.index_title', branding.index_title, 'Omarketing')
  exactCheck(
    checks,
    'branding.splash_accessible_name',
    branding.splash_aria_label,
    'Loading Omarketing'
  )
  exactCheck(checks, 'branding.app_title', branding.app_title, 'Omarketing')
  exactCheck(
    checks,
    'branding.tab_default_title',
    branding.tab_default_title,
    'Omarketing'
  )
  exactCheck(
    checks,
    'branding.tab_title_suffix',
    branding.tab_title_suffix,
    ' - Omarketing'
  )
  exactCheck(
    checks,
    'branding.sidebar_accessible_name',
    branding.sidebar_logo_alt,
    'Omarketing Logo'
  )
  exactCheck(
    checks,
    'branding.logo_component_preserved',
    branding.sidebar_logo_component,
    'ComfyLogo'
  )
  exactCheck(
    checks,
    'branding.manifest_name',
    branding.manifest.name,
    'Omarketing'
  )
  exactCheck(
    checks,
    'branding.manifest_short_name',
    branding.manifest.short_name,
    'Omarketing'
  )

  const manifestDescriptionPass =
    typeof branding.manifest.description === 'string' &&
    branding.manifest.description.startsWith('Omarketing') &&
    !/official\s+comfyui/i.test(branding.manifest.description)
  addCheck(
    checks,
    manifestDescriptionPass ? 'PASS' : 'BLOCKED',
    'branding.manifest_description',
    branding.manifest.description,
    'Omarketing-prefixed non-official description',
    manifestDescriptionPass
      ? 'name-only product identity is explicit'
      : 'manifest description retains or implies upstream primary identity'
  )

  exactCheck(
    checks,
    'branding.package_description',
    branding.package.description,
    REQUIRED_PACKAGE_DESCRIPTION
  )

  const packageNamePass =
    controlVerified && branding.package.name === control.package_name
  const packageNameSafelyDeferred =
    !controlVerified && branding.package.name === '@comfyorg/comfyui-frontend'
  addCheck(
    checks,
    packageNamePass
      ? 'PASS'
      : packageNameSafelyDeferred
        ? 'DEFERRED'
        : 'BLOCKED',
    'branding.package_name_controlled',
    branding.package.name,
    controlVerified ? control.package_name : 'verified controlled package name',
    packageNamePass
      ? 'package name matches the asserted controlled namespace'
      : packageNameSafelyDeferred
        ? 'upstream name is retained instead of claiming an uncontrolled namespace; release remains blocked'
        : 'package name is neither asserted-controlled nor the unchanged upstream safe state'
  )

  let sourceUrlState
  if (controlVerified && controlledLinksMatch(branding.source_links, control)) {
    sourceUrlState = 'CONTROLLED'
    addCheck(
      checks,
      'PASS',
      'source.links_control_state',
      sourceSummary(branding.source_links),
      sourceSummary(controlledSourceExpectations(control)),
      'all release source destinations match the asserted controlled values'
    )
  } else if (
    !controlVerified &&
    upstreamLinksArePreserved(branding.source_links)
  ) {
    sourceUrlState = 'UPSTREAM_PRESERVED_CONTROL_UNVERIFIED'
    addCheck(
      checks,
      'DEFERRED',
      'source.links_control_state',
      sourceSummary(branding.source_links),
      'verified controlled Omarketing destinations',
      'safe upstream retention avoids a false ownership claim; release remains blocked'
    )
  } else {
    sourceUrlState = controlVerified
      ? 'CONTROLLED_MISMATCH'
      : 'UNVERIFIED_DESTINATION'
    addCheck(
      checks,
      'BLOCKED',
      'source.links_control_state',
      sourceSummary(branding.source_links),
      controlVerified
        ? sourceSummary(controlledSourceExpectations(control))
        : 'unchanged allowlisted upstream destinations',
      controlVerified
        ? 'one or more source destinations do not match asserted control'
        : 'an unverified destination would imply unsupported ownership'
    )
  }

  const blockers = checks.filter((check) => check.status !== 'PASS').length
  const exitCode = blockers === 0 ? EXIT_CODES.PASS : EXIT_CODES.BLOCKED
  const verdict =
    blockers > 0
      ? 'BLOCKED'
      : snapshot.scenario.includes('synthetic')
        ? 'PASS_SYNTHETIC'
        : 'LOCAL_PASS'

  return {
    snapshot,
    checks,
    sourceUrlState,
    blockers,
    exitCode,
    verdict
  }
}

export const renderResult = (result) => {
  const changedPaths = result.snapshot.observation?.changed_branding_paths ?? []
  const commands = result.snapshot.observation?.commands ?? []
  const lines = [
    'OMARKETING_RELEASE_SOURCE_TOPOLOGY_V1',
    `scenario=${result.snapshot.scenario}`,
    `observed_at=${result.snapshot.observed_at}`,
    `observed_branding_changes=${changedPaths.length === 0 ? '<none>' : changedPaths.join(',')}`,
    `verdict=${result.verdict}`,
    `source_url_state=${result.sourceUrlState}`
  ]

  for (const command of commands) {
    lines.push(`command_exit=${command.exit_code}|${command.command}`)
  }

  for (const check of result.checks) {
    lines.push(
      `check=${check.status}|${check.id}|actual=${JSON.stringify(check.actual)}|expected=${JSON.stringify(check.expected)}|detail=${JSON.stringify(check.detail)}`
    )
  }

  lines.push(`blockers=${result.blockers}`, `exit_code=${result.exitCode}`)
  return `${lines.join('\n')}\n`
}

const parseOptions = (args) => {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (!name.startsWith('--')) throw new Error(`unexpected argument: ${name}`)
    if (Object.hasOwn(options, name))
      throw new Error(`duplicate option: ${name}`)
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for ${name}`)
    }
    options[name] = value
    index += 1
  }
  return options
}

const assertOnlyOptions = (options, allowed) => {
  for (const name of Object.keys(options)) {
    if (!allowed.has(name)) throw new Error(`unknown option: ${name}`)
  }
}

const usage =
  'usage: node verify.mjs capture --repo <path> --observed-at <RFC3339> [--scenario <name>] [--control <json>]\n' +
  '       node verify.mjs verify --input <snapshot.json>\n'

export const runCli = async (
  args,
  { stdout = process.stdout, stderr = process.stderr } = {}
) => {
  try {
    const [command, ...rest] = args
    if (command === 'capture') {
      const options = parseOptions(rest)
      assertOnlyOptions(
        options,
        new Set(['--repo', '--observed-at', '--scenario', '--control'])
      )
      if (!options['--repo'] || !options['--observed-at']) {
        throw new Error('capture requires --repo and --observed-at')
      }
      const snapshot = await captureSnapshot({
        repo: path.resolve(options['--repo']),
        observedAt: options['--observed-at'],
        scenario: options['--scenario'] ?? 'current',
        control: await loadControl(options['--control'])
      })
      stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`)
      return EXIT_CODES.PASS
    }

    if (command === 'verify') {
      const options = parseOptions(rest)
      assertOnlyOptions(options, new Set(['--input']))
      if (!options['--input']) throw new Error('verify requires --input')
      const snapshot = JSON.parse(await readFile(options['--input'], 'utf8'))
      const result = verifySnapshot(snapshot)
      stdout.write(renderResult(result))
      return result.exitCode
    }

    stderr.write(usage)
    return EXIT_CODES.INPUT_ERROR
  } catch (error) {
    stderr.write(
      `INPUT_ERROR ${error instanceof Error ? error.message : String(error)}\n`
    )
    return EXIT_CODES.INPUT_ERROR
  }
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isMain) process.exitCode = await runCli(process.argv.slice(2))
