import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  collectFixtureIds,
  compileSchemas,
  contractPath,
  deriveCallbackSignature,
  deriveIdempotencyVector,
  evaluateArtifactCase,
  evaluateCallbackCase,
  evaluateDocumentInvariantCase,
  evaluateLifecycleCase,
  evaluateNetworkCase,
  evaluateOdesignStatusReceiptCase,
  evaluateRecoveryCase,
  evaluateStatusSequenceCase,
  expectedSchemaNames,
  isGlobalIpAddress,
  isSafeText,
  loadExternalLifecycleContract,
  materializeSchemaCase,
  validateAll,
  validateArtifactCases,
  validateCallbackBodyVectors,
  validateCallbackCases,
  validateDocumentInvariantCases,
  validateIdempotencyVectors,
  validateLifecycleCases,
  validateNetworkCases,
  validateOdesignStatusReceiptCases,
  validateRecoveryCases,
  validateSafeTextCases,
  validateSchemaCases,
  validateStatusSequenceCases
} from './validate-external-lifecycle-contract.mjs'

const { fixture, schemas } = loadExternalLifecycleContract()
const validators = compileSchemas(schemas)

function assertClosedDataObjects(value, location, conditional = false) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertClosedDataObjects(entry, `${location}[${index}]`, conditional)
    )
    return
  }
  if (!value || typeof value !== 'object') return

  if (value.type === 'object' && !conditional) {
    assert.equal(
      value.additionalProperties,
      false,
      `${location} must reject additional properties`
    )
  }

  for (const [key, entry] of Object.entries(value)) {
    assertClosedDataObjects(
      entry,
      `${location}.${key}`,
      key === 'if' || key === 'then'
    )
  }
}

function collectPropertyNames(value, location, names) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectPropertyNames(entry, `${location}[${index}]`, names)
    )
    return
  }
  if (!value || typeof value !== 'object') return

  if (value.properties) {
    for (const name of Object.keys(value.properties)) {
      names.push({ location: `${location}.properties.${name}`, name })
    }
  }
  for (const [key, entry] of Object.entries(value)) {
    collectPropertyNames(entry, `${location}.${key}`, names)
  }
}

const canonicalUtcPattern =
  '^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,6})?Z$'

function assertCanonicalDateTimes(value, location) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertCanonicalDateTimes(entry, `${location}[${index}]`)
    )
    return
  }
  if (!value || typeof value !== 'object') return
  if (value.format === 'date-time') {
    assert.equal(value.pattern, canonicalUtcPattern, location)
    assert.equal(value.minLength, 20, location)
    assert.equal(value.maxLength, 27, location)
  }
  for (const [key, entry] of Object.entries(value)) {
    assertCanonicalDateTimes(entry, `${location}.${key}`)
  }
}

function idsFor(collection) {
  return new Set(fixture[collection].map((fixtureCase) => fixtureCase.id))
}

test('external lifecycle fixture JSON has globally unique case ids', () => {
  assert.equal(fixture.schema_version, 1)
  assert.equal(fixture.contract, 'external-job-lifecycle.md')
  assert.equal(collectFixtureIds(fixture).length, 224)
})

