import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const INPUT = resolve(
  ROOT,
  '../comfyui-omarketing/schemas/v1/local-selection-api.schema.json'
)
export const OUTPUT = resolve(
  ROOT,
  'src/extensions/core/omarketing/localSelectionApi.generated.ts'
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
      else if (key === 'anyOf')
        (value as Schema[]).forEach((child, index) =>
          audit(child, `${path}/anyOf/${index}`)
        )
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
  function emit(s: Schema): string {
    if ('$ref' in s) {
      if (
        Object.keys(s).length !== 1 ||
        typeof s.$ref !== 'string' ||
        !s.$ref.startsWith('#/$defs/')
      )
        throw new Error('Unsupported reference siblings')
      return definition(s.$ref.slice(8))
    }
    if ('const' in s) {
      if (Object.keys(s).some((k) => !['const', 'type'].includes(k)))
        throw new Error('Unsupported const siblings')
      if (
        s.type !== undefined &&
        (s.type === 'integer'
          ? !Number.isSafeInteger(s.const)
          : typeof s.const !== s.type)
      )
        throw new Error('Incompatible constant type')
      return s.const === null
        ? 'z.null()'
        : `z.literal(${JSON.stringify(s.const)})`
    }
    if ('enum' in s) {
      if (
        Object.keys(s).length !== 1 ||
        !(s.enum as unknown[]).every((v) => typeof v === 'string')
      )
        throw new Error('Unsupported enum')
      return `z.enum(${JSON.stringify(s.enum)})`
    }
    if ('anyOf' in s) {
      if (Object.keys(s).length !== 1)
        throw new Error('Unsupported union siblings')
      return `z.union([${(s.anyOf as Schema[]).map(emit).join(',')}])`
    }
    let out: string
    if (s.type === 'object') {
      if (s.additionalProperties !== false)
        throw new Error('Unsupported open object')
      const required = new Set(s.required as string[])
      out = `z.object({${Object.entries(s.properties as Record<string, Schema>)
        .map(
          ([key, value]) =>
            `${JSON.stringify(key)}:${emit(value)}${required.has(key) ? '' : '.optional()'}`
        )
        .join(',')}}).strict()`
    } else if (s.type === 'array') out = `z.array(${emit(s.items as Schema)})`
    else if (s.type === 'string') out = 'z.string()'
    else if (s.type === 'integer') out = 'z.number().int()'
    else throw new Error('Unsupported type')
    const allowed =
      s.type === 'string'
        ? ['type', 'pattern', 'minLength', 'maxLength']
        : s.type === 'integer'
          ? ['type', 'minimum', 'maximum']
          : s.type === 'array'
            ? ['type', 'items', 'minItems', 'maxItems']
            : ['type', 'properties', 'required', 'additionalProperties']
    if (Object.keys(s).some((k) => !allowed.includes(k)))
      throw new Error('Unsupported keyword for type')
    for (const key of ['minimum', 'minLength', 'minItems'])
      if (key in s) out += `.min(${s[key]})`
    for (const key of ['maximum', 'maxLength', 'maxItems'])
      if (key in s) out += `.max(${s[key]})`
    if ('pattern' in s)
      out += `.regex(new RegExp(${JSON.stringify(s.pattern)}))`
    return out
  }
  Object.keys(definitions).forEach(definition)
  return `// DO NOT EDIT — local selection API ${VERSION}\n// Source: comfyui-omarketing/schemas/v1/local-selection-api.schema.json\n// Schema SHA-256: ${hash(readFileSync(INPUT, 'utf8'))}\n// Generator SHA-256: ${hash(readFileSync(fileURLToPath(import.meta.url), 'utf8'))}\nimport { z } from 'zod'\n${lines.join('\n')}`
}

export function generate(): {
  changedOutputs: number
  inputSha256: string
  outputSha256: string
} {
  const input = readFileSync(INPUT, 'utf8')
  const output = render(JSON.parse(input))
  const changed = !existsSync(OUTPUT) || readFileSync(OUTPUT, 'utf8') !== output
  if (changed) {
    const staged = `${OUTPUT}.local-selection-stage`
    writeFileSync(staged, output, { flag: 'wx' })
    renameSync(staged, OUTPUT)
  }
  return {
    changedOutputs: Number(changed),
    inputSha256: hash(input),
    outputSha256: hash(output)
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(generate()))
