import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(directory, 'release-receipt.v1.schema.json')

export const VALIDATION_DISCLAIMER =
  'Structural validation only; this does not establish production readiness. It does not constitute legal approval or authorize publication.'
export const EXIT_CODES = Object.freeze({
  PASS: 0,
  INVALID: 1,
  USAGE_OR_INPUT_ERROR: 2
})
export const RELEASE_RECEIPT_SCHEMA = deepFreeze(
  JSON.parse(readFileSync(schemaPath, 'utf8'))
)

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$ref',
  '$defs',
  '$comment',
  'title',
  'description',
  'type',
  'const',
  'enum',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum'
])
const SUPPORTED_SCHEMA_TYPES = new Set([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string'
])
const SUPPORTED_SCHEMA_FORMATS = new Set(['date', 'date-time', 'uri'])
const SCHEMA_METADATA_KEYWORDS = new Set(['$comment', 'description', 'title'])
const NON_NEGATIVE_INTEGER_KEYWORDS = [
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
  'minLength',
  'maxLength'
]
const PLACEHOLDER_PATTERN =
  /(?:\b(?:todo|tbd|placeholder|changeme|change[_ -]?me|fill[_ -]?me|unknown|insert[_ -]?here|yyyy-mm-dd)\b|<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\})/i
const RESERVED_HOST_PATTERN =
  /^(?:localhost|(?:.+\.)?(?:example\.(?:com|net|org)|invalid|test))$/i
const SECRET_ENVIRONMENT_NAME_PATTERN =
  /(?:^|_)(?:PASSWORDS?|PASSWDS?|SECRETS?|TOKENS?|API_?KEYS?|CREDENTIALS?|COOKIES?|SESSIONS?|PRIVATE_?KEYS?|CLIENT_?SECRETS?|ACCESS_?KEYS?|AUTH)(?:_|$)/i
const PEM_PRIVATE_KEY_HEADER_PATTERN =
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/i
const SECRET_TOKEN_PREFIX_PATTERN =
  /^(?:bearer[ \t]+)?(?:sk-|ghp_|github_pat_)/i
const SYNTHETIC_SECRET_SENTINEL_PATTERN =
  /synthetic(?:[-_.:\s]+)secret(?:[-_.:\s]+)do(?:[-_.:\s]+)not(?:[-_.:\s]+)store/i
const BASE64URL_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}(?![\s\S])/
const COMMIT_PATTERN = /^[a-f0-9]{40}(?![\s\S])/
const UTC_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?![\s\S])/
const UTC_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z(?![\s\S])/
const MOVING_SOURCE_NAMES = new Set([
  'develop',
  'development',
  'latest',
  'main',
  'master',
  'stable',
  'trunk'
])
const SOURCE_ARCHIVE_SUFFIXES = ['.tar.gz', '.tgz', '.zip']
const GITHUB_REF_SELECTORS = new Set(['tar.gz', 'zip'])
const URI_UNRESERVED_PATTERN = /^[A-Za-z0-9._~-]$/

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function isUri(value) {
  if (typeof value !== 'string' || /\s/.test(value)) return false

  try {
    return new URL(value).protocol.length > 1
  } catch {
    return false
  }
}

function normalizeIdentity(value) {
  if (typeof value !== 'string') return null

  try {
    return new URL(value).href.replaceAll(
      /%([a-f0-9]{2})/gi,
      (encoded, hex) => {
        const decoded = String.fromCharCode(Number.parseInt(hex, 16))
        return URI_UNRESERVED_PATTERN.test(decoded)
          ? decoded
          : encoded.toUpperCase()
      }
    )
  } catch {
    return null
  }
}

function isValidUtcDate(value) {
  if (typeof value !== 'string') return false
  const match = UTC_DATE_PATTERN.exec(value)
  if (!match) return false

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function isValidUtcDateTime(value) {
  if (typeof value !== 'string') return false
  const match = UTC_DATE_TIME_PATTERN.exec(value)
  if (!match) return false

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)

  if (hour > 23 || minute > 59 || second > 59) return false

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  )
}

function utcDateTimeNanoseconds(value) {
  if (!isValidUtcDateTime(value)) return null

  const match = UTC_DATE_TIME_PATTERN.exec(value)
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match
  const fractionText = match[7] ?? ''
  const epochMilliseconds = Date.UTC(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Number(secondText)
  )

  return (
    BigInt(epochMilliseconds) * 1_000_000n + BigInt(fractionText.padEnd(9, '0'))
  )
}

