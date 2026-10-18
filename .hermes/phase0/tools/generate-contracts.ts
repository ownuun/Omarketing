/**
 * Omarketing contract generator.
 *
 * Reads exactly two JSON Schemas and emits exactly two `*.generated.ts` runtime
 * Zod parsers plus inferred readonly types. Publishes both outputs or neither.
 *
 * Contract: `.hermes/phase0/contracts/core-file-allowlist.md`
 *   - "Contract generator (CR-1)"
 *   - "Allowed additive frontend extension files" (generated-file header rules)
 *
 * Run: `pnpm exec tsx .hermes/phase0/tools/generate-contracts.ts`
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  renameSync,
  rmSync,
  unlinkSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GENERATOR_VERSION = '1.0.0'
const SUPPORTED_KEYWORD_MAP_VERSION = '1'

const HERE = dirname(fileURLToPath(import.meta.url))
/** `.hermes/phase0/tools` -> repository root */
const REPO_ROOT = resolve(HERE, '..', '..', '..')

export type KeywordCategory =
  | 'annotation'
  | 'validation'
  | 'applicator'
  | 'reference'

/**
 * Fixed supported-keyword map. Every keyword encountered during traversal must
 * appear here. Anything absent fails the run before either output is written.
 */
export const SUPPORTED_KEYWORDS: Readonly<Record<string, KeywordCategory>> =
  Object.freeze({
    // annotation: no runtime effect
    $schema: 'annotation',
    title: 'annotation',
    description: 'annotation',
    $comment: 'annotation',
    // validation
    type: 'validation',
    const: 'validation',
    enum: 'validation',
    format: 'validation',
    pattern: 'validation',
    minLength: 'validation',
    maxLength: 'validation',
    minimum: 'validation',
    maximum: 'validation',
    minProperties: 'validation',
    required: 'validation',
    additionalProperties: 'validation',
    // applicator
    properties: 'applicator',
    propertyNames: 'applicator',
    patternProperties: 'applicator',
    allOf: 'applicator',
    anyOf: 'applicator',
    not: 'applicator',
    if: 'applicator',
    then: 'applicator',
    else: 'applicator',
    // reference
    $ref: 'reference',
    $defs: 'reference'
  })

export class UnsupportedKeywordError extends Error {
  constructor(
    readonly keyword: string,
    readonly pointer: string
  ) {
    super(
      `Unsupported JSON Schema keyword "${keyword}" at ${pointer}. ` +
        `Extend SUPPORTED_KEYWORDS deliberately and re-review the contract; ` +
        `silently ignoring it would weaken the generated parser.`
    )
    this.name = 'UnsupportedKeywordError'
  }
}

type Json = Record<string, unknown>

/** Walks every subschema and rejects any keyword outside the supported map. */
export function assertSupportedKeywords(node: unknown, pointer = '#'): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => assertSupportedKeywords(item, `${pointer}/${i}`))
    return
  }
  if (typeof node !== 'object' || node === null) return

  for (const [key, value] of Object.entries(node as Json)) {
    const isSchemaMap =
      pointer.endsWith('/properties') ||
      pointer.endsWith('/patternProperties') ||
      pointer.endsWith('/$defs')
    if (!isSchemaMap && !(key in SUPPORTED_KEYWORDS)) {
      throw new UnsupportedKeywordError(key, pointer)
    }
    assertSupportedKeywords(value, `${pointer}/${key}`)
  }
}

const q = (s: string) => JSON.stringify(s)

