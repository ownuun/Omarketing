import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  collectFixtureIds,
  compileSchemas,
  contractPath,
  evaluateRevokeCase,
  expectedSchemaNames,
  loadAuthContract,
  parseJsonDocument,
  validateAll,
  validateClockCases,
  validateDeploymentProfiles,
  validateDurableStoreCases,
  validateFirstReleaseAuthPolicyCases,
  validateMaintenanceRestoreCases,
  validateRawJsonCases,
  validateRevokeCases,
  validateRouteCases,
  validateSchemaCases,
  validateStagingProfileCases,
  validateWebsocketSlaCases
} from './validate-auth-contract.mjs'

const { fixture, schemas } = loadAuthContract()
const validators = compileSchemas(schemas)

function assertClosedObjects(value, location) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertClosedObjects(entry, `${location}[${index}]`)
    )
    return
  }
  if (!value || typeof value !== 'object') return

  if (value.type === 'object') {
    assert.equal(
      value.additionalProperties,
      false,
      `${location} must reject additional properties`
    )
  }
  for (const [key, entry] of Object.entries(value)) {
    assertClosedObjects(entry, `${location}.${key}`)
  }
}

test('auth fixture JSON has globally unique case ids', () => {
  assert.equal(fixture.schema_version, 1)
  assert.equal(collectFixtureIds(fixture).length, 73)
})

test('S2 deployment profile and staging window remain contract-only', () => {
  assert.deepEqual(validateDeploymentProfiles(fixture.deployment_profiles), {
    caseCount: 1
  })
  assert.deepEqual(
    validateStagingProfileCases(fixture.staging_profile_cases),
    { caseCount: 5, stepCount: 9 }
  )

  const concurrent = structuredClone(fixture.deployment_profiles)
  concurrent[0].concurrent_activation = true
  assert.throws(
    () => validateDeploymentProfiles(concurrent),
    /auth-gateway-staging-v1/
  )

  const sharedRoots = structuredClone(fixture.deployment_profiles)
  sharedRoots[0].separate_staging_roots.auth_database = 'production/auth.sqlite'
  assert.throws(
    () => validateDeploymentProfiles(sharedRoots),
    /auth-gateway-staging-v1/
  )

  const nonzeroPrecondition = structuredClone(fixture.staging_profile_cases)
  nonzeroPrecondition[0].preflight.external_provider_work = 1
  assert.throws(
    () => validateStagingProfileCases(nonzeroPrecondition),
    /staging-profile-v1-happy-sequential-window/
  )

  const reordered = structuredClone(fixture.staging_profile_cases)
  reordered[0].steps.reverse()
  assert.throws(
    () => validateStagingProfileCases(reordered),
    /staging-profile-v1-happy-sequential-window/
  )

  const missingStep = structuredClone(fixture.staging_profile_cases)
  missingStep[0].steps.splice(4, 1)
  assert.throws(
    () => validateStagingProfileCases(missingStep),
    /staging-profile-v1-happy-sequential-window/
  )

  const unknownPrecondition = structuredClone(fixture.staging_profile_cases)
  unknownPrecondition[0].preflight.external_provider_work = 'unknown'
  assert.throws(
    () => validateStagingProfileCases(unknownPrecondition),
    /staging-profile-v1-happy-sequential-window/
  )

  const crossOrigin = structuredClone(fixture.staging_profile_cases)
  crossOrigin[3].checks[0].expected.accepted = true
  assert.throws(
    () => validateStagingProfileCases(crossOrigin),
    /staging-profile-v1-cross-origin-rejection/
  )

  const autoRetry = structuredClone(fixture.staging_profile_cases)
  autoRetry[4].expected.automatic_retry = true
  assert.throws(
    () => validateStagingProfileCases(autoRetry),
    /staging-profile-v1-failure-restores-only-after-verification/
  )

  const unverifiedRestore = structuredClone(fixture.staging_profile_cases)
  unverifiedRestore[4].expected.prior_production_restore_requires_verification = false
  assert.throws(
    () => validateStagingProfileCases(unverifiedRestore),
    /staging-profile-v1-failure-restores-only-after-verification/
  )
})