function addError(errors, code, path, message) {
  errors.push({ code, path, message })
}

export function assertSupportedSchema(schema, path = '#', rootSchema = schema) {
  if (!isRecord(schema)) {
    throw new Error(`Schema node ${path} must be an object`)
  }

  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(keyword)) {
      throw new Error(`Unsupported schema keyword ${keyword} at ${path}`)
    }
  }

  for (const keyword of [
    '$schema',
    '$id',
    '$ref',
    '$comment',
    'title',
    'description',
    'type',
    'pattern',
    'format'
  ]) {
    if (schema[keyword] !== undefined && typeof schema[keyword] !== 'string') {
      throw new Error(`Schema keyword ${keyword} at ${path} must be a string`)
    }
  }

  if (schema.type && !SUPPORTED_SCHEMA_TYPES.has(schema.type)) {
    throw new Error(`Unsupported JSON Schema type ${schema.type} at ${path}`)
  }
  if (schema.format && !SUPPORTED_SCHEMA_FORMATS.has(schema.format)) {
    throw new Error(
      `Unsupported JSON Schema format ${schema.format} at ${path}`
    )
  }
  if (schema.pattern !== undefined) {
    try {
      new RegExp(schema.pattern, 'u')
    } catch {
      throw new Error(`Invalid JSON Schema pattern at ${path}`)
    }
  }

  for (const keyword of NON_NEGATIVE_INTEGER_KEYWORDS) {
    if (
      schema[keyword] !== undefined &&
      (!Number.isInteger(schema[keyword]) || schema[keyword] < 0)
    ) {
      throw new Error(
        `Schema keyword ${keyword} at ${path} must be a non-negative integer`
      )
    }
  }
  for (const keyword of ['minimum', 'maximum']) {
    if (
      schema[keyword] !== undefined &&
      (typeof schema[keyword] !== 'number' || !Number.isFinite(schema[keyword]))
    ) {
      throw new Error(
        `Schema keyword ${keyword} at ${path} must be a finite number`
      )
    }
  }

  if (
    schema.enum !== undefined &&
    (!Array.isArray(schema.enum) || schema.enum.length === 0)
  ) {
    throw new Error(`Schema enum at ${path} must be a non-empty array`)
  }
  if (
    schema.required !== undefined &&
    (!Array.isArray(schema.required) ||
      schema.required.some((name) => typeof name !== 'string') ||
      new Set(schema.required).size !== schema.required.length)
  ) {
    throw new Error(
      `Schema required keyword at ${path} must contain unique strings`
    )
  }
  if (
    schema.uniqueItems !== undefined &&
    typeof schema.uniqueItems !== 'boolean'
  ) {
    throw new Error(`Schema uniqueItems at ${path} must be boolean`)
  }

  if (schema.$ref !== undefined) {
    assertLocalRefPath(schema.$ref)
    const target = resolveLocalRef(schema.$ref, rootSchema)
    if (!isConstrainedSchemaNode(target)) {
      throw new Error(
        `JSON Schema reference ${schema.$ref} at ${path} does not resolve to a constrained schema node`
      )
    }
    const validationSiblings = Object.keys(schema).filter(
      (keyword) => keyword !== '$ref' && !SCHEMA_METADATA_KEYWORDS.has(keyword)
    )
    if (validationSiblings.length > 0) {
      throw new Error(
        `Schema reference at ${path} has unsupported validation siblings`
      )
    }
  }

  for (const collectionName of ['$defs', 'properties']) {
    const collection = schema[collectionName]
    if (collection === undefined) continue
    if (!isRecord(collection)) {
      throw new Error(
        `Schema keyword ${collectionName} at ${path} must be an object`
      )
    }
    for (const [name, childSchema] of Object.entries(collection)) {
      assertSupportedSchema(
        childSchema,
        `${path}/${collectionName}/${name}`,
        rootSchema
      )
    }
  }

  if (schema.items !== undefined) {
    if (!isRecord(schema.items)) {
      throw new Error(`Schema items at ${path} must be an object`)
    }
    assertSupportedSchema(schema.items, `${path}/items`, rootSchema)
  }
  if (
    schema.additionalProperties !== undefined &&
    schema.additionalProperties !== false &&
    !isRecord(schema.additionalProperties)
  ) {
    throw new Error(
      `Schema additionalProperties at ${path} must be false or an object`
    )
  }
  if (isRecord(schema.additionalProperties)) {
    assertSupportedSchema(
      schema.additionalProperties,
      `${path}/additionalProperties`,
      rootSchema
    )
  }

  if (schema.type === 'object' && schema.additionalProperties !== false) {
    throw new Error(
      `Object schema at ${path} must reject additional properties`
    )
  }
  if (schema.type === 'object') {
    const propertyNames = Object.keys(schema.properties ?? {})
    const requiredNames = new Set(schema.required ?? [])
    if (
      propertyNames.length === 0 ||
      requiredNames.size !== propertyNames.length ||
      propertyNames.some((name) => !requiredNames.has(name))
    ) {
      throw new Error(
        `Object schema at ${path} must require every declared property`
      )
    }
  }
  if (schema.type === 'array') {
    if (!isRecord(schema.items)) {
      throw new Error(`Array schema at ${path} must define an item schema`)
    }
    if (schema.minItems === undefined || schema.minItems < 1) {
      throw new Error(`Array schema at ${path} must reject empty arrays`)
    }
    if (schema.uniqueItems !== true) {
      throw new Error(`Array schema at ${path} must reject duplicate items`)
    }
  }
  if (path === '#' && rootSchema === schema) {
    assertAcyclicSchemaRefs(rootSchema)
  }
}