/** Emits a Zod expression preserving the schema's validation semantics. */
function emit(
  schema: Json,
  pointer: string,
  refs: Map<string, string>
): string {
  if (typeof schema.$ref === 'string') {
    const target = refs.get(schema.$ref)
    if (!target) {
      throw new Error(`Unresolvable $ref ${schema.$ref} at ${pointer}`)
    }
    return target
  }

  if ('const' in schema) return `z.literal(${JSON.stringify(schema.const)})`

  if (Array.isArray(schema.enum)) {
    return `z.enum([${(schema.enum as string[]).map(q).join(', ')}] as const)`
  }

  // `propertyNames` subschemas carry string constraints without `type`, because
  // JSON Schema property names are always strings. Treat that shape as a string
  // rather than failing, but never infer a type from constraints alone anywhere
  // else.
  const hasStringConstraint =
    'pattern' in schema || 'minLength' in schema || 'maxLength' in schema
  const type =
    schema.type ??
    (pointer.endsWith('/propertyNames') && hasStringConstraint
      ? 'string'
      : undefined)

  if (type === 'string') {
    let out = 'z.string()'
    if (typeof schema.minLength === 'number') out += `.min(${schema.minLength})`
    if (typeof schema.maxLength === 'number') out += `.max(${schema.maxLength})`
    if (typeof schema.pattern === 'string') {
      out += `.regex(new RegExp(${q(schema.pattern)}))`
    }
    if (schema.format === 'uuid') out += '.uuid()'
    if (schema.format === 'date-time') out += '.datetime({ offset: true })'
    if (schema.not && typeof (schema.not as Json).const === 'string') {
      const forbidden = (schema.not as Json).const as string
      out += `.refine((v) => v !== ${q(forbidden)}, { message: ${q(
        `must not be ${forbidden}`
      )} })`
    }
    return out
  }

  if (type === 'integer') {
    let out = 'z.number().int()'
    if (typeof schema.minimum === 'number') out += `.min(${schema.minimum})`
    if (typeof schema.maximum === 'number') out += `.max(${schema.maximum})`
    return out
  }

  if (type === 'object') {
    // Keyed map form: propertyNames + patternProperties
    if (schema.propertyNames || schema.patternProperties) {
      const keySchema = emit(
        (schema.propertyNames as Json) ?? { type: 'string' },
        `${pointer}/propertyNames`,
        refs
      )
      const patterns = Object.entries(
        (schema.patternProperties as Record<string, Json>) ?? {}
      )
      if (patterns.length !== 1) {
        throw new Error(
          `Exactly one patternProperties entry is supported at ${pointer}`
        )
      }
      const [patternKey, valueSchema] = patterns[0]
      const value = emit(
        valueSchema,
        `${pointer}/patternProperties/${patternKey}`,
        refs
      )
      let out = `z.record(${keySchema}.regex(new RegExp(${q(
        patternKey
      )})), ${value})`
      if (typeof schema.minProperties === 'number') {
        out += `.refine((v) => Object.keys(v).length >= ${schema.minProperties}, { message: ${q(
          `at least ${schema.minProperties} entr${
            schema.minProperties === 1 ? 'y' : 'ies'
          } required`
        )} })`
      }
      return out
    }

    const props = (schema.properties as Record<string, Json>) ?? {}
    const required = new Set((schema.required as string[]) ?? [])
    const fields = Object.entries(props).map(([name, sub]) => {
      const expr = emit(sub, `${pointer}/properties/${name}`, refs)
      return `    ${JSON.stringify(name)}: ${expr}${
        required.has(name) ? '' : '.optional()'
      }`
    })
    let out = `z.object({\n${fields.join(',\n')}\n  })`
    if (schema.additionalProperties === false) out += '.strict()'
    if (Array.isArray(schema.allOf)) {
      out += emitConditional(schema.allOf as Json[], pointer)
    }
    return out
  }

  throw new Error(`Unsupported schema shape at ${pointer}`)
}

/**
 * Emits the `allOf`/`if`/`then`/`else` conditional-presence rule as a
 * `superRefine`. Digest equality alone would not catch a dropped branch, so the
 * branch is materialized explicitly.
 */
function emitConditional(allOf: Json[], pointer: string): string {
  const clauses = allOf.map((entry, i) => {
    const cond = entry.if as Json | undefined
    const then = entry.then as Json | undefined
    const els = entry.else as Json | undefined
    if (!cond) throw new Error(`allOf[${i}] without if at ${pointer}`)

    const condProps = (cond.properties as Record<string, Json>) ?? {}
    const [discriminator] = Object.keys(condProps)
    const expected = condProps[discriminator]?.const

    // Fail closed rather than emitting `value[undefined] === undefined`, which
    // would compile into an always-true branch and silently drop the rule.
    if (discriminator === undefined || expected === undefined) {
      throw new Error(
        `allOf[${i}].if at ${pointer} needs exactly one property with a const ` +
          `discriminator; this generator does not support a wider condition.`
      )
    }

    const thenRequired = ((then?.required as string[]) ?? []).map(q).join(', ')
    const elseForbidden = (((els?.not as Json)?.anyOf as Json[]) ?? []).flatMap(
      (n) => ((n.required as string[]) ?? []).map(q)
    )

    return `
    if (value[${q(discriminator)}] === ${JSON.stringify(expected)}) {
      for (const key of [${thenRequired}] as const) {
        if (value[key] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: \`\${key} is required when ${discriminator} is ${String(expected)}\`
          })
        }
      }
    } else {
      for (const key of [${elseForbidden.join(', ')}] as const) {
        if (value[key] !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: \`\${key} is only allowed when ${discriminator} is ${String(expected)}\`
          })
        }
      }
    }`
  })

  return `.superRefine((value, ctx) => {${clauses.join('')}\n  })`
}