test('durable auth state is one SQLite behind the gateway boundary', () => {
  assert.deepEqual(validateDurableStoreCases(fixture.durable_store_cases), {
    caseCount: 2
  })

  const altered = structuredClone(fixture.durable_store_cases)
  altered[0].expected.running_gateway_operator_cli.direct_sqlite_open = true
  assert.throws(
    () => validateDurableStoreCases(altered),
    /topology-one-process-one-sqlite/
  )

  const tcpFallback = structuredClone(fixture.durable_store_cases)
  tcpFallback[0].expected.running_gateway_operator_cli.channel.tcp = true
  assert.throws(
    () => validateDurableStoreCases(tcpFallback),
    /topology-one-process-one-sqlite/
  )

  const wrongPeerAuth = structuredClone(fixture.durable_store_cases)
  wrongPeerAuth[0].expected.running_gateway_operator_cli.channel.peer_credentials.macos =
    'SO_PEERCRED'
  assert.throws(
    () => validateDurableStoreCases(wrongPeerAuth),
    /topology-one-process-one-sqlite/
  )

  const wrongPeerUid = structuredClone(fixture.durable_store_cases)
  wrongPeerUid[0].expected.running_gateway_operator_cli.channel.peer_credentials.requires_exact_configured_operator_uid =
    false
  assert.throws(
    () => validateDurableStoreCases(wrongPeerUid),
    /topology-one-process-one-sqlite/
  )

  const permissiveSocket = structuredClone(fixture.durable_store_cases)
  permissiveSocket[0].expected.running_gateway_operator_cli.channel.socket_mode =
    '0666'
  assert.throws(
    () => validateDurableStoreCases(permissiveSocket),
    /topology-one-process-one-sqlite/
  )

  const extra = structuredClone(fixture.durable_store_cases)
  extra[1].expected.integrity_failure = 'replace_with_empty_database'
  assert.throws(
    () => validateDurableStoreCases(extra),
    /sqlite-operational-defaults-v1/
  )
})

test('maintenance restore ordering, invalidation, credential version, and cooldown are fail-closed', () => {
  assert.deepEqual(
    validateMaintenanceRestoreCases(fixture.maintenance_restore_cases),
    { caseCount: 2, orderedStepCount: 5 }
  )

  const reordered = structuredClone(fixture.maintenance_restore_cases)
  reordered[0].steps.reverse()
  assert.throws(
    () => validateMaintenanceRestoreCases(reordered),
    /ordered maintenance semantics/
  )

  const reopened = structuredClone(fixture.maintenance_restore_cases)
  reopened[1].expected.empty_replacement_created = true
  assert.throws(
    () => validateMaintenanceRestoreCases(reopened),
    /restore-integrity-failure-stays-closed/
  )
})

test('websocket revocation and natural-expiry SLAs start at the right boundary', () => {
  assert.deepEqual(
    validateWebsocketSlaCases(fixture.websocket_sla_cases),
    { caseCount: 2, eventCount: 4 }
  )

  const lateDrop = structuredClone(fixture.websocket_sla_cases)
  lateDrop[0].events[0].expected.frames_dropped_immediately = false
  assert.throws(
    () => validateWebsocketSlaCases(lateDrop),
    /websocket-explicit-revoke-sla-starts-at-commit/
  )

  const wrongBoundary = structuredClone(fixture.websocket_sla_cases)
  wrongBoundary[1].events[0].at = 'within_5_seconds'
  assert.throws(
    () => validateWebsocketSlaCases(wrongBoundary),
    /starts its SLA/
  )
})