function assertLocalRefPath(ref) {
  if (typeof ref !== 'string' || !/^#\/\$defs\/[^/]+$/.test(ref)) {
    throw new Error(
      `Only direct local JSON Schema definition references are supported: ${ref}`
    )
  }
}

function resolveLocalRef(ref, rootSchema) {
  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, part) => {
      if (!isRecord(value) || !Object.hasOwn(value, part)) {
        throw new Error(`Unresolved JSON Schema reference: ${ref}`)
      }
      return value[part]
    }, rootSchema)
}

function isConstrainedSchemaNode(schema) {
  return (
    isRecord(schema) &&
    ['$ref', 'type', 'const', 'enum'].some((keyword) =>
      Object.hasOwn(schema, keyword)
    )
  )
}

function collectSchemaRefs(schema, refs = []) {
  if (!isRecord(schema)) return refs
  if (typeof schema.$ref === 'string') refs.push(schema.$ref)

  for (const collectionName of ['$defs', 'properties']) {
    const collection = schema[collectionName]
    if (!isRecord(collection)) continue
    for (const childSchema of Object.values(collection)) {
      collectSchemaRefs(childSchema, refs)
    }
  }
  if (isRecord(schema.items)) collectSchemaRefs(schema.items, refs)
  if (isRecord(schema.additionalProperties)) {
    collectSchemaRefs(schema.additionalProperties, refs)
  }
  return refs
}

function assertAcyclicSchemaRefs(rootSchema) {
  const states = new Map()

  const visit = (ref, chain = []) => {
    assertLocalRefPath(ref)
    const state = states.get(ref)
    if (state === 'done') return
    if (state === 'visiting') {
      throw new Error(
        `Cyclic JSON Schema reference: ${[...chain, ref].join(' -> ')}`
      )
    }

    const target = resolveLocalRef(ref, rootSchema)
    if (!isConstrainedSchemaNode(target)) {
      throw new Error(
        `JSON Schema reference ${ref} does not resolve to a constrained schema node`
      )
    }

    states.set(ref, 'visiting')
    for (const nestedRef of collectSchemaRefs(target, [])) {
      visit(nestedRef, [...chain, ref])
    }
    states.set(ref, 'done')
  }

  for (const ref of collectSchemaRefs(rootSchema, [])) visit(ref)
}

