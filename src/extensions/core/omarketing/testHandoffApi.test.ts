import { describe, expect, it, vi } from 'vitest'

import { TestHandoffApiError, createTestHandoffApi } from './testHandoffApi'

const binding = {
  project_key: '10000000-0000-4000-8000-000000000001',
  workflow_locator: 'workflows/TestHandoff/main.json',
  run_key: '20000000-0000-4000-8000-000000000002',
  reference_id: 'reference-test-handoff',
  candidate_id: 'candidate-a'
}

const projection = {
  schema_version: 1,
  mode: 'local_test',
  simulated: true,
  scope: {
    project_key: binding.project_key,
    workflow_locator: binding.workflow_locator,
    run_key: binding.run_key,
    reference_id: binding.reference_id
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

describe('createTestHandoffApi', () => {
  it('uses closed same-origin GET and verifies its returned scope', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(projection))
    const result = await createTestHandoffApi(fetcher).read(
      binding,
      new AbortController().signal
    )
    expect(result).toEqual(projection)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/omarketing/v1/projects/10000000-0000-4000-8000-000000000001/runs/20000000-0000-4000-8000-000000000002/references/reference-test-handoff/test-handoffs',
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error'
      })
    )
  })

  it('sends only generated create fields and returns the validated projection', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(projection))
    await expect(
      createTestHandoffApi(fetcher).create(
        binding,
        1,
        '3a000000-0000-4000-8000-000000000003',
        new AbortController().signal
      )
    ).resolves.toEqual(projection)
    const init = fetcher.mock.calls[0][1]
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init?.body).toBe(
      JSON.stringify({
        schema_version: 1,
        workflow_locator: binding.workflow_locator,
        activation_correlation_id: '3a000000-0000-4000-8000-000000000003',
        expected_manifest_revision: 1
      })
    )
  })

  it('rejects a mismatched projection and preserves closed HTTP errors', async () => {
    const mismatch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...projection,
        scope: { ...projection.scope, reference_id: 'other-reference' }
      })
    )
    await expect(
      createTestHandoffApi(mismatch).read(binding, new AbortController().signal)
    ).rejects.toMatchObject({ status: 502 })

    const conflict = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            diagnostic_id: 'a'.repeat(32)
          }
        },
        { status: 409 }
      )
    )
    await expect(
      createTestHandoffApi(conflict).create(
        binding,
        1,
        '3a000000-0000-4000-8000-000000000003',
        new AbortController().signal
      )
    ).rejects.toEqual(expect.any(TestHandoffApiError))
  })
})
