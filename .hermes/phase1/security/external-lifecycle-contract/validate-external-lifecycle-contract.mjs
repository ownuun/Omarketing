import assert from 'node:assert/strict'
import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify
} from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TextDecoder } from 'node:util'
import { gunzipSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true })

export const repoRoot = resolve(moduleDirectory, '../../../..')
export const fixturePath = join(
  repoRoot,
  '.hermes/phase0/fixtures/external-job-lifecycle.cases.json'
)
export const schemaDirectory = join(repoRoot, '.hermes/phase0/schemas')
export const contractPath = join(
  repoRoot,
  '.hermes/phase0/contracts/external-job-lifecycle.md'
)

export const expectedSchemaNames = Object.freeze([
  'external-job-acceptance.v1.schema.json',
  'external-job-artifact-handle.v1.schema.json',
  'external-job-cancel-request.v1.schema.json',
  'external-job-cancel-response.v1.schema.json',
  'external-job-envelope.v1.schema.json',
  'external-job-error.v1.schema.json',
  'external-job-event.v1.schema.json',
  'external-job-locator.v1.schema.json',
  'external-job-status.v1.schema.json'
])

export const fixtureCollections = Object.freeze([
  'schema_cases',
  'document_invariant_cases',
  'cases',
  'recovery_cases',
  'network_cases',
  'artifact_cases',
  'callback_cases',
  'status_sequence_cases',
  'safe_text_cases',
  'odesign_status_receipt_cases'
])

const ODESIGN_STATUS_RECEIPT_SHAPE = Object.freeze([
  'schema_version',
  'operation',
  'external_run_id',
  'odesign_status',
  'omarketing_projection',
  'guidance_code',
  'observed_at',
  'publication',
  'lookup_before_retry'
])
const ODESIGN_STATUS_RECEIPT_SCHEMA_VERSION =
  'omarketing.odesign-status-receipt.v1'
const ODESIGN_OPERATIONS = Object.freeze(['StaticAd', 'Shorts'])
const ODESIGN_STATUSES = Object.freeze([
  'accepted',
  'awaiting_approval',
  'running',
  'outcome_unknown',
  'succeeded',
  'failed'
])
const ODESIGN_APPROVAL_GUIDANCE = 'APPROVE_IN_ODDESIGN'
const ODESIGN_APPROVAL_SAFE_CODE = 'APPROVAL_REQUIRED_IN_ODDESIGN'
const ODESIGN_APPROVAL_GUIDANCE_TEXT =
  '승인 대기 — Odesign에서 승인을 완료해야 작업이 계속됩니다.'

function parseJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${path}: ${error.message}`, {
      cause: error
    })
  }
}

function compareVersions(left, right) {
  return right.localeCompare(left, undefined, { numeric: true })
}

function findInstalledPackage(packageName, minimumMajor = 0) {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`, {
      paths: [repoRoot]
    })
    const metadata = parseJson(packageJsonPath)
    const major = Number.parseInt(metadata.version.split('.')[0], 10)
    if (major >= minimumMajor) return dirname(packageJsonPath)
  } catch {
    // The dependency may only be reachable through pnpm's existing store.
  }

  const pnpmDirectory = join(repoRoot, 'node_modules/.pnpm')
  const candidates = []

  for (const entry of readdirSync(pnpmDirectory)) {
    const packageJsonPath = join(
      pnpmDirectory,
      entry,
      'node_modules',
      packageName,
      'package.json'
    )

    try {
      const metadata = parseJson(packageJsonPath)
      const major = Number.parseInt(metadata.version.split('.')[0], 10)
      if (metadata.name === packageName && major >= minimumMajor) {
        candidates.push({
          directory: dirname(packageJsonPath),
          version: metadata.version
        })
      }
    } catch {
      // This pnpm entry does not contain the requested package.
    }
  }

  candidates.sort((left, right) =>
    compareVersions(left.version, right.version)
  )
  if (candidates.length === 0) {
    throw new Error(
      `Required existing package ${packageName} is unavailable; no install was attempted.`
    )
  }
  return candidates[0].directory
}

function createAjv() {
  const ajvDirectory = findInstalledPackage('ajv', 8)
  const formatsDirectory = findInstalledPackage('ajv-formats', 3)
  const AjvModule = require(join(ajvDirectory, 'dist/2020.js'))
  const formatsModule = require(formatsDirectory)
  const Ajv2020 = AjvModule.default ?? AjvModule
  const addFormats = formatsModule.default ?? formatsModule
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: false,
    strict: true,
    validateFormats: true
  })
  addFormats(ajv)
  return ajv
}

export function loadExternalLifecycleContract() {
  const fixture = parseJson(fixturePath)
  const schemaNames = readdirSync(schemaDirectory)
    .filter((name) => /^external-job-.*\.v1\.schema\.json$/.test(name))
    .sort()
  const schemas = new Map(
    schemaNames.map((name) => [name, parseJson(join(schemaDirectory, name))])
  )
  return { fixture, schemas }
}

export function collectFixtureIds(fixture) {
  const ids = []
  for (const collection of fixtureCollections) {
    assert.ok(Array.isArray(fixture[collection]), `${collection} must be an array`)
    for (const fixtureCase of fixture[collection]) {
      assert.equal(
        typeof fixtureCase.id,
        'string',
        `${collection} contains a case without a string id`
      )
      assert.ok(fixtureCase.id.length > 0, `${collection} contains an empty id`)
      ids.push(fixtureCase.id)
    }
  }
  assert.equal(
    new Set(ids).size,
    ids.length,
    'External lifecycle fixture case ids must be globally unique'
  )
  return ids
}

export function compileSchemas(schemas) {
  assert.deepEqual(
    [...schemas.keys()].sort(),
    [...expectedSchemaNames],
    'External lifecycle schema set changed without updating the evaluator'
  )

  const ajv = createAjv()
  for (const schema of schemas.values()) ajv.addSchema(schema)

  const validators = new Map()
  for (const [name, schema] of schemas) {
    const validate = ajv.getSchema(schema.$id)
    assert.ok(validate, `${name} did not compile`)
    validators.set(name, validate)
  }
  return validators
}