function childPath(path, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`
}

function valueTypeMatches(value, type) {
  switch (type) {
    case 'object':
      return isRecord(value)
    case 'array':
      return Array.isArray(value)
    case 'string':
      return typeof value === 'string'
    case 'boolean':
      return typeof value === 'boolean'
    case 'integer':
      return Number.isInteger(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'null':
      return value === null
    default:
      throw new Error(`Unsupported JSON Schema type: ${type}`)
  }
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validateFormat(value, format) {
  switch (format) {
    case 'date':
      return isValidUtcDate(value)
    case 'date-time':
      return isValidUtcDateTime(value)
    case 'uri':
      return isUri(value)
    default:
      throw new Error(`Unsupported JSON Schema format: ${format}`)
  }
}

function validateSchemaNode(value, schema, rootSchema, path, errors) {
  if (schema.$ref) {
    validateSchemaNode(
      value,
      resolveLocalRef(schema.$ref, rootSchema),
      rootSchema,
      path,
      errors
    )
    return
  }

  if (schema.type && !valueTypeMatches(value, schema.type)) {
    addError(
      errors,
      'SCHEMA_TYPE',
      path,
      `Expected ${schema.type}, received ${
        value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
      }`
    )
    return
  }

  if ('const' in schema && !valuesEqual(value, schema.const)) {
    addError(
      errors,
      'SCHEMA_CONST',
      path,
      'Value does not match the required constant'
    )
  }

  if (schema.enum && !schema.enum.some((item) => valuesEqual(value, item))) {
    addError(errors, 'SCHEMA_ENUM', path, 'Value is outside the allowed set')
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      addError(
        errors,
        'SCHEMA_MIN_LENGTH',
        path,
        `String must contain at least ${schema.minLength} characters`
      )
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      addError(
        errors,
        'SCHEMA_MAX_LENGTH',
        path,
        `String must contain at most ${schema.maxLength} characters`
      )
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      addError(
        errors,
        'SCHEMA_PATTERN',
        path,
        'String does not match the required pattern'
      )
    }
    if (schema.format && !validateFormat(value, schema.format)) {
      addError(
        errors,
        'SCHEMA_FORMAT',
        path,
        `String is not a valid ${schema.format}`
      )
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      addError(
        errors,
        'SCHEMA_MINIMUM',
        path,
        `Number must be at least ${schema.minimum}`
      )
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      addError(
        errors,
        'SCHEMA_MAXIMUM',
        path,
        `Number must be at most ${schema.maximum}`
      )
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      addError(
        errors,
        'SCHEMA_MIN_ITEMS',
        path,
        `Array must contain at least ${schema.minItems} item(s)`
      )
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      addError(
        errors,
        'SCHEMA_MAX_ITEMS',
        path,
        `Array must contain at most ${schema.maxItems} item(s)`
      )
    }
    if (
      schema.uniqueItems &&
      new Set(value.map((item) => JSON.stringify(item))).size !== value.length
    ) {
      addError(
        errors,
        'SCHEMA_UNIQUE_ITEMS',
        path,
        'Array items must be unique'
      )
    }
    if (schema.items) {
      value.forEach((item, index) => {
        validateSchemaNode(
          item,
          schema.items,
          rootSchema,
          `${path}[${index}]`,
          errors
        )
      })
    }
  }

  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (
      schema.minProperties !== undefined &&
      keys.length < schema.minProperties
    ) {
      addError(
        errors,
        'SCHEMA_MIN_PROPERTIES',
        path,
        `Object must contain at least ${schema.minProperties} properties`
      )
    }
    if (
      schema.maxProperties !== undefined &&
      keys.length > schema.maxProperties
    ) {
      addError(
        errors,
        'SCHEMA_MAX_PROPERTIES',
        path,
        `Object must contain at most ${schema.maxProperties} properties`
      )
    }

    for (const requiredName of schema.required ?? []) {
      if (!Object.hasOwn(value, requiredName)) {
        addError(
          errors,
          'SCHEMA_REQUIRED',
          childPath(path, requiredName),
          'Required field is missing'
        )
      }
    }

    const properties = schema.properties ?? {}
    for (const [key, childValue] of Object.entries(value)) {
      const propertyPath = childPath(path, key)
      if (Object.hasOwn(properties, key)) {
        validateSchemaNode(
          childValue,
          properties[key],
          rootSchema,
          propertyPath,
          errors
        )
      } else if (schema.additionalProperties === false) {
        addError(
          errors,
          'SCHEMA_ADDITIONAL_PROPERTY',
          propertyPath,
          'Unknown field is not allowed'
        )
      } else if (isRecord(schema.additionalProperties)) {
        validateSchemaNode(
          childValue,
          schema.additionalProperties,
          rootSchema,
          propertyPath,
          errors
        )
      }
    }
  }
}

function walk(value, visit, path = '$') {
  visit(value, path)
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${path}[${index}]`))
  } else if (isRecord(value)) {
    for (const [key, childValue] of Object.entries(value)) {
      walk(childValue, visit, childPath(path, key))
    }
  }
}

function entriesNamed(value, matches, path = '$', entries = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      entriesNamed(item, matches, `${path}[${index}]`, entries)
    )
  } else if (isRecord(value)) {
    for (const [key, childValue] of Object.entries(value)) {
      const propertyPath = childPath(path, key)
      if (matches(key)) entries.push({ value: childValue, path: propertyPath })
      entriesNamed(childValue, matches, propertyPath, entries)
    }
  }
  return entries
}

