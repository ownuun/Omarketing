import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { generate, render, INPUT, OUTPUT } from './generate-local-selection-api'

test('typed constants fail closed on incompatible types', () => {
  assert.match(
    render({ $defs: { Version: { type: 'integer', const: 1 } } }),
    /z.literal\(1\)/
  )
  assert.throws(
    () => render({ $defs: { Version: { type: 'string', const: 1 } } }),
    /constant type/
  )
})

test('closed generated wire parser; unsupported keyword fail closed; idempotence', async () => {
  const schema = JSON.parse(readFileSync(INPUT, 'utf8'))
  assert.throws(
    () => render({ ...schema, unevaluatedProperties: false }),
    /Unsupported/
  )
  generate()
  const first = readFileSync(OUTPUT, 'utf8')
  assert.equal(generate().changedOutputs, 0)
  assert.equal(readFileSync(OUTPUT, 'utf8'), first)
  const api =
    await import('../../../src/extensions/core/omarketing/localSelectionApi.generated')
  assert.equal(api.RevisionSchema.safeParse(0).success, true)
  assert.equal(
    api.TargetSchema.safeParse({
      correlation_id: 't0',
      job_id: 'job',
      node_id: 'node',
      filename: 'ordinary.png',
      subfolder: '',
      directory_type: 'output',
      media_type: 'image'
    }).success,
    true
  )
  for (const value of [-1, 0.5, true, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(api.RevisionSchema.safeParse(value).success, false)
  }
  const empty = {
    schema_version: 1,
    project_key: '11111111-1111-4111-8111-111111111111',
    workflow_locator: 'workflows/Brand/main.json',
    run_key: '22222222-2222-4222-8222-222222222222',
    revision: 0,
    selections: []
  }
  assert.equal(api.ManifestResponseSchema.safeParse(empty).success, true)
  for (const value of [
    { ...empty, owner_namespace: 'private' },
    { ...empty, revision: -1 },
    { ...empty, selections: [{}] }
  ]) {
    assert.equal(api.ManifestResponseSchema.safeParse(value).success, false)
  }
  const unavailable = {
    reference_id: 'ref',
    candidate_id: null,
    output: null,
    availability: 'unavailable',
    state: 'selected',
    selected_at: 'stamp',
    updated_at: 'stamp'
  }
  assert.equal(api.SelectionSchema.safeParse(unavailable).success, true)
  assert.equal(
    api.SelectionSchema.safeParse({ ...unavailable, candidate_id: 'guessed' })
      .success,
    false
  )
  assert.equal(
    api.AssociationRequestSchema.safeParse({ schema_version: 1, targets: [] })
      .success,
    false
  )
  const vectors = [
    ['ManifestResponse', empty],
    ['ManifestResponse', { ...empty, schema_version: true }],
    ['ManifestResponse', { ...empty, revision: 0.5 }],
    ['ManifestResponse', { ...empty, owner_user_id: 'x' }],
    [
      'ManifestResponse',
      { ...empty, project_key: '00000000-0000-0000-0000-000000000000' }
    ],
    ['ManifestResponse', { ...empty, workflow_locator: 'workflows/../x.json' }],
    ['Selection', unavailable],
    ['Selection', { ...unavailable, candidate_id: 'x' }],
    ['AssociationRequest', { schema_version: 1, targets: [] }],
    ['RevisionResponse', { schema_version: 1, revision: 0 }],
    ['RevisionResponse', { schema_version: 1, revision: true }],
    [
      'RevisionResponse',
      { schema_version: 1, revision: Number.MAX_SAFE_INTEGER + 1 }
    ],
    ['RevisionResponse', { schema_version: 1, revision: -1 }]
  ] as const
  const code = `import json,sys
from comfyui_omarketing.routes.selection import _wire
out=[]
for name,value in json.load(sys.stdin):
 try: _wire(name,value); out.append(True)
 except Exception: out.append(False)
print(json.dumps(out))`
  const python = spawnSync('/opt/homebrew/bin/python3', ['-B', '-c', code], {
    cwd: dirname(dirname(dirname(INPUT))),
    input: JSON.stringify(vectors),
    encoding: 'utf8'
  })
  assert.equal(python.status, 0, python.stderr)
  const zod = vectors.map(
    ([name, value]) =>
      (
        api[(name + 'Schema') as keyof typeof api] as {
          safeParse: (x: unknown) => { success: boolean }
        }
      ).safeParse(value).success
  )
  assert.deepEqual(
    JSON.parse(python.stdout),
    zod,
    'Python runtime and generated Zod must accept/reject identically'
  )
})
