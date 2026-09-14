import type { z } from 'zod'
import type {
  Binding,
  ManifestResponse,
  Output,
  Target
} from './localSelectionApi.generated'
import {
  AssociationRequestSchema,
  AssociationResponseSchema,
  BindingSchema,
  ManifestResponseSchema,
  RevalidateRequestSchema,
  RevisionResponseSchema,
  VerifyRequestSchema,
  WriteRequestSchema,
  WriteResponseSchema
} from './localSelectionApi.generated'

const PREFIX = '/api/omarketing/v1'
export class SelectionApiError extends Error {
  constructor(readonly status: number) {
    super('Selection API unavailable')
  }
}
export type SelectionResult =
  | { status: 'confirmed'; manifest: ManifestResponse }
  | { status: 'conflict' | 'outcome_unknown' }
export const sameOutput = (a: Output, b: Output): boolean =>
  a.job_id === b.job_id &&
  a.node_id === b.node_id &&
  a.filename === b.filename &&
  a.media_type === b.media_type &&
  a.sha256 === b.sha256 &&
  a.size_bytes === b.size_bytes &&
  a.mime_type === b.mime_type

export function createSelectionApi(
  fetcher: typeof fetch = (...args) => fetch(...args)
) {
  async function request<T>(
    path: string,
    method: string,
    schema: z.ZodType<T>,
    signal: AbortSignal,
    body?: unknown
  ): Promise<T> {
    signal.throwIfAborted()
    const response = await fetcher(PREFIX + path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (!response.ok) throw new SelectionApiError(response.status)
    const parsed = schema.safeParse(await response.json())
    if (!parsed.success) throw new SelectionApiError(502)
    signal.throwIfAborted()
    return parsed.data
  }
  function scope(binding: Binding): string {
    const b = BindingSchema.parse(binding)
    return `/projects/${encodeURIComponent(b.project_key)}/runs/${encodeURIComponent(b.run_key)}`
  }
  async function read(
    binding: Binding,
    signal: AbortSignal
  ): Promise<ManifestResponse> {
    const result = await request(
      scope(binding) + '/selection-manifest',
      'GET',
      ManifestResponseSchema,
      signal
    )
    if (
      result.project_key !== binding.project_key ||
      result.workflow_locator !== binding.workflow_locator ||
      result.run_key !== binding.run_key ||
      new Set(result.selections.map((s) => s.reference_id)).size !==
        result.selections.length
    )
      throw new SelectionApiError(502)
    return result
  }
  return {
    async associate(targets: Target[], signal: AbortSignal) {
      const body = AssociationRequestSchema.parse({
        schema_version: 1,
        targets
      })
      if (new Set(targets.map((t) => t.correlation_id)).size !== targets.length)
        throw new SelectionApiError(400)
      const response = await request(
        '/candidate-associations:resolve',
        'POST',
        AssociationResponseSchema,
        signal,
        body
      )
      if (
        response.results.length !== targets.length ||
        new Set(response.results.map((r) => r.correlation_id)).size !==
          targets.length
      )
        throw new SelectionApiError(502)
      for (const result of response.results) {
        const target = targets.find(
          (t) => t.correlation_id === result.correlation_id
        )
        if (
          !target ||
          (result.status === 'bound' &&
            (result.output.job_id !== target.job_id ||
              result.output.node_id !== target.node_id ||
              result.output.filename !== target.filename ||
              result.output.media_type !== target.media_type))
        )
          throw new SelectionApiError(502)
      }
      return response
    },
    read,
    async revalidate(binding: Binding, revision: number, signal: AbortSignal) {
      const body = RevalidateRequestSchema.parse({
        schema_version: 1,
        workflow_locator: binding.workflow_locator,
        expected_manifest_revision: revision
      })
      return request(
        scope(binding) + '/selection-manifest:revalidate',
        'POST',
        RevisionResponseSchema,
        signal,
        body
      )
    },
    async select(
      binding: Binding,
      output: Output,
      revision: number,
      signal: AbortSignal
    ): Promise<SelectionResult> {
      const verified = await request(
        '/output-locators:verify',
        'POST',
        WriteResponseSchema,
        signal,
        VerifyRequestSchema.parse({ schema_version: 1, ...binding })
      )
      if (
        verified.revision !== revision ||
        verified.reference_id !== binding.reference_id ||
        verified.candidate_id !== binding.candidate_id ||
        !sameOutput(verified.output, output)
      )
        return { status: 'conflict' }
      let conflict = false
      try {
        const written = await request(
          scope(binding) +
            `/selections/${encodeURIComponent(binding.reference_id)}`,
          'PUT',
          WriteResponseSchema,
          signal,
          WriteRequestSchema.parse({
            schema_version: 1,
            workflow_locator: binding.workflow_locator,
            expected_manifest_revision: revision,
            intent: 'confirm_final_selection',
            candidate_id: binding.candidate_id
          })
        )
        if (
          written.reference_id !== binding.reference_id ||
          written.candidate_id !== binding.candidate_id ||
          !sameOutput(written.output, output)
        )
          return { status: 'outcome_unknown' }
      } catch (error) {
        if (
          error instanceof SelectionApiError &&
          [401, 403].includes(error.status)
        )
          throw error
        conflict = error instanceof SelectionApiError && error.status === 409
        // Never retry PUT, including abort-after-send. Re-entry GET recovers aborts.
      }
      try {
        const manifest = await read(binding, signal)
        const selected = manifest.selections.find(
          (s) => s.reference_id === binding.reference_id
        )
        if (
          !conflict &&
          selected?.availability === 'bound' &&
          selected.state === 'selected' &&
          selected.candidate_id === binding.candidate_id &&
          sameOutput(selected.output, output)
        )
          return { status: 'confirmed', manifest }
        return { status: conflict ? 'conflict' : 'outcome_unknown' }
      } catch (error) {
        if (
          error instanceof SelectionApiError &&
          [401, 403].includes(error.status)
        )
          throw error
        return { status: 'outcome_unknown' }
      }
    }
  }
}
export type SelectionApi = ReturnType<typeof createSelectionApi>