function hasDigestEntropy(value, prefixLength) {
  return new Set(value.slice(prefixLength)).size >= 4
}

function hasArchiveSuffix(value) {
  return SOURCE_ARCHIVE_SUFFIXES.some((suffix) => value.endsWith(suffix))
}

function withoutArchiveSuffix(value) {
  const suffix = SOURCE_ARCHIVE_SUFFIXES.find((candidate) =>
    value.endsWith(candidate)
  )
  return suffix === undefined ? value : value.slice(0, -suffix.length)
}

function urlHasMovingSourceSelector(url, path) {
  for (const parameter of ['branch', 'head', 'ref']) {
    const value = url.searchParams.get(parameter)
    if (value !== null && MOVING_SOURCE_NAMES.has(value.toLowerCase())) {
      return true
    }
  }

  const segments = path.split('/').filter((segment) => segment.length > 0)
  if (url.hostname === 'github.com' && segments[2] === 'archive') {
    const selector = segments.slice(3)
    if (selector[0] === 'refs' && selector[1] === 'heads') return true
    return (
      selector.length === 1 &&
      MOVING_SOURCE_NAMES.has(withoutArchiveSuffix(selector[0]).toLowerCase())
    )
  }
  if (
    url.hostname === 'codeload.github.com' &&
    GITHUB_REF_SELECTORS.has(segments[2])
  ) {
    const selector = segments.slice(3)
    if (selector[0] === 'refs' && selector[1] === 'heads') return true
    return (
      selector.length === 1 &&
      MOVING_SOURCE_NAMES.has(selector[0].toLowerCase())
    )
  }
  if (url.hostname === 'gitlab.com') {
    const routeIndex = segments.indexOf('-')
    if (
      routeIndex >= 2 &&
      segments[routeIndex + 1] === 'archive' &&
      segments[routeIndex + 2] !== undefined
    ) {
      return MOVING_SOURCE_NAMES.has(segments[routeIndex + 2].toLowerCase())
    }
  }

  return false
}

function pathHasCanonicalCommitSelector(url, path, commit) {
  if (typeof commit !== 'string' || !COMMIT_PATTERN.test(commit)) return false
  if (url.port !== '') return false

  const segments = path.split('/').filter((segment) => segment.length > 0)
  if (url.hostname === 'github.com') {
    return (
      segments.length === 4 &&
      segments[2] === 'archive' &&
      SOURCE_ARCHIVE_SUFFIXES.some(
        (suffix) => segments[3] === `${commit}${suffix}`
      )
    )
  }
  if (url.hostname === 'codeload.github.com') {
    return (
      segments.length === 4 &&
      GITHUB_REF_SELECTORS.has(segments[2]) &&
      segments[3] === commit
    )
  }
  if (url.hostname === 'gitlab.com') {
    const route = segments.slice(-4)
    const routeIndex = segments.length - route.length
    return (
      segments.length >= 6 &&
      segments.indexOf('-') === routeIndex &&
      route[0] === '-' &&
      route[1] === 'archive' &&
      route[2] === commit &&
      hasArchiveSuffix(route[3])
    )
  }

  return false
}

function validatePlaceholders(receipt, errors) {
  walk(receipt, (value, path) => {
    if (typeof value !== 'string') return

    let reservedHost = false
    if (isUri(value)) {
      try {
        const url = new URL(value)
        reservedHost = RESERVED_HOST_PATTERN.test(url.hostname)
      } catch {
        reservedHost = false
      }
    }

    if (PLACEHOLDER_PATTERN.test(value) || reservedHost) {
      addError(
        errors,
        'PLACEHOLDER_VALUE',
        path,
        'Placeholder or reserved fixture destination is not allowed'
      )
    }
  })
}

function isJwtLike(value) {
  const candidate = value.trim().replace(/^bearer[ \t]+/i, '')
  const segments = candidate.split('.')

  return (
    segments.length === 3 &&
    segments.every(
      (segment) => segment.length > 0 && BASE64URL_SEGMENT_PATTERN.test(segment)
    ) &&
    segments[0].startsWith('eyJ') &&
    segments[1].startsWith('eyJ') &&
    segments[2].length >= 8
  )
}

function hasUrlUserInfo(value) {
  try {
    const url = new URL(value)
    return url.username !== '' || url.password !== ''
  } catch {
    return false
  }
}

function isSecretLikeEnvironmentValue(value) {
  const candidate = value.trim()
  return (
    PEM_PRIVATE_KEY_HEADER_PATTERN.test(candidate) ||
    isJwtLike(candidate) ||
    SECRET_TOKEN_PREFIX_PATTERN.test(candidate) ||
    hasUrlUserInfo(candidate) ||
    SYNTHETIC_SECRET_SENTINEL_PATTERN.test(candidate)
  )
}