test('Draft 2020-12 external schemas compile as closed versioned objects', () => {
  assert.deepEqual([...schemas.keys()].sort(), [...expectedSchemaNames])
  const schemaIds = new Set()

  for (const [name, schema] of schemas) {
    assert.equal(
      schema.$schema,
      'https://json-schema.org/draft/2020-12/schema',
      name
    )
    assert.match(schema.$id, /^https:\/\/schemas\.omarketing\.invalid\/external\//)
    assert.equal(schemaIds.has(schema.$id), false, schema.$id)
    schemaIds.add(schema.$id)
    assert.ok(schema.required.includes('schema_version'), name)
    assert.equal(schema.properties.schema_version.type, 'string', name)
    assert.equal(
      schema.properties.schema_version.const,
      `omarketing.${name.replace('.v1.schema.json', '.v1')}`,
      name
    )
    assertClosedDataObjects(schema, name)
    assertCanonicalDateTimes(schema, name)
  }

  const forbiddenPropertyNames = new Set([
    'access_token',
    'artifact_url',
    'authorization',
    'callback_url',
    'cookie',
    'credential',
    'endpoint',
    'host',
    'hostname',
    'port',
    'private_url',
    'query',
    'refresh_token',
    'signed_url',
    'status_url',
    'url',
    'uri'
  ])
  for (const [name, schema] of schemas) {
    const properties = []
    collectPropertyNames(schema, name, properties)
    for (const property of properties) {
      assert.equal(
        forbiddenPropertyNames.has(property.name),
        false,
        property.location
      )
    }
  }

  const envelope = schemas.get('external-job-envelope.v1.schema.json')
  assert.equal('payload' in envelope.properties, false)
  assert.ok(envelope.required.includes('canonical_payload_digest'))
  assert.ok(envelope.required.includes('operation_payload_schema'))
  assert.equal(envelope.properties.deadline_at.format, 'date-time')
  assert.equal(envelope.properties.deadline_at.pattern, canonicalUtcPattern)
  assert.equal(envelope.properties.deadline_at.maxLength, 27)

  const acceptance = schemas.get('external-job-acceptance.v1.schema.json')
  assert.deepEqual(acceptance.properties.status, {
    type: 'string',
    const: 'accepted'
  })
  assert.equal(
    acceptance.properties.external_job_locator.$ref,
    'external-job-locator.v1.schema.json'
  )
  assert.equal('request_id' in acceptance.properties, false)

  const artifact = schemas.get(
    'external-job-artifact-handle.v1.schema.json'
  )
  assert.deepEqual(Object.keys(artifact.properties).sort(), [
    'expires_at',
    'handle_id',
    'schema_version'
  ])

  const status = schemas.get('external-job-status.v1.schema.json')
  assert.equal(status.properties.item_outcomes.maxItems, 1000)
  assert.equal(status.properties.artifact_handles.maxItems, 64)
  assert.equal(status.properties.artifact_handles.uniqueItems, true)
  assert.equal(status.$defs.progress.properties.value.maximum, 1000000000)
  assert.equal(status.$defs.progress.properties.max.minimum, 1)

  const error = schemas.get('external-job-error.v1.schema.json')
  assert.deepEqual(Object.keys(error.properties).sort(), [
    'code',
    'diagnostic_id',
    'external_job_locator',
    'item_id',
    'node_id',
    'prompt_id',
    'schema_version'
  ])

  const event = schemas.get('external-job-event.v1.schema.json')
  assert.equal(event.properties.sequence.maximum, 9007199254740991)
})

test('positive schema documents pass and hostile documents are rejected', () => {
  assert.deepEqual(validateSchemaCases(fixture, validators), {
    caseCount: 58,
    negativeCount: 48,
    positiveCount: 10
  })

  for (const schemaName of expectedSchemaNames) {
    const cases = fixture.schema_cases.filter(
      (fixtureCase) => fixtureCase.schema === schemaName
    )
    assert.ok(cases.some((fixtureCase) => fixtureCase.valid), schemaName)
    assert.ok(cases.some((fixtureCase) => !fixtureCase.valid), schemaName)
  }

  const errorValidator = validators.get(
    'external-job-error.v1.schema.json'
  )
  const approvalCase = fixture.schema_cases.find(
    (fixtureCase) => fixtureCase.id === 'schema-error-approval-required-valid'
  )
  assert.ok(approvalCase)
  assert.equal(
    errorValidator(
      materializeSchemaCase(fixture, approvalCase)
    ),
    true
  )
  const unsupportedApprovalCode = materializeSchemaCase(
    fixture,
    approvalCase
  )
  unsupportedApprovalCode.code = 'APPROVAL_REQUIRED'
  assert.equal(errorValidator(unsupportedApprovalCode), false)

  const hostileIds = idsFor('schema_cases')
  for (const requiredId of [
    'schema-envelope-credential-field-rejected',
    'schema-envelope-status-url-rejected',
    'schema-envelope-generic-payload-rejected',
    'schema-acceptance-status-url-rejected',
    'schema-acceptance-duplicate-request-id-rejected',
    'schema-acceptance-malformed-timestamp-rejected',
    'schema-acceptance-private-endpoint-rejected',
    'schema-locator-signed-url-rejected',
    'schema-artifact-signed-url-rejected',
    'schema-artifact-url-handle-rejected',
    'schema-artifact-invalid-calendar-date-rejected',
    'schema-status-artifact-url-rejected',
    'schema-status-terminal-poll-rejected',
    'schema-status-zero-progress-max-rejected',
    'schema-status-succeeded-running-item-rejected',
    'schema-status-failed-without-error-rejected',
    'schema-cancel-request-url-rejected',
    'schema-error-private-url-field-rejected',
    'schema-error-approval-required-valid',
    'schema-error-benign-free-text-rejected',
    'schema-error-retryable-override-rejected',
    'schema-error-approval-like-code-rejected',
    'schema-error-approval-dynamic-message-rejected',
    'schema-error-approval-retryable-override-rejected',
    'schema-event-callback-url-rejected',
    'schema-event-signature-field-rejected'
  ]) {
    assert.ok(hostileIds.has(requiredId), requiredId)
  }
})

test('mandatory semantic evaluator rejects cross-document invalid states', () => {
  assert.deepEqual(
    validateDocumentInvariantCases(
      fixture.document_invariant_cases,
      fixture,
      validators
    ),
    { caseCount: 26, rejectedCount: 22 }
  )

  for (const id of [
    'invariant-envelope-deadline-not-after-sent-rejected',
    'invariant-envelope-two-hour-ceiling-rejected',
    'invariant-acceptance-before-submission-rejected',
    'invariant-acceptance-request-id-mismatch-rejected',
    'invariant-acceptance-operation-mismatch-rejected',
    'invariant-acceptance-after-deadline-rejected',
    'invariant-status-before-submission-rejected',
    'invariant-status-request-id-mismatch-rejected',
    'invariant-status-operation-mismatch-rejected',
    'invariant-status-job-id-mismatch-rejected',
    'invariant-status-value-exceeds-max-rejected',
    'invariant-status-succeeded-incomplete-progress-rejected',
    'invariant-status-duplicate-item-id-rejected',
    'invariant-status-dangling-handle-reference-rejected',
    'invariant-status-expired-artifact-handle-rejected',
    'invariant-status-duplicate-handle-id-rejected',
    'invariant-status-error-locator-mismatch-rejected',
    'invariant-cancel-request-before-submission-rejected',
    'invariant-cancel-shared-wrong-locator-rejected',
    'invariant-cancel-request-id-mismatch-rejected',
    'invariant-cancel-locator-mismatch-rejected',
    'invariant-cancel-response-before-request-rejected'
  ]) {
    const fixtureCase = fixture.document_invariant_cases.find(
      (entry) => entry.id === id
    )
    assert.ok(fixtureCase, id)
    assert.equal(
      evaluateDocumentInvariantCase(fixtureCase, fixture, validators).valid,
      false,
      id
    )
  }
})

test('idempotency derivation vectors survive every crash and key rotation', () => {
  assert.deepEqual(validateIdempotencyVectors(fixture.idempotency_policy), {
    vectorCount: 2
  })
  assert.deepEqual(
    deriveIdempotencyVector(fixture.idempotency_policy, 'k2026a'),
    {
      idempotencyKey:
        'oj1.k2026a.JF4cZWKXOM0hkM42pq6a_ScDgVWjgVhnk5dWrLIiE0c',
      idempotencyKeyHash:
        'sha256:b630a7476c0946afc319d0046016cf24fb09c005d752e26f230c1e7b879bccbc'
    }
  )
  assert.deepEqual(
    validateRecoveryCases(
      fixture.recovery_cases,
      fixture.idempotency_policy
    ),
    { caseCount: 12 }
  )

  const crashPoints = new Set(
    fixture.recovery_cases.map((fixtureCase) => fixtureCase.crash_point)
  )
  assert.deepEqual(
    crashPoints,
    new Set([
      'before_prepared_commit',
      'after_prepared_before_connect',
      'during_submit_before_provider_commit',
      'after_provider_commit_before_response',
      'after_response_before_locator_commit',
      'after_locator_commit'
    ])
  )

  const rotated = fixture.recovery_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'recovery-key-rotation-uses-recorded-version'
  )
  assert.equal(
    evaluateRecoveryCase(rotated, fixture.idempotency_policy)
      .active_version_ignored,
    true
  )
  const retired = fixture.recovery_cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'recovery-key-version-retired-too-early-fails-closed'
  )
  assert.equal(
    evaluateRecoveryCase(retired, fixture.idempotency_policy).safe_code,
    'IDEMPOTENCY_KEY_UNRECOVERABLE'
  )

  for (const fixtureCase of fixture.recovery_cases) {
    const actual = evaluateRecoveryCase(
      fixtureCase,
      fixture.idempotency_policy
    )
    assert.equal(actual.new_key_minted, false, fixtureCase.id)
    const evidence = fixtureCase.execution_evidence ?? {}
    const ownsActiveAuthority =
      evidence.state === 'executing' &&
      evidence.prompt_id === fixture.idempotency_policy.scope.prompt_id &&
      evidence.node_id === fixture.idempotency_policy.scope.node_id &&
      fixtureCase.journal_invocation_token_hash ===
        'sha256:58c4271410d4e30d46b1a24913ae2d73ad1f0c28b478e22e49e39fd2e8c0ab1f'
    assert.equal(
      actual.publication_allowed,
      ownsActiveAuthority,
      fixtureCase.id
    )
  }
  const activeRetry = fixture.recovery_cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'recovery-active-invocation-not-found-retries-same-key'
  )
  const activeRetryResult = evaluateRecoveryCase(
    activeRetry,
    fixture.idempotency_policy
  )
  assert.equal(activeRetryResult.lookup_before_retry, true)
  assert.equal(activeRetryResult.same_key_rederived, true)
  assert.equal(activeRetryResult.retry_performed, true)
  assert.equal(activeRetryResult.provider_job_count, 1)
  const mismatchedInvocation = evaluateRecoveryCase(
    {
      ...activeRetry,
      execution_evidence: {
        ...activeRetry.execution_evidence,
        invocation_token: 'invocation-token-other'
      }
    },
    fixture.idempotency_policy
  )
  assert.equal(mismatchedInvocation.retry_performed, false)
  assert.equal(
    mismatchedInvocation.safe_code,
    'IDEMPOTENCY_JOURNAL_INVALID'
  )
  assert.equal(mismatchedInvocation.quarantine_required, true)

  for (const hostile of [
    {
      ...activeRetry,
      available_key_versions: []
    },
    {
      ...activeRetry,
      stored_key_hash_override:
        'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    },
    {
      ...activeRetry,
      missing_journal_fields: ['node_id']
    }
  ]) {
    const result = evaluateRecoveryCase(
      hostile,
      fixture.idempotency_policy
    )
    assert.equal(result.publication_allowed, false)
    assert.equal(result.retry_performed, false)
    assert.equal(result.quarantine_required, true)
  }

  const startupNotFound = fixture.recovery_cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'recovery-crash-during-submit-before-provider-commit'
  )
  const relabeledStartup = evaluateRecoveryCase(
    { ...startupNotFound, recovery_mode: 'active_invocation' },
    fixture.idempotency_policy
  )
  assert.equal(relabeledStartup.submission_retry_allowed, false)
  assert.equal(relabeledStartup.retry_performed, false)

  const knownLocator = fixture.recovery_cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'recovery-unavailable-key-known-locator-status-and-quarantine'
  )
  const knownLocatorResult = evaluateRecoveryCase(
    knownLocator,
    fixture.idempotency_policy
  )
  assert.equal(knownLocatorResult.authoritative_status_by_locator, true)
  assert.equal(knownLocatorResult.quarantine_required, true)
  const malformedUnavailableLocator = evaluateRecoveryCase(
    {
      ...knownLocator,
      stored_key_hash_override: 'not-a-sha256'
    },
    fixture.idempotency_policy
  )
  assert.equal(
    malformedUnavailableLocator.authoritative_status_by_locator,
    false
  )
  assert.equal(
    malformedUnavailableLocator.safe_code,
    'IDEMPOTENCY_JOURNAL_INVALID'
  )
  const missingWorkflowLocator = evaluateRecoveryCase(
    {
      ...knownLocator,
      missing_journal_fields: ['workflow_locator']
    },
    fixture.idempotency_policy
  )
  assert.equal(
    missingWorkflowLocator.authoritative_status_by_locator,
    false
  )
  assert.equal(
    missingWorkflowLocator.safe_code,
    'IDEMPOTENCY_JOURNAL_INVALID'
  )

  const committedLocator = fixture.recovery_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'recovery-crash-after-locator-commit'
  )
  const activeLocatorResult = evaluateRecoveryCase(
    {
      ...committedLocator,
      recovery_mode: 'active_invocation',
      journal_invocation_token_hash:
        'sha256:58c4271410d4e30d46b1a24913ae2d73ad1f0c28b478e22e49e39fd2e8c0ab1f',
      execution_evidence: {
        state: 'executing',
        prompt_id: '11111111-1111-4111-8111-111111111111',
        node_id: 'node-42',
        invocation_token: 'invocation-token-0001'
      }
    },
    fixture.idempotency_policy
  )
  assert.equal(activeLocatorResult.authoritative_status_by_locator, true)
  assert.equal(activeLocatorResult.publication_allowed, true)
  const corruptLocator = evaluateRecoveryCase(
    {
      ...committedLocator,
      stored_key_hash_override:
        'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    },
    fixture.idempotency_policy
  )
  assert.equal(corruptLocator.authoritative_status_by_locator, false)
  assert.equal(
    corruptLocator.safe_code,
    'IDEMPOTENCY_JOURNAL_INTEGRITY_FAILURE'
  )
})

