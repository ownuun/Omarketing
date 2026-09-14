import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { validateReleaseReceipt } from './validate-release-receipt.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const validatorPath = join(directory, 'validate-release-receipt.mjs')
const fixturePath = (name) => join(directory, 'fixtures', 'invalid', name)
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const invalidCases = [
  {
    name: 'missing-required-fields.json',
    expectedCodes: ['SCHEMA_REQUIRED']
  },
  {
    name: 'missing-nested-fields.json',
    expectedCodes: ['SCHEMA_REQUIRED', 'SCHEMA_MIN_ITEMS']
  },
  {
    name: 'moving-branch-url.json',
    expectedCodes: ['SOURCE_URL_MOVING', 'SOURCE_URL_NOT_IMMUTABLE']
  },
  {
    name: 'placeholder-values.json',
    expectedCodes: [
      'PLACEHOLDER_VALUE',
      'COMMIT_PLACEHOLDER',
      'SHA256_PLACEHOLDER'
    ]
  },
  {
    name: 'malformed-sha-date.json',
    expectedCodes: [
      'COMMIT_INVALID',
      'SHA256_INVALID',
      'UTC_DATE_INVALID',
      'UTC_DATETIME_INVALID'
    ]
  },
  {
    name: 'secret-environment-value.json',
    expectedCodes: ['ENV_SECRET_VALUE']
  }
]

describe('RED invalid release receipt fixtures', () => {
  for (const { name, expectedCodes } of invalidCases) {
    test(`${name} is rejected with its specific failure`, () => {
      const errors = validateReleaseReceipt(readJson(fixturePath(name)))
      const codes = new Set(errors.map(({ code }) => code))

      for (const expectedCode of expectedCodes) {
        assert.ok(codes.has(expectedCode), `${expectedCode} was not reported`)
      }

      const result = spawnSync(
        process.execPath,
        [validatorPath, fixturePath(name)],
        {
          encoding: 'utf8'
        }
      )

      assert.equal(result.status, 1, result.stdout)
      for (const expectedCode of expectedCodes) {
        assert.match(result.stderr, new RegExp(expectedCode))
      }
      assert.match(result.stderr, /does not establish production readiness/i)
      assert.match(result.stderr, /does not constitute legal approval/i)
    })
  }
})
