// Source schema: .hermes/phase0/schemas/selection-manifest.v1.schema.json
// Schema SHA-256: dd2ec20de553ba7a9b323b237bfdc16cbd10bd1dfe07124ec9491fe456452712
// Generator: generate-contracts.ts v1.0.0 (keyword map v1)
// DO NOT EDIT — regenerate with `pnpm exec tsx .hermes/phase0/tools/generate-contracts.ts`
/* eslint-disable no-control-regex -- source schema rejects control characters by matching their ranges */
import { z } from 'zod'
import { outputLocatorV1Schema } from '@/platform/assets/presentation/outputLocatorV1.generated'

const selectionSchema = z
  .object({
    state: z.enum(['selected', 'stale'] as const),
    output: outputLocatorV1Schema,
    selected_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    owner_user_id: z
      .string()
      .min(1)
      .max(128)
      .regex(new RegExp('^[^\\u0000-\\u001F\\u007F]+$')),
    stale_at: z.string().datetime({ offset: true }).optional(),
    stale_reason: z
      .string()
      .min(1)
      .max(512)
      .regex(new RegExp('^\\S(?:.*\\S)?$'))
      .optional(),
    observed_sha256: z.string().regex(new RegExp('^[a-f0-9]{64}$')).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value['state'] === 'stale') {
      for (const key of ['stale_at', 'stale_reason'] as const) {
        if (value[key] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when state is stale`
          })
        }
      }
    } else {
      for (const key of [
        'stale_at',
        'stale_reason',
        'observed_sha256'
      ] as const) {
        if (value[key] !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is only allowed when state is stale`
          })
        }
      }
    }
  })

export const selectionManifestV1Schema = z
  .object({
    schema_version: z.literal(1),
    revision: z.number().int().min(1).max(9007199254740991),
    project_key: z
      .string()
      .regex(
        new RegExp(
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
      .uuid()
      .refine((v) => v !== '00000000-0000-0000-0000-000000000000', {
        message: 'must not be 00000000-0000-0000-0000-000000000000'
      }),
    workflow_locator: z
      .string()
      .min(16)
      .max(1024)
      .regex(
        new RegExp(
          '^(?!/)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//)(?!.*\\\\)workflows/(?:[^/\\u0000-\\u001F\\u007F]+/)*[^/\\u0000-\\u001F\\u007F]+\\.json$'
        )
      ),
    run_key: z
      .string()
      .regex(
        new RegExp(
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
      .uuid()
      .refine((v) => v !== '00000000-0000-0000-0000-000000000000', {
        message: 'must not be 00000000-0000-0000-0000-000000000000'
      }),
    selections: z
      .record(
        z
          .string()
          .min(1)
          .max(128)
          .regex(new RegExp('^[A-Za-z0-9][A-Za-z0-9._:@-]*$'))
          .regex(new RegExp('^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$')),
        selectionSchema
      )
      .refine((v) => Object.keys(v).length >= 1, {
        message: 'at least 1 entry required'
      })
  })
  .strict()

export type SelectionManifestV1 = Readonly<
  z.infer<typeof selectionManifestV1Schema>
>
