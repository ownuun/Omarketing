// DO NOT EDIT — local selection API 1.0.0
// Source: comfyui-omarketing/schemas/v1/local-selection-api.schema.json
// Schema SHA-256: 916b2d10a713d0f4e29cf4a07bafe6df9fabbc57bfc462eb1d21318dacbe8857
// Generator SHA-256: f5fb0023576ec8da9a0c99d264cf15cee83c7bd8c85da047b60a2a2a9f8328c3
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

export const WorkflowSchema = z
  .string()
  .max(1024)
  .regex(new RegExp('^workflows/[^/]+/(?:[^/]+/)*[^/]+\\.json$'))
export type Workflow = z.infer<typeof WorkflowSchema>

export const RevisionSchema = z.number().int().min(0).max(9007199254740991)
export type Revision = z.infer<typeof RevisionSchema>

export const OutputSchema = z
  .object({
    job_id: z.string().min(1).max(1024),
    node_id: z.string().min(1).max(1024),
    filename: z.string().min(1).max(1024),
    media_type: z.string().min(1).max(1024),
    sha256: z.string().regex(new RegExp('^[a-f0-9]{64}$')),
    size_bytes: RevisionSchema,
    mime_type: z.string().min(1).max(1024)
  })
  .strict()
export type Output = z.infer<typeof OutputSchema>

export const BindingSchema = z
  .object({
    project_key: UuidSchema,
    workflow_locator: WorkflowSchema,
    run_key: UuidSchema,
    reference_id: TokenSchema,
    candidate_id: TokenSchema
  })
  .strict()
export type Binding = z.infer<typeof BindingSchema>

export const TargetSchema = z
  .object({
    correlation_id: TokenSchema,
    job_id: z.string().min(1).max(1024),
    node_id: z.string().min(1).max(1024),
    directory_type: z.literal('output'),
    subfolder: z.string().min(0).max(1024),
    filename: z.string().min(1).max(1024),
    media_type: z.string().min(1).max(1024)
  })
  .strict()
export type Target = z.infer<typeof TargetSchema>

export const AssociationRequestSchema = z
  .object({
    schema_version: z.literal(1),
    targets: z.array(TargetSchema).min(1).max(64)
  })
  .strict()
export type AssociationRequest = z.infer<typeof AssociationRequestSchema>

export const AssociationResultSchema = z.union([
  z
    .object({
      correlation_id: TokenSchema,
      status: z.literal('bound'),
      binding: BindingSchema,
      output: OutputSchema
    })
    .strict(),
  z
    .object({
      correlation_id: TokenSchema,
      status: z.enum(['not-applicable', 'unavailable'])
    })
    .strict()
])
export type AssociationResult = z.infer<typeof AssociationResultSchema>

export const AssociationResponseSchema = z
  .object({
    schema_version: z.literal(1),
    results: z.array(AssociationResultSchema).min(1).max(64)
  })
  .strict()
export type AssociationResponse = z.infer<typeof AssociationResponseSchema>

export const SelectionSchema = z.union([
  z
    .object({
      reference_id: TokenSchema,
      selected_at: z.string().min(1).max(1024),
      updated_at: z.string().min(1).max(1024),
      state: z.literal('selected'),
      availability: z.literal('bound'),
      candidate_id: TokenSchema,
      output: OutputSchema
    })
    .strict(),
  z
    .object({
      reference_id: TokenSchema,
      selected_at: z.string().min(1).max(1024),
      updated_at: z.string().min(1).max(1024),
      state: z.literal('selected'),
      availability: z.literal('unavailable'),
      candidate_id: z.null(),
      output: z.null()
    })
    .strict(),
  z
    .object({
      reference_id: TokenSchema,
      selected_at: z.string().min(1).max(1024),
      updated_at: z.string().min(1).max(1024),
      state: z.literal('stale'),
      availability: z.literal('bound'),
      candidate_id: TokenSchema,
      output: OutputSchema,
      stale_reason: z.enum([
        'output_missing',
        'mime_not_allowed',
        'output_too_large',
        'output_changed'
      ]),
      stale_at: z.string().min(1).max(1024)
    })
    .strict(),
  z
    .object({
      reference_id: TokenSchema,
      selected_at: z.string().min(1).max(1024),
      updated_at: z.string().min(1).max(1024),
      state: z.literal('stale'),
      availability: z.literal('unavailable'),
      candidate_id: z.null(),
      output: z.null(),
      stale_reason: z.enum([
        'output_missing',
        'mime_not_allowed',
        'output_too_large',
        'output_changed'
      ]),
      stale_at: z.string().min(1).max(1024)
    })
    .strict()
])
export type Selection = z.infer<typeof SelectionSchema>

export const ManifestResponseSchema = z
  .object({
    schema_version: z.literal(1),
    project_key: UuidSchema,
    workflow_locator: WorkflowSchema,
    run_key: UuidSchema,
    revision: RevisionSchema,
    selections: z.array(SelectionSchema).min(0).max(10000)
  })
  .strict()
export type ManifestResponse = z.infer<typeof ManifestResponseSchema>

export const VerifyRequestSchema = z
  .object({
    schema_version: z.literal(1),
    project_key: UuidSchema,
    workflow_locator: WorkflowSchema,
    run_key: UuidSchema,
    reference_id: TokenSchema,
    candidate_id: TokenSchema
  })
  .strict()
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>

export const WriteRequestSchema = z
  .object({
    schema_version: z.literal(1),
    workflow_locator: WorkflowSchema,
    expected_manifest_revision: RevisionSchema,
    intent: z.literal('confirm_final_selection'),
    candidate_id: TokenSchema
  })
  .strict()
export type WriteRequest = z.infer<typeof WriteRequestSchema>

export const RevalidateRequestSchema = z
  .object({
    schema_version: z.literal(1),
    workflow_locator: WorkflowSchema,
    expected_manifest_revision: RevisionSchema
  })
  .strict()
export type RevalidateRequest = z.infer<typeof RevalidateRequestSchema>

export const WriteResponseSchema = z
  .object({
    schema_version: z.literal(1),
    revision: RevisionSchema,
    reference_id: TokenSchema,
    candidate_id: TokenSchema,
    output: OutputSchema
  })
  .strict()
export type WriteResponse = z.infer<typeof WriteResponseSchema>

export const RevisionResponseSchema = z
  .object({ schema_version: z.literal(1), revision: RevisionSchema })
  .strict()
export type RevisionResponse = z.infer<typeof RevisionResponseSchema>
