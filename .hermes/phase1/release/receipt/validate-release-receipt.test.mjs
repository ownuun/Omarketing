import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  EXIT_CODES,
  RELEASE_RECEIPT_SCHEMA,
  VALIDATION_DISCLAIMER,
  assertSupportedSchema,
  validateReleaseReceipt
} from './validate-release-receipt.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const validatorPath = join(directory, 'validate-release-receipt.mjs')
const validFixturePath = join(directory, 'fixtures', 'valid.synthetic.json')
const validReceipt = JSON.parse(readFileSync(validFixturePath, 'utf8'))
const LINE_TERMINATORS = ['\n', '\r', '\r\n', '\u2028', '\u2029']
const SECRET_ENVIRONMENT_NAME_CASES = [
  ['PASSWORD', 'DATABASE_pAsSwOrD'],
  ['PASSWD', 'DATABASE_PaSsWd'],
  ['SECRET', 'APP_sEcReT'],
  ['TOKEN', 'DEPLOY_tOkEn'],
  ['API_KEY', 'PUBLIC_aPi_KeY'],
  ['APIKEY', 'SERVICE_aPiKeY'],
  ['CREDENTIAL', 'BUILD_cReDeNtIaL'],
  ['COOKIE', 'FEATURE_cOoKiE'],
  ['SESSION', 'USER_sEsSiOn'],
  ['PRIVATE_KEY', 'SIGNING_pRiVaTe_KeY'],
  ['PRIVATEKEY', 'SIGNING_pRiVaTeKeY'],
  ['CLIENT_SECRET', 'OAUTH_cLiEnT_sEcReT'],
  ['ACCESS_KEY', 'CLOUD_aCcEsS_KeY'],
  ['AUTH', 'BASIC_aUtH']
]
const SECRET_ENVIRONMENT_VALUE_CASES = [
  ['PEM private key header', '-----BEGIN PRIVATE KEY-----'],
  [
    'JWT-like three-segment value',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.syntheticSignature0123456789'
  ],
  ['sk- token prefix', 'sk-synthetic-do-not-store-1234567890'],
  ['ghp_ token prefix', 'ghp_syntheticDoNotStore1234567890'],
  ['github_pat_ token prefix', 'github_pat_synthetic_do_not_store_1234567890'],
  [
    'URL userinfo credentials',
    'https://fixture-user:fixture-password@build.omarketing.dev/input'
  ],
  ['explicit synthetic sentinel', 'synthetic-secret-do-not-store']
]

