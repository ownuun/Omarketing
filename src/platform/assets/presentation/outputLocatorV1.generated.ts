// Source schema: .hermes/phase0/schemas/output-locator.v1.schema.json
// Schema SHA-256: 194e06f4a1658962c8e394b8f90c26b8ab5261ab2d2fa1bdf805019cdb1978f0
// Generator: generate-contracts.ts v1.0.0 (keyword map v1)
// DO NOT EDIT — regenerate with `pnpm exec tsx .hermes/phase0/tools/generate-contracts.ts`
/* eslint-disable no-control-regex -- source schema rejects control characters by matching their ranges */
import { z } from 'zod'

export const outputLocatorV1Schema = z
  .object({
    job_id: z
      .string()
      .regex(
        new RegExp(
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
      .uuid(),
    node_id: z
      .string()
      .min(1)
      .max(128)
      .regex(new RegExp('^[^\\u0000-\\u001F\\u007F]+$')),
    directory_type: z.literal('output'),
    subfolder: z
      .string()
      .min(1)
      .max(1024)
      .regex(
        new RegExp(
          '^(?!/)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//)(?!.*\\\\)[^/\\u0000-\\u001F\\u007F]+(?:/[^/\\u0000-\\u001F\\u007F]+)*$'
        )
      ),
    filename: z
      .string()
      .min(1)
      .max(255)
      .regex(new RegExp('^(?!\\.{1,2}$)[^/\\\\\\u0000-\\u001F\\u007F]+$')),
    media_type: z
      .string()
      .min(1)
      .max(64)
      .regex(new RegExp('^[a-z][a-z0-9_-]*$')),
    sha256: z.string().regex(new RegExp('^[a-f0-9]{64}$')),
    size_bytes: z.number().int().min(0).max(9007199254740991),
    mime_type: z
      .string()
      .min(3)
      .max(127)
      .regex(
        new RegExp('^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$')
      ),
    asset_id: z
      .string()
      .min(1)
      .max(256)
      .regex(new RegExp('^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$'))
      .optional()
  })
  .strict()

export type OutputLocatorV1 = Readonly<z.infer<typeof outputLocatorV1Schema>>