test('status destinations reject redirects rebinding private IP and proxy injection', () => {
  assert.deepEqual(
    validateNetworkCases(fixture.network_cases, fixture.network_profiles),
    { blockedCount: 18, caseCount: 23 }
  )

  const requiredIds = idsFor('network_cases')
  for (const id of [
    'network-same-origin-path-redirect-rejected',
    'network-cross-origin-redirect-rejected',
    'network-redirect-loop-rejected',
    'network-public-to-private-dns-rebind-rejected',
    'network-private-ip-rejected-before-socket',
    'network-ipv4-mapped-ipv6-rejected-before-socket',
    'network-proxy-environment-ignored',
    'network-unapproved-cname-rejected',
    'network-userinfo-rejected',
    'network-fragment-rejected',
    'network-alternate-port-rejected',
    'network-encoded-path-separator-rejected',
    'network-submit-private-ip-rejected',
    'network-lookup-private-ip-rejected',
    'network-cancel-private-ip-rejected',
    'network-site-local-ipv6-rejected',
    'network-documentation-ipv6-rejected',
    'network-ipv4-compatible-ipv6-rejected'
  ]) {
    assert.ok(requiredIds.has(id), id)
  }

  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '203.0.113.1',
    '::1',
    'fc00::1',
    'fe80::1',
    'fec0::1',
    '::10.0.0.1',
    '2001:db8::1',
    '2002:0a00:1::1',
    '3fff::1',
    '::ffff:127.0.0.1'
  ]) {
    assert.equal(isGlobalIpAddress(address), false, address)
  }
  assert.equal(isGlobalIpAddress('8.8.8.8'), true)
  assert.equal(isGlobalIpAddress('2001:4860:4860::8888'), true)

  const proxyCase = fixture.network_cases.find(
    (fixtureCase) => fixtureCase.id === 'network-proxy-environment-ignored'
  )
  assert.deepEqual(
    evaluateNetworkCase(proxyCase, fixture.network_profiles),
    {
      allowed: true,
      reason: undefined,
      socket_connects: 1,
      failed_connect_attempt: undefined,
      redirects_followed: 0,
      proxy_environment_used: false,
      proxy_attack_effect: false,
      credentials_forwarded: true,
      credentials_forwarded_to_redirect: false,
      credentials_forwarded_on_failed_attempt: false
    }
  )
})