test('first-release H2 policy is strict and contract-only', () => {
  assert.deepEqual(
    validateFirstReleaseAuthPolicyCases(
      fixture.first_release_auth_policy_cases
    ),
    { caseCount: 1, localCoreSurfaceCount: 7 }
  )

  const missingProperty = structuredClone(
    fixture.first_release_auth_policy_cases
  )
  delete missingProperty[0].policy.single_owner

  const extraProperty = structuredClone(
    fixture.first_release_auth_policy_cases
  )
  extraProperty[0].policy.visible_comfy_control_acceptable = true

  const reversedPolicy = structuredClone(
    fixture.first_release_auth_policy_cases
  )
  reversedPolicy[0].policy.comfy_signin_ui = true

  const driftedPolicy = structuredClone(
    fixture.first_release_auth_policy_cases
  )
  driftedPolicy[0].policy.local_core_surfaces[0] = 'Projects'

  for (const invalidCases of [
    missingProperty,
    extraProperty,
    driftedPolicy,
    reversedPolicy
  ]) {
    assert.throws(
      () => validateFirstReleaseAuthPolicyCases(invalidCases),
      /authoritative contract/
    )
  }
})

test('route fixtures are all evaluated as contract-only policy evidence', () => {
  assert.deepEqual(
    validateRouteCases(fixture.cases, fixture.canonical_origin),
    { caseCount: 19 }
  )
})

test('Draft 2020-12 auth schemas compile with strict closed objects', () => {
  assert.deepEqual([...schemas.keys()].sort(), [...expectedSchemaNames])

  for (const [name, schema] of schemas) {
    assert.equal(
      schema.$schema,
      'https://json-schema.org/draft/2020-12/schema',
      name
    )
    assert.ok(schema.required.includes('schema_version'), name)
    assert.equal(schema.properties.schema_version.type, 'integer', name)
    assert.equal(schema.properties.schema_version.const, 1, name)
    assertClosedObjects(schema, name)
  }

  const login = schemas.get('auth-login-request.v1.schema.json')
  assert.equal(login.properties.username.maxLength, 128)
  assert.equal(login.properties.password.maxLength, 1024)

  const session = schemas.get('auth-session-response.v1.schema.json')
  for (const property of ['idle_expires_at', 'absolute_expires_at']) {
    assert.equal(session.properties[property].format, 'date-time')
    assert.equal(session.properties[property].pattern, 'Z$')
  }

  const error = schemas.get('auth-error-response.v1.schema.json')
  assert.deepEqual(error.properties.error.properties.code.enum, [
    'INVALID_REQUEST',
    'INVALID_CREDENTIALS',
    'AUTH_REQUIRED',
    'CSRF_REJECTED',
    'RATE_LIMITED',
    'SERVICE_UNAVAILABLE'
  ])
})

test('positive and hostile schema fixtures validate as declared', () => {
  assert.deepEqual(validateSchemaCases(fixture.schema_cases, validators), {
    caseCount: 23,
    negativeCount: 17,
    positiveCount: 6
  })

  for (const schemaName of expectedSchemaNames) {
    const cases = fixture.schema_cases.filter(
      (fixtureCase) => fixtureCase.schema === schemaName
    )
    assert.ok(cases.some((fixtureCase) => fixtureCase.valid), schemaName)
    assert.ok(cases.some((fixtureCase) => !fixtureCase.valid), schemaName)
  }

  const hostileIds = new Set(
    fixture.schema_cases
      .filter((fixtureCase) => !fixtureCase.valid)
      .map((fixtureCase) => fixtureCase.id)
  )
  for (const requiredId of [
    'schema-login-unknown-credential-rejected',
    'schema-login-unknown-url-rejected',
    'schema-login-extra-role-rejected',
    'schema-session-malformed-timestamp-rejected',
    'schema-session-credential-metadata-rejected',
    'schema-revoke-all-sessions-url-rejected'
  ]) {
    assert.ok(hostileIds.has(requiredId), requiredId)
  }
})

