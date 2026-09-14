import { describe, expect, it, vi } from 'vitest'
import { createSelectionApi, SelectionApiError } from './selectionApi'

const binding = {
  project_key: '11111111-1111-4111-8111-111111111111',
  workflow_locator: 'workflows/Brand/main.json',
  run_key: '22222222-2222-4222-8222-222222222222',
  reference_id: 'ref',
  candidate_id: 'candidate'
}
const output = {
  job_id: 'job',
  node_id: '42',
  filename: 'x.txt',
  media_type: 'text',
  sha256: 'a'.repeat(64),
  size_bytes: 1,
  mime_type: 'text/plain'
}
const manifest = {
  schema_version: 1,
  project_key: binding.project_key,
  workflow_locator: binding.workflow_locator,
  run_key: binding.run_key,
  revision: 1,
  selections: [
    {
      reference_id: 'ref',
      candidate_id: 'candidate',
      output,
      state: 'selected',
      availability: 'bound',
      selected_at: 'stamp',
      updated_at: 'stamp'
    }
  ]
}
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 })
describe('selection API: real transport with injected test fetch', () => {
  it.each(['candidate', 'hash', 'stale', 'unavailable', 'failed-get'])(
    'never confirms mismatched or unverified readback: %s',
    async (kind) => {
      const selected = {
        ...manifest.selections[0],
        ...(kind === 'candidate' ? { candidate_id: 'other' } : {}),
        ...(kind === 'hash'
          ? { output: { ...output, sha256: 'b'.repeat(64) } }
          : {}),
        ...(kind === 'stale'
          ? { state: 'stale', stale_reason: 'hash_mismatch', stale_at: 'stamp' }
          : {}),
        ...(kind === 'unavailable'
          ? { availability: 'unavailable', candidate_id: null, output: null }
          : {})
      }
      const verified = {
        schema_version: 1,
        revision: 0,
        reference_id: 'ref',
        candidate_id: 'candidate',
        output
      }
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(ok(verified))
        .mockResolvedValueOnce(ok({ ...verified, revision: 1 }))
        .mockResolvedValueOnce(
          kind === 'failed-get'
            ? new Response('', { status: 503 })
            : ok({ ...manifest, selections: [selected] })
        )
      expect(
        (
          await createSelectionApi(fetcher).select(
            binding,
            output,
            0,
            new AbortController().signal
          )
        ).status
      ).toBe('outcome_unknown')
      expect(
        fetcher.mock.calls.filter((c) => c[1].method === 'PUT')
      ).toHaveLength(1)
    }
  )
  it.each([401, 403])(
    'auth status %i clears authority instead of silently retrying',
    async (status) => {
      const verified = {
        schema_version: 1,
        revision: 0,
        reference_id: 'ref',
        candidate_id: 'candidate',
        output
      }
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(ok(verified))
        .mockResolvedValueOnce(new Response('', { status }))
      await expect(
        createSelectionApi(fetcher).select(
          binding,
          output,
          0,
          new AbortController().signal
        )
      ).rejects.toMatchObject({ status })
      expect(fetcher).toHaveBeenCalledTimes(2)
    }
  )
  it('409 fetches latest state but requires a fresh explicit intent', async () => {
    const verified = {
      schema_version: 1,
      revision: 0,
      reference_id: 'ref',
      candidate_id: 'candidate',
      output
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok(verified))
      .mockResolvedValueOnce(new Response('', { status: 409 }))
      .mockResolvedValueOnce(ok(manifest))
    expect(
      (
        await createSelectionApi(fetcher).select(
          binding,
          output,
          0,
          new AbortController().signal
        )
      ).status
    ).toBe('conflict')
    expect(fetcher.mock.calls.map((c) => c[1].method)).toEqual([
      'POST',
      'PUT',
      'GET'
    ])
  })
  it('aborted result is not confirmation and never retries PUT', async () => {
    const controller = new AbortController()
    const verified = {
      schema_version: 1,
      revision: 0,
      reference_id: 'ref',
      candidate_id: 'candidate',
      output
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok(verified))
      .mockImplementationOnce(async () => {
        controller.abort()
        throw new Error('lost after send')
      })
    expect(
      (
        await createSelectionApi(fetcher).select(
          binding,
          output,
          0,
          controller.signal
        )
      ).status
    ).toBe('outcome_unknown')
    expect(fetcher.mock.calls.map((c) => c[1].method)).toEqual(['POST', 'PUT'])
  })
  it('ambiguous correlation or client authority is rejected rather than adopted', async () => {
    const target = {
      correlation_id: 't0',
      job_id: 'job',
      node_id: '42',
      filename: 'x.txt',
      subfolder: 'private',
      directory_type: 'output' as const,
      media_type: 'text'
    }
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        ok({
          schema_version: 1,
          results: [
            { correlation_id: 'wrong', status: 'bound', binding, output }
          ]
        })
      )
    await expect(
      createSelectionApi(fetcher).associate(
        [target],
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(SelectionApiError)
  })
  it('uses same-origin credentials and strict projection; GET never fabricates Origin', async () => {
    const fetcher = vi.fn().mockResolvedValue(ok(manifest))
    const api = createSelectionApi(fetcher)
    expect(await api.read(binding, new AbortController().signal)).toEqual(
      manifest
    )
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toMatch(/^\/api\/omarketing\/v1\/projects\//)
    expect(init.credentials).toBe('same-origin')
    expect(init.headers).not.toHaveProperty('Origin')
    expect(init.body).toBeUndefined()
    fetcher.mockResolvedValue(ok({ ...manifest, owner_namespace: 'private' }))
    await expect(
      api.read(binding, new AbortController().signal)
    ).rejects.toBeInstanceOf(SelectionApiError)
  })
  it('verify PUT GET confirms exact fingerprint; a lost PUT response uses only GET', async () => {
    const verified = {
      schema_version: 1,
      revision: 0,
      reference_id: 'ref',
      candidate_id: 'candidate',
      output
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok(verified))
      .mockRejectedValueOnce(new TypeError('lost'))
      .mockResolvedValueOnce(ok(manifest))
    const result = await createSelectionApi(fetcher).select(
      binding,
      output,
      0,
      new AbortController().signal
    )
    expect(result.status).toBe('confirmed')
    expect(fetcher.mock.calls.map(([, init]) => init.method)).toEqual([
      'POST',
      'PUT',
      'GET'
    ])
  })
  it('revision change in verify is conflict with zero PUT; readback mismatch never succeeds', async () => {
    const verified = {
      schema_version: 1,
      revision: 2,
      reference_id: 'ref',
      candidate_id: 'candidate',
      output
    }
    const fetcher = vi.fn().mockResolvedValue(ok(verified))
    expect(
      (
        await createSelectionApi(fetcher).select(
          binding,
          output,
          0,
          new AbortController().signal
        )
      ).status
    ).toBe('conflict')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