test('artifact handles validate destinations and enforce bounded streaming', () => {
  assert.deepEqual(validateArtifactCases(fixture.artifact_cases, fixture), {
    caseCount: 25,
    rejectedCount: 23
  })

  const requiredIds = idsFor('artifact_cases')
  for (const id of [
    'artifact-handle-redirect-rejected',
    'artifact-valid-bounded-gzip-stream',
    'artifact-private-destination-rejected-before-socket',
    'artifact-expired-handle-rejected-before-socket',
    'artifact-wrong-owner-binding-rejected-before-socket',
    'artifact-wrong-provider-artifact-id-rejected-before-socket',
    'artifact-content-length-oversize-rejected',
    'artifact-compressed-stream-oversize-aborts',
    'artifact-uncompressed-stream-oversize-aborts',
    'artifact-decompression-bomb-aborts',
    'artifact-reconnect-dns-rebind-rejected',
    'artifact-truncated-stream-rejected',
    'artifact-nested-encoding-rejected',
    'artifact-decompressor-error-rejected',
    'artifact-mime-mismatch-rejected',
    'artifact-checksum-validation-rejected',
    'artifact-authenticated-readback-mismatch-rejected',
    'artifact-unauthenticated-readback-rejected',
    'artifact-readback-wrong-profile-rejected',
    'artifact-readback-wrong-request-job-rejected',
    'artifact-readback-wrong-locator-rejected',
    'artifact-readback-wrong-handle-rejected',
    'artifact-size-mismatch-rejected',
    'artifact-closed-publication-gate-quarantines'
  ]) {
    assert.ok(requiredIds.has(id), id)
  }

  for (const fixtureCase of fixture.artifact_cases) {
    const actual = evaluateArtifactCase(fixtureCase, fixture)
    assert.equal(actual.partial_bytes_published, false, fixtureCase.id)
    if (!actual.accepted) {
      assert.equal(actual.publication_allowed, false, fixtureCase.id)
    }
  }

  const identity = fixture.artifact_cases.find(
    (fixtureCase) => fixtureCase.id === 'artifact-valid-bounded-stream'
  )
  const identityResult = evaluateArtifactCase(identity, fixture)
  assert.equal(identityResult.compressed_bytes_accepted, 500)
  assert.equal(identityResult.uncompressed_bytes_accepted, 500)
  assert.equal(
    identityResult.computed_sha256,
    '33873650e5f9307c9ee93f71c559f6b2e20b71f327d6372bd50d6dba390e6e1d'
  )
  assert.equal(
    evaluateArtifactCase(
      {
        ...identity,
        expected_size_bytes: 1,
        expected_sha256:
          'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        allowed_mime_types: ['application/octet-stream']
      },
      fixture
    ).accepted,
    true
  )

  const checksumMismatch = fixture.artifact_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'artifact-checksum-validation-rejected'
  )
  const attackerReadback = {
    ...fixture.artifact_readback_observations.valid,
    reported_sha256:
      '439ec46335685b64fa8d1c10e6217c6e1e4077b807232e49515404f43affe2c6'
  }
  assert.equal(
    evaluateArtifactCase(
      { ...checksumMismatch, readback_observation: 'attacker_matching' },
      {
        ...fixture,
        artifact_readback_observations: {
          ...fixture.artifact_readback_observations,
          attacker_matching: attackerReadback
        }
      }
    ).reason,
    'artifact_checksum_mismatch'
  )
  for (const [field, value] of [
    ['resolved_adapter_id', 'other-adapter'],
    ['resolved_environment', 'staging'],
    ['resolved_service_principal_id', 'provider-attacker'],
    ['resolved_operation_profile', 'media.other'],
    ['resolved_network_profile', 'submit'],
    ['provider_artifact_id', 'artifact_9999']
  ]) {
    const handleId = identity.resolver.handle_id
    const mutatedFixture = {
      ...fixture,
      artifact_resolver_records: {
        ...fixture.artifact_resolver_records,
        [handleId]: {
          ...fixture.artifact_resolver_records[handleId],
          [field]: value
        }
      }
    }
    const result = evaluateArtifactCase(
      identity,
      mutatedFixture
    )
    assert.equal(result.reason, 'handle_resolution_failed', field)
    assert.equal(result.socket_connects, 0, field)
  }

  const gzipSuccess = fixture.artifact_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'artifact-valid-bounded-gzip-stream'
  )
  const gzipSuccessResult = evaluateArtifactCase(gzipSuccess, fixture)
  assert.equal(gzipSuccessResult.accepted, true)
  assert.equal(gzipSuccessResult.compressed_bytes_accepted, 158)
  assert.equal(gzipSuccessResult.uncompressed_bytes_accepted, 1000)
  assert.equal(
    gzipSuccessResult.computed_sha256,
    '3383925488c11d4f88a909aeca63c6d6cb3213e1ac494123a4aeb07d790d1313'
  )

  const gzipLimit = fixture.artifact_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'artifact-uncompressed-stream-oversize-aborts'
  )
  const gzipLimitResult = evaluateArtifactCase(gzipLimit, fixture)
  assert.equal(gzipLimitResult.compressed_bytes_accepted, 757)
  assert.equal(gzipLimitResult.uncompressed_bytes_accepted, 3000)

  const unauthenticatedReadback = fixture.artifact_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'artifact-unauthenticated-readback-rejected'
  )
  assert.equal(
    evaluateArtifactCase(unauthenticatedReadback, fixture).reason,
    'artifact_readback_authentication_failed'
  )

  const closedPublication = fixture.artifact_cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'artifact-closed-publication-gate-quarantines'
  )
  const attemptedOverride = evaluateArtifactCase(
    closedPublication,
    fixture,
    { publication_allowed: true }
  )
  assert.equal(attemptedOverride.accepted, false)
  assert.equal(attemptedOverride.reason, 'publication_closed')
})

