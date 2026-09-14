import type { z } from 'zod'
import type { Binding } from './localSelectionApi.generated'
import type {
  TestHandoffError,
  TestHandoffProjection
} from './testHandoffApi.generated'
import {
  TestHandoffCreateRequestSchema,
  TestHandoffErrorSchema,
  TestHandoffProjectionSchema
} from './testHandoffApi.generated'

const prefix = '/api/omarketing/v1'

type TestHandoffErrorCode = TestHandoffError['error']['code']

export class TestHandoffApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: TestHandoffErrorCode | null = null
  ) {
    super('Local TEST handoff unavailable')
  }
}

export function createTestHandoffApi(
  fetcher: typeof fetch = (...args) => fetch(...args)
) {
  function path(binding: Binding): string {
    return `${prefix}/projects/${encodeURIComponent(binding.project_key)}/runs/${encodeURIComponent(binding.run_key)}/references/${encodeURIComponent(binding.reference_id)}/test-handoffs`
  }

  async function request<T>(
    binding: Binding,
    method: 'GET' | 'POST',
    schema: z.ZodType<T>,
    signal: AbortSignal,
    body?: unknown
  ): Promise<T> {
    signal.throwIfAborted()
    const response = await fetcher(path(binding), {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new TestHandoffApiError(response.ok ? 502 : response.status)
    }
    if (!response.ok) {
      const error = TestHandoffErrorSchema.safeParse(payload)
      throw new TestHandoffApiError(
        response.status,
        error.success ? error.data.error.code : null
      )
    }
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new TestHandoffApiError(502)
    signal.throwIfAborted()
    return parsed.data
  }

  function verifyScope(
    binding: Binding,
    projection: TestHandoffProjection
  ): TestHandoffProjection {
    if (
      projection.scope.project_key !== binding.project_key ||
      projection.scope.workflow_locator !== binding.workflow_locator ||
      projection.scope.run_key !== binding.run_key ||
      projection.scope.reference_id !== binding.reference_id
    )
      throw new TestHandoffApiError(502)
    return projection
  }

  return {
    async read(binding: Binding, signal: AbortSignal) {
      return verifyScope(
        binding,
        await request(binding, 'GET', TestHandoffProjectionSchema, signal)
      )
    },
    async create(
      binding: Binding,
      expectedManifestRevision: number,
      activationCorrelationId: string,
      signal: AbortSignal
    ) {
      const body = TestHandoffCreateRequestSchema.parse({
        schema_version: 1,
        workflow_locator: binding.workflow_locator,
        activation_correlation_id: activationCorrelationId,
        expected_manifest_revision: expectedManifestRevision
      })
      return verifyScope(
        binding,
        await request(
          binding,
          'POST',
          TestHandoffProjectionSchema,
          signal,
          body
        )
      )
    }
  }
}

export type TestHandoffApi = ReturnType<typeof createTestHandoffApi>
