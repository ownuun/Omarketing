import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const INPUT = resolve(
  ROOT,
  '../comfyui-omarketing/schemas/v1/test-handoff-api.schema.json'
)
export const OUTPUT = resolve(
  ROOT,
  'src/extensions/core/omarketing/testHandoffApi.generated.ts'
)
export const VERSION = '1.0.0'

type Schema = { [key: string]: unknown }

const keywords = new Set([
  '$schema',
  'title',
  '$defs',
  '$ref',
  'type',
  'const',
  'enum',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'anyOf'
])

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export function render(root: Schema): string {
  function audit(node: Schema, path: string): void {
    for (const [key, value] of Object.entries(node)) {
      if (!keywords.has(key))
        throw new Error(`Unsupported keyword ${path}/${key}`)
      if (['$defs', 'properties'].includes(key)) {
        for (const [name, child] of Object.entries(value as Schema))
          audit(child as Schema, `${path}/${key}/${name}`)
      } else if (key === 'items') audit(value as Schema, `${path}/items`)
      else if (key === 'anyOf') {
        ;(value as Schema[]).forEach((child, index) =>
          audit(child, `${path}/anyOf/${index}`)
        )
      }
    }
  }

  audit(root, '#')
  const definitions = root.$defs as Record<string, Schema>
  const emitted = new Set<string>()
  const visiting = new Set<string>()
  const lines: string[] = []

  function definition(name: string): string {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || !(name in definitions))
      throw new Error('Unsupported reference')
    if (visiting.has(name)) throw new Error('Unsupported recursive reference')
    if (!emitted.has(name)) {
      visiting.add(name)
      const expression = emit(definitions[name])
      visiting.delete(name)
      emitted.add(name)
      lines.push(
        `export const ${name}Schema = ${expression}\nexport type ${name} = z.infer<typeof ${name}Schema>\n`
      )
    }
    return `${name}Schema`
  }

  function emit(schema: Schema): string {
    if ('$ref' in schema) {
      if (
        Object.keys(schema).length !== 1 ||
        typeof schema.$ref !== 'string' ||
        !schema.$ref.startsWith('#/$defs/')
      )
        throw new Error('Unsupported reference siblings')
      return definition(schema.$ref.slice(8))
    }
    if ('const' in schema) {
      if (Object.keys(schema).some((key) => !['const', 'type'].includes(key)))
        throw new Error('Unsupported const siblings')
      if (
        schema.type !== undefined &&
        (schema.type === 'integer'
          ? !Number.isSafeInteger(schema.const)
          : typeof schema.const !== schema.type)
      )
        throw new Error('Incompatible constant type')
      return schema.const === null
        ? 'z.null()'
        : `z.literal(${JSON.stringify(schema.const)})`
    }
    if ('enum' in schema) {
      if (
        Object.keys(schema).length !== 1 ||
        !(schema.enum as unknown[]).every((value) => typeof value === 'string')
      )
        throw new Error('Unsupported enum')
      return `z.enum(${JSON.stringify(schema.enum)})`
    }
    if ('anyOf' in schema) {
      if (Object.keys(schema).length !== 1)
        throw new Error('Unsupported union siblings')
      return `z.union([${(schema.anyOf as Schema[]).map(emit).join(',')}])`
    }
    let output: string
    if (schema.type === 'object') {
      if (schema.additionalProperties !== false)
        throw new Error('Unsupported open object')
      const required = new Set(schema.required as string[])
      output = `z.object({${Object.entries(
        schema.properties as Record<string, Schema>
      )
        .map(
          ([key, value]) =>
            `${JSON.stringify(key)}:${emit(value)}${required.has(key) ? '' : '.optional()'}`
        )
        .join(',')}}).strict()`
    } else if (schema.type === 'array') {
      output = `z.array(${emit(schema.items as Schema)})`
    } else if (schema.type === 'string') {
      output = 'z.string()'
    } else if (schema.type === 'integer') {
      output = 'z.number().int()'
    } else {
      throw new Error('Unsupported type')
    }
    const allowed =
      schema.type === 'string'
        ? ['type', 'pattern', 'minLength', 'maxLength']
        : schema.type === 'integer'
          ? ['type', 'minimum', 'maximum']
          : schema.type === 'array'
            ? ['type', 'items', 'minItems', 'maxItems']
            : ['type', 'properties', 'required', 'additionalProperties']
    if (Object.keys(schema).some((key) => !allowed.includes(key)))
      throw new Error('Unsupported keyword for type')
    for (const key of ['minimum', 'minLength', 'minItems'])
      if (key in schema) output += `.min(${schema[key]})`
    for (const key of ['maximum', 'maxLength', 'maxItems'])
      if (key in schema) output += `.max(${schema[key]})`
    if ('pattern' in schema)
      output += `.regex(new RegExp(${JSON.stringify(schema.pattern)}))`
    return output
  }

  Object.keys(definitions).forEach(definition)
  return `// DO NOT EDIT — TEST handoff API ${VERSION}\n// Source: comfyui-omarketing/schemas/v1/test-handoff-api.schema.json\n// Schema SHA-256: ${hash(readFileSync(INPUT, 'utf8'))}\n// Generator SHA-256: ${hash(readFileSync(fileURLToPath(import.meta.url), 'utf8'))}\nimport { z } from 'zod'\n${lines.join('\n')}`
}

export function generate(): {
  changedOutputs: number
  inputSha256: string
  outputSha256: string
} {
  const input = readFileSync(INPUT, 'utf8')
  const staged = `${OUTPUT}.test-handoff-stage.ts`
  writeFileSync(staged, render(JSON.parse(input)), { flag: 'wx' })
  try {
    execFileSync(
      resolve(ROOT, 'node_modules/.bin/oxfmt'),
      ['--write', staged],
      {
        cwd: ROOT,
        stdio: 'ignore'
      }
    )
    const output = readFileSync(staged, 'utf8')
    const changed =
      !existsSync(OUTPUT) || readFileSync(OUTPUT, 'utf8') !== output
    if (changed) {
      renameSync(staged, OUTPUT)
    } else {
      unlinkSync(staged)
    }
    return {
      changedOutputs: Number(changed),
      inputSha256: hash(input),
      outputSha256: hash(output)
    }
  } catch (error) {
    try {
      unlinkSync(staged)
    } catch {
      // Preserve the formatter failure as the authoritative generation failure.
    }
    throw error
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(generate()))