test('callback remains default-off and rejects replay stale mutated oversized input', () => {
  assert.deepEqual(validateCallbackBodyVectors(fixture.callback_bodies), {
    vectorCount: 7
  })
  assert.deepEqual(
    validateCallbackCases(fixture.callback_cases, fixture, validators),
    { acceptedCount: 3, caseCount: 30, rejectedCount: 27 }
  )

  const requiredIds = idsFor('callback_cases')
  for (const id of [
    'callback-default-disabled-rejected',
    'callback-replay-rejected',
    'callback-stale-timestamp-rejected',
    'callback-raw-byte-encoding-mutation-rejected',
    'callback-content-encoding-rejected',
    'callback-oversize-rejected-before-parse',
    'callback-invalid-utf8-rejected-after-authentication',
    'callback-unknown-field-rejected',
    'callback-progress-value-exceeds-max-rejected',
    'callback-cross-adapter-scope-rejected',
    'callback-event-before-submission-rejected',
    'callback-old-key-overlap-accepted',
    'callback-retired-key-rejected',
    'callback-source-acl-rejected',
    'callback-rate-limit-rejected',
    'callback-invalid-mtls-rejected',
    'callback-auth-mode-switch-rejected',
    'callback-new-nonce-duplicate-event-rejected',
    'callback-reordered-sequence-rejected',
    'callback-sequence-gap-triggers-polling',
    'callback-method-mutation-rejected',
    'callback-path-mutation-rejected',
    'callback-signed-timestamp-mutation-rejected',
    'callback-signed-nonce-mutation-rejected',
    'callback-unknown-algorithm-rejected',
    'callback-malformed-signature-token-rejected',
    'callback-unknown-key-rejected',
    'callback-revoked-key-rejected'
  ]) {
    assert.ok(requiredIds.has(id), id)
  }

  for (const fixtureCase of fixture.callback_cases) {
    const actual = evaluateCallbackCase(fixtureCase, fixture, validators)
    assert.equal(actual.polling_authority, true, fixtureCase.id)
    if (!actual.accepted) {
      assert.equal(actual.sequence_cursor_advanced, false, fixtureCase.id)
    }
  }
  const validSignature = fixture.callback_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'callback-valid-raw-signature-accepted'
  )
  assert.equal(
    deriveCallbackSignature(
      fixture.callback_profile,
      validSignature.key_id,
      validSignature,
      Buffer.from(fixture.callback_bodies[validSignature.body].raw)
    ),
    validSignature.signature_hex
  )
  for (const mutation of [
    { method: 'GET' },
    { path: '/callbacks/fixture-adapter/other' },
    { timestamp: '2026-08-27T09:00:01Z' },
    { nonce: 'nonce-mutated' }
  ]) {
    assert.notEqual(
      deriveCallbackSignature(
        fixture.callback_profile,
        validSignature.key_id,
        { ...validSignature, ...mutation },
        Buffer.from(fixture.callback_bodies[validSignature.body].raw)
      ),
      validSignature.signature_hex
    )
  }
  assert.notEqual(
    deriveCallbackSignature(
      fixture.callback_profile,
      validSignature.key_id,
      validSignature,
      Buffer.from(fixture.callback_bodies.whitespace_mutated.raw)
    ),
    validSignature.signature_hex
  )
  assert.notEqual(
    deriveCallbackSignature(
      fixture.callback_profile,
      'key-2026a',
      validSignature,
      Buffer.from(fixture.callback_bodies[validSignature.body].raw)
    ),
    validSignature.signature_hex
  )

  for (const vector of [
    {
      id: 'callback-raw-byte-encoding-mutation-rejected',
      baseline: {},
      body: 'valid'
    },
    {
      id: 'callback-method-mutation-rejected',
      baseline: { method: 'POST' },
      body: 'valid'
    },
    {
      id: 'callback-path-mutation-rejected',
      baseline: { path: '/callbacks/fixture-adapter/events' },
      body: 'valid'
    },
    {
      id: 'callback-signed-timestamp-mutation-rejected',
      baseline: { timestamp: '2026-08-27T09:00:00Z' },
      body: 'valid'
    },
    {
      id: 'callback-signed-nonce-mutation-rejected',
      baseline: { nonce: 'nonce-original' },
      body: 'valid'
    }
  ]) {
    const hostile = fixture.callback_cases.find(
      (fixtureCase) => fixtureCase.id === vector.id
    )
    assert.equal(
      deriveCallbackSignature(
        fixture.callback_profile,
        hostile.key_id,
        { ...hostile, ...vector.baseline },
        Buffer.from(fixture.callback_bodies[vector.body].raw)
      ),
      hostile.signature_hex,
      vector.id
    )
  }

  const validMtls = fixture.callback_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'callback-valid-mtls-accepted'
  )
  const wrongTrustFixture = {
    ...fixture,
    callback_profile: {
      ...fixture.callback_profile,
      auth_profiles: {
        ...fixture.callback_profile.auth_profiles,
        mtls: {
          ...fixture.callback_profile.auth_profiles.mtls,
          trust_bundle_sha256:
            'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
        }
      }
    }
  }
  assert.equal(
    evaluateCallbackCase(
      validMtls,
      wrongTrustFixture,
      validators
    ).reason,
    'mtls_identity_rejected'
  )
  assert.equal(
    evaluateCallbackCase(
      { ...validMtls, body: 'whitespace_mutated' },
      fixture,
      validators
    ).reason,
    'mtls_identity_rejected'
  )
  assert.equal(
    evaluateCallbackCase(
      validMtls,
      {
        ...fixture,
        callback_profile: {
          ...fixture.callback_profile,
          auth_profiles: {
            ...fixture.callback_profile.auth_profiles,
            mtls: {
              ...fixture.callback_profile.auth_profiles.mtls,
              revoked: true
            }
          }
        }
      },
      validators
    ).reason,
    'mtls_identity_rejected'
  )
})