const requiredPaths = [
  ['schemaVersion'],
  ['receiptId'],
  ['artifactSpecific'],
  ['release'],
  ['source'],
  ['build'],
  ['artifact'],
  ['legalPayload'],
  ['sbom'],
  ['publisher'],
  ['reviewer'],
  ['release', 'version'],
  ['release', 'status'],
  ['release', 'modificationDate'],
  ['release', 'buildCompletedAt'],
  ['source', 'url'],
  ['source', 'tag'],
  ['source', 'commit'],
  ['source', 'archiveSha256'],
  ['source', 'frontendBaseCommit'],
  ['source', 'backendCompatibilityCommit'],
  ['build', 'toolchain'],
  ['build', 'environment'],
  ['build', 'commands'],
  ['build', 'lockfiles'],
  ['build', 'inputs'],
  ['build', 'outputs'],
  ['build', 'toolchain', 'operatingSystem'],
  ['build', 'toolchain', 'operatingSystemVersion'],
  ['build', 'toolchain', 'architecture'],
  ['build', 'toolchain', 'nodeVersion'],
  ['build', 'toolchain', 'pnpmVersion'],
  ['build', 'toolchain', 'packageManager'],
  ['build', 'environment', 'distribution'],
  ['build', 'environment', 'variables'],
  ['build', 'environment', 'variables', 0, 'classification'],
  ['build', 'environment', 'variables', 0, 'name'],
  ['build', 'environment', 'variables', 0, 'value'],
  ['build', 'lockfiles', 0, 'path'],
  ['build', 'lockfiles', 0, 'manager'],
  ['build', 'lockfiles', 0, 'sha256'],
  ['build', 'inputs', 0, 'path'],
  ['build', 'inputs', 0, 'role'],
  ['build', 'inputs', 0, 'sha256'],
  ['build', 'outputs', 0, 'path'],
  ['build', 'outputs', 0, 'role'],
  ['build', 'outputs', 0, 'sha256'],
  ['artifact', 'name'],
  ['artifact', 'version'],
  ['artifact', 'path'],
  ['artifact', 'mediaType'],
  ['artifact', 'sha256'],
  ['legalPayload', 'license'],
  ['legalPayload', 'license', 'path'],
  ['legalPayload', 'license', 'sha256'],
  ['legalPayload', 'thirdPartyNotices'],
  ['legalPayload', 'thirdPartyNotices', 'path'],
  ['legalPayload', 'thirdPartyNotices', 'sha256'],
  ['legalPayload', 'complianceChecklist'],
  ['legalPayload', 'complianceChecklist', 'path'],
  ['legalPayload', 'complianceChecklist', 'sha256'],
  ['legalPayload', 'sourceDirections'],
  ['legalPayload', 'sourceDirections', 'path'],
  ['legalPayload', 'sourceDirections', 'sha256'],
  ['sbom', 'format'],
  ['sbom', 'specVersion'],
  ['sbom', 'path'],
  ['sbom', 'sha256'],
  ['sbom', 'artifactSha256'],
  ['publisher', 'name'],
  ['publisher', 'organization'],
  ['publisher', 'identity'],
  ['publisher', 'attestedAt'],
  ['publisher', 'evidence'],
  ['publisher', 'evidence', 'path'],
  ['publisher', 'evidence', 'sha256'],
  ['reviewer', 'name'],
  ['reviewer', 'organization'],
  ['reviewer', 'identity'],
  ['reviewer', 'reviewedAt'],
  ['reviewer', 'decision'],
  ['reviewer', 'scope'],
  ['reviewer', 'evidence'],
  ['reviewer', 'evidence', 'path'],
  ['reviewer', 'evidence', 'sha256']
]

function cloneReceipt() {
  return structuredClone(validReceipt)
}

function jsonPath(segments) {
  return segments.reduce(
    (path, segment) =>
      typeof segment === 'number'
        ? `${path}[${segment}]`
        : `${path}.${segment}`,
    '$'
  )
}

function deleteAtPath(receipt, segments) {
  const parent = segments
    .slice(0, -1)
    .reduce((value, segment) => value[segment], receipt)
  delete parent[segments.at(-1)]
}

function errorAt(receipt, code, path) {
  return validateReleaseReceipt(receipt).some(
    (error) => error.code === code && error.path === path
  )
}