export interface RenderInput {
  readonly schemaPath: string
  readonly schemaText: string
  readonly outputPath: string
  readonly exportName: string
  readonly typeName: string
  readonly imports?: string
  readonly refs?: Map<string, string>
}

export function render(input: RenderInput): string {
  const schema = JSON.parse(input.schemaText) as Json
  assertSupportedKeywords(schema)

  const sha256 = createHash('sha256').update(input.schemaText).digest('hex')
  const refs = input.refs ?? new Map<string, string>()

  const defs = (schema.$defs as Record<string, Json>) ?? {}
  const defBlocks: string[] = []
  for (const [name, sub] of Object.entries(defs)) {
    const localName = `${name}Schema`
    refs.set(`#/$defs/${name}`, localName)
    defBlocks.push(
      `const ${localName} = ${emit(sub, `#/$defs/${name}`, refs)}\n`
    )
  }

  const body = emit(schema, '#', refs)

  // The source schemas match control-character ranges in order to *reject*
  // control characters in paths, filenames, and identifiers. That is a security
  // property of the contract, so `no-control-regex` is disabled for this
  // generated file only rather than weakened anywhere else. The file is
  // DO NOT EDIT, so the pragma has to come from the generator.
  const controlRegexPragma = /\\u0000|\\u001[fF]|\\u007[fF]/.test(
    input.schemaText
  )
    ? '/* eslint-disable no-control-regex -- source schema rejects control characters by matching their ranges */\n'
    : ''

  return `// Source schema: ${input.schemaPath}
// Schema SHA-256: ${sha256}
// Generator: generate-contracts.ts v${GENERATOR_VERSION} (keyword map v${SUPPORTED_KEYWORD_MAP_VERSION})
// DO NOT EDIT — regenerate with \`pnpm exec tsx .hermes/phase0/tools/generate-contracts.ts\`
${controlRegexPragma}import { z } from 'zod'
${input.imports ?? ''}
${defBlocks.join('\n')}
export const ${input.exportName} = ${body}

export type ${input.typeName} = Readonly<z.infer<typeof ${input.exportName}>>
`
}

const OUTPUT_LOCATOR = {
  schemaPath: '.hermes/phase0/schemas/output-locator.v1.schema.json',
  outputPath: 'src/platform/assets/presentation/outputLocatorV1.generated.ts',
  exportName: 'outputLocatorV1Schema',
  typeName: 'OutputLocatorV1'
} as const

const SELECTION_MANIFEST = {
  schemaPath: '.hermes/phase0/schemas/selection-manifest.v1.schema.json',
  outputPath: 'src/extensions/core/omarketing/selectionManifestV1.generated.ts',
  exportName: 'selectionManifestV1Schema',
  typeName: 'SelectionManifestV1'
} as const

export interface GenerationResult {
  readonly inputs: readonly { path: string; sha256: string }[]
  readonly outputs: readonly { path: string; sha256: string }[]
}