test('terminal and progress evaluator preserves poll authority and immutability', () => {
  assert.deepEqual(
    validateStatusSequenceCases(
      fixture.status_sequence_cases,
      fixture,
      validators
    ),
    { caseCount: 8, rejectedCount: 6 }
  )

  const pushCase = fixture.status_sequence_cases.find(
    (fixtureCase) => fixtureCase.id === 'status-push-terminal-not-authoritative'
  )
  assert.deepEqual(evaluateStatusSequenceCase(pushCase, fixture, validators), {
    accepted: true,
    reason: null,
    confirmed_terminal: null
  })

  const mutationCase = fixture.status_sequence_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'status-terminal-content-mutation-rejected'
  )
  assert.equal(
    evaluateStatusSequenceCase(mutationCase, fixture, validators).reason,
    'terminal_content_mutation'
  )
  const identityDrift = fixture.status_sequence_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'status-item-identity-drift-rejected'
  )
  assert.equal(
    evaluateStatusSequenceCase(
      identityDrift,
      fixture,
      validators
    ).reason,
    'item_identity_drift'
  )
})

test('lifecycle evaluator preserves lookup publication quarantine and read-back', () => {
  assert.deepEqual(
    validateLifecycleCases(fixture.cases, fixture, validators),
    {
    caseCount: 24
    }
  )

  const requiredIds = idsFor('cases')
  for (const id of [
    'submission-before-journal-commit-rejected',
    'lost-submit-response',
    'duplicate-submit-without-lookup-rejected',
    'interrupt-races-external-success',
    'restart-orphan-running',
    'provider-terminal-conflict',
    'whole-node-deadline-expired',
    'staged-artifact-quarantined-on-publication-close',
    'normal-success',
    'push-terminal-remains-advisory',
    'publication-close-precedes-late-success',
    'authoritative-failure-closes-publication',
    'spontaneous-provider-cancel-closes-publication',
    'terminal-to-nonterminal-poll-rejected',
    'cancel-response-cannot-overwrite-confirmed-terminal',
    'cancel-observed-success-requires-fresh-poll',
    'cancel-observed-success-defers-to-fresh-failed-poll',
    'post-completion-artifact-is-quarantined'
  ]) {
    assert.ok(requiredIds.has(id), id)
  }

  const success = fixture.cases.find(
    (fixtureCase) => fixtureCase.id === 'normal-success'
  )
  const successResult = evaluateLifecycleCase(
    success,
    fixture,
    validators
  )
  assert.equal(
    success.events.find(
      (event) => event.kind === 'artifact_contract_result'
    ).artifact_case_id,
    'artifact-valid-bounded-gzip-stream'
  )
  assert.equal(successResult.authenticated_poll_confirmed, true)
  assert.equal(successResult.checksum_readback_confirmed, true)
  assert.equal(successResult.comfy_core_terminal, 'completed')
  assert.equal(successResult.adapter_emits_execution_success, false)
  assert.equal(successResult.publication_allowed, false)
  const wrongArtifactResult = evaluateLifecycleCase(
    {
      ...success,
      events: success.events.map((event) =>
        event.kind === 'artifact_contract_result'
          ? {
              ...event,
              artifact_case_id: 'artifact-valid-bounded-stream'
            }
          : event
      )
    },
    fixture,
    validators
  )
  assert.equal(wrongArtifactResult.node_returns_outputs, false)
  assert.equal(wrongArtifactResult.output_file_published, false)

  const duplicateSubmit = fixture.cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'duplicate-submit-without-lookup-rejected'
  )
  const duplicateSubmitResult = evaluateLifecycleCase(
    duplicateSubmit,
    fixture,
    validators
  )
  assert.equal(duplicateSubmitResult.provider_job_count, 1)
  assert.equal(
    duplicateSubmitResult.safe_code,
    'SUBMISSION_RETRY_NOT_AUTHORIZED'
  )

  // Terminal-conflict precedence: a second authenticated terminal poll that
  // disagrees with the confirmed terminal is classified as a terminal
  // conflict even though it also regresses progress and observed_at, which
  // are lower-priority cross-poll protocol checks.
  const terminalConflict = fixture.cases.find(
    (fixtureCase) => fixtureCase.id === 'provider-terminal-conflict'
  )
  const terminalConflictResult = evaluateLifecycleCase(
    terminalConflict,
    fixture,
    validators
  )
  assert.equal(terminalConflictResult.safe_code, 'EXTERNAL_TERMINAL_CONFLICT')
  assert.equal(
    terminalConflictResult.publication_closed_reason,
    'provider_terminal_conflict'
  )
  assert.equal(terminalConflictResult.authenticated_poll_confirmed, true)
  assert.equal(terminalConflictResult.external_terminal, 'succeeded')
  assert.equal(terminalConflictResult.provider_terminal_overwritten, false)
  const conflictingPoll = terminalConflict.events[1]
  assert.equal(conflictingPoll.kind, 'authoritative_status')
  assert.equal(
    conflictingPoll.mutations.some(
      (mutation) => mutation.path.join('.') === 'progress.value'
    ),
    false
  )
  const staleConflictResult = evaluateLifecycleCase(
    {
      ...terminalConflict,
      events: [
        terminalConflict.events[0],
        {
          ...conflictingPoll,
          mutations: conflictingPoll.mutations.map((mutation) =>
            mutation.path.join('.') === 'observed_at'
              ? { ...mutation, value: '2026-08-27T09:00:59Z' }
              : mutation
          )
        }
      ]
    },
    fixture,
    validators
  )
  assert.equal(staleConflictResult.safe_code, 'EXTERNAL_TERMINAL_CONFLICT')
  assert.equal(
    staleConflictResult.publication_closed_reason,
    'provider_terminal_conflict'
  )
  // Same-terminal content mutation stays a protocol error: only disagreement
  // about the terminal outcome earns the terminal-conflict classification.
  const sameTerminalMutationResult = evaluateLifecycleCase(
    {
      ...terminalConflict,
      events: [
        terminalConflict.events[0],
        {
          kind: 'authoritative_status',
          document: conflictingPoll.document,
          mutations: [
            { op: 'set', path: ['observed_at'], value: '2026-08-27T09:01:01Z' },
            { op: 'set', path: ['status'], value: 'succeeded' },
            { op: 'set', path: ['progress', 'value'], value: 10 },
            { op: 'set', path: ['next_poll_after_seconds'], value: null },
            {
              op: 'set',
              path: ['item_outcomes', 0, 'status'],
              value: 'succeeded'
            },
            {
              op: 'set',
              path: ['warnings'],
              value: [{ code: 'PROGRESS_RECONCILED' }]
            }
          ]
        }
      ]
    },
    fixture,
    validators
  )
  assert.equal(
    sameTerminalMutationResult.safe_code,
    'PROVIDER_PROTOCOL_ERROR'
  )
  assert.equal(
    sameTerminalMutationResult.publication_closed_reason,
    'provider_terminal_conflict'
  )
  assert.equal(sameTerminalMutationResult.external_terminal, 'succeeded')
  assert.equal(sameTerminalMutationResult.publication_allowed, false)

  const cancelConflict = fixture.cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'cancel-response-cannot-overwrite-confirmed-terminal'
  )
  const cancelConflictResult = evaluateLifecycleCase(
    cancelConflict,
    fixture,
    validators
  )
  assert.equal(cancelConflictResult.external_terminal, 'succeeded')
  assert.equal(cancelConflictResult.provider_terminal_overwritten, false)

  const cancelObservedSuccess = fixture.cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'cancel-observed-success-requires-fresh-poll'
  )
  const cancelObservedResult = evaluateLifecycleCase(
    cancelObservedSuccess,
    fixture,
    validators
  )
  assert.equal(cancelObservedResult.node_returns_outputs, false)
  assert.equal(
    cancelObservedResult.safe_code,
    'TERMINAL_NOT_POLL_CONFIRMED'
  )
  const freshFailed = fixture.cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'cancel-observed-success-defers-to-fresh-failed-poll'
  )
  assert.equal(
    evaluateLifecycleCase(
      freshFailed,
      fixture,
      validators
    ).external_terminal,
    'failed'
  )

  const postCompletion = fixture.cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'post-completion-artifact-is-quarantined'
  )
  assert.equal(
    evaluateLifecycleCase(postCompletion, fixture, validators)
      .late_artifact_destination,
    'private_quarantine'
  )

  for (const id of [
    'interrupt-races-external-success',
    'restart-orphan-running',
    'whole-node-deadline-expired',
    'staged-artifact-quarantined-on-publication-close',
    'publication-close-precedes-late-success'
  ]) {
    const fixtureCase = fixture.cases.find((entry) => entry.id === id)
    assert.equal(
      evaluateLifecycleCase(
        fixtureCase,
        fixture,
        validators
      ).publication_allowed,
      false,
      id
    )
  }
})