function collectNamedPaths(value, predicate, path = '$', found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectNamedPaths(item, predicate, `${path}[${index}]`, found)
    )
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`
      if (predicate(key)) found.push(childPath)
      collectNamedPaths(child, predicate, childPath, found)
    }
  }
  return found
}

function collectStringEntries(value, path = '$', found = []) {
  if (typeof value === 'string') {
    found.push({ path, value })
  } else if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectStringEntries(item, `${path}[${index}]`, found)
    )
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectStringEntries(child, `${path}.${key}`, found)
    }
  }
  return found
}

function setAtJsonPath(receipt, path, value) {
  const segments = [...path.matchAll(/\.([A-Za-z0-9_$]+)|\[(\d+)\]/g)].map(
    (match) => (match[1] === undefined ? Number(match[2]) : match[1])
  )
  const parent = segments
    .slice(0, -1)
    .reduce((current, segment) => current[segment], receipt)
  parent[segments.at(-1)] = value
}

describe('GREEN synthetic artifact-specific receipt', () => {
  test('passes locally while remaining explicitly BLOCKED', () => {
    assert.deepEqual(validateReleaseReceipt(validReceipt), [])
    assert.equal(validReceipt.release.status, 'BLOCKED')
    assert.equal(validReceipt.reviewer.decision, 'BLOCKED')
  })

  test('accepts a canonical codeload archive selected by exact commit', () => {
    const receipt = cloneReceipt()
    receipt.source.url = `https://codeload.github.com/omarketing-synthetic/frontend/tar.gz/${receipt.source.commit}`

    assert.deepEqual(validateReleaseReceipt(receipt), [])
  })

  test('accepts a canonical GitLab archive selected by exact commit', () => {
    const receipt = cloneReceipt()
    receipt.source.url = `https://gitlab.com/omarketing-synthetic/frontend/-/archive/${receipt.source.commit}/frontend-${receipt.source.commit}.tar.gz`

    assert.deepEqual(validateReleaseReceipt(receipt), [])
  })

  test('does not treat repository or owner names as moving selectors', () => {
    const receipt = cloneReceipt()
    receipt.source.url = `https://github.com/stable/main/archive/${receipt.source.commit}.tar.gz`

    assert.deepEqual(validateReleaseReceipt(receipt), [])
  })

  test('CLI exits zero without claiming readiness or legal approval', () => {
    const result = spawnSync(
      process.execPath,
      [validatorPath, validFixturePath],
      {
        encoding: 'utf8'
      }
    )

    assert.equal(result.status, EXIT_CODES.PASS, result.stderr)
    assert.match(
      result.stdout,
      /PASS: artifact-specific release receipt structure/
    )
    assert.match(result.stdout, /releaseStatus=BLOCKED/)
    assert.match(result.stdout, /does not establish production readiness/i)
    assert.match(result.stdout, /does not constitute legal approval/i)
    assert.match(
      result.stdout,
      new RegExp(VALIDATION_DISCLAIMER.replaceAll('.', '\\.'))
    )
    assert.doesNotMatch(result.stdout, /production[- ]ready/i)
  })

  test('stdin validation has the same structural result', () => {
    const result = spawnSync(process.execPath, [validatorPath, '-'], {
      encoding: 'utf8',
      input: JSON.stringify(validReceipt)
    })

    assert.equal(result.status, EXIT_CODES.PASS, result.stderr)
    assert.match(result.stdout, /releaseStatus=BLOCKED/)
  })
})

describe('public build environment secret boundary', () => {
  test('schema limits environment evidence to public non-secret build inputs', () => {
    const contractText = [
      RELEASE_RECEIPT_SCHEMA.description,
      RELEASE_RECEIPT_SCHEMA.$defs.environment.description,
      RELEASE_RECEIPT_SCHEMA.$defs.environmentVariable.description
    ].join(' ')

    assert.equal(
      RELEASE_RECEIPT_SCHEMA.$defs.environmentVariable.properties.classification
        .const,
      'public-build-input'
    )
    assert.match(contractText, /runtime\/deployment secrets are outside/i)
    assert.match(contractText, /must not be requested, read, or recorded/i)
    assert.match(
      contractText,
      /must not bake owner access passwords or provider credentials into frontend artifacts/i
    )
    assert.match(
      contractText,
      /proven separately by redacted operational evidence/i
    )
    assert.match(contractText, /never by a value or hash in this receipt/i)
  })

  for (const [secretClass, name] of SECRET_ENVIRONMENT_NAME_CASES) {
    test(`${secretClass} names are rejected case-insensitively`, () => {
      const receipt = cloneReceipt()
      receipt.build.environment.variables[0].name = name

      const error = validateReleaseReceipt(receipt).find(
        ({ code }) => code === 'ENV_SECRET_NAME'
      )
      assert.deepEqual(error, {
        code: 'ENV_SECRET_NAME',
        path: '$.build.environment.variables[0].name',
        message: 'Secret-like environment variable name is forbidden'
      })
    })
  }

  test('ordinary public build variable names remain valid', () => {
    for (const name of [
      'NODE_ENV',
      'PUBLIC_API_URL',
      'VITE_OAUTH_REDIRECT_URI',
      'AUTHOR_NAME',
      'TOKENIZER_MODE'
    ]) {
      const receipt = cloneReceipt()
      receipt.build.environment.variables[0].name = name

      assert.deepEqual(validateReleaseReceipt(receipt), [], name)
    }
  })

  for (const [shape, value] of SECRET_ENVIRONMENT_VALUE_CASES) {
    test(`${shape} is rejected without retaining the value in errors`, () => {
      const receipt = cloneReceipt()
      receipt.build.environment.variables[0].name = 'PUBLIC_BUILD_LABEL'
      receipt.build.environment.variables[0].value = value

      const errors = validateReleaseReceipt(receipt)
      assert.ok(
        errors.some(
          (error) =>
            error.code === 'ENV_SECRET_VALUE' &&
            error.path === '$.build.environment.variables[0].value' &&
            error.message ===
              'Secret-like environment variable value is forbidden'
        )
      )
      assert.equal(JSON.stringify(errors).includes(value), false)

      const result = spawnSync(process.execPath, [validatorPath, '-'], {
        encoding: 'utf8',
        input: JSON.stringify(receipt)
      })
      assert.equal(result.status, EXIT_CODES.INVALID)
      assert.match(result.stderr, /ENV_SECRET_VALUE/)
      assert.equal(result.stdout.includes(value), false)
      assert.equal(result.stderr.includes(value), false)
    })
  }

  test('CLI rejects a synthetic secret fixture without disclosing secret bytes', () => {
    const secretFixturePath = join(
      directory,
      'fixtures',
      'invalid',
      'secret-environment-value.json'
    )
    const secretBytes = 'synthetic-secret-do-not-store'
    const result = spawnSync(
      process.execPath,
      [validatorPath, secretFixturePath],
      {
        encoding: 'utf8'
      }
    )

    assert.equal(result.status, EXIT_CODES.INVALID, result.stdout)
    assert.match(result.stderr, /ENV_SECRET_VALUE/)
    assert.equal(result.stdout.includes(secretBytes), false)
    assert.equal(result.stderr.includes(secretBytes), false)
  })
})

