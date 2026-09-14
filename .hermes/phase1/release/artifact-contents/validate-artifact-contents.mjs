import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const FIXTURE_DISCLAIMER =
  'Fixture structure only; this is not legal approval or license-compliance evidence.'

const SCHEMA_VERSION = 'omarketing-artifact-contents-fixture/v1'
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/i
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i
const COMPONENT_RELATIONSHIPS = new Set([
  'CONTAINS',
  'DEPENDS_ON',
  'DYNAMIC_LINK',
  'GENERATED_FROM',
  'OTHER',
  'STATIC_LINK'
])
const UNKNOWN_LICENSES = new Set([
  'NONE',
  'NOASSERTION',
  'UNKNOWN',
  'UNLICENSED'
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasDigest(value) {
  return isNonEmptyString(value) && SHA256_PATTERN.test(value)
}

function hasCommit(value) {
  return isNonEmptyString(value) && COMMIT_PATTERN.test(value)
}

function hasSourceReference(value) {
  if (!isNonEmptyString(value)) return false
  if (/^pkg:[a-z0-9.+-]+\/\S+$/i.test(value)) return true

  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function hasImmutableSourceUrl(value, immutableId) {
  return (
    hasSourceReference(value) &&
    hasCommit(immutableId) &&
    value.includes(immutableId)
  )
}

function addError(errors, code, path, message) {
  errors.push({ code, path, message })
}

function findRequiredFile(errors, files, role, missingCode, label) {
  const matches = files.filter((file) => isRecord(file) && file.role === role)
  if (matches.length === 0) {
    addError(errors, missingCode, 'files', `${label} is required.`)
    return undefined
  }
  if (matches.length > 1) {
    addError(
      errors,
      'PAYLOAD_ROLE_DUPLICATED',
      'files',
      `${label} must appear exactly once.`
    )
  }
  return matches[0]
}

function validateCommonFile(errors, file, role, codePrefix) {
  if (file.complete !== true) {
    addError(
      errors,
      `${codePrefix}_INCOMPLETE`,
      `files.${role}.complete`,
      `${role} must be marked complete.`
    )
  }
  if (!hasDigest(file.digest)) {
    addError(
      errors,
      `${codePrefix}_DIGEST_INVALID`,
      `files.${role}.digest`,
      `${role} must have a sha256 digest.`
    )
  }
}

function validateArtifact(errors, artifact) {
  if (!isRecord(artifact)) {
    addError(
      errors,
      'ARTIFACT_REQUIRED',
      'artifact',
      'Artifact identity is required.'
    )
    return
  }

  if (!isNonEmptyString(artifact.name)) {
    addError(
      errors,
      'ARTIFACT_NAME_REQUIRED',
      'artifact.name',
      'Artifact name is required.'
    )
  }
  if (!isNonEmptyString(artifact.version)) {
    addError(
      errors,
      'ARTIFACT_VERSION_REQUIRED',
      'artifact.version',
      'Artifact version is required.'
    )
  }
  if (!hasDigest(artifact.digest)) {
    addError(
      errors,
      'ARTIFACT_DIGEST_INVALID',
      'artifact.digest',
      'Artifact digest must be sha256.'
    )
  }
}

function validateLicense(errors, license) {
  if (!license) return
  validateCommonFile(errors, license, 'license', 'LICENSE')
  if (license.path !== 'LICENSE') {
    addError(
      errors,
      'LICENSE_PATH_INVALID',
      'files.license.path',
      'The complete license must use the artifact path LICENSE.'
    )
  }
}

function validateNotices(errors, notices, componentCount) {
  if (!notices) return
  validateCommonFile(errors, notices, 'notices', 'NOTICES')
  if (notices.path !== 'THIRD_PARTY_NOTICES.md') {
    addError(
      errors,
      'NOTICES_PATH_INVALID',
      'files.notices.path',
      'Notices must use the artifact path THIRD_PARTY_NOTICES.md.'
    )
  }
  if (notices.componentCount !== componentCount) {
    addError(
      errors,
      'NOTICES_COMPONENT_COUNT_MISMATCH',
      'files.notices.componentCount',
      'Notices must account for every component in this manifest.'
    )
  }
  if (notices.reviewStatus !== 'synthetic-fixture-only') {
    addError(
      errors,
      'NOTICES_FIXTURE_STATUS_INVALID',
      'files.notices.reviewStatus',
      'Fixture notices must not claim a real human or legal review.'
    )
  }
}

function validateSbom(errors, sbom, artifactDigest, componentCount) {
  if (!sbom) return
  validateCommonFile(errors, sbom, 'sbom', 'SBOM')
  if (!['SPDX', 'CycloneDX'].includes(sbom.format)) {
    addError(
      errors,
      'SBOM_FORMAT_INVALID',
      'files.sbom.format',
      'SBOM format must be SPDX or CycloneDX.'
    )
  }
  if (!isNonEmptyString(sbom.specVersion)) {
    addError(
      errors,
      'SBOM_SPEC_VERSION_REQUIRED',
      'files.sbom.specVersion',
      'SBOM specification version is required.'
    )
  }
  if (
    !hasDigest(sbom.artifactDigest) ||
    sbom.artifactDigest !== artifactDigest
  ) {
    addError(
      errors,
      'SBOM_ARTIFACT_DIGEST_MISMATCH',
      'files.sbom.artifactDigest',
      'SBOM must describe the manifest artifact digest.'
    )
  }
  if (sbom.componentCount !== componentCount) {
    addError(
      errors,
      'SBOM_COMPONENT_COUNT_MISMATCH',
      'files.sbom.componentCount',
      'SBOM must account for every component in this manifest.'
    )
  }
}

function validateSourceBuildReceipt(errors, receipt, artifactDigest) {
  if (!receipt) return
  validateCommonFile(
    errors,
    receipt,
    'source-build-receipt',
    'SOURCE_BUILD_RECEIPT'
  )
  if (receipt.path !== 'SOURCE_BUILD_RECEIPT.json') {
    addError(
      errors,
      'SOURCE_BUILD_RECEIPT_PATH_INVALID',
      'files.source-build-receipt.path',
      'Source/build receipt path must be SOURCE_BUILD_RECEIPT.json.'
    )
  }
  if (!hasCommit(receipt.sourceCommit)) {
    addError(
      errors,
      'SOURCE_BUILD_COMMIT_INVALID',
      'files.source-build-receipt.sourceCommit',
      'Source/build receipt must identify a full source commit.'
    )
  }
  if (
    !isNonEmptyString(receipt.sourceTag) ||
    !receipt.sourceTag.startsWith('refs/tags/')
  ) {
    addError(
      errors,
      'SOURCE_BUILD_TAG_INVALID',
      'files.source-build-receipt.sourceTag',
      'Source/build receipt must identify an immutable tag ref.'
    )
  }
  if (!hasImmutableSourceUrl(receipt.sourceUrl, receipt.sourceCommit)) {
    addError(
      errors,
      'SOURCE_BUILD_URL_NOT_IMMUTABLE',
      'files.source-build-receipt.sourceUrl',
      'Source URL must be HTTPS and contain the full source commit.'
    )
  }

  const build = receipt.build
  if (!isRecord(build)) {
    addError(
      errors,
      'BUILD_DETAILS_REQUIRED',
      'files.source-build-receipt.build',
      'Artifact-specific build details are required.'
    )
    return
  }

  for (const field of [
    'os',
    'architecture',
    'nodeVersion',
    'pnpmVersion',
    'environment'
  ]) {
    if (!isNonEmptyString(build[field])) {
      addError(
        errors,
        'BUILD_DETAILS_INCOMPLETE',
        `files.source-build-receipt.build.${field}`,
        `Build ${field} is required.`
      )
    }
  }
  if (
    !Array.isArray(build.commands) ||
    build.commands.length === 0 ||
    build.commands.some((command) => !isNonEmptyString(command))
  ) {
    addError(
      errors,
      'BUILD_COMMANDS_REQUIRED',
      'files.source-build-receipt.build.commands',
      'Build commands must be a non-empty string list.'
    )
  }
  if (!hasDigest(build.outputDigest) || build.outputDigest !== artifactDigest) {
    addError(
      errors,
      'BUILD_OUTPUT_DIGEST_MISMATCH',
      'files.source-build-receipt.build.outputDigest',
      'Build output digest must equal the artifact digest.'
    )
  }
}

function validateSourceDirections(errors, directions, receipt) {
  if (!directions) return
  validateCommonFile(
    errors,
    directions,
    'source-directions',
    'SOURCE_DIRECTIONS'
  )
  if (directions.immutable !== true) {
    addError(
      errors,
      'SOURCE_DIRECTIONS_NOT_IMMUTABLE',
      'files.source-directions.immutable',
      'Source directions must explicitly be immutable.'
    )
  }
  if (directions.noAdditionalCharge !== true) {
    addError(
      errors,
      'SOURCE_DIRECTIONS_CHARGE_INVALID',
      'files.source-directions.noAdditionalCharge',
      'Source directions must record no-additional-charge access.'
    )
  }
  if (!hasCommit(directions.sourceCommit)) {
    addError(
      errors,
      'SOURCE_DIRECTIONS_COMMIT_INVALID',
      'files.source-directions.sourceCommit',
      'Source directions must identify a full source commit.'
    )
  }
  if (!hasImmutableSourceUrl(directions.sourceUrl, directions.sourceCommit)) {
    addError(
      errors,
      'SOURCE_DIRECTIONS_URL_NOT_IMMUTABLE',
      'files.source-directions.sourceUrl',
      'Source directions URL must be HTTPS and contain the full source commit.'
    )
  }
  if (
    receipt &&
    (directions.sourceCommit !== receipt.sourceCommit ||
      directions.sourceBuildReceiptPath !== receipt.path)
  ) {
    addError(
      errors,
      'SOURCE_DIRECTIONS_RECEIPT_MISMATCH',
      'files.source-directions',
      'Source directions must reference the matching source/build receipt.'
    )
  }
  if (
    !Array.isArray(directions.installBuildReplaceSteps) ||
    directions.installBuildReplaceSteps.length < 3 ||
    directions.installBuildReplaceSteps.some((step) => !isNonEmptyString(step))
  ) {
    addError(
      errors,
      'SOURCE_DIRECTIONS_STEPS_INCOMPLETE',
      'files.source-directions.installBuildReplaceSteps',
      'Install, build, and object-code replacement directions are required.'
    )
  }
}

function validateBackendBridgeReceipt(errors, receipt) {
  if (!receipt) return
  validateCommonFile(
    errors,
    receipt,
    'backend-bridge-receipt',
    'BACKEND_BRIDGE_RECEIPT'
  )
  if (receipt.path !== 'BACKEND_BRIDGE_RECEIPT.json') {
    addError(
      errors,
      'BACKEND_BRIDGE_RECEIPT_PATH_INVALID',
      'files.backend-bridge-receipt.path',
      'Backend bridge receipt path must be BACKEND_BRIDGE_RECEIPT.json.'
    )
  }
  for (const field of ['name', 'version', 'license', 'sbomPath']) {
    if (!isNonEmptyString(receipt[field])) {
      addError(
        errors,
        'BACKEND_BRIDGE_RECEIPT_INCOMPLETE',
        `files.backend-bridge-receipt.${field}`,
        `Backend bridge ${field} is required.`
      )
    }
  }
  if (!hasCommit(receipt.sourceCommit)) {
    addError(
      errors,
      'BACKEND_BRIDGE_COMMIT_INVALID',
      'files.backend-bridge-receipt.sourceCommit',
      'Backend bridge receipt must identify a full source commit.'
    )
  }
  if (!hasImmutableSourceUrl(receipt.sourceUrl, receipt.sourceCommit)) {
    addError(
      errors,
      'BACKEND_BRIDGE_URL_NOT_IMMUTABLE',
      'files.backend-bridge-receipt.sourceUrl',
      'Backend bridge source URL must contain its full source commit.'
    )
  }
  if (!hasDigest(receipt.artifactDigest)) {
    addError(
      errors,
      'BACKEND_BRIDGE_DIGEST_INVALID',
      'files.backend-bridge-receipt.artifactDigest',
      'Backend bridge artifact must have a sha256 digest.'
    )
  }
  if (!hasCommit(receipt.backendCommit)) {
    addError(
      errors,
      'BACKEND_COMPATIBILITY_COMMIT_INVALID',
      'files.backend-bridge-receipt.backendCommit',
      'Backend compatibility pin must be a full commit.'
    )
  }
}

function isUnknownLicense(license) {
  return (
    UNKNOWN_LICENSES.has(license.toUpperCase()) || /^LicenseRef-/i.test(license)
  )
}

function validateUnknownDisposition(errors, disposition, license, path) {
  if (!isRecord(disposition)) {
    addError(
      errors,
      'COMPONENT_UNKNOWN_DISPOSITION_REQUIRED',
      path,
      'Every component must state its unknown-license disposition.'
    )
    return
  }

  if (
    !isNonEmptyString(disposition.status) ||
    !isNonEmptyString(disposition.reason)
  ) {
    addError(
      errors,
      'COMPONENT_UNKNOWN_DISPOSITION_INCOMPLETE',
      path,
      'Disposition status and reason are required.'
    )
    return
  }

  if (isUnknownLicense(license)) {
    if (
      !['removed', 'replaced', 'synthetic-reviewed'].includes(
        disposition.status
      ) ||
      !isNonEmptyString(disposition.reviewer) ||
      !isNonEmptyString(disposition.evidence)
    ) {
      addError(
        errors,
        'COMPONENT_UNKNOWN_DISPOSITION_INCOMPLETE',
        path,
        'Unknown licenses require a disposition, reviewer, and evidence.'
      )
    }
    return
  }

  if (!['documented', 'not-required'].includes(disposition.status)) {
    addError(
      errors,
      'COMPONENT_UNKNOWN_DISPOSITION_INVALID',
      path,
      'Known licenses must use documented or not-required disposition.'
    )
  }
}

function validateComponents(errors, components) {
  if (!Array.isArray(components) || components.length === 0) {
    addError(
      errors,
      'COMPONENTS_REQUIRED',
      'components',
      'At least one SBOM component is required.'
    )
    return
  }

  components.forEach((component, index) => {
    const path = `components.${index}`
    if (!isRecord(component)) {
      addError(
        errors,
        'COMPONENT_OBJECT_REQUIRED',
        path,
        'Component must be an object.'
      )
      return
    }
    if (!isNonEmptyString(component.name)) {
      addError(
        errors,
        'COMPONENT_NAME_REQUIRED',
        `${path}.name`,
        'Component name is required.'
      )
    }
    if (!isNonEmptyString(component.version)) {
      addError(
        errors,
        'COMPONENT_VERSION_REQUIRED',
        `${path}.version`,
        'Component version or immutable commit is required.'
      )
    }
    if (!hasSourceReference(component.source)) {
      addError(
        errors,
        'COMPONENT_SOURCE_REQUIRED',
        `${path}.source`,
        'Component source must be an HTTPS URL or package URL.'
      )
    }
    if (!hasDigest(component.digest)) {
      addError(
        errors,
        'COMPONENT_DIGEST_INVALID',
        `${path}.digest`,
        'Component digest must be sha256.'
      )
    }
    if (!isNonEmptyString(component.concludedLicense)) {
      addError(
        errors,
        'COMPONENT_LICENSE_REQUIRED',
        `${path}.concludedLicense`,
        'Component concluded license is required.'
      )
    }
    if (!COMPONENT_RELATIONSHIPS.has(component.relationship)) {
      addError(
        errors,
        'COMPONENT_RELATIONSHIP_INVALID',
        `${path}.relationship`,
        'Component relationship is missing or unsupported.'
      )
    }

    validateUnknownDisposition(
      errors,
      component.unknownDisposition,
      isNonEmptyString(component.concludedLicense)
        ? component.concludedLicense
        : 'UNKNOWN',
      `${path}.unknownDisposition`
    )
  })
}

export function validateArtifactManifest(manifest) {
  const errors = []
  if (!isRecord(manifest)) {
    addError(
      errors,
      'MANIFEST_OBJECT_REQUIRED',
      '$',
      'Manifest must be a JSON object.'
    )
    return errors
  }

  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    addError(
      errors,
      'SCHEMA_VERSION_INVALID',
      'schemaVersion',
      `Schema version must be ${SCHEMA_VERSION}.`
    )
  }
  if (manifest.fixtureOnly !== true) {
    addError(
      errors,
      'FIXTURE_ONLY_REQUIRED',
      'fixtureOnly',
      'This bounded validator accepts synthetic fixtures only.'
    )
  }

  validateArtifact(errors, manifest.artifact)

  const files = Array.isArray(manifest.files) ? manifest.files : []
  if (!Array.isArray(manifest.files)) {
    addError(errors, 'FILES_REQUIRED', 'files', 'Artifact files are required.')
  }
  const components = Array.isArray(manifest.components)
    ? manifest.components
    : []

  const license = findRequiredFile(
    errors,
    files,
    'license',
    'LICENSE_REQUIRED',
    'Complete LICENSE'
  )
  const notices = findRequiredFile(
    errors,
    files,
    'notices',
    'NOTICES_REQUIRED',
    'Complete third-party notices'
  )
  const sbom = findRequiredFile(
    errors,
    files,
    'sbom',
    'SBOM_REQUIRED',
    'SPDX or CycloneDX SBOM'
  )
  const sourceBuildReceipt = findRequiredFile(
    errors,
    files,
    'source-build-receipt',
    'SOURCE_BUILD_RECEIPT_REQUIRED',
    'Source/build receipt'
  )
  const sourceDirections = findRequiredFile(
    errors,
    files,
    'source-directions',
    'SOURCE_DIRECTIONS_REQUIRED',
    'Immutable source directions'
  )
  const backendBridgeReceipt = findRequiredFile(
    errors,
    files,
    'backend-bridge-receipt',
    'BACKEND_BRIDGE_RECEIPT_REQUIRED',
    'Backend bridge receipt'
  )

  validateLicense(errors, license)
  validateNotices(errors, notices, components.length)
  validateSbom(errors, sbom, manifest.artifact?.digest, components.length)
  validateSourceBuildReceipt(
    errors,
    sourceBuildReceipt,
    manifest.artifact?.digest
  )
  validateSourceDirections(errors, sourceDirections, sourceBuildReceipt)
  validateBackendBridgeReceipt(errors, backendBridgeReceipt)
  validateComponents(errors, manifest.components)

  return errors
}

function runCli(args) {
  if (args.length !== 1) {
    process.stderr.write(
      'Usage: node validate-artifact-contents.mjs <manifest.json|->\n'
    )
    return 2
  }

  let manifest
  try {
    const input =
      args[0] === '-' ? readFileSync(0, 'utf8') : readFileSync(args[0], 'utf8')
    manifest = JSON.parse(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`INPUT_INVALID: ${message}\n${FIXTURE_DISCLAIMER}\n`)
    return 2
  }

  const errors = validateArtifactManifest(manifest)
  if (errors.length > 0) {
    process.stderr.write(
      `FAIL: synthetic artifact manifest structure (${errors.length} error(s)).\n`
    )
    for (const error of errors) {
      process.stderr.write(`${error.code} ${error.path}: ${error.message}\n`)
    }
    process.stderr.write(`${FIXTURE_DISCLAIMER}\n`)
    return 1
  }

  process.stdout.write(
    `PASS: synthetic artifact manifest structure. ${FIXTURE_DISCLAIMER}\n`
  )
  return 0
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = runCli(process.argv.slice(2))
}