test('Odesign status receipts are closed semantic projections', () => {
  assert.deepEqual(
    validateOdesignStatusReceiptCases(
      fixture.odesign_status_receipt_cases,
      fixture.odesign_status_receipt_shape,
      validators,
      fixture
    ),
    {
      acceptedCount: 12,
      caseCount: 13,
      operationCounts: { StaticAd: 6, Shorts: 6 },
      rejectedCount: 1,
      statusCounts: {
        accepted: 2,
        awaiting_approval: 2,
        running: 2,
        outcome_unknown: 2,
        succeeded: 2,
        failed: 2
      }
    }
  )

  const receiptCases = idsFor('odesign_status_receipt_cases')
  for (const id of [
    'odesign-staticad-awaiting-approval-fails-omarketing-prompt',
    'odesign-shorts-awaiting-approval-fails-omarketing-prompt',
    'odesign-staticad-outcome-unknown-closes-publication',
    'odesign-shorts-outcome-unknown-closes-publication',
    'odesign-staticad-accepted-receipt',
    'odesign-shorts-accepted-receipt',
    'odesign-staticad-running-receipt',
    'odesign-shorts-running-receipt',
    'odesign-staticad-succeeded-receipt-requires-readback',
    'odesign-shorts-succeeded-receipt-requires-readback',
    'odesign-staticad-failed-receipt-closes-publication',
    'odesign-shorts-failed-receipt-closes-publication',
    'odesign-unknown-label-rejected'
  ]) {
    assert.equal(receiptCases.has(id), true, id)
  }

  const awaiting = fixture.odesign_status_receipt_cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'odesign-staticad-awaiting-approval-fails-omarketing-prompt'
  )
  assert.deepEqual(
    evaluateOdesignStatusReceiptCase(
      awaiting,
      fixture.odesign_status_receipt_shape,
      validators,
      fixture
    ),
    awaiting.expected
  )
  assert.equal(
    evaluateOdesignStatusReceiptCase(
      { ...awaiting, guidance_code: null },
      fixture.odesign_status_receipt_shape,
      validators,
      fixture
    ).reason,
    'receipt_guidance_mismatch'
  )
  assert.equal(
    evaluateOdesignStatusReceiptCase(
      { ...awaiting, omarketing_projection: 'running' },
      fixture.odesign_status_receipt_shape,
      validators,
      fixture
    ).reason,
    'receipt_projection_mismatch'
  )
  assert.equal(
    evaluateOdesignStatusReceiptCase(
      { ...awaiting, publication: 'open' },
      fixture.odesign_status_receipt_shape,
      validators,
      fixture
    ).reason,
    'receipt_publication_mismatch'
  )
  assert.equal(
    evaluateOdesignStatusReceiptCase(
      { ...awaiting, prompt_waiting: true },
      fixture.odesign_status_receipt_shape,
      validators,
      fixture
    ).reason,
    'awaiting_approval_prompt_open'
  )
  assert.equal(
    evaluateOdesignStatusReceiptCase(
      { ...awaiting, safe_failure_code: 'APPROVAL_REQUIRED' },
      fixture.odesign_status_receipt_shape,
      validators,
      fixture
    ).reason,
    'awaiting_approval_safe_code_not_allowlisted'
  )
  assert.equal(
    evaluateOdesignStatusReceiptCase(
      {
        ...awaiting,
        guidance: 'Approve at https://odesign.example/run/1'
      },
      fixture.odesign_status_receipt_shape,
      validators,
      fixture
    ).reason,
    'awaiting_approval_failure_metadata_invalid'
  )

  const unknownOutcome = fixture.odesign_status_receipt_cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'odesign-shorts-outcome-unknown-closes-publication'
  )
  assert.equal(
    evaluateOdesignStatusReceiptCase(
      { ...unknownOutcome, resubmission_allowed: true },
      fixture.odesign_status_receipt_shape,
      validators,
      fixture
    ).reason,
    'outcome_unknown_resubmission_allowed'
  )

  const succeeded = fixture.odesign_status_receipt_cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'odesign-staticad-succeeded-receipt-requires-readback'
  )
  assert.equal(
    evaluateOdesignStatusReceiptCase(
      { ...succeeded, evidence: ['fresh_authenticated_poll'] },
      fixture.odesign_status_receipt_shape,
      validators,
      fixture
    ).reason,
    'succeeded_evidence_incomplete'
  )

  const accepted = fixture.odesign_status_receipt_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'odesign-staticad-accepted-receipt'
  )
  const acceptedReceipt = {
    schema_version: 'omarketing.odesign-status-receipt.v1',
    operation: accepted.operation,
    external_run_id: accepted.external_run_id,
    odesign_status: accepted.odesign_status,
    omarketing_projection: 'accepted',
    guidance_code: null,
    observed_at: accepted.observed_at,
    publication: 'open',
    lookup_before_retry: false,
    unexpected: 'reject me'
  }
  assert.equal(
    evaluateOdesignStatusReceiptCase({
      ...accepted,
      receipt: acceptedReceipt
    }).reason,
    'receipt_unknown_field'
  )
  assert.equal(
    evaluateOdesignStatusReceiptCase({
      ...accepted,
      expected: { ...accepted.expected, unexpected: 'reject me' }
    }).reason,
    'receipt_unknown_field'
  )
})