describe('fail-closed required fields', () => {
  for (const segments of requiredPaths) {
    test(`${jsonPath(segments)} cannot be omitted`, () => {
      const receipt = cloneReceipt()
      deleteAtPath(receipt, segments)

      assert.ok(
        errorAt(receipt, 'SCHEMA_REQUIRED', jsonPath(segments)),
        `${jsonPath(segments)} was not reported missing`
      )
    })
  }

  test('unknown root and nested fields are rejected', () => {
    const receipt = cloneReceipt()
    receipt.unreviewedClaim = true
    receipt.source.branch = 'main'

    assert.ok(
      errorAt(receipt, 'SCHEMA_ADDITIONAL_PROPERTY', '$.unreviewedClaim')
    )
    assert.ok(errorAt(receipt, 'SCHEMA_ADDITIONAL_PROPERTY', '$.source.branch'))
  })

  test('empty commands, locks, inputs, outputs, and environment are rejected', () => {
    const receipt = cloneReceipt()
    receipt.build.commands = []
    receipt.build.lockfiles = []
    receipt.build.inputs = []
    receipt.build.outputs = []
    receipt.build.environment.variables = []

    for (const path of [
      '$.build.commands',
      '$.build.lockfiles',
      '$.build.inputs',
      '$.build.outputs',
      '$.build.environment.variables'
    ]) {
      assert.ok(
        errorAt(receipt, 'SCHEMA_MIN_ITEMS', path),
        `${path} accepted []`
      )
    }
  })
})