function validateEnvironment(receipt, errors) {
  const variables = receipt?.build?.environment?.variables
  if (!Array.isArray(variables)) return

  variables.forEach((variable, index) => {
    if (!isRecord(variable)) return
    const path = `$.build.environment.variables[${index}]`

    if (
      typeof variable.name === 'string' &&
      SECRET_ENVIRONMENT_NAME_PATTERN.test(variable.name)
    ) {
      addError(
        errors,
        'ENV_SECRET_NAME',
        `${path}.name`,
        'Secret-like environment variable name is forbidden'
      )
    }

    if (
      typeof variable.value === 'string' &&
      isSecretLikeEnvironmentValue(variable.value)
    ) {
      addError(
        errors,
        'ENV_SECRET_VALUE',
        `${path}.value`,
        'Secret-like environment variable value is forbidden'
      )
    }
  })
}

function validateHashes(receipt, errors) {
  for (const { value, path } of entriesNamed(receipt, (key) =>
    /sha256$/i.test(key)
  )) {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
      addError(
        errors,
        'SHA256_INVALID',
        path,
        'Expected lowercase sha256:<64 hex>'
      )
    } else if (!hasDigestEntropy(value, 'sha256:'.length)) {
      addError(
        errors,
        'SHA256_PLACEHOLDER',
        path,
        'Low-entropy SHA-256 placeholder is not allowed'
      )
    }
  }

  for (const { value, path } of entriesNamed(receipt, (key) =>
    /commit$/i.test(key)
  )) {
    if (typeof value !== 'string' || !COMMIT_PATTERN.test(value)) {
      addError(
        errors,
        'COMMIT_INVALID',
        path,
        'Expected lowercase 40-hex Git commit'
      )
    } else if (!hasDigestEntropy(value, 0)) {
      addError(
        errors,
        'COMMIT_PLACEHOLDER',
        path,
        'Low-entropy commit placeholder is not allowed'
      )
    }
  }
}

function validateDates(receipt, errors) {
  const modificationDate = receipt?.release?.modificationDate
  const buildCompletedAt = receipt?.release?.buildCompletedAt
  const attestedAt = receipt?.publisher?.attestedAt
  const reviewedAt = receipt?.reviewer?.reviewedAt
  const buildNanoseconds = utcDateTimeNanoseconds(buildCompletedAt)
  const attestedNanoseconds = utcDateTimeNanoseconds(attestedAt)
  const reviewedNanoseconds = utcDateTimeNanoseconds(reviewedAt)

  if (modificationDate !== undefined && !isValidUtcDate(modificationDate)) {
    addError(
      errors,
      'UTC_DATE_INVALID',
      '$.release.modificationDate',
      'Modification date must be a real YYYY-MM-DD UTC calendar date'
    )
  }

  for (const [value, path] of [
    [buildCompletedAt, '$.release.buildCompletedAt'],
    [attestedAt, '$.publisher.attestedAt'],
    [reviewedAt, '$.reviewer.reviewedAt']
  ]) {
    if (value !== undefined && !isValidUtcDateTime(value)) {
      addError(
        errors,
        'UTC_DATETIME_INVALID',
        path,
        'Timestamp must use a real UTC calendar value in the contract format ending in Z'
      )
    }
  }

  if (
    isValidUtcDate(modificationDate) &&
    buildNanoseconds !== null &&
    buildNanoseconds <
      BigInt(Date.parse(`${modificationDate}T00:00:00Z`)) * 1_000_000n
  ) {
    addError(
      errors,
      'BUILD_BEFORE_MODIFICATION',
      '$.release.buildCompletedAt',
      'Build completion cannot predate the recorded modification date'
    )
  }

  if (
    buildNanoseconds !== null &&
    attestedNanoseconds !== null &&
    attestedNanoseconds < buildNanoseconds
  ) {
    addError(
      errors,
      'PUBLISHER_BEFORE_BUILD',
      '$.publisher.attestedAt',
      'Publisher attestation cannot predate build completion'
    )
  }

  if (
    attestedNanoseconds !== null &&
    reviewedNanoseconds !== null &&
    reviewedNanoseconds < attestedNanoseconds
  ) {
    addError(
      errors,
      'REVIEW_BEFORE_ATTESTATION',
      '$.reviewer.reviewedAt',
      'Reviewer timestamp cannot predate publisher attestation'
    )
  }
}