function formatValidationErrors(validate) {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message}`)
    .join('; ')
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function applyMutation(document, mutation) {
  assert.equal(mutation.op, 'set', 'Only deterministic set mutations are allowed')
  assert.ok(Array.isArray(mutation.path) && mutation.path.length > 0)
  let target = document
  for (const segment of mutation.path.slice(0, -1)) {
    assert.ok(
      target && typeof target === 'object' && segment in target,
      `Mutation path does not exist: ${mutation.path.join('.')}`
    )
    target = target[segment]
  }
  target[mutation.path.at(-1)] = cloneJson(mutation.value)
}

export function materializeSchemaCase(fixture, fixtureCase) {
  const source = fixture.schema_documents[fixtureCase.document]
  assert.ok(source, `${fixtureCase.id} references an unknown document`)
  const document = cloneJson(source)
  for (const mutation of fixtureCase.mutations ?? []) {
    applyMutation(document, mutation)
  }
  return document
}

export function validateSchemaCases(fixture, validators) {
  let positiveCount = 0
  let negativeCount = 0

  for (const fixtureCase of fixture.schema_cases) {
    const validate = validators.get(fixtureCase.schema)
    assert.ok(validate, `${fixtureCase.id} references an unknown schema`)
    assert.equal(typeof fixtureCase.valid, 'boolean')
    const document = materializeSchemaCase(fixture, fixtureCase)
    const actual = validate(document)
    assert.equal(
      actual,
      fixtureCase.valid,
      `${fixtureCase.id} validation mismatch: ${formatValidationErrors(validate)}`
    )
    if (actual) positiveCount += 1
    else negativeCount += 1
  }

  return {
    caseCount: fixture.schema_cases.length,
    negativeCount,
    positiveCount
  }
}

function schemaValidateOrThrow(document, schemaName, validators, label) {
  const validate = validators.get(schemaName)
  assert.ok(validate(document), `${label}: ${formatValidationErrors(validate)}`)
}

function materializeDocument(source, mutations = []) {
  const document = cloneJson(source)
  for (const mutation of mutations) applyMutation(document, mutation)
  return document
}

function documentsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function evaluateDocumentInvariantCase(
  fixtureCase,
  fixture,
  validators
) {
  if (fixtureCase.kind === 'cancel_pair') {
    const request = materializeDocument(
      fixture.schema_documents[fixtureCase.request_document],
      fixtureCase.request_mutations
    )
    const response = materializeDocument(
      fixture.schema_documents[fixtureCase.response_document],
      fixtureCase.response_mutations
    )
    schemaValidateOrThrow(
      request,
      'external-job-cancel-request.v1.schema.json',
      validators,
      fixtureCase.id
    )
    schemaValidateOrThrow(
      response,
      'external-job-cancel-response.v1.schema.json',
      validators,
      fixtureCase.id
    )
    if (
      parseTimestamp(
        request.requested_at,
        `${fixtureCase.id}.requested_at`
      ) <
      parseTimestamp(
        request.external_job_locator.submitted_at,
        `${fixtureCase.id}.submitted_at`
      )
    ) {
      return { valid: false, reason: 'cancel_request_before_submission' }
    }
    if (
      !documentsEqual(
        request.external_job_locator,
        fixture.schema_documents.acceptance.external_job_locator
      )
    ) {
      return {
        valid: false,
        reason: 'cancel_locator_not_authoritative'
      }
    }
    if (request.request_id !== response.request_id) {
      return { valid: false, reason: 'cancel_request_id_mismatch' }
    }
    if (
      !documentsEqual(
        request.external_job_locator,
        response.external_job_locator
      )
    ) {
      return { valid: false, reason: 'cancel_locator_mismatch' }
    }
    if (
      parseTimestamp(response.observed_at, `${fixtureCase.id}.observed_at`) <
      parseTimestamp(request.requested_at, `${fixtureCase.id}.requested_at`)
    ) {
      return { valid: false, reason: 'cancel_response_before_request' }
    }
    return { valid: true, reason: null }
  }

  const document = materializeDocument(
    fixture.schema_documents[fixtureCase.document],
    fixtureCase.mutations
  )
  const schemaName = `external-job-${fixtureCase.kind}.v1.schema.json`
  schemaValidateOrThrow(document, schemaName, validators, fixtureCase.id)

  if (fixtureCase.kind === 'envelope') {
    const sentAt = parseTimestamp(document.sent_at, `${fixtureCase.id}.sent_at`)
    const deadlineAt = parseTimestamp(
      document.deadline_at,
      `${fixtureCase.id}.deadline_at`
    )
    if (deadlineAt <= sentAt) {
      return { valid: false, reason: 'deadline_not_after_sent' }
    }
    if (deadlineAt > sentAt + 2 * 60 * 60 * 1000) {
      return { valid: false, reason: 'deadline_exceeds_two_hour_ceiling' }
    }
  } else if (fixtureCase.kind === 'acceptance') {
    const acceptedAt = parseTimestamp(
      document.accepted_at,
      `${fixtureCase.id}.accepted_at`
    )
    if (
      acceptedAt <
      parseTimestamp(
        document.external_job_locator.submitted_at,
        `${fixtureCase.id}.submitted_at`
      )
    ) {
      return { valid: false, reason: 'acceptance_before_submission' }
    }
    const envelope = fixture.schema_documents.envelope
    if (document.external_job_locator.request_id !== envelope.request_id) {
      return { valid: false, reason: 'acceptance_request_id_mismatch' }
    }
    if (document.external_job_locator.operation !== envelope.operation) {
      return { valid: false, reason: 'acceptance_operation_mismatch' }
    }
    if (
      acceptedAt >
      parseTimestamp(
        envelope.deadline_at,
        `${fixtureCase.id}.deadline_at`
      )
    ) {
      return { valid: false, reason: 'acceptance_after_deadline' }
    }
  } else if (fixtureCase.kind === 'status') {
    const observedAt = parseTimestamp(
      document.observed_at,
      `${fixtureCase.id}.observed_at`
    )
    if (
      observedAt <
      parseTimestamp(
        document.external_job_locator.submitted_at,
        `${fixtureCase.id}.submitted_at`
      )
    ) {
      return { valid: false, reason: 'status_before_submission' }
    }
    if (
      !documentsEqual(
        document.external_job_locator,
        fixture.schema_documents.acceptance.external_job_locator
      )
    ) {
      return { valid: false, reason: 'status_locator_mismatch' }
    }
    if (document.progress && document.progress.value > document.progress.max) {
      return { valid: false, reason: 'progress_value_exceeds_max' }
    }
    if (
      document.status === 'succeeded' &&
      document.progress &&
      document.progress.value !== document.progress.max
    ) {
      return { valid: false, reason: 'succeeded_progress_incomplete' }
    }

    const itemIds = document.item_outcomes.map((item) => item.item_id)
    if (new Set(itemIds).size !== itemIds.length) {
      return { valid: false, reason: 'duplicate_item_id' }
    }
    const handleIds = document.artifact_handles.map(
      (handle) => handle.handle_id
    )
    if (new Set(handleIds).size !== handleIds.length) {
      return { valid: false, reason: 'duplicate_artifact_handle_id' }
    }
    const handleIdSet = new Set(handleIds)
    for (const handle of document.artifact_handles) {
      if (
        parseTimestamp(
          handle.expires_at,
          `${fixtureCase.id}.${handle.handle_id}.expires_at`
        ) <= observedAt
      ) {
        return { valid: false, reason: 'expired_artifact_handle' }
      }
    }
    for (const item of document.item_outcomes) {
      for (const handleId of item.artifact_handle_ids) {
        if (!handleIdSet.has(handleId)) {
          return { valid: false, reason: 'dangling_artifact_handle_id' }
        }
      }
    }
    for (const error of document.errors) {
      if (
        error.external_job_locator !== null &&
        !documentsEqual(
          error.external_job_locator,
          document.external_job_locator
        )
      ) {
        return { valid: false, reason: 'error_locator_mismatch' }
      }
    }
  } else {
    assert.fail(`${fixtureCase.id} has unknown document invariant kind`)
  }

  return { valid: true, reason: null }
}

export function validateDocumentInvariantCases(cases, fixture, validators) {
  let rejectedCount = 0
  for (const fixtureCase of cases) {
    const actual = evaluateDocumentInvariantCase(
      fixtureCase,
      fixture,
      validators
    )
    assert.deepEqual(actual, {
      valid: fixtureCase.valid,
      reason: fixtureCase.reason
    }, fixtureCase.id)
    if (!actual.valid) rejectedCount += 1
  }
  return { caseCount: cases.length, rejectedCount }
}

function encodeLengthPrefixed(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(value, 'utf8')
  return Buffer.concat([Buffer.from(`${bytes.length}:`, 'ascii'), bytes])
}

export function deriveIdempotencyVector(policy, keyVersion) {
  const keyHex = policy.fixture_hmac_keys_hex[keyVersion]
  assert.match(keyVersion, /^[A-Za-z0-9_-]{1,32}$/)
  assert.match(keyHex, /^(?:[a-f0-9]{2}){32,}$/)

  const chunks = [Buffer.from(policy.domain_separator, 'ascii'), Buffer.from([0])]
  for (const field of policy.scope_order) {
    assert.equal(typeof policy.scope[field], 'string', `Missing scope field ${field}`)
    chunks.push(encodeLengthPrefixed(field))
    chunks.push(encodeLengthPrefixed(policy.scope[field]))
  }

  const digest = createHmac('sha256', Buffer.from(keyHex, 'hex'))
    .update(Buffer.concat(chunks))
    .digest('base64url')
  const idempotencyKey = `oj1.${keyVersion}.${digest}`
  const idempotencyKeyHash = `sha256:${createHash('sha256')
    .update(idempotencyKey, 'ascii')
    .digest('hex')}`

  return { idempotencyKey, idempotencyKeyHash }
}

export function validateIdempotencyVectors(policy) {
  for (const [keyVersion, expected] of Object.entries(policy.expected_vectors)) {
    const actual = deriveIdempotencyVector(policy, keyVersion)
    assert.deepEqual(
      actual,
      {
        idempotencyKey: expected.idempotency_key,
        idempotencyKeyHash: expected.idempotency_key_hash
      },
      keyVersion
    )
  }
  return { vectorCount: Object.keys(policy.expected_vectors).length }
}

function constantTimeEqual(left, right) {
  const leftBytes = Buffer.from(left, 'ascii')
  const rightBytes = Buffer.from(right, 'ascii')
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  )
}

function constantTimeHexDigestEqual(left, right) {
  assert.match(left, /^[0-9a-f]{64}$/)
  assert.match(right, /^[0-9a-f]{64}$/)
  return timingSafeEqual(
    Buffer.from(left, 'hex'),
    Buffer.from(right, 'hex')
  )
}

export function evaluateRecoveryCase(fixtureCase, policy) {
  const crashStates = {
    before_prepared_commit: {
      journalCommitted: false,
      networkAttempted: false,
      providerCommitted: false,
      locatorCommitted: false
    },
    after_prepared_before_connect: {
      journalCommitted: true,
      networkAttempted: false,
      providerCommitted: false,
      locatorCommitted: false
    },
    during_submit_before_provider_commit: {
      journalCommitted: true,
      networkAttempted: true,
      providerCommitted: false,
      locatorCommitted: false
    },
    after_provider_commit_before_response: {
      journalCommitted: true,
      networkAttempted: true,
      providerCommitted: true,
      locatorCommitted: false
    },
    after_response_before_locator_commit: {
      journalCommitted: true,
      networkAttempted: true,
      providerCommitted: true,
      locatorCommitted: false
    },
    after_locator_commit: {
      journalCommitted: true,
      networkAttempted: true,
      providerCommitted: true,
      locatorCommitted: true
    }
  }
  const crashState = crashStates[fixtureCase.crash_point]
  assert.ok(crashState, `${fixtureCase.id} has an unknown crash point`)
  const executionEvidence = fixtureCase.execution_evidence ?? {}
  const invocationTokenHash =
    typeof executionEvidence.invocation_token === 'string'
      ? `sha256:${createHash('sha256')
          .update(executionEvidence.invocation_token, 'utf8')
          .digest('hex')}`
      : null
  const activeAuthority =
    executionEvidence.state === 'executing' &&
    executionEvidence.prompt_id === policy.scope.prompt_id &&
    executionEvidence.node_id === policy.scope.node_id &&
    typeof executionEvidence.invocation_token === 'string' &&
    executionEvidence.invocation_token.length >= 16 &&
    typeof fixtureCase.journal_invocation_token_hash === 'string' &&
    constantTimeEqual(
      invocationTokenHash,
      fixtureCase.journal_invocation_token_hash
    )
  const anyActiveEvidence = Object.keys(executionEvidence).length > 0

  const actual = {
    journal_committed: crashState.journalCommitted,
    locator_committed: crashState.locatorCommitted,
    network_before_journal_commit:
      crashState.networkAttempted && !crashState.journalCommitted,
    lookup_before_retry: false,
    authoritative_status_by_locator: false,
    same_key_rederived: false,
    active_version_ignored:
      fixtureCase.recorded_key_version !== null &&
      fixtureCase.recorded_key_version !==
        fixtureCase.active_key_version_after_restart,
    new_key_minted: false,
    submission_retry_allowed: false,
    retry_performed: false,
    provider_job_count: crashState.providerCommitted ? 1 : 0,
    publication_allowed: false,
    quarantine_required:
      crashState.journalCommitted && !activeAuthority,
    safe_code: null,
    safe_warning: null
  }

  if (!crashState.journalCommitted) {
    assert.equal(fixtureCase.recorded_key_version, null)
    return actual
  }

  const journalEntry = {
    ...policy.scope,
    journal_format_version: 'external-dispatch-journal.v1',
    workflow_locator: {
      prompt_id: policy.scope.prompt_id,
      node_id: policy.scope.node_id
    },
    phase: crashState.locatorCommitted ? 'accepted' : 'prepared',
    key_secret_version: fixtureCase.recorded_key_version,
    idempotency_key_hash:
      fixtureCase.stored_key_hash_override ??
      policy.expected_vectors[fixtureCase.recorded_key_version]
        ?.idempotency_key_hash,
    deadline_at: '2026-08-27T11:00:00Z'
  }
  if (crashState.locatorCommitted) {
    journalEntry.external_job_locator = {
      schema_version: 'omarketing.external-job-locator.v1',
      adapter_id: policy.scope.adapter_id,
      environment: policy.scope.environment,
      operation: policy.scope.operation,
      job_id: 'job_0001',
      request_id: policy.scope.prompt_id,
      submitted_at: '2026-08-27T09:00:00Z'
    }
  }
  for (const field of fixtureCase.missing_journal_fields ?? []) {
    delete journalEntry[field]
  }
  const requiredJournalFields = [
    ...policy.scope_order,
    'journal_format_version',
    'workflow_locator',
    'phase',
    'key_secret_version',
    'idempotency_key_hash',
    'deadline_at'
  ]
  if (journalEntry.phase === 'accepted') {
    requiredJournalFields.push('external_job_locator')
  }
  const journalComplete = requiredJournalFields.every(
    (field) =>
      Object.hasOwn(journalEntry, field) &&
      journalEntry[field] !== null &&
      journalEntry[field] !== undefined
  )
  if (!journalComplete) {
    actual.safe_code = 'IDEMPOTENCY_JOURNAL_INVALID'
    actual.quarantine_required = true
    return actual
  }
  if (anyActiveEvidence && !activeAuthority) {
    actual.safe_code = 'IDEMPOTENCY_JOURNAL_INVALID'
    actual.quarantine_required = true
    return actual
  }

  if (crashState.locatorCommitted) {
    assert.equal(fixtureCase.lookup_result, 'not_required')
  }

  const recordedVersion = fixtureCase.recorded_key_version
  const locator = journalEntry.external_job_locator
  const journalFormatValid =
    journalEntry.journal_format_version ===
      'external-dispatch-journal.v1' &&
    /^k[0-9]{4}[a-z]$/.test(recordedVersion) &&
    policy.expected_vectors[recordedVersion] !== undefined &&
    /^sha256:[0-9a-f]{64}$/.test(
      journalEntry.canonical_payload_digest
    ) &&
    /^sha256:[0-9a-f]{64}$/.test(
      journalEntry.idempotency_key_hash
    ) &&
    isCanonicalUtcTimestamp(journalEntry.deadline_at) &&
    ['prepared', 'accepted'].includes(journalEntry.phase) &&
    documentsEqual(journalEntry.workflow_locator, {
      prompt_id: policy.scope.prompt_id,
      node_id: policy.scope.node_id
    }) &&
    (journalEntry.phase !== 'accepted' ||
      (locator !== undefined &&
        documentsEqual(Object.keys(locator).sort(), [
          'adapter_id',
          'environment',
          'job_id',
          'operation',
          'request_id',
          'schema_version',
          'submitted_at'
        ]) &&
        locator.schema_version ===
          'omarketing.external-job-locator.v1' &&
        locator.adapter_id === policy.scope.adapter_id &&
        locator.environment === policy.scope.environment &&
        locator.operation === policy.scope.operation &&
        /^job_[A-Za-z0-9_-]+$/.test(locator.job_id) &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          locator.request_id
        ) &&
        isCanonicalUtcTimestamp(locator.submitted_at)))
  if (!journalFormatValid) {
    actual.safe_code = 'IDEMPOTENCY_JOURNAL_INVALID'
    actual.quarantine_required = true
    return actual
  }
  if (!fixtureCase.available_key_versions.includes(recordedVersion)) {
    if (crashState.locatorCommitted) {
      actual.authoritative_status_by_locator = true
    }
    actual.safe_code = 'IDEMPOTENCY_KEY_UNRECOVERABLE'
    actual.safe_warning = 'cancel_requested_but_external_job_may_continue'
    actual.quarantine_required = true
    return actual
  }

  const vector = deriveIdempotencyVector(policy, recordedVersion)
  const storedHash = journalEntry.idempotency_key_hash
  if (!constantTimeEqual(vector.idempotencyKeyHash, storedHash)) {
    actual.safe_code = 'IDEMPOTENCY_JOURNAL_INTEGRITY_FAILURE'
    actual.quarantine_required = true
    return actual
  }

  assert.equal(
    vector.idempotencyKey,
    policy.expected_vectors[recordedVersion].idempotency_key
  )
  actual.same_key_rederived = true

  if (crashState.locatorCommitted) {
    actual.authoritative_status_by_locator = true
    if (activeAuthority) {
      actual.publication_allowed = true
      actual.quarantine_required = false
    }
    return actual
  }

  actual.lookup_before_retry = true
  if (fixtureCase.lookup_result === 'existing') {
    assert.equal(crashState.providerCommitted, true)
    if (activeAuthority) {
      actual.publication_allowed = true
      actual.quarantine_required = false
    }
  } else if (fixtureCase.lookup_result === 'not_found') {
    assert.equal(crashState.providerCommitted, false)
    if (activeAuthority) {
      actual.submission_retry_allowed = true
      actual.retry_performed = true
      actual.provider_job_count += 1
      actual.publication_allowed = true
      actual.quarantine_required = false
    }
  } else {
    assert.fail(`${fixtureCase.id} has invalid lookup result`)
  }
  return actual
}

export function validateRecoveryCases(cases, policy) {
  for (const fixtureCase of cases) {
    const actual = evaluateRecoveryCase(fixtureCase, policy)
    assert.deepEqual(actual, fixtureCase.expected, fixtureCase.id)
  }
  return { caseCount: cases.length }
}

function isGlobalIpv4(address) {
  const parts = address.split('.').map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0 && c === 0) return false
  if (a === 192 && b === 0 && c === 2) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

export function isGlobalIpAddress(address) {
  const normalized = address.toLowerCase()
  const version = isIP(normalized)
  if (version === 4) return isGlobalIpv4(normalized)
  if (version !== 6 || normalized.includes('%')) return false

  const bytes = parseIpv6Bytes(normalized)
  if (!bytes) return false

  // Only global-unicast 2000::/3 is eligible. This rejects unspecified,
  // loopback, IPv4-compatible/mapped, NAT64, ULA, link/site-local, multicast,
  // and other reserved spaces before the deployment allowlist is considered.
  if ((bytes[0] & 0xe0) !== 0x20) return false
  if (hasIpv6Prefix(bytes, [0x20, 0x01, 0x00], 23)) return false
  if (hasIpv6Prefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)) return false
  if (hasIpv6Prefix(bytes, [0x20, 0x02], 16)) return false
  if (hasIpv6Prefix(bytes, [0x3f, 0xfe], 16)) return false
  if (hasIpv6Prefix(bytes, [0x3f, 0xff, 0x00], 20)) return false
  return true
}

function parseIpv6Bytes(address) {
  let normalized = address
  const ipv4Tail = normalized.match(/(?:^|:)([0-9]+(?:\.[0-9]+){3})$/)
  if (ipv4Tail) {
    const parts = ipv4Tail[1].split('.').map(Number)
    if (
      parts.some(
        (part) => !Number.isInteger(part) || part < 0 || part > 255
      )
    ) {
      return null
    }
    const replacement = `${((parts[0] << 8) | parts[1]).toString(16)}:${(
      (parts[2] << 8) |
      parts[3]
    ).toString(16)}`
    normalized = normalized.slice(
      0,
      normalized.length - ipv4Tail[1].length
    ) + replacement
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  if (halves.length === 1 && left.length !== 8) return null
  if (halves.length === 2 && left.length + right.length >= 8) return null
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0
  const segments = [...left, ...Array(missing).fill('0'), ...right]
  if (
    segments.length !== 8 ||
    segments.some((segment) => !/^[a-f0-9]{1,4}$/.test(segment))
  ) {
    return null
  }
  const bytes = []
  for (const segment of segments) {
    const value = Number.parseInt(segment, 16)
    bytes.push(value >> 8, value & 0xff)
  }
  return bytes
}

function hasIpv6Prefix(address, prefix, bitLength) {
  const fullBytes = Math.floor(bitLength / 8)
  for (let index = 0; index < fullBytes; index += 1) {
    if (address[index] !== prefix[index]) return false
  }
  const remainingBits = bitLength % 8
  if (remainingBits === 0) return true
  const mask = (0xff << (8 - remainingBits)) & 0xff
  return (address[fullBytes] & mask) === (prefix[fullBytes] & mask)
}

function effectivePort(url) {
  if (url.port) return Number.parseInt(url.port, 10)
  if (url.protocol === 'https:') return 443
  if (url.protocol === 'http:') return 80
  return -1
}

function isApprovedCname(target, profile) {
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(target)) {
    return false
  }
  return profile.allowed_cname_suffixes.some(
    (suffix) => target === suffix || target.endsWith(`.${suffix}`)
  )
}

export function evaluateNetworkCase(fixtureCase, profiles) {
  const profile = profiles[fixtureCase.profile]
  assert.ok(profile, `${fixtureCase.id} references an unknown profile`)
  assert.equal(profile.redirect_policy, 'deny')
  assert.equal(profile.proxy_environment_policy, 'ignore')

  const actual = {
    allowed: false,
    reason: undefined,
    socket_connects: 0,
    failed_connect_attempt: undefined,
    redirects_followed: 0,
    proxy_environment_used: false,
    proxy_attack_effect: false,
    credentials_forwarded: false,
    credentials_forwarded_to_redirect: false,
    credentials_forwarded_on_failed_attempt: false
  }

  let candidate
  try {
    candidate = new URL(fixtureCase.url)
  } catch {
    actual.reason = 'invalid_url'
    return actual
  }

  if (candidate.username || candidate.password || candidate.hash) {
    actual.reason = 'userinfo_or_fragment'
    return actual
  }
  if (
    candidate.protocol !== `${profile.scheme}:` ||
    candidate.hostname !== profile.ascii_host ||
    effectivePort(candidate) !== profile.effective_port
  ) {
    actual.reason = 'origin_mismatch'
    return actual
  }

  const expectedPath = profile.path_template.replace(
    '{opaque_id}',
    encodeURIComponent(fixtureCase.opaque_id)
  )
  if (
    candidate.pathname !== expectedPath ||
    candidate.search !== '' ||
    /%2f|%5c/i.test(candidate.pathname)
  ) {
    actual.reason = 'path_mismatch'
    return actual
  }

  for (const cname of fixtureCase.cname_chain) {
    if (!isApprovedCname(cname.toLowerCase(), profile)) {
      actual.reason = 'unapproved_cname'
      return actual
    }
  }

  const approvedAddresses = new Set(
    profile.approved_ip_addresses.map((address) => address.toLowerCase())
  )
  for (const address of approvedAddresses) {
    assert.equal(
      isGlobalIpAddress(address),
      true,
      `${fixtureCase.profile} contains a non-global approved IP`
    )
  }
  assert.equal(fixtureCase.dns_rounds.length, fixtureCase.connect_attempts)
  for (let index = 0; index < fixtureCase.connect_attempts; index += 1) {
    const answers = fixtureCase.dns_rounds[index]
    assert.ok(answers.length > 0, `${fixtureCase.id} has an empty DNS answer`)
    for (const address of answers) {
      if (!isGlobalIpAddress(address)) {
        actual.reason = 'non_global_ip'
        actual.failed_connect_attempt = index + 1
        return actual
      }
      if (!approvedAddresses.has(address.toLowerCase())) {
        actual.reason = 'unapproved_ip'
        actual.failed_connect_attempt = index + 1
        return actual
      }
    }
    actual.socket_connects += 1
  }

  if (!fixtureCase.tls_hostname_verified) {
    actual.reason = 'tls_hostname_mismatch'
    return actual
  }

  actual.credentials_forwarded = true
  if (fixtureCase.redirect_locations.length > 0) {
    actual.reason = 'redirects_disabled'
    return actual
  }

  actual.allowed = true
  return actual
}

export function validateNetworkCases(cases, profiles) {
  let blockedCount = 0
  for (const fixtureCase of cases) {
    const actual = evaluateNetworkCase(fixtureCase, profiles)
    const expected = {
      allowed: false,
      reason: null,
      socket_connects: 0,
      failed_connect_attempt: null,
      redirects_followed: 0,
      proxy_environment_used: false,
      proxy_attack_effect: false,
      credentials_forwarded: false,
      credentials_forwarded_to_redirect: false,
      credentials_forwarded_on_failed_attempt: false,
      ...fixtureCase.expected
    }
    assert.deepEqual(
      {
        ...actual,
        reason: actual.reason ?? null,
        failed_connect_attempt:
          actual.failed_connect_attempt ?? null
      },
      expected,
      fixtureCase.id
    )
    if (!actual.allowed) blockedCount += 1
  }
  return { blockedCount, caseCount: cases.length }
}

function materializeArtifactWireChunk(chunk, label) {
  if (typeof chunk.base64 === 'string') {
    const bytes = Buffer.from(chunk.base64, 'base64')
    assert.equal(bytes.toString('base64'), chunk.base64, label)
    return bytes
  }
  assert.ok(
    Number.isInteger(chunk.repeat_byte) &&
      chunk.repeat_byte >= 0 &&
      chunk.repeat_byte <= 255,
    label
  )
  assert.ok(
    Number.isSafeInteger(chunk.count) && chunk.count >= 0,
    label
  )
  return Buffer.alloc(chunk.count, chunk.repeat_byte)
}

function evaluateArtifactReadback(fixtureCase, fixture) {
  const observation =
    fixture.artifact_readback_observations[
      fixtureCase.readback_observation
    ]
  assert.ok(
    observation,
    `${fixtureCase.id} references an unknown read-back observation`
  )
  const network = evaluateNetworkCase(
    observation.network_request,
    fixture.network_profiles
  )
  const resolverRecord =
    fixture.artifact_resolver_records[
      fixtureCase.resolver.handle_id
    ]
  assert.ok(resolverRecord, fixtureCase.resolver.handle_id)
  const authenticated =
    network.allowed &&
    network.credentials_forwarded &&
    observation.network_request.profile === 'status' &&
    observation.network_request.opaque_id ===
      fixture.artifact_policy.job_id &&
    observation.service_principal_id ===
      fixture.artifact_policy.service_principal_id &&
    observation.job_id === fixture.artifact_policy.job_id &&
    documentsEqual(
      observation.external_job_locator,
      fixture.schema_documents.acceptance.external_job_locator
    ) &&
    observation.external_job_locator.job_id ===
      resolverRecord.resolved_job_id &&
    observation.artifact_handle_id ===
      fixtureCase.resolver.handle_id
  return {
    authenticated,
    reportedSha256: observation.reported_sha256
  }
}

export function evaluateArtifactCase(
  fixtureCase,
  fixture,
  lifecycleContext = null
) {
  const policy = fixture.artifact_policy
  const resolverRecord =
    fixture.artifact_resolver_records[
      fixtureCase.resolver.handle_id
    ]
  const actual = {
    accepted: false,
    reason: null,
    stream_accepted: false,
    artifact_validated: false,
    publication_allowed: false,
    socket_connects: 0,
    redirects_followed: 0,
    compressed_bytes_accepted: 0,
    uncompressed_bytes_accepted: 0,
    computed_sha256: null,
    partial_bytes_published: false
  }

  if (
    !resolverRecord ||
    !/^ah1_[A-Za-z0-9_-]{22,128}$/.test(
      fixtureCase.resolver.handle_id
    ) ||
    resolverRecord.resolved_owner_user_id !==
      policy.owner_user_id ||
    resolverRecord.resolved_project_key !== policy.project_key ||
    resolverRecord.resolved_job_id !== policy.job_id ||
    resolverRecord.resolved_adapter_id !== policy.adapter_id ||
    resolverRecord.resolved_environment !== policy.environment ||
    resolverRecord.resolved_service_principal_id !==
      policy.service_principal_id ||
    resolverRecord.resolved_operation_profile !==
      policy.operation_profile ||
    resolverRecord.resolved_network_profile !==
      policy.network_profile ||
    resolverRecord.resolved_network_profile !==
      fixtureCase.profile ||
    resolverRecord.provider_artifact_id !==
      fixtureCase.opaque_id ||
    parseTimestamp(
      resolverRecord.expires_at,
      `${fixtureCase.id}.resolver.expires_at`
    ) <=
      parseTimestamp(
        fixtureCase.resolver.resolved_at,
        `${fixtureCase.id}.resolver.resolved_at`
      )
  ) {
    actual.reason = 'handle_resolution_failed'
    return actual
  }

  const network = evaluateNetworkCase(fixtureCase, fixture.network_profiles)
  actual.socket_connects = network.socket_connects
  actual.redirects_followed = network.redirects_followed
  if (!network.allowed) {
    actual.reason = network.reason
    return actual
  }

  if (
    fixtureCase.content_length !== null &&
    fixtureCase.content_length > policy.compressed_byte_limit
  ) {
    actual.reason = 'compressed_limit_exceeded'
    return actual
  }
  if (
    !['identity', 'gzip'].includes(fixtureCase.content_encoding) ||
    fixtureCase.nested_encoding
  ) {
    actual.reason = 'content_encoding_rejected'
    return actual
  }

  const checksum = createHash('sha256')
  let textMimeCandidate = true
  const payload = fixture.artifact_payloads[fixtureCase.payload]
  assert.ok(payload, `${fixtureCase.id} references an unknown payload`)
  for (const [index, chunk] of payload.chunks.entries()) {
    const wireBytes = materializeArtifactWireChunk(
      chunk,
      `${fixtureCase.id}.chunks[${index}]`
    )

    const nextCompressed =
      actual.compressed_bytes_accepted + wireBytes.length
    if (nextCompressed > policy.compressed_byte_limit) {
      actual.reason = 'compressed_limit_exceeded'
      return actual
    }
    actual.compressed_bytes_accepted = nextCompressed

    let outputBytes
    try {
      outputBytes =
        fixtureCase.content_encoding === 'gzip'
          ? gunzipSync(wireBytes, {
              maxOutputLength: policy.uncompressed_byte_limit + 1
            })
          : wireBytes
    } catch {
      actual.reason = 'decompressor_error'
      return actual
    }

    const nextUncompressed =
      actual.uncompressed_bytes_accepted + outputBytes.length
    if (nextUncompressed > policy.uncompressed_byte_limit) {
      actual.reason = 'uncompressed_limit_exceeded'
      return actual
    }
    if (
      nextUncompressed >
      actual.compressed_bytes_accepted * policy.decompression_ratio_limit
    ) {
      actual.reason = 'decompression_ratio_exceeded'
      return actual
    }
    actual.uncompressed_bytes_accepted = nextUncompressed
    checksum.update(outputBytes)
    for (const byte of outputBytes) {
      if (
        byte !== 9 &&
        byte !== 10 &&
        byte !== 13 &&
        (byte < 32 || byte > 126)
      ) {
        textMimeCandidate = false
      }
    }
  }

  if (
    fixtureCase.content_length !== null &&
    fixtureCase.content_length !== actual.compressed_bytes_accepted
  ) {
    actual.reason = 'content_length_mismatch'
    return actual
  }
  actual.computed_sha256 = checksum.digest('hex')
  if (!fixtureCase.stream_complete) {
    actual.reason = 'truncated_stream'
    return actual
  }
  actual.stream_accepted = true

  if (
    actual.uncompressed_bytes_accepted !==
    resolverRecord.expected_size_bytes
  ) {
    actual.reason = 'artifact_size_mismatch'
    return actual
  }
  const detectedMime =
    actual.uncompressed_bytes_accepted > 0 && textMimeCandidate
      ? 'text/plain'
      : 'application/octet-stream'
  if (!resolverRecord.allowed_mime_types.includes(detectedMime)) {
    actual.reason = 'artifact_mime_rejected'
    return actual
  }
  if (actual.computed_sha256 !== resolverRecord.expected_sha256) {
    actual.reason = 'artifact_checksum_mismatch'
    return actual
  }
  const readback = evaluateArtifactReadback(fixtureCase, fixture)
  if (!readback.authenticated) {
    actual.reason = 'artifact_readback_authentication_failed'
    return actual
  }
  if (readback.reportedSha256 !== actual.computed_sha256) {
    actual.reason = 'artifact_readback_mismatch'
    return actual
  }
  actual.artifact_validated = true

  for (const event of fixtureCase.publication_state_events) {
    assert.ok(
      [
        'deadline_expired',
        'comfy_interrupt',
        'orphaned_invocation',
        'provider_failed',
        'provider_canceled'
      ].includes(event),
      `${fixtureCase.id} has an unknown publication transition`
    )
  }
  const publicationAllowed =
    fixtureCase.publication_state_events.length === 0 &&
    (lifecycleContext === null ||
      lifecycleContext.publication_allowed === true)
  if (!publicationAllowed) {
    actual.reason = 'publication_closed'
    return actual
  }

  actual.accepted = true
  actual.publication_allowed = true
  return actual
}

export function validateArtifactCases(cases, fixture) {
  let rejectedCount = 0
  for (const fixtureCase of cases) {
    const actual = evaluateArtifactCase(fixtureCase, fixture)
    assert.deepEqual(actual, fixtureCase.expected, fixtureCase.id)
    if (!actual.accepted) rejectedCount += 1
  }
  return { caseCount: cases.length, rejectedCount }
}

function isCanonicalUtcTimestamp(value) {
  if (typeof value !== 'string') return false
  const match = value.match(
    /^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])(?:\.[0-9]{1,6})?Z$/
  )
  if (!match) return false
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) return false
  const parsed = new Date(milliseconds)
  return (
    parsed.getUTCFullYear() === Number(match[1]) &&
    parsed.getUTCMonth() + 1 === Number(match[2]) &&
    parsed.getUTCDate() === Number(match[3]) &&
    parsed.getUTCHours() === Number(match[4]) &&
    parsed.getUTCMinutes() === Number(match[5]) &&
    parsed.getUTCSeconds() === Number(match[6])
  )
}

function parseTimestamp(value, label) {
  assert.ok(
    isCanonicalUtcTimestamp(value),
    `${label} must be canonical UTC`
  )
  const milliseconds = Date.parse(value)
  return milliseconds
}

function receiptFailure(reason) {
  return { valid: false, reason }
}

function materializeOdesignStatusReceipt(fixtureCase, shape) {
  if (!Array.isArray(shape) || !documentsEqual(shape, ODESIGN_STATUS_RECEIPT_SHAPE)) {
    return receiptFailure('receipt_shape_changed')
  }

  const expectedKeys = new Set([
    'schema_version',
    'omarketing_projection',
    'guidance_code',
    'guidance',
    'publication',
    'lookup_before_retry',
    'safe_failure_code',
    'omarketing_approval_mutation',
    'resubmission_allowed',
    'fresh_poll_required',
    'checksum_readback_required',
    'comfy_terminal',
    'valid',
    'reason'
  ])
  if (
    fixtureCase.expected &&
    typeof fixtureCase.expected === 'object' &&
    Object.keys(fixtureCase.expected).some(
      (key) => !expectedKeys.has(key)
    )
  ) {
    return receiptFailure('receipt_unknown_field')
  }

  const supplied = fixtureCase.receipt
  if (supplied !== undefined) {
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) {
      return receiptFailure('receipt_not_an_object')
    }
    const suppliedKeys = Object.keys(supplied).sort()
    const expectedKeys = [...shape].sort()
    if (!documentsEqual(suppliedKeys, expectedKeys)) {
      return receiptFailure('receipt_unknown_field')
    }
  }

  const mapping = {
    schema_version: ODESIGN_STATUS_RECEIPT_SCHEMA_VERSION,
    operation: fixtureCase.operation,
    external_run_id: fixtureCase.external_run_id,
    odesign_status: fixtureCase.odesign_status,
    omarketing_projection: {
      accepted: 'accepted',
      awaiting_approval: 'failed',
      running: 'running',
      outcome_unknown: 'running',
      succeeded: 'succeeded',
      failed: 'failed'
    }[fixtureCase.odesign_status],
    guidance_code:
      fixtureCase.odesign_status === 'awaiting_approval'
        ? ODESIGN_APPROVAL_GUIDANCE
        : null,
    observed_at: fixtureCase.observed_at,
    publication:
      fixtureCase.odesign_status === 'awaiting_approval' ||
      fixtureCase.odesign_status === 'outcome_unknown' ||
      fixtureCase.odesign_status === 'failed'
        ? 'closed'
        : 'open',
    lookup_before_retry: fixtureCase.odesign_status === 'outcome_unknown'
  }

  const receipt = Object.fromEntries(
    shape.map((field) => [
      field,
      supplied !== undefined && Object.hasOwn(supplied, field)
        ? supplied[field]
        : Object.hasOwn(fixtureCase, field)
          ? fixtureCase[field]
          : mapping[field]
    ])
  )
  if (!documentsEqual(Object.keys(receipt).sort(), [...shape].sort())) {
    return receiptFailure('receipt_unknown_field')
  }
  return receipt
}

export function evaluateOdesignStatusReceiptCase(
  fixtureCase,
  shape = ODESIGN_STATUS_RECEIPT_SHAPE,
  validators = null,
  fixture = null
) {
  const receipt = materializeOdesignStatusReceipt(fixtureCase, shape)
  if (receipt?.valid === false) return receipt

  if (receipt.schema_version !== ODESIGN_STATUS_RECEIPT_SCHEMA_VERSION) {
    return receiptFailure('receipt_schema_version_invalid')
  }
  if (!ODESIGN_OPERATIONS.includes(receipt.operation)) {
    return receiptFailure('receipt_operation_invalid')
  }
  if (
    typeof receipt.external_run_id !== 'string' ||
    !/^odesign-run-[A-Za-z0-9_-]{1,120}$/.test(receipt.external_run_id)
  ) {
    return receiptFailure('receipt_run_id_invalid')
  }
  if (!ODESIGN_STATUSES.includes(receipt.odesign_status)) {
    return receiptFailure('unknown_odesign_status')
  }
  if (!isCanonicalUtcTimestamp(receipt.observed_at)) {
    return receiptFailure('receipt_observed_at_invalid')
  }

  const expectedProjection = {
    accepted: 'accepted',
    awaiting_approval: 'failed',
    running: 'running',
    outcome_unknown: 'running',
    succeeded: 'succeeded',
    failed: 'failed'
  }[receipt.odesign_status]
  const expectedPublication =
    receipt.odesign_status === 'awaiting_approval' ||
    receipt.odesign_status === 'outcome_unknown' ||
    receipt.odesign_status === 'failed'
      ? 'closed'
      : 'open'
  const expectedLookup = receipt.odesign_status === 'outcome_unknown'
  const expectedGuidance =
    receipt.odesign_status === 'awaiting_approval'
      ? ODESIGN_APPROVAL_GUIDANCE
      : null

  if (receipt.omarketing_projection !== expectedProjection) {
    return receiptFailure('receipt_projection_mismatch')
  }
  if (receipt.publication !== expectedPublication) {
    return receiptFailure('receipt_publication_mismatch')
  }
  if (receipt.lookup_before_retry !== expectedLookup) {
    return receiptFailure('receipt_lookup_before_retry_mismatch')
  }
  if (receipt.guidance_code !== expectedGuidance) {
    return receiptFailure('receipt_guidance_mismatch')
  }

  const awaitingApproval = receipt.odesign_status === 'awaiting_approval'
  const awaitingApprovalGuidanceInvalid =
    fixtureCase.guidance_code !== undefined &&
    fixtureCase.guidance_code !== ODESIGN_APPROVAL_GUIDANCE
  const awaitingApprovalMutation =
    fixtureCase.omarketing_approval_mutation !== undefined &&
    fixtureCase.omarketing_approval_mutation !== false
  const awaitingApprovalPromptOpen =
    fixtureCase.prompt_open === true ||
    fixtureCase.prompt_waiting === true ||
    fixtureCase.open_prompt === true ||
    ['open', 'waiting'].includes(fixtureCase.prompt_state) ||
    ['open', 'waiting'].includes(fixtureCase.prompt_status)
  if (awaitingApproval) {
    const safeFailureCode =
      fixtureCase.safe_failure_code ?? ODESIGN_APPROVAL_SAFE_CODE
    const guidanceText = fixtureCase.guidance ?? fixtureCase.message
    const hasRegistryOverride =
      fixtureCase.retryable !== undefined ||
      fixtureCase.category !== undefined ||
      fixtureCase.remediation !== undefined ||
      fixtureCase.remediation_key !== undefined
    const errorValidator = validators?.get(
      'external-job-error.v1.schema.json'
    )
    if (errorValidator && fixture?.schema_documents?.approval_error) {
      const errorDocument = {
        ...fixture.schema_documents.approval_error,
        code: safeFailureCode
      }
      if (!errorValidator(errorDocument)) {
        return receiptFailure('awaiting_approval_safe_code_not_allowlisted')
      }
    }
    if (
      fixtureCase.safe_failure_code !== undefined &&
      fixtureCase.safe_failure_code !== ODESIGN_APPROVAL_SAFE_CODE
    ) {
      return receiptFailure('awaiting_approval_failure_metadata_invalid')
    }
    if (
      safeFailureCode !== ODESIGN_APPROVAL_SAFE_CODE ||
      (guidanceText !== undefined &&
        guidanceText !== ODESIGN_APPROVAL_GUIDANCE_TEXT) ||
      hasRegistryOverride
    ) {
      return receiptFailure('awaiting_approval_failure_metadata_invalid')
    }
  }
  if (
    awaitingApproval &&
    (awaitingApprovalGuidanceInvalid ||
      awaitingApprovalMutation ||
      awaitingApprovalPromptOpen)
  ) {
    return receiptFailure('awaiting_approval_prompt_open')
  }
  const outcomeUnknown = receipt.odesign_status === 'outcome_unknown'
  const outcomeUnknownResubmission =
    (fixtureCase.resubmission_allowed !== undefined &&
      fixtureCase.resubmission_allowed !== false) ||
    fixtureCase.resubmit === true
  if (outcomeUnknown && outcomeUnknownResubmission) {
    return receiptFailure('outcome_unknown_resubmission_allowed')
  }

  const actual = {
    schema_version: receipt.schema_version,
    omarketing_projection: receipt.omarketing_projection,
    guidance_code: receipt.guidance_code,
    publication: receipt.publication,
    lookup_before_retry: receipt.lookup_before_retry
  }

  if (receipt.odesign_status === 'awaiting_approval') {
    Object.assign(actual, {
      guidance: ODESIGN_APPROVAL_GUIDANCE_TEXT,
      safe_failure_code: ODESIGN_APPROVAL_SAFE_CODE,
      omarketing_approval_mutation: false
    })
  } else if (receipt.odesign_status === 'outcome_unknown') {
    actual.resubmission_allowed = false
  } else if (receipt.odesign_status === 'succeeded') {
    const evidence = fixtureCase.evidence
    if (
      !Array.isArray(evidence) ||
      !evidence.includes('fresh_authenticated_poll') ||
      !evidence.includes('artifact_checksum_readback')
    ) {
      return receiptFailure('succeeded_evidence_incomplete')
    }
    if (
      (fixtureCase.fresh_poll_required !== undefined &&
        fixtureCase.fresh_poll_required !== true) ||
      (fixtureCase.checksum_readback_required !== undefined &&
        fixtureCase.checksum_readback_required !== true)
    ) {
      return receiptFailure('succeeded_evidence_incomplete')
    }
    actual.fresh_poll_required = true
    actual.checksum_readback_required = true
  } else if (receipt.odesign_status === 'failed') {
    actual.comfy_terminal = 'failed'
  }

  return actual
}

export function validateOdesignStatusReceiptCases(
  cases,
  shape = ODESIGN_STATUS_RECEIPT_SHAPE,
  validators = null,
  fixture = null
) {
  assert.deepEqual(
    shape,
    ODESIGN_STATUS_RECEIPT_SHAPE,
    'Odesign status receipt shape changed without updating the evaluator'
  )

  let acceptedCount = 0
  let rejectedCount = 0
  const operationCounts = Object.fromEntries(
    ODESIGN_OPERATIONS.map((operation) => [operation, 0])
  )
  const statusCounts = Object.fromEntries(
    ODESIGN_STATUSES.map((status) => [status, 0])
  )
  const covered = new Map(
    ODESIGN_OPERATIONS.map((operation) => [
      operation,
      new Set()
    ])
  )

  for (const fixtureCase of cases) {
    const actual = evaluateOdesignStatusReceiptCase(
      fixtureCase,
      shape,
      validators,
      fixture
    )
    assert.deepEqual(actual, fixtureCase.expected, fixtureCase.id)
    if (actual.valid === false) {
      rejectedCount += 1
      continue
    }
    acceptedCount += 1
    operationCounts[fixtureCase.operation] += 1
    statusCounts[fixtureCase.odesign_status] += 1
    covered.get(fixtureCase.operation).add(fixtureCase.odesign_status)
  }

  for (const operation of ODESIGN_OPERATIONS) {
    assert.deepEqual(
      covered.get(operation),
      new Set(ODESIGN_STATUSES),
      `${operation} must cover every Odesign status label`
    )
  }

  return {
    acceptedCount,
    caseCount: cases.length,
    operationCounts,
    rejectedCount,
    statusCounts
  }
}

function resolveCallbackBody(bodyFixture) {
  if (typeof bodyFixture.raw === 'string') {
    return Buffer.from(bodyFixture.raw, 'utf8')
  }
  if (typeof bodyFixture.base64 === 'string') {
    const bytes = Buffer.from(bodyFixture.base64, 'base64')
    assert.equal(bytes.toString('base64'), bodyFixture.base64)
    return bytes
  }
  assert.equal(typeof bodyFixture.repeat, 'string')
  assert.ok(Number.isSafeInteger(bodyFixture.count) && bodyFixture.count >= 0)
  return Buffer.from(
    bodyFixture.repeat.repeat(bodyFixture.count),
    'utf8'
  )
}

export function validateCallbackBodyVectors(callbackBodies) {
  let vectorCount = 0
  for (const [name, bodyFixture] of Object.entries(callbackBodies)) {
    const raw = resolveCallbackBody(bodyFixture)
    if (bodyFixture.sha256) {
      const digest = createHash('sha256').update(raw).digest('hex')
      assert.equal(digest, bodyFixture.sha256, name)
      vectorCount += 1
    }
  }
  return { vectorCount }
}

export function deriveCallbackSignature(
  profile,
  keyId,
  request,
  rawBody
) {
  const key = profile.active_keys[keyId]
  assert.ok(key, `Unknown callback fixture key ${keyId}`)
  const chunks = [
    Buffer.from('omarketing-callback-v1', 'ascii'),
    Buffer.from([0])
  ]
  for (const [name, value] of [
    ['method', request.method],
    ['path', request.path],
    ['timestamp', request.timestamp],
    ['nonce', request.nonce],
    ['body', rawBody]
  ]) {
    chunks.push(encodeLengthPrefixed(name))
    chunks.push(encodeLengthPrefixed(value))
  }
  return createHmac(
    'sha256',
    Buffer.from(key.fixture_hmac_key_hex, 'hex')
  )
    .update(Buffer.concat(chunks))
    .digest('hex')
}

export function evaluateCallbackCase(fixtureCase, fixture, validators) {
  const profile = fixture.callback_profile
  const rawBody = resolveCallbackBody(fixture.callback_bodies[fixtureCase.body])
  const actual = {
    accepted: false,
    reason: undefined,
    body_parsed: false,
    nonce_consumed: false,
    event_dedupe_consumed: false,
    sequence_cursor_advanced: false,
    polling_reconciliation_required: false,
    polling_authority:
      profile.terminal_authority === 'authenticated_polling'
  }

  if (!fixtureCase.profile_enabled) {
    actual.reason = 'push_disabled'
    return actual
  }
  if (!fixtureCase.source_acl_allowed) {
    actual.reason = 'source_acl_rejected'
    return actual
  }
  if (rawBody.length > profile.max_body_bytes) {
    actual.reason = 'body_too_large'
    return actual
  }
  if (!fixtureCase.rate_limit_allowed) {
    actual.reason = 'rate_limited'
    return actual
  }
  if (
    fixtureCase.content_type !== profile.accepted_content_type ||
    fixtureCase.content_encoding !== profile.accepted_content_encoding
  ) {
    actual.reason = 'content_contract_rejected'
    return actual
  }
  const ingressRoute = profile.ingress_routes[fixtureCase.path]
  if (
    !ingressRoute ||
    fixtureCase.method !== ingressRoute.method
  ) {
    actual.reason = 'callback_route_rejected'
    return actual
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(fixtureCase.nonce)) {
    actual.reason = 'nonce_rejected'
    return actual
  }

  const receivedAt = parseTimestamp(
    fixtureCase.received_at,
    `${fixtureCase.id}.received_at`
  )
  const signedAt = parseTimestamp(
    fixtureCase.timestamp,
    `${fixtureCase.id}.timestamp`
  )
  if (Math.abs(receivedAt - signedAt) > profile.max_skew_seconds * 1000) {
    actual.reason = 'stale_timestamp'
    return actual
  }

  const authProfile =
    profile.auth_profiles[ingressRoute.auth_profile]
  if (!authProfile || fixtureCase.auth_method !== authProfile.mode) {
    actual.reason = 'auth_profile_mismatch'
    return actual
  }

  if (fixtureCase.auth_method === 'raw_signature') {
    if (
      fixtureCase.algorithm !== profile.signature_algorithm ||
      fixtureCase.algorithm !== authProfile.algorithm
    ) {
      actual.reason = 'signature_algorithm_rejected'
      return actual
    }
    const key = profile.active_keys[fixtureCase.key_id]
    if (!key) {
      actual.reason = 'unknown_key'
      return actual
    }
    if (key.revoked) {
      actual.reason = 'key_revoked'
      return actual
    }
    if (
      receivedAt < parseTimestamp(key.active_from, `${fixtureCase.id}.active_from`) ||
      receivedAt >= parseTimestamp(key.retire_at, `${fixtureCase.id}.retire_at`)
    ) {
      actual.reason = 'key_not_active'
      return actual
    }
    if (!/^[0-9a-f]{64}$/.test(fixtureCase.signature_hex)) {
      actual.reason = 'signature_token_rejected'
      return actual
    }
    const expectedSignature = deriveCallbackSignature(
      profile,
      fixtureCase.key_id,
      fixtureCase,
      rawBody
    )
    if (
      !constantTimeHexDigestEqual(
        expectedSignature,
        fixtureCase.signature_hex
      )
    ) {
      actual.reason = 'raw_signature_mismatch'
      return actual
    }
  } else if (fixtureCase.auth_method === 'mtls') {
    const observation =
      profile.tls_verifier_observations[
        fixtureCase.tls_observation
      ]
    let mtlsVerified = false
    try {
      assert.ok(observation)
      const trustAnchorSpki = Buffer.from(
        authProfile.trust_anchor_spki_base64,
        'base64'
      )
      const leafSpki = Buffer.from(
        observation.leaf_spki_base64,
        'base64'
      )
      const certificateSignature = Buffer.from(
        observation.certificate_signature_base64,
        'base64'
      )
      const proofSignature = Buffer.from(
        observation.proof_signature_base64,
        'base64'
      )
      assert.equal(
        trustAnchorSpki.toString('base64'),
        authProfile.trust_anchor_spki_base64
      )
      assert.equal(
        leafSpki.toString('base64'),
        observation.leaf_spki_base64
      )
      assert.equal(
        certificateSignature.toString('base64'),
        observation.certificate_signature_base64
      )
      assert.equal(
        proofSignature.toString('base64'),
        observation.proof_signature_base64
      )
      const trustAnchorKey = createPublicKey({
        key: trustAnchorSpki,
        format: 'der',
        type: 'spki'
      })
      const leafKey = createPublicKey({
        key: leafSpki,
        format: 'der',
        type: 'spki'
      })
      const certificateStatement = Buffer.concat([
        Buffer.from('omarketing-mtls-cert-v1', 'ascii'),
        Buffer.from([0]),
        encodeLengthPrefixed(observation.peer_identity),
        encodeLengthPrefixed(authProfile.trust_bundle_sha256),
        encodeLengthPrefixed(leafSpki)
      ])
      const handshakeStatement = Buffer.concat([
        Buffer.from('omarketing-mtls-handshake-v1', 'ascii'),
        Buffer.from([0]),
        encodeLengthPrefixed(fixtureCase.method),
        encodeLengthPrefixed(fixtureCase.path),
        encodeLengthPrefixed(fixtureCase.timestamp),
        encodeLengthPrefixed(fixtureCase.nonce),
        encodeLengthPrefixed(rawBody)
      ])
      const peerSpkiSha256 = createHash('sha256')
        .update(leafSpki)
        .digest('hex')
      mtlsVerified =
        !authProfile.revoked &&
        receivedAt >=
          parseTimestamp(
            authProfile.active_from,
            `${fixtureCase.id}.mtls_active_from`
          ) &&
        receivedAt <
          parseTimestamp(
            authProfile.retire_at,
            `${fixtureCase.id}.mtls_retire_at`
          ) &&
        verify(
          null,
          certificateStatement,
          trustAnchorKey,
          certificateSignature
        ) &&
        verify(
          null,
          handshakeStatement,
          leafKey,
          proofSignature
        ) &&
        authProfile.allowed_peer_identities.includes(
          observation.peer_identity
        ) &&
        authProfile.allowed_peer_spki_sha256.includes(
          peerSpkiSha256
        )
    } catch {
      mtlsVerified = false
    }
    if (!mtlsVerified) {
      actual.reason = 'mtls_identity_rejected'
      return actual
    }
  } else {
    actual.reason = 'auth_method_rejected'
    return actual
  }

  let decodedBody
  try {
    decodedBody = fatalUtf8Decoder.decode(rawBody)
  } catch {
    actual.reason = 'invalid_utf8'
    return actual
  }

  let document
  try {
    document = JSON.parse(decodedBody)
    actual.body_parsed = true
  } catch {
    actual.reason = 'invalid_json'
    return actual
  }

  const validate = validators.get('external-job-event.v1.schema.json')
  if (!validate(document)) {
    actual.reason = 'event_schema_rejected'
    return actual
  }
  if (
    document.external_job_locator.adapter_id !== profile.adapter_id ||
    document.external_job_locator.environment !== profile.environment
  ) {
    actual.reason = 'callback_scope_mismatch'
    return actual
  }
  const emittedAt = parseTimestamp(
    document.emitted_at,
    `${fixtureCase.id}.emitted_at`
  )
  if (
    emittedAt <
    parseTimestamp(
      document.external_job_locator.submitted_at,
      `${fixtureCase.id}.submitted_at`
    ) ||
    Math.abs(receivedAt - emittedAt) >
      profile.max_skew_seconds * 1000
  ) {
    actual.reason = 'event_time_invalid'
    return actual
  }
  if (
    document.progress &&
    (document.progress.value > document.progress.max ||
      (document.status === 'succeeded' &&
        document.progress.value !== document.progress.max))
  ) {
    actual.reason = 'event_progress_invalid'
    return actual
  }

  const nonceKey = [
    profile.adapter_id,
    profile.environment,
    profile.service_principal_id,
    fixtureCase.nonce
  ].join('|')
  if (fixtureCase.seen_nonce_keys.includes(nonceKey)) {
    actual.reason = 'nonce_replay'
    return actual
  }
  actual.nonce_consumed = true

  const eventDedupeKey = [
    profile.adapter_id,
    profile.environment,
    profile.service_principal_id,
    document.external_job_locator.job_id,
    document.dedupe_key
  ].join('|')
  if (fixtureCase.seen_event_dedupe_keys.includes(eventDedupeKey)) {
    actual.reason = 'event_duplicate'
    return actual
  }
  actual.event_dedupe_consumed = true

  if (document.sequence <= fixtureCase.highest_contiguous_sequence) {
    actual.reason = 'sequence_reordered'
    return actual
  }
  if (document.sequence > fixtureCase.highest_contiguous_sequence + 1) {
    actual.reason = 'sequence_gap'
    actual.polling_reconciliation_required = true
    return actual
  }

  actual.accepted = true
  actual.reason = null
  actual.sequence_cursor_advanced = true
  return actual
}

export function validateCallbackCases(cases, fixture, validators) {
  let acceptedCount = 0
  let rejectedCount = 0
  for (const fixtureCase of cases) {
    const actual = evaluateCallbackCase(fixtureCase, fixture, validators)
    assert.deepEqual(actual, fixtureCase.expected, fixtureCase.id)
    if (actual.accepted) acceptedCount += 1
    else rejectedCount += 1
  }
  return { acceptedCount, caseCount: cases.length, rejectedCount }
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(value[key])}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function terminalStatusDigest(document) {
  const projection = {
    schema_version: document.schema_version,
    external_job_locator: document.external_job_locator,
    status: document.status,
    progress: document.progress,
    item_outcomes: document.item_outcomes,
    artifact_handles: document.artifact_handles,
    warnings: document.warnings,
    errors: document.errors
  }
  return createHash('sha256')
    .update(canonicalJson(projection), 'utf8')
    .digest('hex')
}

export function evaluateStatusSequenceCase(
  fixtureCase,
  fixture,
  validators
) {
  let previousProgress = null
  let previousObservedAt = null
  let canonicalItemIds = null
  let confirmedTerminal = null
  let terminalDigest = null

  for (const [index, observation] of fixtureCase.observations.entries()) {
    const semantic = evaluateDocumentInvariantCase(
      {
        id: `${fixtureCase.id}.observations[${index}]`,
        kind: 'status',
        document: observation.document,
        mutations: observation.mutations
      },
      fixture,
      validators
    )
    if (!semantic.valid) {
      return {
        accepted: false,
        reason: semantic.reason,
        confirmed_terminal: confirmedTerminal
      }
    }
    const document = materializeDocument(
      fixture.schema_documents[observation.document],
      observation.mutations
    )
    const progress = document.progress
    assert.ok(progress, `${fixtureCase.id} requires progress`)
    if (progress.value > progress.max) {
      return {
        accepted: false,
        reason: 'progress_value_exceeds_max',
        confirmed_terminal: confirmedTerminal
      }
    }
    if (observation.source === 'push') continue
    assert.equal(observation.source, 'authenticated_poll')

    const observedAt = parseTimestamp(
      document.observed_at,
      `${fixtureCase.id}.observed_at`
    )
    if (
      previousObservedAt !== null &&
      observedAt < previousObservedAt
    ) {
      return {
        accepted: false,
        reason: 'status_observation_time_regression',
        confirmed_terminal: confirmedTerminal
      }
    }
    previousObservedAt = observedAt

    const itemIds = document.item_outcomes.map((item) => item.item_id)
    if (canonicalItemIds === null) {
      canonicalItemIds = itemIds
    } else if (!documentsEqual(itemIds, canonicalItemIds)) {
      return {
        accepted: false,
        reason: 'item_identity_drift',
        confirmed_terminal: confirmedTerminal
      }
    }

    if (previousProgress) {
      if (
        progress.max !== previousProgress.max ||
        progress.value < previousProgress.value
      ) {
        return {
          accepted: false,
          reason: 'progress_regression',
          confirmed_terminal: confirmedTerminal
        }
      }
    }
    previousProgress = progress

    const isTerminal = ['succeeded', 'failed', 'canceled'].includes(
      document.status
    )
    if (confirmedTerminal !== null && !isTerminal) {
      return {
        accepted: false,
        reason: 'terminal_to_nonterminal_regression',
        confirmed_terminal: confirmedTerminal
      }
    }
    if (isTerminal) {
      if (confirmedTerminal === null) {
        confirmedTerminal = document.status
        terminalDigest = terminalStatusDigest(document)
      } else if (document.status !== confirmedTerminal) {
        return {
          accepted: false,
          reason: 'terminal_conflict',
          confirmed_terminal: confirmedTerminal
        }
      } else if (terminalStatusDigest(document) !== terminalDigest) {
        return {
          accepted: false,
          reason: 'terminal_content_mutation',
          confirmed_terminal: confirmedTerminal
        }
      }
    }
  }

  return {
    accepted: true,
    reason: null,
    confirmed_terminal: confirmedTerminal
  }
}

export function validateStatusSequenceCases(cases, fixture, validators) {
  let rejectedCount = 0
  for (const fixtureCase of cases) {
    const actual = evaluateStatusSequenceCase(
      fixtureCase,
      fixture,
      validators
    )
    assert.deepEqual(actual, fixtureCase.expected, fixtureCase.id)
    if (!actual.accepted) rejectedCount += 1
  }
  return { caseCount: cases.length, rejectedCount }
}

export function isSafeText(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 500) {
    return false
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) return false
  if (/https?:\/\//i.test(value)) return false
  if (/\b(?:authorization|bearer|basic)\b/i.test(value)) return false
  if (/[?&](?:sig|signature|token|key)=/i.test(value)) return false
  if (/(?:^|\s)(?:\/Users\/|\/private\/|\/etc\/|[A-Za-z]:\\)/.test(value)) {
    return false
  }
  return true
}

export function validateSafeTextCases(cases) {
  let rejectedCount = 0
  for (const fixtureCase of cases) {
    const actual = isSafeText(fixtureCase.value)
    assert.equal(actual, fixtureCase.valid, fixtureCase.id)
    if (!actual) rejectedCount += 1
  }
  return { caseCount: cases.length, rejectedCount }
}

export function evaluateLifecycleCase(
  fixtureCase,
  fixture,
  validators
) {
  const actual = {
    provider_job_count: 0,
    provider_job_count_delta: 0,
    new_idempotency_key_minted: false,
    lookup_before_retry: false,
    local_state: 'pending',
    publication_allowed: true,
    publication_closed_reason: null,
    http_status: undefined,
    safe_code: undefined,
    safe_category: undefined,
    safe_warning: undefined,
    external_terminal: null,
    comfy_terminal: undefined,
    comfy_terminal_before_execution_end: undefined,
    comfy_core_terminal: undefined,
    comfy_failure_reason: undefined,
    custom_frontend_terminal_created: false,
    adapter_emits_execution_success: false,
    node_returns_outputs: false,
    output_file_published: false,
    selection_manifest_changed: false,
    assets_membership_changed: false,
    artifact_destination: undefined,
    late_artifact_destination: undefined,
    external_cancel_requested: false,
    cancel_attempt_bound_seconds: undefined,
    comfy_interrupt_waits_for_provider: false,
    backend_reconciliation_required: false,
    old_comfy_job_resumed: false,
    history_rewritten: false,
    provider_terminal_overwritten: false,
    authenticated_poll_confirmed: false,
    checksum_readback_confirmed: false
  }

  const validatedArtifactHandleIds = new Set()
  let pollRequiredArtifactHandleIds = null
  let pollConfirmedTerminalDigest = null
  let lifecycleCanonicalItemIds = null
  let previousLifecyclePollObservedAt = null
  let previousLifecycleProgress = null
  let retryAuthorized = false
  let pollConfirmedTerminal = null
  let coreTerminalCommitted = false
  function closePublication(reason) {
    if (actual.publication_allowed) {
      actual.publication_allowed = false
      actual.publication_closed_reason = reason
    }
    if (actual.artifact_destination === 'private_staging') {
      actual.artifact_destination = 'private_quarantine'
      actual.late_artifact_destination = 'private_quarantine'
    }
  }

  function observeAuthoritativeStatus(status) {
    const terminal = ['succeeded', 'failed', 'canceled'].includes(status)
    if (!terminal) {
      if (actual.external_terminal !== null) {
        actual.safe_code = 'PROVIDER_PROTOCOL_ERROR'
        actual.comfy_terminal = 'failed'
        actual.comfy_terminal_before_execution_end = 'failed'
        closePublication('provider_protocol_error')
        return
      }
      actual.local_state = 'running'
      return
    }

    if (actual.external_terminal === null) {
      actual.external_terminal = status
      if (status === 'failed' || status === 'canceled') {
        actual.comfy_terminal = 'failed'
        closePublication(`provider_${status}`)
      }
      return
    }
    if (actual.external_terminal !== status) {
      actual.safe_code = 'EXTERNAL_TERMINAL_CONFLICT'
      actual.comfy_terminal = 'failed'
      actual.comfy_terminal_before_execution_end = 'failed'
      closePublication('provider_terminal_conflict')
    }
  }

  for (const event of fixtureCase.events) {
    switch (event.kind) {
      case 'journal_committed':
        actual.local_state = 'prepared'
        break
      case 'provider_job_created':
        if (
          actual.provider_job_count === 0 &&
          actual.local_state !== 'prepared' &&
          !retryAuthorized
        ) {
          actual.safe_code = 'SUBMISSION_BEFORE_JOURNAL_COMMIT'
          actual.comfy_terminal = 'failed'
          closePublication('submission_before_journal_commit')
          break
        }
        if (actual.provider_job_count > 0 && !retryAuthorized) {
          actual.safe_code = 'SUBMISSION_RETRY_NOT_AUTHORIZED'
          actual.comfy_terminal = 'failed'
          closePublication('submission_retry_not_authorized')
          break
        }
        actual.provider_job_count += 1
        retryAuthorized = false
        actual.local_state = 'submission_outcome_unknown'
        break
      case 'submit_response_lost':
        actual.local_state = 'submission_outcome_unknown'
        break
      case 'lookup_by_original_key':
        actual.lookup_before_retry = true
        break
      case 'lookup_result':
        assert.equal(actual.lookup_before_retry, true)
        if (event.result === 'existing') {
          actual.local_state = 'running'
          retryAuthorized = false
        } else if (event.result === 'not_found') {
          assert.equal(actual.provider_job_count, 0)
          retryAuthorized = actual.publication_allowed
        } else {
          assert.fail(`${fixtureCase.id} has invalid lookup result`)
        }
        break
      case 'idempotency_conflict':
        actual.http_status = 409
        actual.safe_code = 'IDEMPOTENCY_CONFLICT'
        actual.comfy_terminal = 'failed'
        closePublication('idempotency_conflict')
        break
      case 'push_status':
        // Advisory only; no authoritative terminal or publication transition.
        break
      case 'authoritative_status': {
        const semantic = evaluateDocumentInvariantCase(
          {
            id: `${fixtureCase.id}.authoritative_status`,
            kind: 'status',
            document: event.document,
            mutations: event.mutations
          },
          fixture,
          validators
        )
        assert.deepEqual(semantic, { valid: true, reason: null })
        const statusDocument = materializeDocument(
          fixture.schema_documents[event.document],
          event.mutations
        )
        const pollObservedAt = parseTimestamp(
          statusDocument.observed_at,
          `${fixtureCase.id}.observed_at`
        )
        const itemIds = statusDocument.item_outcomes.map(
          (item) => item.item_id
        )
        const handleBindingsValid =
          statusDocument.artifact_handles.every((handle) => {
            const record =
              fixture.artifact_resolver_records[handle.handle_id]
            return (
              record !== undefined &&
              record.expires_at === handle.expires_at &&
              record.resolved_job_id ===
                fixture.artifact_policy.job_id
            )
          })
        // Per-document binding integrity is evaluated before anything else:
        // a status whose artifact handles are not bound to this job is never
        // trusted enough to classify a terminal transition from it.
        if (!handleBindingsValid) {
          actual.safe_code = 'PROVIDER_PROTOCOL_ERROR'
          actual.comfy_terminal = 'failed'
          actual.comfy_terminal_before_execution_end = 'failed'
          closePublication('provider_protocol_error')
          break
        }
        const terminalDocument = [
          'succeeded',
          'failed',
          'canceled'
        ].includes(statusDocument.status)
        // Two authenticated polls that disagree on the terminal outcome are a
        // terminal conflict, and that classification outranks every
        // lower-priority cross-poll protocol check (progress monotonicity,
        // observed_at ordering, item identity drift). Those checks compare a
        // status against earlier polls of the same job, so a conflicting
        // terminal document usually trips them too; without this precedence the
        // conflict is masked as a generic PROVIDER_PROTOCOL_ERROR. Publication
        // stays closed either way, so fail-closed behaviour is unchanged.
        if (
          terminalDocument &&
          actual.external_terminal !== null &&
          actual.external_terminal !== statusDocument.status
        ) {
          actual.authenticated_poll_confirmed = true
          actual.safe_code = 'EXTERNAL_TERMINAL_CONFLICT'
          actual.comfy_terminal = 'failed'
          actual.comfy_terminal_before_execution_end = 'failed'
          closePublication('provider_terminal_conflict')
          break
        }
        const progressHistoryValid =
          previousLifecyclePollObservedAt === null ||
          (previousLifecycleProgress === null
            ? statusDocument.progress === null
            : statusDocument.progress !== null &&
              statusDocument.progress.max ===
                previousLifecycleProgress.max &&
              statusDocument.progress.value >=
                previousLifecycleProgress.value)
        if (
          !progressHistoryValid ||
          (previousLifecyclePollObservedAt !== null &&
            pollObservedAt < previousLifecyclePollObservedAt) ||
          (lifecycleCanonicalItemIds !== null &&
            !documentsEqual(itemIds, lifecycleCanonicalItemIds))
        ) {
          actual.safe_code = 'PROVIDER_PROTOCOL_ERROR'
          actual.comfy_terminal = 'failed'
          actual.comfy_terminal_before_execution_end = 'failed'
          closePublication('provider_protocol_error')
          break
        }
        previousLifecyclePollObservedAt = pollObservedAt
        previousLifecycleProgress =
          statusDocument.progress === null
            ? null
            : {
                value: statusDocument.progress.value,
                max: statusDocument.progress.max
              }
        if (lifecycleCanonicalItemIds === null) {
          lifecycleCanonicalItemIds = itemIds
        }
        const terminalDigest = terminalDocument
          ? terminalStatusDigest(statusDocument)
          : null
        // Reaching here with a terminal document means the status agrees with
        // the already confirmed terminal, so a digest change is content
        // mutation of the same terminal and stays a protocol error.
        if (
          terminalDigest !== null &&
          pollConfirmedTerminalDigest !== null &&
          terminalDigest !== pollConfirmedTerminalDigest
        ) {
          actual.safe_code = 'PROVIDER_PROTOCOL_ERROR'
          actual.comfy_terminal = 'failed'
          actual.comfy_terminal_before_execution_end = 'failed'
          closePublication('provider_terminal_conflict')
          break
        }
        actual.authenticated_poll_confirmed = true
        observeAuthoritativeStatus(statusDocument.status)
        if (
          ['succeeded', 'failed', 'canceled'].includes(
            statusDocument.status
          ) &&
          actual.external_terminal === statusDocument.status
        ) {
          pollConfirmedTerminal = statusDocument.status
          if (pollConfirmedTerminalDigest === null) {
            pollConfirmedTerminalDigest = terminalDigest
            pollRequiredArtifactHandleIds =
              statusDocument.artifact_handles.map(
                (handle) => handle.handle_id
              )
          }
        }
        break
      }
      case 'comfy_interrupt':
        closePublication('comfy_interrupt')
        actual.comfy_terminal = 'failed'
        actual.comfy_failure_reason = 'execution_interrupted'
        actual.external_cancel_requested = true
        break
      case 'cancel_response':
        actual.safe_warning =
          'cancel_requested_but_external_job_may_continue'
        break
      case 'cancel_timeout':
        actual.cancel_attempt_bound_seconds = 10
        actual.safe_warning = 'cancel_requested_but_external_job_may_continue'
        actual.backend_reconciliation_required = true
        closePublication('cancel_unconfirmed')
        break
      case 'backend_restart':
        actual.old_comfy_job_resumed = false
        actual.history_rewritten = false
        break
      case 'original_node_inactive':
        actual.external_cancel_requested = true
        closePublication('orphaned_invocation')
        break
      case 'deadline_expired':
        actual.safe_category = 'TIMEOUT'
        actual.external_cancel_requested = true
        closePublication('deadline_expired')
        actual.comfy_terminal = 'failed'
        break
      case 'artifact_arrived':
        actual.artifact_destination = actual.publication_allowed
          ? 'private_staging'
          : 'private_quarantine'
        if (!actual.publication_allowed) {
          actual.late_artifact_destination = 'private_quarantine'
        }
        break
      case 'artifact_contract_result': {
        const artifactCase = fixture.artifact_cases.find(
          (candidate) => candidate.id === event.artifact_case_id
        )
        assert.ok(artifactCase, event.artifact_case_id)
        const artifactResult = evaluateArtifactCase(
          artifactCase,
          fixture,
          { publication_allowed: actual.publication_allowed }
        )
        if (
          artifactResult.artifact_validated &&
          artifactResult.publication_allowed &&
          actual.publication_allowed
        ) {
          actual.checksum_readback_confirmed = true
          validatedArtifactHandleIds.add(
            artifactCase.resolver.handle_id
          )
        } else if (
          coreTerminalCommitted &&
          artifactResult.reason === 'publication_closed'
        ) {
          actual.artifact_destination = 'private_quarantine'
          actual.late_artifact_destination =
            'private_quarantine'
        } else {
          closePublication('artifact_validation_failed')
          actual.comfy_terminal = 'failed'
          actual.safe_category = 'DATA'
        }
        break
      }
      case 'node_returns_outputs':
        if (coreTerminalCommitted) break
        if (
          actual.external_terminal !== 'succeeded' ||
          pollConfirmedTerminal !== 'succeeded' ||
          pollConfirmedTerminalDigest === null ||
          !actual.checksum_readback_confirmed ||
          pollRequiredArtifactHandleIds === null ||
          !documentsEqual(
            [...validatedArtifactHandleIds].sort(),
            [...pollRequiredArtifactHandleIds].sort()
          ) ||
          !actual.publication_allowed
        ) {
          actual.safe_code = 'TERMINAL_NOT_POLL_CONFIRMED'
          actual.comfy_terminal = 'failed'
          closePublication('terminal_not_poll_confirmed')
          break
        }
        actual.node_returns_outputs = true
        actual.output_file_published = true
        break
      case 'core_execution_success':
        coreTerminalCommitted = true
        if (!actual.node_returns_outputs) {
          actual.safe_code = 'PROVIDER_PROTOCOL_ERROR'
        }
        actual.comfy_core_terminal = 'completed'
        closePublication('comfy_terminal_committed')
        break
      default:
        assert.fail(`${fixtureCase.id} has unknown event ${event.kind}`)
    }
  }

  return actual
}

export function validateLifecycleCases(cases, fixture, validators) {
  const resultDefaults = {
    provider_job_count: 0,
    provider_job_count_delta: 0,
    new_idempotency_key_minted: false,
    lookup_before_retry: false,
    local_state: 'pending',
    publication_allowed: true,
    publication_closed_reason: null,
    http_status: null,
    safe_code: null,
    safe_category: null,
    safe_warning: null,
    external_terminal: null,
    comfy_terminal: null,
    comfy_terminal_before_execution_end: null,
    comfy_core_terminal: null,
    comfy_failure_reason: null,
    custom_frontend_terminal_created: false,
    adapter_emits_execution_success: false,
    node_returns_outputs: false,
    output_file_published: false,
    selection_manifest_changed: false,
    assets_membership_changed: false,
    artifact_destination: null,
    late_artifact_destination: null,
    external_cancel_requested: false,
    cancel_attempt_bound_seconds: null,
    comfy_interrupt_waits_for_provider: false,
    backend_reconciliation_required: false,
    old_comfy_job_resumed: false,
    history_rewritten: false,
    provider_terminal_overwritten: false,
    authenticated_poll_confirmed: false,
    checksum_readback_confirmed: false
  }
  for (const fixtureCase of cases) {
    const actual = evaluateLifecycleCase(
      fixtureCase,
      fixture,
      validators
    )
    const normalizedActual = Object.fromEntries(
      Object.keys(resultDefaults).map((key) => [key, actual[key] ?? null])
    )
    assert.deepEqual(
      normalizedActual,
      { ...resultDefaults, ...fixtureCase.expected },
      fixtureCase.id
    )
  }
  return { caseCount: cases.length }
}

export function validateAll() {
  const { fixture, schemas } = loadExternalLifecycleContract()
  assert.equal(fixture.schema_version, 1)
  assert.equal(fixture.contract, 'external-job-lifecycle.md')
  assert.deepEqual(Object.keys(fixture.network_profiles).sort(), [
    'artifact',
    'cancel',
    'lookup',
    'status',
    'submit'
  ])
  assert.deepEqual(
    [
      ...new Set(fixture.artifact_cases.map((entry) => entry.payload))
    ].sort(),
    Object.keys(fixture.artifact_payloads).sort()
  )
  assert.deepEqual(
    [
      ...new Set(
        fixture.artifact_cases.map(
          (entry) => entry.resolver.handle_id
        )
      )
    ].sort(),
    Object.keys(fixture.artifact_resolver_records).sort()
  )
  assert.deepEqual(
    [
      ...new Set(
        fixture.artifact_cases.map(
          (entry) => entry.readback_observation
        )
      )
    ].sort(),
    Object.keys(fixture.artifact_readback_observations).sort()
  )
  assert.deepEqual(
    [
      ...new Set(fixture.callback_cases.map((entry) => entry.body))
    ].sort(),
    Object.keys(fixture.callback_bodies).sort()
  )

  const ids = collectFixtureIds(fixture)
  const validators = compileSchemas(schemas)
  assert.equal(fixture.callback_profile.default_enabled, false)
  const schemaCases = validateSchemaCases(fixture, validators)
  const documentInvariants = validateDocumentInvariantCases(
    fixture.document_invariant_cases,
    fixture,
    validators
  )
  const idempotency = validateIdempotencyVectors(fixture.idempotency_policy)
  const lifecycle = validateLifecycleCases(
    fixture.cases,
    fixture,
    validators
  )
  const recovery = validateRecoveryCases(
    fixture.recovery_cases,
    fixture.idempotency_policy
  )
  const network = validateNetworkCases(
    fixture.network_cases,
    fixture.network_profiles
  )
  const artifacts = validateArtifactCases(fixture.artifact_cases, fixture)
  const callbackBodies = validateCallbackBodyVectors(fixture.callback_bodies)
  const callbacks = validateCallbackCases(
    fixture.callback_cases,
    fixture,
    validators
  )
  const statusSequences = validateStatusSequenceCases(
    fixture.status_sequence_cases,
    fixture,
    validators
  )
  const safeText = validateSafeTextCases(fixture.safe_text_cases)
  const odesignStatusReceipts = validateOdesignStatusReceiptCases(
    fixture.odesign_status_receipt_cases,
    fixture.odesign_status_receipt_shape,
    validators,
    fixture
  )

  return {
    artifactCaseCount: artifacts.caseCount,
    artifactRejectedCount: artifacts.rejectedCount,
    callbackAcceptedCount: callbacks.acceptedCount,
    callbackBodyVectorCount: callbackBodies.vectorCount,
    callbackCaseCount: callbacks.caseCount,
    callbackRejectedCount: callbacks.rejectedCount,
    documentInvariantCaseCount: documentInvariants.caseCount,
    documentInvariantRejectedCount: documentInvariants.rejectedCount,
    fixtureIdCount: ids.length,
    idempotencyVectorCount: idempotency.vectorCount,
    lifecycleCaseCount: lifecycle.caseCount,
    negativeSchemaCaseCount: schemaCases.negativeCount,
    networkBlockedCount: network.blockedCount,
    networkCaseCount: network.caseCount,
    odesignStatusReceiptAcceptedCount:
      odesignStatusReceipts.acceptedCount,
    odesignStatusReceiptCaseCount: odesignStatusReceipts.caseCount,
    odesignStatusReceiptOperationCounts:
      odesignStatusReceipts.operationCounts,
    odesignStatusReceiptRejectedCount:
      odesignStatusReceipts.rejectedCount,
    odesignStatusReceiptStatusCounts:
      odesignStatusReceipts.statusCounts,
    positiveSchemaCaseCount: schemaCases.positiveCount,
    recoveryCaseCount: recovery.caseCount,
    safeTextCaseCount: safeText.caseCount,
    safeTextRejectedCount: safeText.rejectedCount,
    schemaCaseCount: schemaCases.caseCount,
    schemaCount: schemas.size,
    statusSequenceCaseCount: statusSequences.caseCount,
    statusSequenceRejectedCount: statusSequences.rejectedCount
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (invokedPath === import.meta.url) {
  try {
    const result = validateAll()
    console.log(
      [
        'external-lifecycle-contract validation ok',
        `schemas=${result.schemaCount}`,
        `schema_cases=${result.schemaCaseCount}`,
        `positive=${result.positiveSchemaCaseCount}`,
        `negative=${result.negativeSchemaCaseCount}`,
        `document_invariants=${result.documentInvariantCaseCount}`,
        `document_invariant_rejected=${result.documentInvariantRejectedCount}`,
        `lifecycle=${result.lifecycleCaseCount}`,
        `recovery=${result.recoveryCaseCount}`,
        `network=${result.networkCaseCount}`,
        `network_blocked=${result.networkBlockedCount}`,
        `artifacts=${result.artifactCaseCount}`,
        `artifact_rejected=${result.artifactRejectedCount}`,
        `callbacks=${result.callbackCaseCount}`,
        `callback_rejected=${result.callbackRejectedCount}`,
        `status_sequences=${result.statusSequenceCaseCount}`,
        `odesign_receipts=${result.odesignStatusReceiptCaseCount}`,
        `odesign_receipt_rejected=${result.odesignStatusReceiptRejectedCount}`,
        `safe_text=${result.safeTextCaseCount}`,
        `unique_ids=${result.fixtureIdCount}`
      ].join(' ')
    )
  } catch (error) {
    console.error(error.stack ?? error.message)
    process.exitCode = 1
  }
}