describe('fail-closed schema startup gate', () => {
  test('the active schema cannot be weakened after startup', () => {
    assert.ok(Object.isFrozen(RELEASE_RECEIPT_SCHEMA))
    assert.ok(Object.isFrozen(RELEASE_RECEIPT_SCHEMA.$defs.legalPayload))
    assert.throws(() => RELEASE_RECEIPT_SCHEMA.required.pop(), TypeError)
  })

  const invalidSchemaCases = [
    {
      name: 'unknown nested keyword',
      mutate: (schema) => {
        schema.$defs.sha256.anyOf = []
      }
    },
    {
      name: 'boolean item schema',
      mutate: (schema) => {
        schema.$defs.sha256.items = false
      }
    },
    {
      name: 'unknown format',
      mutate: (schema) => {
        schema.$defs.sha256.format = 'hostname'
      }
    },
    {
      name: 'unsupported type union',
      mutate: (schema) => {
        schema.$defs.sha256.type = ['string', 'null']
      }
    },
    {
      name: 'invalid regular expression',
      mutate: (schema) => {
        schema.$defs.sha256.pattern = '['
      }
    },
    {
      name: 'unresolved reference',
      mutate: (schema) => {
        schema.properties.source.$ref = '#/$defs/not-present'
      }
    },
    {
      name: 'definition collection reference',
      mutate: (schema) => {
        schema.properties.legalPayload.$ref = '#/$defs'
      }
    },
    {
      name: 'inherited object property reference',
      mutate: (schema) => {
        schema.properties.legalPayload.$ref = '#/constructor'
      }
    },
    {
      name: 'scalar reference target',
      mutate: (schema) => {
        schema.$defs.scalar = 'not-a-schema'
        schema.properties.legalPayload.$ref = '#/$defs/scalar'
      }
    },
    {
      name: 'unconstrained reference target',
      mutate: (schema) => {
        schema.$defs.legalPayload = {}
      }
    },
    {
      name: 'self-referential definition',
      mutate: (schema) => {
        schema.$defs.legalPayload = {
          $ref: '#/$defs/legalPayload'
        }
      }
    },
    {
      name: 'mutually recursive definitions',
      mutate: (schema) => {
        schema.$defs.legalPayload = {
          $ref: '#/$defs/sbom'
        }
        schema.$defs.sbom = {
          $ref: '#/$defs/legalPayload'
        }
      }
    },
    {
      name: 'validation sibling beside a reference',
      mutate: (schema) => {
        schema.properties.source.minLength = 1
      }
    },
    {
      name: 'open object schema',
      mutate: (schema) => {
        schema.$defs.source.additionalProperties = true
      }
    },
    {
      name: 'optional declared property',
      mutate: (schema) => {
        schema.$defs.legalPayload.required.pop()
      }
    },
    {
      name: 'empty array admission',
      mutate: (schema) => {
        schema.$defs.build.properties.commands.minItems = 0
      }
    },
    {
      name: 'duplicate array admission',
      mutate: (schema) => {
        schema.$defs.build.properties.commands.uniqueItems = false
      }
    }
  ]

  for (const { name, mutate } of invalidSchemaCases) {
    test(`${name} is rejected before receipt validation`, () => {
      const schema = structuredClone(RELEASE_RECEIPT_SCHEMA)
      mutate(schema)

      assert.throws(() => assertSupportedSchema(schema))
    })
  }
})