function validateSource(receipt, errors) {
  const source = receipt?.source
  const version = receipt?.release?.version
  if (!isRecord(source)) return

  if (typeof source.url === 'string') {
    try {
      const url = new URL(source.url)
      let path = url.pathname
      try {
        path = decodeURIComponent(url.pathname)
      } catch {
        addError(
          errors,
          'SOURCE_URL_ENCODING_INVALID',
          '$.source.url',
          'Source URL contains malformed percent encoding'
        )
      }

      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        addError(
          errors,
          'SOURCE_URL_NOT_IMMUTABLE',
          '$.source.url',
          'Source URL must be credential-free HTTPS without query or fragment'
        )
      }

      if (urlHasMovingSourceSelector(url, path)) {
        addError(
          errors,
          'SOURCE_URL_MOVING',
          '$.source.url',
          'Moving branch or mutable channel URL is forbidden'
        )
      }

      const containsCommit = pathHasCanonicalCommitSelector(
        url,
        path,
        source.commit
      )

      if (!containsCommit) {
        addError(
          errors,
          'SOURCE_URL_NOT_IMMUTABLE',
          '$.source.url',
          'Source URL path must bind the exact recorded commit'
        )
      }
    } catch {
      addError(
        errors,
        'SOURCE_URL_NOT_IMMUTABLE',
        '$.source.url',
        'Source URL must be an absolute immutable HTTPS URL'
      )
    }
  }

  if (
    typeof version === 'string' &&
    typeof source.tag === 'string' &&
    source.tag !== `refs/tags/v${version}`
  ) {
    addError(
      errors,
      'SOURCE_TAG_VERSION_MISMATCH',
      '$.source.tag',
      'Source tag must exactly bind the release version'
    )
  }

  const sourceInputs = Array.isArray(receipt?.build?.inputs)
    ? receipt.build.inputs.filter((input) => input?.role === 'source-archive')
    : []
  if (sourceInputs.length !== 1) {
    addError(
      errors,
      'SOURCE_INPUT_COUNT_INVALID',
      '$.build.inputs',
      'Exactly one source-archive input is required'
    )
  } else if (sourceInputs[0].sha256 !== source.archiveSha256) {
    addError(
      errors,
      'SOURCE_INPUT_DIGEST_MISMATCH',
      '$.build.inputs',
      'Source input digest must match source.archiveSha256'
    )
  }
}

function validateBindings(receipt, errors) {
  const release = receipt?.release
  const artifact = receipt?.artifact
  const outputs = receipt?.build?.outputs
  const sbom = receipt?.sbom
  const publisher = receipt?.publisher
  const reviewer = receipt?.reviewer

  if (isRecord(release) && isRecord(artifact)) {
    if (
      release.version !== undefined &&
      artifact.version !== undefined &&
      release.version !== artifact.version
    ) {
      addError(
        errors,
        'RELEASE_VERSION_MISMATCH',
        '$.artifact.version',
        'Artifact and release versions must match'
      )
    }

    if (
      typeof artifact.name === 'string' &&
      typeof artifact.version === 'string' &&
      typeof artifact.sha256 === 'string'
    ) {
      const expectedReceiptId = `${artifact.name}@${artifact.version}+${artifact.sha256}`
      if (receipt.receiptId !== expectedReceiptId) {
        addError(
          errors,
          'RECEIPT_ID_MISMATCH',
          '$.receiptId',
          'Receipt ID must bind artifact name, version, and SHA-256'
        )
      }
    }
  }

  if (isRecord(artifact) && Array.isArray(outputs)) {
    const releaseOutputs = outputs.filter(
      (output) => output?.role === 'release-artifact'
    )
    if (releaseOutputs.length !== 1) {
      addError(
        errors,
        'ARTIFACT_OUTPUT_COUNT_INVALID',
        '$.build.outputs',
        'Exactly one release-artifact output is required'
      )
    } else if (
      releaseOutputs[0].path !== artifact.path ||
      releaseOutputs[0].sha256 !== artifact.sha256
    ) {
      addError(
        errors,
        'ARTIFACT_OUTPUT_MISMATCH',
        '$.build.outputs',
        'Release output path and digest must match the artifact'
      )
    }
  }

  if (
    isRecord(artifact) &&
    isRecord(sbom) &&
    artifact.sha256 !== undefined &&
    sbom.artifactSha256 !== undefined &&
    artifact.sha256 !== sbom.artifactSha256
  ) {
    addError(
      errors,
      'SBOM_ARTIFACT_MISMATCH',
      '$.sbom.artifactSha256',
      'SBOM subject digest must match the artifact digest'
    )
  }

  if (
    isRecord(release) &&
    isRecord(reviewer) &&
    release.status !== undefined &&
    reviewer.decision !== undefined &&
    release.status !== reviewer.decision
  ) {
    addError(
      errors,
      'REVIEW_DECISION_MISMATCH',
      '$.reviewer.decision',
      'Reviewer decision must match the receipt release status'
    )
  }

  if (
    isRecord(publisher) &&
    isRecord(reviewer) &&
    publisher.identity !== undefined &&
    reviewer.identity !== undefined &&
    normalizeIdentity(publisher.identity) ===
      normalizeIdentity(reviewer.identity)
  ) {
    addError(
      errors,
      'REVIEWER_NOT_INDEPENDENT',
      '$.reviewer.identity',
      'Publisher and reviewer identities must differ'
    )
  }

  const toolchain = receipt?.build?.toolchain
  if (
    isRecord(toolchain) &&
    typeof toolchain.pnpmVersion === 'string' &&
    typeof toolchain.packageManager === 'string' &&
    toolchain.packageManager !== `pnpm@${toolchain.pnpmVersion}`
  ) {
    addError(
      errors,
      'PACKAGE_MANAGER_VERSION_MISMATCH',
      '$.build.toolchain.packageManager',
      'packageManager must bind the exact recorded pnpm version'
    )
  }
}

