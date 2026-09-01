/**
 * Parity and fail-closed tests for the Omarketing contract generator.
 *
 * Run: `pnpm exec tsx --test .hermes/phase0/tools/generate-contracts.test.ts`
 *
 * The repository Vitest include does not collect `.hermes/**`, so this suite
 * runs through the Node test runner under tsx. It must not require any package
 * script, config, or dependency change.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  GENERATOR_VERSION,
  commitOutputs,
  render,
  SUPPORTED_KEYWORDS,
  UnsupportedKeywordError,
  assertSupportedKeywords,
  generate
} from './generate-contracts.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..', '..')
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), 'utf8')

const LOCATOR_OUT =
  'src/platform/assets/presentation/outputLocatorV1.generated.ts'
const MANIFEST_OUT =
  'src/extensions/core/omarketing/selectionManifestV1.generated.ts'

const validLocator = {
  job_id: '3f1a2b4c-5d6e-4f70-8912-a3b4c5d6e7f8',
  node_id: '12',
  directory_type: 'output',
  subfolder: 'omarketing/run-1',
  filename: 'frame_00001.png',
  media_type: 'image',
  sha256: 'a'.repeat(64),
  size_bytes: 2048,
  mime_type: 'image/png'
}

const validSelection = {
  state: 'selected',
  output: validLocator,
  selected_at: '2026-08-30T07:00:00+09:00',
  updated_at: '2026-08-30T07:00:00+09:00',
  owner_user_id: 'owner-1'
}

const validManifest = {
  schema_version: 1,
  revision: 1,
  project_key: '11111111-2222-4333-8444-555555555555',
  workflow_locator: 'workflows/campaign/spring.json',
  run_key: '66666666-7777-4888-8999-aaaaaaaaaaaa',
  selections: { 'ref-1': validSelection }
}

// ---------------------------------------------------------------- keyword map

test('supported keyword map covers both schemas', () => {
  assertSupportedKeywords(
    JSON.parse(read('.hermes/phase0/schemas/output-locator.v1.schema.json'))
  )
  assertSupportedKeywords(
    JSON.parse(read('.hermes/phase0/schemas/selection-manifest.v1.schema.json'))
  )
})

test('unsupported validation keyword fails closed with its pointer', () => {
  assert.throws(
    () =>
      assertSupportedKeywords({
        type: 'object',
        properties: { a: { type: 'string', unevaluatedProperties: false } }
      }),
    (error: unknown) =>
      error instanceof UnsupportedKeywordError &&
      error.keyword === 'unevaluatedProperties' &&
      error.pointer.includes('/properties/a')
  )
})

test('keyword map is categorized, not a bare allowlist', () => {
  for (const category of Object.values(SUPPORTED_KEYWORDS)) {
    assert.ok(
      ['annotation', 'validation', 'applicator', 'reference'].includes(category)
    )
  }
})

// ------------------------------------------------------------- determinism

test('conditional without a const discriminator fails closed', () => {
  // An `if` the generator cannot discriminate would otherwise compile into an
  // always-true branch, silently dropping a conditional-presence rule.
  assert.throws(
    () =>
      render({
        schemaPath: 'test://inline',
        schemaText: JSON.stringify({
          type: 'object',
          properties: { state: { type: 'string' } },
          allOf: [{ if: { properties: {} }, then: { required: ['x'] } }]
        }),
        outputPath: 'test://out',
        exportName: 'x',
        typeName: 'X'
      }),
    /const discriminator/
  )
})

test('generation is deterministic and writes exactly two outputs', () => {
  const first = generate(false)
  const second = generate(false)
  assert.equal(first.inputs.length, 2)
  assert.equal(first.outputs.length, 2)
  assert.deepEqual(first.outputs, second.outputs)
})

test('reported digests match the published files on disk', () => {
  // `generate(true)` reports post-format digests, because formatting is part of
  // publishing. A dry run reports pre-format digests and cannot stand in for
  // what was actually written.
  const result = generate(true)
  for (const output of result.outputs) {
    const onDisk = createHash('sha256').update(read(output.path)).digest('hex')
    assert.equal(
      onDisk,
      output.sha256,
      `${output.path} drifted from generator output`
    )
  }
})

test('republishing over already-published files changes nothing', () => {
  const first = generate(true)
  const second = generate(true)
  assert.deepEqual(second.outputs, first.outputs)
})

test('a failed second commit rolls both outputs back', () => {
  // Two renames are two operations. Without rollback a failure between them
  // leaves a mismatched generated pair on disk, which is exactly what the
  // all-or-nothing publish rule forbids.
  const dir = mkdtempSync(resolve(tmpdir(), 'omarketing-commit-'))
  const first = resolve(dir, 'first.ts')
  const second = resolve(dir, 'second.ts')
  writeFileSync(first, 'ORIGINAL FIRST')
  writeFileSync(second, 'ORIGINAL SECOND')

  let renames = 0
  assert.throws(
    () =>
      commitOutputs(
        [
          { path: first, content: 'NEW FIRST' },
          { path: second, content: 'NEW SECOND' }
        ],
        (from, to) => {
          renames += 1
          if (renames === 2) throw new Error('injected second-commit failure')
          renameSync(from, to)
        }
      ),
    /injected second-commit failure/
  )

  assert.equal(readFileSync(first, 'utf8'), 'ORIGINAL FIRST')
  assert.equal(readFileSync(second, 'utf8'), 'ORIGINAL SECOND')
  assert.equal(
    readdirSync(dir).filter((name) => name.includes('.tmp-')).length,
    0,
    'staged temp files must not survive a failed commit'
  )
  rmSync(dir, { recursive: true, force: true })
})

test('a successful commit replaces every output together', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'omarketing-commit-ok-'))
  const first = resolve(dir, 'first.ts')
  const second = resolve(dir, 'second.ts')

  commitOutputs([
    { path: first, content: 'A' },
    { path: second, content: 'B' }
  ])

  assert.equal(readFileSync(first, 'utf8'), 'A')
  assert.equal(readFileSync(second, 'utf8'), 'B')
  rmSync(dir, { recursive: true, force: true })
})

test('generated headers record provenance', () => {
  for (const path of [LOCATOR_OUT, MANIFEST_OUT]) {
    const text = read(path)
    assert.match(text, /^\/\/ Source schema: \.hermes\/phase0\/schemas\//m)
    assert.match(text, /^\/\/ Schema SHA-256: [a-f0-9]{64}$/m)
    assert.match(
      text,
      new RegExp(`Generator: generate-contracts\\.ts v${GENERATOR_VERSION}`)
    )
    assert.match(text, /DO NOT EDIT/)
  }
})

// ------------------------------------------------- OutputLocator parity vectors

test('OutputLocator accepts a valid locator', async () => {
  const { outputLocatorV1Schema } = await import(
    resolve(REPO_ROOT, LOCATOR_OUT)
  )
  assert.equal(outputLocatorV1Schema.safeParse(validLocator).success, true)
})

const locatorNegatives: readonly [string, Record<string, unknown>][] = [
  ['pattern: parent traversal in subfolder', { subfolder: '../escape' }],
  ['pattern: absolute subfolder', { subfolder: '/abs/path' }],
  ['pattern: backslash in subfolder', { subfolder: 'a\\b' }],
  ['pattern: directory separator in filename', { filename: 'a/b.png' }],
  ['pattern: dot filename', { filename: '..' }],
  ['pattern: uppercase sha256', { sha256: 'A'.repeat(64) }],
  ['minLength: empty node_id', { node_id: '' }],
  ['maxLength: oversized node_id', { node_id: 'x'.repeat(129) }],
  ['minimum: negative size_bytes', { size_bytes: -1 }],
  ['type: non-integer size_bytes', { size_bytes: 1.5 }],
  ['const: wrong directory_type', { directory_type: 'input' }],
  ['format: malformed job_id', { job_id: 'not-a-uuid' }],
  ['pattern: mime_type without subtype', { mime_type: 'image' }],
  ['additionalProperties: unknown key', { unexpected: true }]
]

for (const [label, patch] of locatorNegatives) {
  test(`OutputLocator rejects ${label}`, async () => {
    const { outputLocatorV1Schema } = await import(
      resolve(REPO_ROOT, LOCATOR_OUT)
    )
    const candidate = { ...validLocator, ...patch }
    assert.equal(outputLocatorV1Schema.safeParse(candidate).success, false)
  })
}

// -------------------------------------------- SelectionManifest parity vectors

test('SelectionManifest accepts a valid selected manifest', async () => {
  const { selectionManifestV1Schema } = await import(
    resolve(REPO_ROOT, MANIFEST_OUT)
  )
  assert.equal(selectionManifestV1Schema.safeParse(validManifest).success, true)
})

test('SelectionManifest accepts a valid stale selection', async () => {
  const { selectionManifestV1Schema } = await import(
    resolve(REPO_ROOT, MANIFEST_OUT)
  )
  const stale = {
    ...validManifest,
    selections: {
      'ref-1': {
        ...validSelection,
        state: 'stale',
        stale_at: '2026-08-30T08:00:00+09:00',
        stale_reason: 'source output was replaced',
        observed_sha256: 'b'.repeat(64)
      }
    }
  }
  assert.equal(selectionManifestV1Schema.safeParse(stale).success, true)
})

test('SelectionManifest rejects propertyNames violation', async () => {
  const { selectionManifestV1Schema } = await import(
    resolve(REPO_ROOT, MANIFEST_OUT)
  )
  const bad = { ...validManifest, selections: { '-bad-key': validSelection } }
  assert.equal(selectionManifestV1Schema.safeParse(bad).success, false)
})

test('SelectionManifest rejects minProperties violation', async () => {
  const { selectionManifestV1Schema } = await import(
    resolve(REPO_ROOT, MANIFEST_OUT)
  )
  const bad = { ...validManifest, selections: {} }
  assert.equal(selectionManifestV1Schema.safeParse(bad).success, false)
})

test('SelectionManifest rejects an external $ref violation in output', async () => {
  const { selectionManifestV1Schema } = await import(
    resolve(REPO_ROOT, MANIFEST_OUT)
  )
  const bad = {
    ...validManifest,
    selections: {
      'ref-1': {
        ...validSelection,
        output: { ...validLocator, subfolder: '../escape' }
      }
    }
  }
  assert.equal(selectionManifestV1Schema.safeParse(bad).success, false)
})

test('SelectionManifest rejects a stale selection missing conditional fields', async () => {
  const { selectionManifestV1Schema } = await import(
    resolve(REPO_ROOT, MANIFEST_OUT)
  )
  const bad = {
    ...validManifest,
    selections: { 'ref-1': { ...validSelection, state: 'stale' } }
  }
  assert.equal(selectionManifestV1Schema.safeParse(bad).success, false)
})

test('SelectionManifest rejects stale-only fields on a selected selection', async () => {
  const { selectionManifestV1Schema } = await import(
    resolve(REPO_ROOT, MANIFEST_OUT)
  )
  for (const key of ['stale_at', 'stale_reason', 'observed_sha256'] as const) {
    const value =
      key === 'observed_sha256'
        ? 'c'.repeat(64)
        : key === 'stale_reason'
          ? 'x'
          : '2026-08-30T08:00:00+09:00'
    const bad = {
      ...validManifest,
      selections: { 'ref-1': { ...validSelection, [key]: value } }
    }
    assert.equal(
      selectionManifestV1Schema.safeParse(bad).success,
      false,
      `${key} must be rejected while state is selected`
    )
  }
})

test('SelectionManifest rejects the nil project_key and run_key', async () => {
  const { selectionManifestV1Schema } = await import(
    resolve(REPO_ROOT, MANIFEST_OUT)
  )
  const nil = '00000000-0000-0000-0000-000000000000'
  for (const key of ['project_key', 'run_key'] as const) {
    assert.equal(
      selectionManifestV1Schema.safeParse({ ...validManifest, [key]: nil })
        .success,
      false,
      `${key} must reject the nil UUID`
    )
  }
})

test('SelectionManifest rejects a workflow_locator outside workflows/', async () => {
  const { selectionManifestV1Schema } = await import(
    resolve(REPO_ROOT, MANIFEST_OUT)
  )
  for (const bad of [
    'elsewhere/x.json',
    'workflows/../escape.json',
    'workflows/x.txt'
  ]) {
    assert.equal(
      selectionManifestV1Schema.safeParse({
        ...validManifest,
        workflow_locator: bad
      }).success,
      false,
      `${bad} must be rejected`
    )
  }
})

test('SelectionManifest rejects an unknown top-level key', async () => {
  const { selectionManifestV1Schema } = await import(
    resolve(REPO_ROOT, MANIFEST_OUT)
  )
  assert.equal(
    selectionManifestV1Schema.safeParse({ ...validManifest, extra: 1 }).success,
    false
  )
})