describe('digest, commit, date, and placeholder rejection', () => {
  for (const path of collectNamedPaths(validReceipt, (key) =>
    /sha256$/i.test(key)
  )) {
    test(`${path} rejects malformed SHA-256`, () => {
      const receipt = cloneReceipt()
      setAtJsonPath(receipt, path, 'sha256:not-64-lowercase-hex')
      assert.ok(errorAt(receipt, 'SHA256_INVALID', path))
    })
  }

  for (const path of collectNamedPaths(validReceipt, (key) =>
    /commit$/i.test(key)
  )) {
    test(`${path} rejects malformed commit`, () => {
      const receipt = cloneReceipt()
      setAtJsonPath(receipt, path, 'abc123')
      assert.ok(errorAt(receipt, 'COMMIT_INVALID', path))
    })
  }

  test('low-entropy digest and commit placeholders are rejected', () => {
    const receipt = cloneReceipt()
    receipt.artifact.sha256 = `sha256:${'0'.repeat(64)}`
    receipt.source.commit = '0'.repeat(40)

    assert.ok(errorAt(receipt, 'SHA256_PLACEHOLDER', '$.artifact.sha256'))
    assert.ok(errorAt(receipt, 'COMMIT_PLACEHOLDER', '$.source.commit'))
  })

  for (const [path, value, code] of [
    ['$.release.modificationDate', '2026-02-30', 'UTC_DATE_INVALID'],
    [
      '$.release.buildCompletedAt',
      '2026-08-27T17:00:00+09:00',
      'UTC_DATETIME_INVALID'
    ],
    ['$.publisher.attestedAt', '2026-08-27 08:30:00Z', 'UTC_DATETIME_INVALID'],
    ['$.reviewer.reviewedAt', '2026-08-27T09:00:00', 'UTC_DATETIME_INVALID']
  ]) {
    test(`${path} requires a real UTC value`, () => {
      const receipt = cloneReceipt()
      setAtJsonPath(receipt, path, value)
      assert.ok(errorAt(receipt, code, path))
    })
  }

  for (const terminator of LINE_TERMINATORS) {
    test(`fixed-format fields reject trailing ${JSON.stringify(terminator)}`, () => {
      const receipt = cloneReceipt()
      receipt.legalPayload.license.sha256 += terminator
      receipt.source.commit += terminator
      receipt.release.modificationDate += terminator
      receipt.release.buildCompletedAt += terminator
      receipt.release.version += terminator
      receipt.source.tag += terminator
      receipt.artifact.path += terminator

      assert.ok(
        errorAt(receipt, 'SHA256_INVALID', '$.legalPayload.license.sha256')
      )
      assert.ok(errorAt(receipt, 'COMMIT_INVALID', '$.source.commit'))
      assert.ok(
        errorAt(receipt, 'UTC_DATE_INVALID', '$.release.modificationDate')
      )
      assert.ok(
        errorAt(receipt, 'UTC_DATETIME_INVALID', '$.release.buildCompletedAt')
      )
      assert.ok(errorAt(receipt, 'SCHEMA_PATTERN', '$.release.version'))
      assert.ok(errorAt(receipt, 'SCHEMA_PATTERN', '$.source.tag'))
      assert.ok(errorAt(receipt, 'SCHEMA_PATTERN', '$.artifact.path'))
    })
  }

  test('every string field rejects every trailing line terminator', () => {
    for (const { path, value } of collectStringEntries(validReceipt)) {
      for (const terminator of LINE_TERMINATORS) {
        const receipt = cloneReceipt()
        setAtJsonPath(receipt, path, `${value}${terminator}`)

        assert.ok(
          validateReleaseReceipt(receipt).some((error) => error.path === path),
          `${path} accepted trailing ${JSON.stringify(terminator)}`
        )
      }
    }
  })

  test('placeholder tokens and reserved destinations are rejected recursively', () => {
    const receipt = cloneReceipt()
    receipt.build.commands[0] = '<insert build command>'
    receipt.publisher.name = 'TBD'
    receipt.source.url =
      'https://example.invalid/archive/7d639fda2c290c0f7a81198a7bd3a9fb44bb00a6.tar.gz'

    assert.ok(errorAt(receipt, 'PLACEHOLDER_VALUE', '$.build.commands[0]'))
    assert.ok(errorAt(receipt, 'PLACEHOLDER_VALUE', '$.publisher.name'))
    assert.ok(errorAt(receipt, 'PLACEHOLDER_VALUE', '$.source.url'))
  })
})