/** Renders both outputs in memory, then writes both or neither. */
export function generate(write = true): GenerationResult {
  const readAt = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), 'utf8')

  const locatorText = readAt(OUTPUT_LOCATOR.schemaPath)
  const manifestText = readAt(SELECTION_MANIFEST.schemaPath)

  const locatorCode = render({
    schemaPath: OUTPUT_LOCATOR.schemaPath,
    schemaText: locatorText,
    outputPath: OUTPUT_LOCATOR.outputPath,
    exportName: OUTPUT_LOCATOR.exportName,
    typeName: OUTPUT_LOCATOR.typeName
  })

  // Cross-file $ref. Dependency direction Omarketing -> generic is the allowed
  // one; the generic registry must never import an Omarketing module.
  const crossRefs = new Map<string, string>([
    ['output-locator.v1.schema.json', OUTPUT_LOCATOR.exportName]
  ])
  const manifestImport = `import { ${OUTPUT_LOCATOR.exportName} } from '@/platform/assets/presentation/outputLocatorV1.generated'\n`

  const manifestCode = render({
    schemaPath: SELECTION_MANIFEST.schemaPath,
    schemaText: manifestText,
    outputPath: SELECTION_MANIFEST.outputPath,
    exportName: SELECTION_MANIFEST.exportName,
    typeName: SELECTION_MANIFEST.typeName,
    imports: manifestImport,
    refs: crossRefs
  })

  const sha = (s: string) => createHash('sha256').update(s).digest('hex')

  const result: GenerationResult = {
    inputs: [
      { path: OUTPUT_LOCATOR.schemaPath, sha256: sha(locatorText) },
      { path: SELECTION_MANIFEST.schemaPath, sha256: sha(manifestText) }
    ],
    outputs: [
      { path: OUTPUT_LOCATOR.outputPath, sha256: sha(locatorCode) },
      { path: SELECTION_MANIFEST.outputPath, sha256: sha(manifestCode) }
    ]
  }

  if (write) {
    // Publish is all-or-nothing. Both outputs are written to a staging
    // directory, formatted and read back there, and only then copied over the
    // real paths. A formatter or write failure therefore leaves the previously
    // published files untouched instead of a half-formatted pair.
    const locatorAbs = resolve(REPO_ROOT, OUTPUT_LOCATOR.outputPath)
    const manifestAbs = resolve(REPO_ROOT, SELECTION_MANIFEST.outputPath)
    const staging = mkdtempSync(resolve(tmpdir(), 'omarketing-contracts-'))

    try {
      const stagedLocator = resolve(staging, 'outputLocatorV1.generated.ts')
      const stagedManifest = resolve(
        staging,
        'selectionManifestV1.generated.ts'
      )
      writeFileSync(stagedLocator, locatorCode)
      writeFileSync(stagedManifest, manifestCode)

      formatStaged([stagedLocator, stagedManifest])

      const finalLocator = readFileSync(stagedLocator, 'utf8')
      const finalManifest = readFileSync(stagedManifest, 'utf8')
      if (!finalLocator.trim() || !finalManifest.trim()) {
        throw new Error(
          'formatter produced an empty output; refusing to publish'
        )
      }

      // Both validated: commit them as one unit.
      commitOutputs([
        { path: locatorAbs, content: finalLocator },
        { path: manifestAbs, content: finalManifest }
      ])

      return {
        inputs: result.inputs,
        outputs: [
          { path: OUTPUT_LOCATOR.outputPath, sha256: sha(finalLocator) },
          { path: SELECTION_MANIFEST.outputPath, sha256: sha(finalManifest) }
        ]
      }
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
  }

  return result
}

/**
 * Formats staged outputs before they are published.
 *
 * Runs outside the repository tree, so a formatter failure cannot leave a
 * partially formatted file at a real output path.
 */
function formatStaged(absolutePaths: readonly string[]): void {
  execFileSync(
    resolve(REPO_ROOT, 'node_modules/.bin/oxfmt'),
    ['--write', ...absolutePaths],
    { cwd: REPO_ROOT, stdio: 'ignore' }
  )
}

export interface PublishTarget {
  readonly path: string
  readonly content: string
}

/**
 * Commits every output as one unit, or leaves all of them as they were.
 *
 * Each file is staged as a sibling temp file on the same filesystem and then
 * moved into place with `rename`, which is atomic per file. Two renames are
 * still two operations, so the previous contents are captured first and
 * restored if any later rename fails. Without this a failure between the two
 * renames would leave a mismatched generated pair on disk.
 *
 * `rename` is injectable so a test can force the second commit to fail.
 */
export function commitOutputs(
  targets: readonly PublishTarget[],
  rename: (from: string, to: string) => void = renameSync
): void {
  const previous = targets.map((target) => ({
    path: target.path,
    existed: existsSync(target.path),
    content: existsSync(target.path) ? readFileSync(target.path, 'utf8') : null
  }))

  const staged: string[] = []
  const committed: string[] = []
  try {
    for (const target of targets) {
      const temp = `${target.path}.tmp-${process.pid}`
      writeFileSync(temp, target.content)
      staged.push(temp)
    }
    for (let i = 0; i < targets.length; i += 1) {
      rename(staged[i], targets[i].path)
      committed.push(targets[i].path)
    }
  } catch (error) {
    // Roll every already-committed file back to what it was.
    for (const snapshot of previous) {
      if (!committed.includes(snapshot.path)) continue
      if (snapshot.existed && snapshot.content !== null) {
        writeFileSync(snapshot.path, snapshot.content)
      } else if (existsSync(snapshot.path)) {
        unlinkSync(snapshot.path)
      }
    }
    throw error
  } finally {
    for (const temp of staged) {
      if (existsSync(temp)) unlinkSync(temp)
    }
  }
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const result = generate(true)
  process.stdout.write(
    `${JSON.stringify({ generator: GENERATOR_VERSION, ...result }, null, 2)}\n`
  )
}