test('safe text evaluator rejects private URLs credentials and local paths', () => {
  assert.deepEqual(validateSafeTextCases(fixture.safe_text_cases), {
    caseCount: 5,
    rejectedCount: 4
  })
  assert.equal(isSafeText('The request could not be completed.'), true)
  assert.equal(isSafeText('Bearer fixture-token'), false)
  assert.equal(isSafeText('http://127.0.0.1/private'), false)
})

test('contract evaluator has no provider or network execution surface', () => {
  const validatorSource = readFileSync(
    new URL('./validate-external-lifecycle-contract.mjs', import.meta.url),
    'utf8'
  )
  for (const forbiddenSource of [
    "from 'node:dns'",
    "from 'node:http'",
    "from 'node:https'",
    'fetch(',
    'process.env',
    'XMLHttpRequest',
    'WebSocket'
  ]) {
    assert.equal(
      validatorSource.includes(forbiddenSource),
      false,
      forbiddenSource
    )
  }
})

test('contract retains the reviewed lifecycle security controls', () => {
  const contract = readFileSync(contractPath, 'utf8').replace(/\s+/g, ' ')
  for (const preservedText of [
    'This contract chooses deterministic re-derivation.',
    '`oj1.<key_secret_version>.<digest>`',
    'Startup/orphan reconciliation never submits work for a dead invocation',
    'query by idempotency key before retrying submission',
    'Automatic redirects are disabled for submit, lookup, status, cancel, and artifact clients.',
    'including IPv4-mapped IPv6',
    '`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`',
    'Push delivery is disabled by default for every provider and environment.',
    'exact received body bytes',
    'two separate atomic uniqueness keys',
    'the exact reviewed algorithm binds the received method',
    'The only normalized artifact reference is:',
    '`compressed_byte_limit`, `uncompressed_byte_limit`, and `decompression_ratio_limit`',
    'Completing the bounded stream sets only a private `stream_accepted` fact.',
    'Local publication authority wins.',
    'Authoritative status lookup wins over events and cached polls.',
    'private quarantine namespace outside Comfy outputs',
    'fresh authenticated status lookup',
    'artifact checksum read-back',
    'Schema validation and the deterministic semantic evaluator are one mandatory boundary.',
    'A committed entry missing any derivation field',
    'The registry entry for `APPROVAL_REQUIRED_IN_ODDESIGN` is fixed as non-retryable, category `POLICY`, localized message key',
    '`omarketing.external.approval_required_in_odesign`',
    '`complete_approval_in_odesign_then_start_a_new_prompt`',
    'No URL, provider prose, or retryable/category/remediation override is accepted.',
    'The `awaiting_approval` receipt MUST carry a schema-valid',
    '`external-job-error.v1` document using this code',
    '`<COMFY_USER_DIRECTORY>/omarketing/v1/external-lifecycle/`',
    'journals/<scope_id>/dispatch-journal.json',
    'locks/<scope_id>.lock',
    'leases/reconciler.lease',
    'receipts/<scope_id>.json',
    'quarantine/',
    'records/<scope_id>/<artifact_id>.metadata.json',
    'bytes/<scope_id>/<artifact_id>.bytes',
    'incident-holds/<scope_id>.json',
    'For Odesign v1, HMAC push and its callback listener are unreachable',
    'no route, listener, setting, or toggle may enable them',
    'polling remains authoritative.'
  ]) {
    assert.ok(contract.includes(preservedText), preservedText)
  }
})

test('aggregate validator covers every executable external lifecycle artifact', () => {
  assert.deepEqual(validateAll(), {
    artifactCaseCount: 25,
    artifactRejectedCount: 23,
    callbackAcceptedCount: 3,
    callbackBodyVectorCount: 7,
    callbackCaseCount: 30,
    callbackRejectedCount: 27,
    documentInvariantCaseCount: 26,
    documentInvariantRejectedCount: 22,
    fixtureIdCount: 224,
    idempotencyVectorCount: 2,
    lifecycleCaseCount: 24,
    negativeSchemaCaseCount: 48,
    networkBlockedCount: 18,
    networkCaseCount: 23,
    odesignStatusReceiptAcceptedCount: 12,
    odesignStatusReceiptCaseCount: 13,
    odesignStatusReceiptOperationCounts: { StaticAd: 6, Shorts: 6 },
    odesignStatusReceiptRejectedCount: 1,
    odesignStatusReceiptStatusCounts: {
      accepted: 2,
      awaiting_approval: 2,
      running: 2,
      outcome_unknown: 2,
      succeeded: 2,
      failed: 2
    },
    positiveSchemaCaseCount: 10,
    recoveryCaseCount: 12,
    safeTextCaseCount: 5,
    safeTextRejectedCount: 4,
    schemaCaseCount: 58,
    schemaCount: 9,
    statusSequenceCaseCount: 8,
    statusSequenceRejectedCount: 6
  })
})
