// DO NOT EDIT — TEST handoff API 1.0.0
// Source: comfyui-omarketing/schemas/v1/test-handoff-api.schema.json
// Schema SHA-256: 6c6e1f7db9b921444a40502ddb63fe941730bcda078d3a7da1dbf7ffba4030a4
// Generator SHA-256: 029f6fc9b05b641711955ac8341e149174b6cde087ec9d46b38889475ed1808c
import { z } from 'zod'
export const TokenSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(new RegExp('^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$'))
export type Token = z.infer<typeof TokenSchema>

export const UuidSchema = z
  .string()
  .regex(
    new RegExp(
      '^(?!00000000-0000-0000-0000-000000000000$)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  )
export type Uuid = z.infer<typeof UuidSchema>

export const CorrelationSchema = z
  .string()
  .regex(
    new RegExp(
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  )
export type Correlation = z.infer<typeof CorrelationSchema>

export const WorkflowSchema = z
  .string()
  .min(20)
  .max(1024)
  .regex(new RegExp('^workflows/[^/]+/(?:[^/]+/)*[^/]+\\.json$'))
export type Workflow = z.infer<typeof WorkflowSchema>

export const RevisionSchema = z.number().int().min(0).max(99999999)
export type Revision = z.infer<typeof RevisionSchema>

export const ExpectedRevisionSchema = z.number().int().min(1).max(99999999)
export type ExpectedRevision = z.infer<typeof ExpectedRevisionSchema>

export const Sha256Schema = z.string().regex(new RegExp('^[a-f0-9]{64}$'))
export type Sha256 = z.infer<typeof Sha256Schema>

export const RequestIdSchema = z
  .string()
  .regex(new RegExp('^test_[a-f0-9]{64}$'))
export type RequestId = z.infer<typeof RequestIdSchema>

export const HandoffIdSchema = z
  .string()
  .regex(new RegExp('^handoff_[a-f0-9]{40}$'))
export type HandoffId = z.infer<typeof HandoffIdSchema>

export const TimestampSchema = z
  .string()
  .regex(
    new RegExp(
      '^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{6})?Z$'
    )
  )
export type Timestamp = z.infer<typeof TimestampSchema>

export const ScopeSchema = z
  .object({
    project_key: UuidSchema,
    workflow_locator: WorkflowSchema,
    run_key: UuidSchema,
    reference_id: TokenSchema
  })
  .strict()
export type Scope = z.infer<typeof ScopeSchema>

export const FixtureCopySchema = z
  .object({
    title: z.string().max(512),
    body: z.string().min(1).max(20000),
    cta: z.null()
  })
  .strict()
export type FixtureCopy = z.infer<typeof FixtureCopySchema>

export const CurrentEmptySchema = z
  .object({
    manifest_revision: RevisionSchema,
    selection_state: z.literal('empty'),
    candidate_id: z.null(),
    activation_correlation_id: z.null(),
    outcome: z.literal('empty')
  })
  .strict()
export type CurrentEmpty = z.infer<typeof CurrentEmptySchema>

export const CurrentStaleSchema = z
  .object({
    manifest_revision: RevisionSchema,
    selection_state: z.literal('stale'),
    candidate_id: z.null(),
    activation_correlation_id: z.null(),
    outcome: z.literal('empty')
  })
  .strict()
export type CurrentStale = z.infer<typeof CurrentStaleSchema>

export const CurrentSelectedEmptySchema = z
  .object({
    manifest_revision: RevisionSchema,
    selection_state: z.literal('selected'),
    candidate_id: TokenSchema,
    activation_correlation_id: z.null(),
    outcome: z.literal('empty')
  })
  .strict()
export type CurrentSelectedEmpty = z.infer<typeof CurrentSelectedEmptySchema>

export const CurrentSelectedAcceptedSchema = z
  .object({
    manifest_revision: RevisionSchema,
    selection_state: z.literal('selected'),
    candidate_id: TokenSchema,
    activation_correlation_id: CorrelationSchema,
    outcome: z.literal('accepted')
  })
  .strict()
export type CurrentSelectedAccepted = z.infer<
  typeof CurrentSelectedAcceptedSchema
>

export const CurrentSelectedFailedHoldSchema = z
  .object({
    manifest_revision: RevisionSchema,
    selection_state: z.literal('selected'),
    candidate_id: TokenSchema,
    activation_correlation_id: CorrelationSchema,
    outcome: z.literal('failed_hold')
  })
  .strict()
export type CurrentSelectedFailedHold = z.infer<
  typeof CurrentSelectedFailedHoldSchema
>

export const CurrentSelectedUnknownSchema = z
  .object({
    manifest_revision: RevisionSchema,
    selection_state: z.literal('selected'),
    candidate_id: TokenSchema,
    activation_correlation_id: CorrelationSchema,
    outcome: z.literal('outcome_unknown')
  })
  .strict()
export type CurrentSelectedUnknown = z.infer<
  typeof CurrentSelectedUnknownSchema
>

export const CurrentSchema = z.union([
  CurrentEmptySchema,
  CurrentStaleSchema,
  CurrentSelectedEmptySchema,
  CurrentSelectedAcceptedSchema,
  CurrentSelectedFailedHoldSchema,
  CurrentSelectedUnknownSchema
])
export type Current = z.infer<typeof CurrentSchema>

export const SelectionSchema = z
  .object({ manifest_revision: RevisionSchema, candidate_id: TokenSchema })
  .strict()
export type Selection = z.infer<typeof SelectionSchema>

export const HistoryAcceptedSchema = z
  .object({
    activation_correlation_id: CorrelationSchema,
    request_id: RequestIdSchema,
    handoff_id: HandoffIdSchema,
    created_at_utc: TimestampSchema,
    selection: SelectionSchema,
    outcome: z.literal('accepted'),
    acknowledgement_sha256: Sha256Schema,
    reason_code: z.null(),
    publication_job_id: z.null()
  })
  .strict()
export type HistoryAccepted = z.infer<typeof HistoryAcceptedSchema>

export const HistoryFailedHoldSchema = z
  .object({
    activation_correlation_id: CorrelationSchema,
    request_id: RequestIdSchema,
    handoff_id: HandoffIdSchema,
    created_at_utc: TimestampSchema,
    selection: SelectionSchema,
    outcome: z.literal('failed_hold'),
    acknowledgement_sha256: Sha256Schema,
    reason_code: z.literal('contract_not_active'),
    publication_job_id: z.null()
  })
  .strict()
export type HistoryFailedHold = z.infer<typeof HistoryFailedHoldSchema>

export const HistoryUnknownSchema = z
  .object({
    activation_correlation_id: CorrelationSchema,
    request_id: RequestIdSchema,
    handoff_id: HandoffIdSchema,
    created_at_utc: TimestampSchema,
    selection: SelectionSchema,
    outcome: z.literal('outcome_unknown'),
    acknowledgement_sha256: z.null(),
    reason_code: z.null(),
    publication_job_id: z.null()
  })
  .strict()
export type HistoryUnknown = z.infer<typeof HistoryUnknownSchema>

export const HistoryEntrySchema = z.union([
  HistoryAcceptedSchema,
  HistoryFailedHoldSchema,
  HistoryUnknownSchema
])
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>

export const TestHandoffCreateRequestSchema = z
  .object({
    schema_version: z.literal(1),
    workflow_locator: WorkflowSchema,
    activation_correlation_id: CorrelationSchema,
    expected_manifest_revision: ExpectedRevisionSchema
  })
  .strict()
export type TestHandoffCreateRequest = z.infer<
  typeof TestHandoffCreateRequestSchema
>

export const TestHandoffProjectionSchema = z
  .object({
    schema_version: z.literal(1),
    mode: z.literal('local_test'),
    simulated: z.literal(true),
    scope: ScopeSchema,
    fixture_copy: FixtureCopySchema,
    current: CurrentSchema,
    history: z.array(HistoryEntrySchema).min(0).max(64),
    publication_job_id: z.null()
  })
  .strict()
export type TestHandoffProjection = z.infer<typeof TestHandoffProjectionSchema>

export const TestHandoffErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum([
          'AUTH_REQUIRED',
          'CSRF_REJECTED',
          'RATE_LIMITED',
          'INVALID_REQUEST',
          'INVALID_SELECTION_REQUEST',
          'SELECTION_NOT_AUTHORIZED',
          'MANIFEST_REVISION_CONFLICT',
          'IDEMPOTENCY_CONFLICT',
          'OUTPUT_CHANGED_DURING_VALIDATION',
          'SERVICE_UNAVAILABLE'
        ]),
        diagnostic_id: z.string().regex(new RegExp('^[a-f0-9]{32}$'))
      })
      .strict()
  })
  .strict()
export type TestHandoffError = z.infer<typeof TestHandoffErrorSchema>