function validateUniqueness(receipt, errors) {
  const collections = [
    ['$.build.lockfiles', receipt?.build?.lockfiles, 'path'],
    ['$.build.inputs', receipt?.build?.inputs, 'path'],
    ['$.build.outputs', receipt?.build?.outputs, 'path'],
    [
      '$.build.environment.variables',
      receipt?.build?.environment?.variables,
      'name'
    ]
  ]

  for (const [path, items, key] of collections) {
    if (!Array.isArray(items)) continue
    const values = items
      .map((item) => (isRecord(item) ? item[key] : undefined))
      .filter((value) => typeof value === 'string')
    if (new Set(values).size !== values.length) {
      addError(
        errors,
        'DUPLICATE_BINDING',
        path,
        `${key} values must be unique within this collection`
      )
    }
  }
}

function deduplicateErrors(errors) {
  const seen = new Set()
  return errors.filter((error) => {
    const key = `${error.code}\u0000${error.path}\u0000${error.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

assertSupportedSchema(RELEASE_RECEIPT_SCHEMA)

export function validateReleaseReceipt(receipt) {
  const errors = []
  validateSchemaNode(
    receipt,
    RELEASE_RECEIPT_SCHEMA,
    RELEASE_RECEIPT_SCHEMA,
    '$',
    errors
  )

  if (isRecord(receipt)) {
    validatePlaceholders(receipt, errors)
    validateEnvironment(receipt, errors)
    validateHashes(receipt, errors)
    validateDates(receipt, errors)
    validateSource(receipt, errors)
    validateBindings(receipt, errors)
    validateUniqueness(receipt, errors)
  }

  return deduplicateErrors(errors)
}

export function runCli(args) {
  if (args.length !== 1) {
    console.error('Usage: node validate-release-receipt.mjs <receipt.json|->')
    console.error(VALIDATION_DISCLAIMER)
    return EXIT_CODES.USAGE_OR_INPUT_ERROR
  }

  let receipt
  try {
    const json =
      args[0] === '-' ? readFileSync(0, 'utf8') : readFileSync(args[0], 'utf8')
    receipt = JSON.parse(json)
  } catch {
    console.error('INPUT_ERROR: Receipt input could not be read or parsed')
    console.error(VALIDATION_DISCLAIMER)
    return EXIT_CODES.USAGE_OR_INPUT_ERROR
  }

  const errors = validateReleaseReceipt(receipt)
  if (errors.length > 0) {
    console.error(`INVALID: ${errors.length} release receipt error(s)`)
    for (const error of errors) {
      console.error(`${error.code} ${error.path}: ${error.message}`)
    }
    console.error(VALIDATION_DISCLAIMER)
    return EXIT_CODES.INVALID
  }

  console.log('PASS: artifact-specific release receipt structure')
  console.log(`releaseStatus=${receipt.release.status}`)
  console.log(VALIDATION_DISCLAIMER)
  return EXIT_CODES.PASS
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = runCli(process.argv.slice(2))
}
