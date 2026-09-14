import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

import {
  FIXTURE_DISCLAIMER,
  validateArtifactManifest
} from './validate-artifact-contents.mjs'

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const validatorPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'validate-artifact-contents.mjs'
)
const completeFixturePath = join(fixtureRoot, 'complete-artifact-manifest.json')
const completeManifest = readJson(completeFixturePath)
const validationCases = readJson(join(fixtureRoot, 'validation-cases.json'))

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function errorCodes(manifest) {
  return validateArtifactManifest(manifest).map(({ code }) => code)
}

function buildInvalidFixture(validationCase) {
  const manifest = structuredClone(completeManifest)

  if (validationCase.removeRole) {
    manifest.files = manifest.files.filter(
      ({ role }) => role !== validationCase.removeRole
    )
  }

  if (validationCase.componentIndex !== undefined) {
    const component = manifest.components[validationCase.componentIndex]
    if (validationCase.deleteField) {
      delete component[validationCase.deleteField]
    }
    if (validationCase.deleteNestedField) {
      const [parent, child] = validationCase.deleteNestedField.split('.')
      delete component[parent][child]
    }
  }

  if (validationCase.targetRole) {
    const file = manifest.files.find(
      ({ role }) => role === validationCase.targetRole
    )
    file[validationCase.setField] = validationCase.value
  }

  return manifest
}

describe('complete synthetic artifact manifest', () => {
  test('passes structural validation', () => {
    assert.deepEqual(validateArtifactManifest(completeManifest), [])
  })

  test('accepts CycloneDX as the supported SBOM alternative', () => {
    const manifest = structuredClone(completeManifest)
    const sbom = manifest.files.find(({ role }) => role === 'sbom')
    sbom.path = 'sbom.cyclonedx.json'
    sbom.format = 'CycloneDX'
    sbom.specVersion = '1.6'

    assert.deepEqual(validateArtifactManifest(manifest), [])
  })

  test('CLI exits zero and limits PASS to fixture structure', () => {
    const result = spawnSync(
      process.execPath,
      [validatorPath, completeFixturePath],
      { encoding: 'utf8' }
    )

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /PASS: synthetic artifact manifest structure/)
    assert.match(result.stdout, /not legal approval/i)
    assert.match(
      result.stdout,
      new RegExp(FIXTURE_DISCLAIMER.replaceAll('.', '\\.'))
    )
    assert.doesNotMatch(result.stdout, /release[- ]ready/i)
  })
})

describe('required artifact payload fixtures', () => {
  for (const validationCase of validationCases.requiredPayloadCases) {
    test(`${validationCase.name} is expected FAIL`, () => {
      const manifest = buildInvalidFixture(validationCase)
      assert.ok(
        errorCodes(manifest).includes(validationCase.expectedCode),
        `${validationCase.expectedCode} was not reported`
      )

      const result = spawnSync(process.execPath, [validatorPath, '-'], {
        encoding: 'utf8',
        input: JSON.stringify(manifest)
      })
      assert.equal(result.status, 1, result.stdout)
      assert.match(result.stderr, new RegExp(validationCase.expectedCode))
      assert.match(result.stderr, /not legal approval/i)
    })
  }
})

describe('component inventory field fixtures', () => {
  for (const validationCase of validationCases.componentFieldCases) {
    test(`${validationCase.name} is validated`, () => {
      const manifest = buildInvalidFixture(validationCase)
      assert.ok(
        errorCodes(manifest).includes(validationCase.expectedCode),
        `${validationCase.expectedCode} was not reported`
      )
    })
  }
})

describe('payload content fixtures', () => {
  for (const validationCase of validationCases.contentCases) {
    test(`${validationCase.name} is rejected`, () => {
      const manifest = buildInvalidFixture(validationCase)
      assert.ok(
        errorCodes(manifest).includes(validationCase.expectedCode),
        `${validationCase.expectedCode} was not reported`
      )
    })
  }
})