test('raw JSON parser rejects literal and escaped duplicate properties', () => {
  assert.deepEqual(validateRawJsonCases(fixture.raw_json_cases, validators), {
    caseCount: 3,
    negativeCount: 2,
    positiveCount: 1
  })
  assert.throws(
    () =>
      parseJsonDocument(
        '{"username":"owner","user\\u006eame":"shadow"}',
        'escaped duplicate'
      ),
    (error) => error.code === 'DUPLICATE_PROPERTY'
  )
})

test('fake clock enforces non-touch idle and immutable absolute expiry', () => {
  assert.deepEqual(
    fixture.activity_policy.refreshing_routes.map((route) => route.path_match),
    ['/', '/api/**', '/internal/**', '/view*']
  )
  assert.deepEqual(fixture.activity_policy.non_touch_events, [
    'auth_session_observation',
    'other_auth_request',
    'websocket_upgrade',
    'websocket_frame',
    'websocket_expiry_check',
    'extension_static',
    'template_static',
    'public_build_asset',
    'rejected_request',
    'cross_origin_preflight',
    'policy_rejected_request'
  ])
  assert.deepEqual(
    validateClockCases(
      fixture.session_clock_cases,
      fixture.activity_policy
    ),
    { caseCount: 6, eventCount: 17 }
  )

  const pollingCase = fixture.session_clock_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'clock-session-observation-does-not-refresh-idle'
  )
  assert.equal(pollingCase.events.at(-1).expected.authentication_status, 401)

  const activityCase = fixture.session_clock_cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'clock-allowlisted-application-request-refreshes-idle'
  )
  assert.equal(activityCase.events[0].expected.activity_refreshed, true)

  const absoluteCase = fixture.session_clock_cases.find(
    (fixtureCase) =>
      fixtureCase.id === 'clock-absolute-expiry-remains-immutable'
  )
  assert.equal(
    absoluteCase.events[1].expected.absolute_expires_at,
    absoluteCase.initial.absolute_expires_at
  )
  assert.equal(absoluteCase.events[1].expected.activity_refreshed, true)
  assert.equal(
    absoluteCase.events.at(-1).expected.websocket_closed_within_seconds,
    5
  )
  assert.equal(
    absoluteCase.events.at(-1).expected.late_upstream_frame_dropped,
    true
  )
})

test('revoke-all unknown, rate-limit, and duplicate outcomes converge', () => {
  assert.deepEqual(
    validateRevokeCases(fixture.revoke_all_convergence_cases, validators),
    { caseCount: 9, stepCount: 41 }
  )

  const requiredIds = new Set([
    'revoke-before-commit-request-drop-converges',
    'revoke-after-commit-response-loss-converges',
    'revoke-5xx-outcome-remains-unknown-until-convergence',
    'revoke-401-does-not-confirm-prior-commit',
    'revoke-429-waits-without-confirming',
    'revoke-duplicate-after-lost-response-stays-unknown',
    'revoke-malformed-200-remains-unknown-until-convergence',
    'revoke-lost-429-response-converges-after-reauth',
    'revoke-429-then-401-requires-reauth-convergence'
  ])
  assert.deepEqual(
    new Set(
      fixture.revoke_all_convergence_cases.map(
        (fixtureCase) => fixtureCase.id
      )
    ),
    requiredIds
  )

  for (const fixtureCase of fixture.revoke_all_convergence_cases) {
    for (const step of fixtureCase.steps) {
      if (step.expected_client_state === 'confirmed') {
        assert.equal(step.status, 200, fixtureCase.id)
      }
    }
  }

  const malformed = fixture.revoke_all_convergence_cases.find(
    (fixtureCase) =>
      fixtureCase.id ===
      'revoke-malformed-200-remains-unknown-until-convergence'
  )
  assert.equal(
    malformed.steps[0].expected_client_state,
    'revoke_outcome_unknown'
  )
})

