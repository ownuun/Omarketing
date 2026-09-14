import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { generate, INPUT, OUTPUT, render } from './generate-test-handoff-api'

const project = '10000000-0000-4000-8000-000000000001'
const run = '20000000-0000-4000-8000-000000000002'
const workflow = 'workflows/TestHandoff/main.json'
const correlation = '3a000000-0000-4000-8000-000000000003'
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

test('TEST generator rejects unsupported schemas', () => {
  assert.throws(
    () => render({ $defs: { Value: { type: 'string', format: 'uuid' } } }),
    /Unsupported/
  )
})

test('TEST schema generates one closed parser output with backend parity', async () => {
  generate()
  const first = readFileSync(OUTPUT, 'utf8')
  assert.equal(generate().changedOutputs, 0)
  assert.equal(readFileSync(OUTPUT, 'utf8'), first)

  const api = await import('../../../src/extensions/core/omarketing/testHandoffApi.generated')
  const request = {
    schema_version: 1,
    workflow_locator: workflow,
    activation_correlation_id: correlation,
    expected_manifest_revision: 1
  }
  const projection = {
    schema_version: 1,
    mode: 'local_test',
    simulated: true,
    scope: {
      project_key: project,
      workflow_locator: workflow,
      run_key: run,
      reference_id: 'reference-test-handoff'
    },
    fixture_copy: {
      title: '',
      body: 'synthetic approved fixture copy',
      cta: null
    },
    current: {
      manifest_revision: 0,
      selection_state: 'empty',
      candidate_id: null,
      activation_correlation_id: null,
      outcome: 'empty'
    },
    history: [],
    publication_job_id: null
  }
  assert.equal(api.TestHandoffCreateRequestSchema.safeParse(request).success, true)
  assert.equal(api.TestHandoffProjectionSchema.safeParse(projection).success, true)

  const vectors = [
    ['TestHandoffCreateRequest', request],
    ['TestHandoffCreateRequest', { ...request, expected_manifest_revision: true }],
    ['TestHandoffCreateRequest', { ...request, owner_user_id: 'forged' }],
    ['TestHandoffProjection', projection],
    ['TestHandoffProjection', { ...projection, publication_job_id: 'job' }]
  ] as const
  const code = `import json,sys
from comfyui_omarketing.routes.test_handoff import _wire
out=[]
for name,value in json.load(sys.stdin):
 try: _wire(name,value); out.append(True)
 except Exception: out.append(False)
print(json.dumps(out))`
  const python = spawnSync(
    dirname(dirname(dirname(INPUT))) + '/.venv/bin/python',
    ['-B', '-c', code],
    {
      cwd: dirname(dirname(dirname(INPUT))),
      input: JSON.stringify(vectors),
      encoding: 'utf8'
    }
  )
  assert.equal(python.status, 0, python.stderr)
  const zod = vectors.map(([name, value]) =>
    name === 'TestHandoffCreateRequest'
      ? api.TestHandoffCreateRequestSchema.safeParse(value).success
      : api.TestHandoffProjectionSchema.safeParse(value).success
  )
  assert.deepEqual(JSON.parse(python.stdout), zod)
})

test('TEST generator publishes formatter-clean provenance output', () => {
  generate()
  const formatter = spawnSync(
    resolve(frontendRoot, 'node_modules/.bin/oxfmt'),
    ['--check', OUTPUT],
    { cwd: frontendRoot, encoding: 'utf8' }
  )
  assert.equal(formatter.status, 0, formatter.stdout + formatter.stderr)
})