describe('artifact-specific semantic bindings', () => {
  const semanticCases = [
    {
      name: 'moving branch URL',
      code: 'SOURCE_URL_MOVING',
      mutate: (receipt) => {
        receipt.source.url =
          'https://github.com/omarketing-synthetic/frontend/archive/refs/heads/main.tar.gz'
      }
    },
    {
      name: 'encoded moving branch URL',
      code: 'SOURCE_URL_MOVING',
      mutate: (receipt) => {
        receipt.source.url =
          'https://github.com/omarketing-synthetic/frontend/archive/refs%2Fheads%2Fmain.tar.gz'
      }
    },
    {
      name: 'source URL without commit or tag',
      code: 'SOURCE_URL_NOT_IMMUTABLE',
      mutate: (receipt) => {
        receipt.source.url =
          'https://github.com/omarketing-synthetic/frontend/archive/source.tar.gz'
      }
    },
    {
      name: 'source URL with a longer tag sharing the recorded prefix',
      code: 'SOURCE_URL_NOT_IMMUTABLE',
      mutate: (receipt) => {
        receipt.source.url =
          'https://github.com/omarketing-synthetic/frontend/archive/refs/tags/v1.0.0-synthetic.10.tar.gz'
      }
    },
    {
      name: 'source URL with only the exact release tag',
      code: 'SOURCE_URL_NOT_IMMUTABLE',
      mutate: (receipt) => {
        receipt.source.url =
          'https://github.com/omarketing-synthetic/frontend/archive/refs/tags/v1.0.0-synthetic.1.tar.gz'
      }
    },
    {
      name: 'source URL with a longer commit sharing the recorded prefix',
      code: 'SOURCE_URL_NOT_IMMUTABLE',
      mutate: (receipt) => {
        receipt.source.url = `https://github.com/omarketing-synthetic/frontend/archive/${receipt.source.commit}a.tar.gz`
      }
    },
    {
      name: 'mutable blob route containing the exact commit as a filename',
      code: 'SOURCE_URL_NOT_IMMUTABLE',
      mutate: (receipt) => {
        receipt.source.url = `https://github.com/omarketing-synthetic/frontend/blob/feature/${receipt.source.commit}.tar.gz`
      }
    },
    {
      name: 'mutable blob route nesting a canonical-looking archive selector',
      code: 'SOURCE_URL_NOT_IMMUTABLE',
      mutate: (receipt) => {
        receipt.source.url = `https://github.com/omarketing-synthetic/frontend/blob/feature/archive/${receipt.source.commit}.tar.gz`
      }
    },
    {
      name: 'unsupported host with a canonical-looking archive selector',
      code: 'SOURCE_URL_NOT_IMMUTABLE',
      mutate: (receipt) => {
        receipt.source.url = `https://source.omarketing.dev/frontend/archive/${receipt.source.commit}.tar.gz`
      }
    },
    {
      name: 'mutable GitLab blob route nesting an archive selector',
      code: 'SOURCE_URL_NOT_IMMUTABLE',
      mutate: (receipt) => {
        receipt.source.url = `https://gitlab.com/omarketing-synthetic/frontend/-/blob/feature/-/archive/${receipt.source.commit}/frontend-${receipt.source.commit}.tar.gz`
      }
    },
    {
      name: 'source tag/version mismatch',
      code: 'SOURCE_TAG_VERSION_MISMATCH',
      mutate: (receipt) => {
        receipt.source.tag = 'refs/tags/v9.9.9'
      }
    },
    {
      name: 'source archive/input digest mismatch',
      code: 'SOURCE_INPUT_DIGEST_MISMATCH',
      mutate: (receipt) => {
        receipt.build.inputs[0].sha256 =
          'sha256:99b8a2fb31b49f4f5aba2fb955f339240eacf9341b73ad0ea5b9c3dacd15bd15'
      }
    },
    {
      name: 'missing source archive role',
      code: 'SOURCE_INPUT_COUNT_INVALID',
      mutate: (receipt) => {
        receipt.build.inputs[0].role = 'other'
      }
    },
    {
      name: 'release/artifact version mismatch',
      code: 'RELEASE_VERSION_MISMATCH',
      mutate: (receipt) => {
        receipt.artifact.version = '2.0.0'
      }
    },
    {
      name: 'receipt ID mismatch',
      code: 'RECEIPT_ID_MISMATCH',
      mutate: (receipt) => {
        receipt.receiptId = `${receipt.receiptId}a`
      }
    },
    {
      name: 'artifact/output mismatch',
      code: 'ARTIFACT_OUTPUT_MISMATCH',
      mutate: (receipt) => {
        receipt.build.outputs[0].path = 'dist/different.zip'
      }
    },
    {
      name: 'multiple artifact outputs',
      code: 'ARTIFACT_OUTPUT_COUNT_INVALID',
      mutate: (receipt) => {
        receipt.build.outputs[1].role = 'release-artifact'
      }
    },
    {
      name: 'SBOM subject mismatch',
      code: 'SBOM_ARTIFACT_MISMATCH',
      mutate: (receipt) => {
        receipt.sbom.artifactSha256 =
          'sha256:99b8a2fb31b49f4f5aba2fb955f339240eacf9341b73ad0ea5b9c3dacd15bd15'
      }
    },
    {
      name: 'review decision mismatch',
      code: 'REVIEW_DECISION_MISMATCH',
      mutate: (receipt) => {
        receipt.reviewer.decision = 'PASS'
      }
    },
    {
      name: 'publisher reviewing own receipt',
      code: 'REVIEWER_NOT_INDEPENDENT',
      mutate: (receipt) => {
        receipt.reviewer.identity = receipt.publisher.identity
      }
    },
    {
      name: 'publisher reviewing under an equivalent identity URI',
      code: 'REVIEWER_NOT_INDEPENDENT',
      mutate: (receipt) => {
        receipt.publisher.identity = 'https://id.omarketing.dev/alice'
        receipt.reviewer.identity = 'https://ID.OMARKETING.DEV:443/alice'
      }
    },
    {
      name: 'publisher reviewing under an unreserved percent-encoded identity',
      code: 'REVIEWER_NOT_INDEPENDENT',
      mutate: (receipt) => {
        receipt.publisher.identity = 'https://id.omarketing.dev/alice'
        receipt.reviewer.identity = 'https://id.omarketing.dev/%61lice'
      }
    },
    {
      name: 'package manager version mismatch',
      code: 'PACKAGE_MANAGER_VERSION_MISMATCH',
      mutate: (receipt) => {
        receipt.build.toolchain.packageManager = 'pnpm@11.14.0'
      }
    },
    {
      name: 'duplicate material path',
      code: 'DUPLICATE_BINDING',
      mutate: (receipt) => {
        receipt.build.inputs[1].path = receipt.build.inputs[0].path
      }
    },
    {
      name: 'build before modification date',
      code: 'BUILD_BEFORE_MODIFICATION',
      mutate: (receipt) => {
        receipt.release.modificationDate = '2026-08-28'
      }
    },
    {
      name: 'publisher attestation before build',
      code: 'PUBLISHER_BEFORE_BUILD',
      mutate: (receipt) => {
        receipt.publisher.attestedAt = '2026-08-27T07:59:59Z'
      }
    },
    {
      name: 'publisher attestation one nanosecond before build',
      code: 'PUBLISHER_BEFORE_BUILD',
      mutate: (receipt) => {
        receipt.release.buildCompletedAt = '2026-08-27T08:00:00.000000002Z'
        receipt.publisher.attestedAt = '2026-08-27T08:00:00.000000001Z'
      }
    },
    {
      name: 'review before publisher attestation',
      code: 'REVIEW_BEFORE_ATTESTATION',
      mutate: (receipt) => {
        receipt.reviewer.reviewedAt = '2026-08-27T08:29:59Z'
      }
    },
    {
      name: 'review one nanosecond before publisher attestation',
      code: 'REVIEW_BEFORE_ATTESTATION',
      mutate: (receipt) => {
        receipt.publisher.attestedAt = '2026-08-27T08:30:00.000000002Z'
        receipt.reviewer.reviewedAt = '2026-08-27T08:30:00.000000001Z'
      }
    }
  ]

  for (const { name, code, mutate } of semanticCases) {
    test(`${name} is rejected`, () => {
      const receipt = cloneReceipt()
      mutate(receipt)
      assert.ok(
        validateReleaseReceipt(receipt).some((error) => error.code === code),
        `${code} was not reported`
      )
    })
  }
})

test('malformed JSON is an input error, not a structural PASS', () => {
  const malformedSecret = 'synthetic-secret-do-not-store'
  const result = spawnSync(process.execPath, [validatorPath, '-'], {
    encoding: 'utf8',
    input: malformedSecret
  })

  assert.equal(result.status, EXIT_CODES.USAGE_OR_INPUT_ERROR)
  assert.match(
    result.stderr,
    /INPUT_ERROR: Receipt input could not be read or parsed/
  )
  assert.equal(result.stderr.includes(malformedSecret), false)
  assert.doesNotMatch(result.stderr, /Unexpected token|not valid JSON/i)
  assert.match(result.stderr, /does not establish production readiness/i)
})