test('revoke-all cannot bypass an outstanding Retry-After', () => {
  assert.throws(
    () =>
      evaluateRevokeCase(
        {
          id: 'synthetic-immediate-retry',
          steps: [
            {
              kind: 'revoke_request',
              transport: 'response_delivered',
              server_commit: 'not_committed',
              status: 429,
              retry_after_seconds: 30,
              body: {
                schema_version: 1,
                error: {
                  code: 'RATE_LIMITED',
                  message: 'Too many requests.',
                  retry_after_seconds: 30
                }
              },
              expected_client_state: 'not_confirmed_rate_limited'
            },
            {
              kind: 'revoke_request',
              transport: 'response_delivered',
              server_commit: 'committed',
              status: 200,
              body: {
                schema_version: 1,
                revoked: true,
                revoked_session_count: 1
              },
              expected_client_state: 'confirmed'
            }
          ],
          expected: {}
        },
        validators
      ),
    /retried before honoring Retry-After/
  )
})

test('contract keeps security controls and the decided H2 disposition', () => {
  const contract = readFileSync(contractPath, 'utf8')
  const normalizedContract = contract.replace(/\s+/g, ' ')
  for (const preservedText of [
    'MUST be default-denied until added to a reviewed contract',
    '`Origin` MUST be present and exactly equal to the canonical public origin',
    '`Sec-Fetch-Site` MUST be present and exactly `same-origin`',
    'Set-Cookie: __Host-omarketing_session=<opaque>; Path=/; Secure; HttpOnly; SameSite=Strict',
    'MUST consume and remove `__Host-omarketing_session` before proxying',
    'MUST strip client-supplied `X-Omarketing-*`, `Forwarded`, `X-Forwarded-*`',
    'bind the upstream/downstream socket pair to the validated `session_id_hash`',
    'force-close both directions within 5 seconds',
    '`owner_user_id` is derived from the authenticated session',
    'Every Comfy sign-in and API-key control MUST be hidden and unreachable',
    'A visible Comfy control is not acceptable',
    'MUST NOT solicit, create, or rely on `comfy_api_key`',
    'retained source is not a supported v1 entry point',
    'gateway access password and session are separate',
    'Local Workflows, Templates, Nodes, Assets, Queue, History, and Omarketing MUST remain available',
    'later implementation proof requirements',
    'presentation allowlist is a separate Tower gate',
    'The policy itself is resolved; only implementation evidence remains open',
    'Versioned TEST/staging deployment profile (D2/S2)',
    'This section is an explicit contract-only profile for the approved sequential TEST/staging maintenance window',
    'does not authorize a server start/restart, production write/deploy, credentials, or external calls',
    'same configured Tailscale hostname with a different explicit staging effective port',
    'Failure, interruption, or `outcome_unknown` at any step MUST block promotion',
    'An unknown external outcome MUST never be auto-retried',
    'Listeners MUST remain closed whenever state is uncertain',
    'This route is a non-touch observation',
    'Only receipt of that schema-valid `200` is confirmation',
    'duplicate object member names',
    'contract-artifact evidence only'
  ]) {
    assert.ok(normalizedContract.includes(preservedText), preservedText)
  }
  assert.ok(!normalizedContract.includes('H2 remains outside this lane'))
})

test('aggregate validator covers every executable auth artifact', () => {
  assert.deepEqual(validateAll(), {
    clockCaseCount: 6,
    clockEventCount: 17,
    deploymentProfileCaseCount: 1,
    durableStoreCaseCount: 2,
    firstReleaseAuthPolicyCaseCount: 1,
    fixtureIdCount: 73,
    localCoreSurfaceCount: 7,
    maintenanceRestoreCaseCount: 2,
    negativeSchemaCaseCount: 17,
    positiveSchemaCaseCount: 6,
    rawJsonCaseCount: 3,
    rawJsonNegativeCount: 2,
    rawJsonPositiveCount: 1,
    revokeCaseCount: 9,
    revokeStepCount: 41,
    routeCaseCount: 19,
    schemaCaseCount: 23,
    schemaCount: 5,
    stagingProfileCaseCount: 5,
    stagingStepCount: 9,
    websocketSlaCaseCount: 2
  })
})
