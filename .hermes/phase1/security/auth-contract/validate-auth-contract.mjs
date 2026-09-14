import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const moduleDirectory = dirname(fileURLToPath(import.meta.url))

export const repoRoot = resolve(moduleDirectory, '../../../..')
export const fixturePath = join(
  repoRoot,
  '.hermes/phase0/fixtures/auth-gateway.cases.json'
)
export const schemaDirectory = join(repoRoot, '.hermes/phase0/schemas')
export const contractPath = join(
  repoRoot,
  '.hermes/phase0/contracts/auth-gateway.md'
)

export const expectedSchemaNames = Object.freeze([
  'auth-error-response.v1.schema.json',
  'auth-login-request.v1.schema.json',
  'auth-logout-response.v1.schema.json',
  'auth-revoke-all-response.v1.schema.json',
  'auth-session-response.v1.schema.json'
])

const fixtureCollections = Object.freeze([
  'deployment_profiles',
  'staging_profile_cases',
  'first_release_auth_policy_cases',
  'durable_store_cases',
  'maintenance_restore_cases',
  'websocket_sla_cases',
  'cases',
  'schema_cases',
  'raw_json_cases',
  'session_clock_cases',
  'revoke_all_convergence_cases'
])

const expectedDeploymentProfile = Object.freeze({
  id: 'auth-gateway-staging-v1',
  environment: 'TEST/staging',
  profile_version: 1,
  strategy: 'S2_sequential_same_hostname_different_port',
  production_origin: 'https://omarketing.example.invalid',
  staging_origin: 'https://omarketing.example.invalid:8443',
  production_effective_port: 443,
  staging_effective_port: 8443,
  concurrent_activation: false,
  session_non_interference_claim: false,
  host_cookie_port_isolation: false,
  tailscale_only: true,
  shared_listener: false,
  origin_wildcard: false,
  staging_port_omission: false,
  redirect_or_cookie_fallback: false,
  browser_credential_storage: false,
  separate_staging_roots: {
    directory: 'staging-v1',
    config: 'staging-v1/config',
    auth_database: 'staging-v1/auth.sqlite',
    data: 'staging-v1/data',
    output: 'staging-v1/output',
    quarantine: 'staging-v1/quarantine'
  },
  active_state_copy: {
    sessions: false,
    credentials: false,
    provider_secrets: false
  },
  credential_action_authorized_now: false,
  implementation_proven: false,
  production_ready: false
})

const expectedDurableStoreTopology = Object.freeze({
  gateway_process_count: 1,
  configured_sqlite_database_count: 1,
  runtime_database_owner: 'omarketing-auth-gateway',
  running_gateway_operator_cli: {
    transport: 'restrictive_local_operator_ipc_control_channel',
    gateway_performs_transaction: true,
    direct_sqlite_open: false,
    requires_console_or_ssh: true,
    channel: {
      family: 'AF_UNIX',
      socket_type: 'SOCK_STREAM',
      local_only: true,
      tcp: false,
      loopback_http: false,
      inherited_anonymous_pipe: false,
      network_fallback: false,
      socket_directory_mode: '0700',
      socket_mode: '0600',
      socket_owner: 'gateway_os_account',
      peer_credentials: {
        macos: 'getpeereid',
        linux: 'SO_PEERCRED',
        requires_exact_configured_operator_uid: true,
        requires_gateway_owned_socket: true,
        unavailable_or_mismatch: 'live_ipc_disabled_offline_maintenance_only'
      },
      http_origin_routes_reach_socket: false
    },
    message_protocol: {
      schema_version: 1,
      request_fields: {
        common: ['schema_version', 'request_id', 'correlation_id', 'command'],
        password_replace_additional: ['password'],
        revoke_all_additional: [],
        status_additional: []
      },
      response_fields: {
        common: [
          'schema_version',
          'request_id',
          'correlation_id',
          'command',
          'outcome'
        ],
        password_replace_committed_additional: ['credential_version'],
        revoke_all_committed_additional: ['revoked_session_count']
      },
      commands: ['password_replace', 'revoke_all', 'status'],
      frame_max_bytes: 16384,
      framing: {
        length_prefix_bytes: 4,
        length_prefix_encoding: 'big_endian',
        payload_encoding: 'UTF-8_JSON_object',
        prefix_plus_payload_max_bytes: 16384
      },
      duplicate_fields_rejected: true,
      unknown_fields_rejected: true,
      unsupported_versions_rejected: true,
      arbitrary_paths_allowed: false,
      sql_allowed: false,
      urls_allowed: false,
      request_id: {
        required: true,
        fresh_cryptographic_random: true,
        encoding: 'base64url_without_padding',
        random_bytes: 32,
        length_characters: 43,
        replay: 'rejected_before_transaction'
      }
    },
    password_input: {
      source: ['cli_stdin', 'cli_tty'],
      sent_once: true,
      echoed: false,
      logged: false,
      persisted_in_ipc_traces: false,
      returned_in_response: false,
      zeroized_as_runtime_permits: true,
      length_bounded: true,
      recovery_input_uses_same_rules: true
    },
    response_semantics: {
      success_requires: ['delivered_response', 'schema_valid', 'committed'],
      response_loss_state: 'operator_outcome_unknown',
      false_success_sources: [
        'socket_closure',
        'timeout',
        'malformed_response',
        'unknown_response'
      ],
      status_query: 'read_only_new_request_id_same_correlation_id',
      retry_requires: 'newly_confirmed_operator_command'
    }
  },
  offline_database_access: [
    'offline_emergency_recovery',
    'migration_tool',
    'backup_restore_tool'
  ],
  offline_access_requires: ['gateway_stopped', 'exclusive_maintenance_fence'],
  zero_database_access: ['custom_node', 'provider_adapter', 'comfy_bridge'],
  prohibited: [
    'postgresql',
    'redis',
    'alternate_database',
    'alternate_cache',
    'in_memory_session_fallback',
    'in_memory_limiter_fallback'
  ],
  database_scope: [
    'owner_credential_metadata',
    'credential_version',
    'sessions',
    'rate_limit_windows',
    'rate_limit_counters',
    'revocation_facts',
    'restore_epoch'
  ],
  excluded_scope: [
    'project_context',
    'selection_sidecar',
    'external_job_journal',
    'Run',
    'Asset',
    'Workflow',
    'provider_payloads',
    'signed_urls',
    'credentials',
    'secrets'
  ],
  awaiting_approval_next_action_owner: 'Odesign',
  omarketing_approval_mutation: false,
  implementation_proven: false,
  production_ready: false
})

const expectedSqliteOperationalDefaults = Object.freeze({
  foreign_keys: true,
  journal_mode: 'WAL',
  synchronous: 'FULL',
  application_id_check: true,
  schema_id_check: true,
  write_transaction: 'BEGIN IMMEDIATE',
  write_lock_order: [
    'owner_credential',
    'sessions_and_revocations',
    'rate_limit_windows',
    'restore_epoch'
  ],
  busy_timeout_ms: 1000,
  busy_behavior: '503_SERVICE_UNAVAILABLE_no_unbounded_retry',
  wal_autocheckpoint_pages: 1000,
  wal_checkpoint: {
    mode: 'PASSIVE',
    maximum_interval_seconds: 300,
    requires_no_write_transaction: true,
    blocking_modes_reserved_for_maintenance: ['FULL', 'RESTART', 'TRUNCATE']
  },
  terminal_record_retention_seconds: 7776000,
  backup_cadence_seconds: 86400,
  backup_retained_count: 14,
  backup_api: 'sqlite_backup',
  integrity_failure: 'fail_closed_no_empty_replacement',
  implementation_proven: false,
  production_ready: false
})

const dependencyVersions = Object.freeze({
  ajv: '8.20.0',
  'ajv-formats': '3.0.1'
})

const expectedFirstReleaseAuthPolicyCase = Object.freeze({
  id: 'h2-first-release-auth-policy',
  policy: Object.freeze({
    contract_only: true,
    single_owner: true,
    signup: false,
    public_registration: false,
    accounts: false,
    user_account_ui: false,
    roles: false,
    teams: false,
    invites: false,
    multi_user_ui: false,
    comfy_signin_ui: false,
    comfy_api_key_ui: false,
    comfy_api_key_solicited: false,
    comfy_api_key_created: false,
    comfy_api_key_used: false,
    comfy_org_identity_authority: false,
    upstream_auth_source_retained: true,
    upstream_auth_supported_entry_point: false,
    gateway_boundary_server_owned: true,
    gateway_password_server_verified: true,
    gateway_password_rate_limited: true,
    gateway_session_server_issued: true,
    gateway_session_http_only_cookie: true,
    gateway_password_browser_storage: false,
    gateway_password_workflow_project_data: false,
    gateway_password_prompt_bodies: false,
    gateway_password_urls: false,
    gateway_password_logs: false,
    gateway_password_telemetry: false,
    gateway_password_comfy_requests: false,
    gateway_password_provider_requests: false,
    local_core_surfaces_preserved: true,
    local_core_surfaces: Object.freeze([
      'Workflows',
      'Templates',
      'Nodes',
      'Assets',
      'Queue',
      'History',
      'Omarketing'
    ]),
    implementation_proven: false,
    production_ready: false
  })
})

function duplicatePropertyError(label, property) {
  const error = new SyntaxError(
    `${label} contains duplicate object property ${JSON.stringify(property)}`
  )
  error.code = 'DUPLICATE_PROPERTY'
  return error
}

export function parseJsonDocument(source, label = 'JSON document') {
  assert.equal(typeof source, 'string', `${label} must be a string`)
  let index = 0

  function fail(message) {
    throw new SyntaxError(`${label}: ${message} at offset ${index}`)
  }

  function skipWhitespace() {
    while (/[\t\n\r ]/.test(source[index] ?? '')) index += 1
  }

  function parseString() {
    if (source[index] !== '"') fail('expected string')
    const start = index
    index += 1
    let escaped = false

    while (index < source.length) {
      const character = source[index]
      index += 1
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        return JSON.parse(source.slice(start, index))
      }
    }
    fail('unterminated string')
  }

  function parsePrimitive() {
    const match =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        source.slice(index)
      )
    if (!match) fail('invalid value')
    index += match[0].length
  }

  function parseArray() {
    index += 1
    skipWhitespace()
    if (source[index] === ']') {
      index += 1
      return
    }

    while (true) {
      parseValue()
      skipWhitespace()
      if (source[index] === ']') {
        index += 1
        return
      }
      if (source[index] !== ',') fail('expected comma or closing bracket')
      index += 1
      skipWhitespace()
    }
  }

  function parseObject() {
    index += 1
    skipWhitespace()
    const properties = new Set()
    if (source[index] === '}') {
      index += 1
      return
    }

    while (true) {
      const property = parseString()
      if (properties.has(property)) {
        throw duplicatePropertyError(label, property)
      }
      properties.add(property)
      skipWhitespace()
      if (source[index] !== ':') fail('expected colon')
      index += 1
      skipWhitespace()
      parseValue()
      skipWhitespace()
      if (source[index] === '}') {
        index += 1
        return
      }
      if (source[index] !== ',') fail('expected comma or closing brace')
      index += 1
      skipWhitespace()
    }
  }

  function parseValue() {
    skipWhitespace()
    if (source[index] === '{') parseObject()
    else if (source[index] === '[') parseArray()
    else if (source[index] === '"') parseString()
    else parsePrimitive()
  }

  parseValue()
  skipWhitespace()
  if (index !== source.length) fail('unexpected trailing content')
  return JSON.parse(source)
}

function parseJson(path) {
  try {
    return parseJsonDocument(readFileSync(path, 'utf8'), path)
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${path}: ${error.message}`, {
      cause: error
    })
  }
}

function findInstalledPackage(packageName, expectedVersion) {
  const discoveredVersions = new Set()
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`, {
      paths: [repoRoot]
    })
    const metadata = parseJson(packageJsonPath)
    discoveredVersions.add(metadata.version)
    if (metadata.version === expectedVersion) return dirname(packageJsonPath)
  } catch (error) {
    if (
      error.code !== 'MODULE_NOT_FOUND' &&
      error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    ) {
      throw error
    }
  }

  const pnpmDirectory = join(repoRoot, 'node_modules/.pnpm')
  for (const entry of readdirSync(pnpmDirectory).sort()) {
    const packageJsonPath = join(
      pnpmDirectory,
      entry,
      'node_modules',
      packageName,
      'package.json'
    )

    try {
      const metadata = parseJsonDocument(
        readFileSync(packageJsonPath, 'utf8'),
        packageJsonPath
      )
      if (metadata.name === packageName) {
        discoveredVersions.add(metadata.version)
        if (metadata.version === expectedVersion) {
          return dirname(packageJsonPath)
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  throw new Error(
    `Required existing ${packageName}@${expectedVersion} is unavailable ` +
      `(found: ${[...discoveredVersions].sort().join(', ') || 'none'}); ` +
      'no install was attempted.'
  )
}

function createAjv() {
  const ajvDirectory = findInstalledPackage('ajv', dependencyVersions.ajv)
  const formatsDirectory = findInstalledPackage(
    'ajv-formats',
    dependencyVersions['ajv-formats']
  )
  const formatsAjv = parseJson(join(formatsDirectory, '../ajv/package.json'))
  assert.equal(
    formatsAjv.version,
    dependencyVersions.ajv,
    'ajv-formats must resolve the pinned Ajv compiler'
  )
  const AjvModule = require(join(ajvDirectory, 'dist/2020.js'))
  const formatsModule = require(formatsDirectory)
  const Ajv2020 = AjvModule.default ?? AjvModule
  const addFormats = formatsModule.default ?? formatsModule
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: false,
    coerceTypes: false,
    removeAdditional: false,
    strict: true,
    useDefaults: false,
    validateFormats: true
  })
  addFormats(ajv)
  return ajv
}

export function loadAuthContract() {
  const fixture = parseJson(fixturePath)
  const schemaNames = readdirSync(schemaDirectory)
    .filter((name) => /^auth-.*\.v1\.schema\.json$/.test(name))
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
    'Auth fixture case ids must be globally unique'
  )
  return ids
}

export function validateFirstReleaseAuthPolicyCases(policyCases) {
  assert.ok(
    Array.isArray(policyCases),
    'first_release_auth_policy_cases must be an array'
  )
  assert.equal(
    policyCases.length,
    1,
    'first_release_auth_policy_cases must contain exactly one case'
  )
  assert.deepEqual(
    policyCases[0],
    expectedFirstReleaseAuthPolicyCase,
    'First-release H2 policy must exactly match the authoritative contract'
  )

  return {
    caseCount: policyCases.length,
    localCoreSurfaceCount:
      expectedFirstReleaseAuthPolicyCase.policy.local_core_surfaces.length
  }
}

function assertCollectionCaseIds(cases, expectedIds, label) {
  assert.ok(Array.isArray(cases), `${label} must be an array`)
  assert.deepEqual(
    cases.map((fixtureCase) => fixtureCase.id),
    expectedIds,
    `${label} ids changed without updating the executable contract`
  )
}

const expectedStagingStepOrder = Object.freeze([
  'production_logout_revoke_and_socket_closure',
  'stop_and_fence_production_profile',
  'snapshot_readback_prior_production_directory_config_origin',
  'switch_to_separate_staging_directory_config_auth_db_origin_and_roots',
  'staging_login_test_logout',
  'verify_staging_sessions_zero_and_websockets_zero',
  'stop_and_fence_staging_profile',
  'restore_exact_prior_production_directory_config_origin_after_verification',
  'production_reauthentication'
])

export function validateDeploymentProfiles(deploymentProfiles) {
  assertCollectionCaseIds(
    deploymentProfiles,
    ['auth-gateway-staging-v1'],
    'deployment_profiles'
  )
  const profile = deploymentProfiles[0]
  assert.deepEqual(
    profile,
    expectedDeploymentProfile,
    `${profile.id} deployment profile`
  )
  assert.equal(
    profile.production_origin,
    'https://omarketing.example.invalid',
    `${profile.id} exact production origin`
  )
  assert.equal(
    profile.staging_origin,
    'https://omarketing.example.invalid:8443',
    `${profile.id} explicit staging origin`
  )
  assert.notEqual(
    profile.production_origin,
    profile.staging_origin,
    `${profile.id} staging must use separate origin`
  )
  assert.equal(profile.production_effective_port, 443, `${profile.id} production port`)
  assert.equal(profile.staging_effective_port, 8443, `${profile.id} staging port`)
  assert.equal(profile.concurrent_activation, false, `${profile.id} concurrent activation`)
  assert.equal(profile.session_non_interference_claim, false, `${profile.id} session isolation claim`)
  assert.equal(profile.tailscale_only, true, `${profile.id} Tailscale-only`)
  assert.equal(profile.credential_action_authorized_now, false, `${profile.id} credential authorization`)
  return { caseCount: deploymentProfiles.length }
}

function validateStagingPreflight(fixtureCase) {
  const { preflight } = fixtureCase
  assert.deepEqual(
    preflight,
    {
      active_production_sessions: 0,
      bound_production_websockets: 0,
      production_queue_or_running_prompts: 0,
      external_provider_work: 0,
      unknown_or_unavailable_counts_fail_closed: true
    },
    `${fixtureCase.id} four zero preconditions`
  )
}

export function validateStagingProfileCases(stagingProfileCases) {
  assertCollectionCaseIds(
    stagingProfileCases,
    [
      'staging-profile-v1-happy-sequential-window',
      'staging-profile-v1-hostile-active-production-precondition',
      'staging-profile-v1-hostile-unknown-provider-precondition',
      'staging-profile-v1-cross-origin-rejection',
      'staging-profile-v1-failure-restores-only-after-verification'
    ],
    'staging_profile_cases'
  )
  for (const fixtureCase of stagingProfileCases) {
    assert.equal(
      fixtureCase.profile,
      'auth-gateway-staging-v1',
      `${fixtureCase.id} profile`
    )
    assert.equal(
      fixtureCase.implementation_proven ?? fixtureCase.expected.implementation_proven,
      false,
      `${fixtureCase.id} implementation claim`
    )
    assert.equal(
      fixtureCase.expected.production_ready,
      false,
      `${fixtureCase.id} production claim`
    )
  }

  const happy = stagingProfileCases[0]
  assert.equal(happy.kind, 'sequential_maintenance_window', `${happy.id} kind`)
  validateStagingPreflight(happy)
  assert.deepEqual(
    happy.steps,
    expectedStagingStepOrder,
    `${happy.id} ordered sequential steps`
  )
  assert.deepEqual(
    happy.expected,
    {
      promotion_allowed: true,
      production_and_staging_concurrent: false,
      final_active_profile: 'production',
      production_reauthenticated: true,
      implementation_proven: false,
      production_ready: false
    },
    `${happy.id} outcome`
  )

  const active = stagingProfileCases[1]
  assert.equal(active.kind, 'preflight_rejection', `${active.id} kind`)
  assert.equal(active.preflight.active_production_sessions, 1, `${active.id} active session`)
  assert.deepEqual(
    active.expected,
    {
      promotion_allowed: false,
      production_logout_started: false,
      profile_switch_started: false,
      listeners_closed: false,
      implementation_proven: false,
      production_ready: false
    },
    `${active.id} blocks before logout or switch`
  )

  const unknown = stagingProfileCases[2]
  assert.equal(unknown.kind, 'preflight_rejection', `${unknown.id} kind`)
  assert.equal(unknown.preflight.external_provider_work, 'unknown', `${unknown.id} unknown count`)
  assert.deepEqual(
    unknown.expected,
    {
      promotion_allowed: false,
      production_logout_started: false,
      profile_switch_started: false,
      listeners_closed: false,
      implementation_proven: false,
      production_ready: false
    },
    `${unknown.id} blocks before logout or switch`
  )

  const origins = stagingProfileCases[3]
  assert.equal(origins.kind, 'exact_origin_boundary', `${origins.id} kind`)
  assert.deepEqual(
    origins.checks,
    [
      {
        active_profile: 'production',
        request_origin: 'https://omarketing.example.invalid:8443',
        expected: { accepted: false, reason: 'origin_mismatch' }
      },
      {
        active_profile: 'staging',
        request_origin: 'https://omarketing.example.invalid',
        expected: { accepted: false, reason: 'origin_mismatch' }
      },
      {
        active_profile: 'staging',
        request_origin: 'https://omarketing.example.invalid:8443',
        expected: { accepted: true }
      }
    ],
    `${origins.id} exact origin checks`
  )
  assert.deepEqual(
    origins.expected,
    {
      wildcard_accepted: false,
      port_omission_accepted: false,
      redirect_or_cookie_fallback: false,
      implementation_proven: false,
      production_ready: false
    },
    `${origins.id} origin boundary outcome`
  )

  const failure = stagingProfileCases[4]
  assert.equal(failure.kind, 'failure_or_unknown_restoration', `${failure.id} kind`)
  assert.deepEqual(
    failure.failure,
    {
      step: 'staging_test',
      outcomes_blocking_promotion: ['failure', 'interruption', 'outcome_unknown'],
      outcome: 'outcome_unknown'
    },
    `${failure.id} failure outcomes`
  )
  assert.deepEqual(
    failure.expected,
    {
      promotion_allowed: false,
      automatic_retry: false,
      listeners_closed_while_uncertain: true,
      prior_production_restore_requires_verification: true,
      prior_production_directory_restored: true,
      prior_production_origin_restored: true,
      production_reauthentication_required: true,
      implementation_proven: false,
      production_ready: false
    },
    `${failure.id} restoration outcome`
  )

  return { caseCount: stagingProfileCases.length, stepCount: happy.steps.length }
}

export function validateDurableStoreCases(durableStoreCases) {
  assertCollectionCaseIds(
    durableStoreCases,
    ['topology-one-process-one-sqlite', 'sqlite-operational-defaults-v1'],
    'durable_store_cases'
  )

  const topology = durableStoreCases[0]
  assert.equal(topology.kind, 'durable_store_topology', topology.id)
  assert.deepEqual(topology.expected, expectedDurableStoreTopology, topology.id)

  const sqlite = durableStoreCases[1]
  assert.equal(sqlite.kind, 'sqlite_policy', sqlite.id)
  assert.deepEqual(
    sqlite.expected,
    expectedSqliteOperationalDefaults,
    sqlite.id
  )

  return { caseCount: durableStoreCases.length }
}

const expectedMaintenanceActions = Object.freeze([
  'stop_gateway_and_drain',
  'acquire_exclusive_lock',
  'verify_backup_receipt',
  'restore_and_advance_epoch',
  'recheck_and_reopen'
])

const expectedLimiterCooldownSeconds = Object.freeze({
  login: 900,
  failed_login: 900,
  logout_revoke_all: 60,
  websocket_upgrade: 300,
  other_protected_http: 300
})

export function validateMaintenanceRestoreCases(maintenanceRestoreCases) {
  assertCollectionCaseIds(
    maintenanceRestoreCases,
    [
      'restore-fence-epoch-credential-limiter-and-reopen',
      'restore-integrity-failure-stays-closed'
    ],
    'maintenance_restore_cases'
  )

  const [restore, integrityFailure] = maintenanceRestoreCases
  assert.equal(restore.kind, 'maintenance_restore', restore.id)
  assert.deepEqual(
    restore.steps.map((step) => step.action),
    expectedMaintenanceActions,
    `${restore.id} must preserve ordered maintenance semantics`
  )
  assert.deepEqual(
    restore.steps[0].expected,
    {
      gateway_stopped: true,
      connected_clients: 0
    },
    `${restore.id} stop_gateway_and_drain`
  )
  assert.deepEqual(
    restore.steps[1].expected,
    {
      database_and_wal_shm_locked: true
    },
    `${restore.id} acquire_exclusive_lock`
  )
  assert.deepEqual(
    restore.steps[2].expected,
    {
      consistent_sqlite_backup_api: true,
      checksum_verified: true,
      application_id_verified: true,
      schema_id_verified: true,
      restore_epoch_verified: true,
      integrity_verified: true,
      rollback_copy_written: true
    },
    `${restore.id} verify_backup_receipt`
  )
  assert.deepEqual(
    restore.steps[3].expected,
    {
      restore_epoch_advanced: true,
      all_restored_sessions_invalidated: true,
      current_credential: 'preserved_and_credential_version_advanced',
      credential_version_advanced: true,
      limiter_policy: 'full_window_cooldown'
    },
    `${restore.id} restore_and_advance_epoch`
  )
  assert.deepEqual(
    restore.steps[4].expected,
    {
      application_id_verified: true,
      schema_id_verified: true,
      integrity_verified: true,
      receipt_recorded: true,
      gateway_reopened: true
    },
    `${restore.id} recheck_and_reopen`
  )
  assert.deepEqual(
    restore.expected,
    {
      implementation_proven: false,
      production_ready: false,
      limiter_cooldown_seconds: expectedLimiterCooldownSeconds
    },
    `${restore.id} final expected state`
  )

  assert.equal(
    integrityFailure.kind,
    'maintenance_restore',
    integrityFailure.id
  )
  assert.deepEqual(
    integrityFailure.input,
    { integrity_check: 'failed' },
    `${integrityFailure.id} input`
  )
  assert.deepEqual(
    integrityFailure.expected,
    {
      gateway_reopened: false,
      empty_replacement_created: false,
      rollback_copy_retained: true,
      operator_replacement_required: true,
      implementation_proven: false,
      production_ready: false
    },
    `${integrityFailure.id} final expected state`
  )

  return {
    caseCount: maintenanceRestoreCases.length,
    orderedStepCount: expectedMaintenanceActions.length
  }
}

function validateWebsocketSlaEvents(fixtureCase, expectedStart) {
  assert.ok(Array.isArray(fixtureCase.events), `${fixtureCase.id} events`)
  assert.deepEqual(
    fixtureCase.events.map((event) => event.at),
    [expectedStart, 'within_5_seconds'],
    `${fixtureCase.id} starts its SLA at the committed/detected boundary`
  )
  assert.deepEqual(
    fixtureCase.events[0].expected,
    {
      frames_dropped_immediately: true,
      sla_clock_started: true
    },
    `${fixtureCase.id} ${fixtureCase.events[0].at} expected`
  )
  assert.deepEqual(
    fixtureCase.events[1].expected,
    {
      upstream_direction_force_closed: true,
      downstream_direction_force_closed: true,
      websockets_closed_within_seconds: 5
    },
    `${fixtureCase.id} ${fixtureCase.events[1].at} expected`
  )
  assert.ok(
    fixtureCase.events[1].expected.websockets_closed_within_seconds <= 5,
    `${fixtureCase.id} websocket close SLA must be at most five seconds`
  )
}

export function validateWebsocketSlaCases(websocketSlaCases) {
  assertCollectionCaseIds(
    websocketSlaCases,
    [
      'websocket-explicit-revoke-sla-starts-at-commit',
      'websocket-natural-expiry-sla-starts-at-detection'
    ],
    'websocket_sla_cases'
  )

  const explicit = websocketSlaCases[0]
  assert.equal(explicit.kind, 'websocket_revocation_sla', explicit.id)
  assert.deepEqual(
    explicit.trigger,
    ['logout', 'revoke_all', 'password_replacement'],
    `${explicit.id} explicit triggers`
  )
  validateWebsocketSlaEvents(explicit, 'committed_unusable_marker')
  assert.deepEqual(
    explicit.expected,
    {
      sla_start: 'committed_unusable_marker',
      explicit_triggers: ['logout', 'revoke_all', 'password_replacement'],
      implementation_proven: false,
      production_ready: false
    },
    `${explicit.id} final expected state`
  )

  const natural = websocketSlaCases[1]
  assert.equal(natural.kind, 'websocket_expiry_sla', natural.id)
  assert.equal(natural.trigger, 'idle_or_absolute_expiry')
  validateWebsocketSlaEvents(natural, 'expiry_detection')
  assert.deepEqual(
    natural.expected,
    {
      sla_start: 'expiry_detection',
      natural_expiry_recheck_max_interval_seconds: 60,
      implementation_proven: false,
      production_ready: false
    },
    `${natural.id} final expected state`
  )
  assert.ok(
    natural.expected.natural_expiry_recheck_max_interval_seconds <= 60,
    `${natural.id} must detect natural expiry at least once per minute`
  )

  return { caseCount: websocketSlaCases.length, eventCount: 4 }
}

export function compileSchemas(schemas) {
  assert.deepEqual(
    [...schemas.keys()].sort(),
    [...expectedSchemaNames],
    'Auth schema set changed without updating the executable contract'
  )

  const ajv = createAjv()
  const validators = new Map()
  for (const [name, schema] of schemas) {
    validators.set(name, ajv.compile(schema))
  }
  return validators
}

function formatValidationErrors(validate) {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message}`)
    .join('; ')
}

export function validateSchemaCases(schemaCases, validators) {
  let positiveCount = 0
  let negativeCount = 0

  for (const fixtureCase of schemaCases) {
    const validate = validators.get(fixtureCase.schema)
    assert.ok(validate, `${fixtureCase.id} references an unknown schema`)
    assert.equal(
      typeof fixtureCase.valid,
      'boolean',
      `${fixtureCase.id} must declare valid`
    )

    const actual = validate(fixtureCase.document)
    assert.equal(
      actual,
      fixtureCase.valid,
      `${fixtureCase.id} validation mismatch: ${formatValidationErrors(validate)}`
    )

    if (fixtureCase.valid) positiveCount += 1
    else negativeCount += 1
  }

  return {
    caseCount: schemaCases.length,
    negativeCount,
    positiveCount
  }
}

export function validateRawJsonCases(rawJsonCases, validators) {
  let negativeCount = 0
  let positiveCount = 0

  for (const fixtureCase of rawJsonCases) {
    const validate = validators.get(fixtureCase.schema)
    assert.ok(validate, `${fixtureCase.id} references an unknown schema`)

    let document
    let parseError
    try {
      document = parseJsonDocument(
        fixtureCase.document_json,
        fixtureCase.id
      )
    } catch (error) {
      parseError = error
    }

    if (fixtureCase.valid) {
      assert.equal(parseError, undefined, `${fixtureCase.id} must parse`)
      assert.ok(
        validate(document),
        `${fixtureCase.id} failed schema validation: ${formatValidationErrors(validate)}`
      )
      positiveCount += 1
    } else {
      assert.ok(parseError, `${fixtureCase.id} unexpectedly parsed`)
      assert.equal(parseError.code, fixtureCase.error, fixtureCase.id)
      negativeCount += 1
    }
  }

  return {
    caseCount: rawJsonCases.length,
    negativeCount,
    positiveCount
  }
}

function assertExpectedSubset(actual, expected, label) {
  if (Array.isArray(expected) || expected === null || typeof expected !== 'object') {
    assert.deepEqual(actual, expected, label)
    return
  }

  assert.ok(actual && typeof actual === 'object', label)
  for (const [key, expectedValue] of Object.entries(expected)) {
    assert.ok(Object.hasOwn(actual, key), `${label} is missing ${key}`)
    assertExpectedSubset(actual[key], expectedValue, `${label}.${key}`)
  }
}

function isValidFixtureSession(session) {
  return typeof session === 'string' && session.startsWith('valid')
}

function passesUnsafeRequestPolicy(fixtureCase, canonicalOrigin) {
  return (
    fixtureCase.origin === canonicalOrigin &&
    fixtureCase.sec_fetch_site === 'same-origin'
  )
}

export function evaluateRouteCase(fixtureCase, canonicalOrigin) {
  const method = fixtureCase.method.toUpperCase()
  const url = new URL(fixtureCase.path, canonicalOrigin)
  const pathname = url.pathname
  const hasValidSession = isValidFixtureSession(fixtureCase.session)

  if (pathname === '/auth/login') {
    if (method === 'GET') {
      return {
        status: 200,
        content: 'self-contained-login',
        cache: 'no-store'
      }
    }
    if (!passesUnsafeRequestPolicy(fixtureCase, canonicalOrigin)) {
      return {
        status: 403,
        code: 'CSRF_REJECTED',
        password_hash_invoked: false
      }
    }
  }

  if (pathname === '/auth/logout') {
    if (!passesUnsafeRequestPolicy(fixtureCase, canonicalOrigin)) {
      return { status: 403, code: 'CSRF_REJECTED' }
    }
    return {
      status: 200,
      revoked: true,
      websockets_closed_within_seconds: hasValidSession ? 5 : 0,
      cookie_cleared: true,
      prior_session_disclosed: false
    }
  }

  if (pathname === '/auth/revoke-all') {
    if (!passesUnsafeRequestPolicy(fixtureCase, canonicalOrigin)) {
      return { status: 403, code: 'CSRF_REJECTED' }
    }
    if (!hasValidSession) {
      return { status: 401, code: 'AUTH_REQUIRED', html_redirect: false }
    }
    return {
      status: 200,
      all_owner_sessions_revoked: true,
      all_owner_websockets_closed_within_seconds: 5
    }
  }

  if (pathname === '/auth/session') {
    if (!hasValidSession) {
      return { status: 401, code: 'AUTH_REQUIRED', html_redirect: false }
    }
    return { status: 200 }
  }

  if (pathname === '/ws' && fixtureCase.upgrade === 'websocket') {
    const queryNames = [...url.searchParams.keys()]
    if (queryNames.some((name) => name !== 'clientId')) {
      return { status: 400, upgrade_accepted: false, secret_logged: false }
    }
    if (
      fixtureCase.origin !== canonicalOrigin ||
      (fixtureCase.sec_fetch_site !== undefined &&
        fixtureCase.sec_fetch_site !== 'same-origin')
    ) {
      return { status: 403, upgrade_accepted: false }
    }
    if (!hasValidSession) {
      return { status: 401, upgrade_accepted: false }
    }
    return { upgrade_accepted: true, bound_to_session: true }
  }

  const protectedPath =
    pathname === '/' ||
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/internal' ||
    pathname.startsWith('/internal/') ||
    pathname === '/extensions' ||
    pathname.startsWith('/extensions/') ||
    pathname === '/templates' ||
    pathname.startsWith('/templates/') ||
    pathname.startsWith('/view')

  if (!protectedPath) return { status: 404, proxy: false }

  if (!hasValidSession) {
    const navigation =
      pathname === '/' &&
      (method === 'GET' || method === 'HEAD') &&
      fixtureCase.sec_fetch_mode === 'navigate' &&
      fixtureCase.accept?.includes('text/html')
    if (navigation) {
      return { status: 303, location: '/auth/login?return_to=%2F' }
    }
    return { status: 401, code: 'AUTH_REQUIRED', html_redirect: false }
  }

  const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  if (unsafe && !passesUnsafeRequestPolicy(fixtureCase, canonicalOrigin)) {
    return { status: 403, code: 'CSRF_REJECTED', proxy: false }
  }

  if (fixtureCase.request_headers) {
    return {
      proxy: true,
      client_identity_headers_stripped: true,
      owner_identity_source: 'validated-session'
    }
  }
  if (fixtureCase.request_cookie_names) {
    return { proxy: true, gateway_session_cookie_forwarded: false }
  }
  return { proxy: true, custom_csrf_header_required: false }
}

export function validateRouteCases(routeCases, canonicalOrigin) {
  for (const fixtureCase of routeCases) {
    assertExpectedSubset(
      evaluateRouteCase(fixtureCase, canonicalOrigin),
      fixtureCase.expected,
      fixtureCase.id
    )
  }
  return { caseCount: routeCases.length }
}

function parseTimestamp(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a timestamp string`)
  assert.match(value, /Z$/, `${label} must be UTC`)
  const milliseconds = Date.parse(value)
  assert.ok(Number.isFinite(milliseconds), `${label} must be a valid timestamp`)
  return milliseconds
}

function formatTimestamp(milliseconds) {
  return new Date(milliseconds).toISOString().replace('.000Z', 'Z')
}

function routeMatches(pathname, pathMatch) {
  if (pathMatch === '/') return pathname === '/'
  if (pathMatch.endsWith('/**')) {
    const base = pathMatch.slice(0, -3)
    return pathname === base || pathname.startsWith(`${base}/`)
  }
  if (pathMatch.endsWith('*')) {
    return pathname.startsWith(pathMatch.slice(0, -1))
  }
  return pathname === pathMatch
}

function isAllowlistedActivity(event, activityPolicy) {
  if (activityPolicy.non_touch_events.includes(event.kind)) return false
  if (
    event.kind !== 'http_request' ||
    event.accepted !== true ||
    typeof event.method !== 'string' ||
    typeof event.path !== 'string'
  ) {
    return false
  }

  const method = event.method.toUpperCase()
  const url = new URL(event.path, 'https://omarketing.example.invalid')
  assert.equal(
    url.origin,
    'https://omarketing.example.invalid',
    'Clock fixture paths must remain local'
  )
  const rule = activityPolicy.refreshing_routes.find((candidate) =>
    routeMatches(url.pathname, candidate.path_match)
  )
  if (!rule) return false
  if (rule.methods === 'upstream-defined') return true
  return rule.methods.includes(method)
}

export function evaluateClockCase(fixtureCase, activityPolicy) {
  assert.equal(activityPolicy.idle_lifetime_seconds, 2592000)
  assert.equal(activityPolicy.absolute_lifetime_seconds, 7776000)

  const state = {
    absoluteExpiresAt: parseTimestamp(
      fixtureCase.initial.absolute_expires_at,
      `${fixtureCase.id}.initial.absolute_expires_at`
    ),
    createdAt: parseTimestamp(
      fixtureCase.initial.created_at,
      `${fixtureCase.id}.initial.created_at`
    ),
    idleExpiresAt: parseTimestamp(
      fixtureCase.initial.idle_expires_at,
      `${fixtureCase.id}.initial.idle_expires_at`
    ),
    lastSeenAt: parseTimestamp(
      fixtureCase.initial.last_seen_at,
      `${fixtureCase.id}.initial.last_seen_at`
    ),
    websocketOpen: false
  }

  assert.ok(state.createdAt <= state.lastSeenAt, `${fixtureCase.id} last_seen_at`)
  assert.ok(
    state.lastSeenAt <= state.idleExpiresAt,
    `${fixtureCase.id} idle_expires_at`
  )
  assert.ok(
    state.idleExpiresAt <= state.absoluteExpiresAt,
    `${fixtureCase.id} absolute_expires_at`
  )
  assert.equal(
    state.absoluteExpiresAt,
    state.createdAt + activityPolicy.absolute_lifetime_seconds * 1000,
    `${fixtureCase.id} absolute lifetime`
  )
  assert.equal(
    state.idleExpiresAt,
    Math.min(
      state.lastSeenAt + activityPolicy.idle_lifetime_seconds * 1000,
      state.absoluteExpiresAt
    ),
    `${fixtureCase.id} initial idle lifetime`
  )

  let previousEventAt = state.lastSeenAt
  const observations = []

  for (const event of fixtureCase.events) {
    const eventAt = parseTimestamp(event.at, `${fixtureCase.id}.${event.kind}.at`)
    assert.ok(
      eventAt >= previousEventAt,
      `${fixtureCase.id} events must be chronological`
    )
    previousEventAt = eventAt

    const expired =
      eventAt >= state.idleExpiresAt || eventAt >= state.absoluteExpiresAt
    const activityRefreshed =
      !expired && isAllowlistedActivity(event, activityPolicy)

    if (event.kind === 'websocket_upgrade') {
      assert.ok(!expired, `${fixtureCase.id} cannot open an expired socket`)
      state.websocketOpen = true
    } else if (event.kind === 'websocket_frame') {
      assert.ok(state.websocketOpen, `${fixtureCase.id} frame needs a live socket`)
      assert.ok(!expired, `${fixtureCase.id} frame arrived after expiry`)
    }

    if (activityRefreshed) {
      state.lastSeenAt = eventAt
      state.idleExpiresAt = Math.min(
        eventAt + activityPolicy.idle_lifetime_seconds * 1000,
        state.absoluteExpiresAt
      )
    }

    const actual = {
      authentication_status: expired ? 401 : 200,
      activity_refreshed: activityRefreshed,
      last_seen_at: formatTimestamp(state.lastSeenAt),
      idle_expires_at: formatTimestamp(state.idleExpiresAt),
      absolute_expires_at: formatTimestamp(state.absoluteExpiresAt)
    }
    if (event.kind === 'websocket_expiry_check') {
      assert.ok(expired, `${fixtureCase.id} socket check must occur at expiry`)
      assert.ok(
        state.websocketOpen,
        `${fixtureCase.id} socket check needs a registered live socket`
      )
      state.websocketOpen = false
      Object.assign(actual, {
        websocket_closed_within_seconds: 5,
        late_upstream_frame_dropped: true,
        reconnect_status: 401
      })
    }
    assert.deepEqual(actual, event.expected, `${fixtureCase.id} ${event.at}`)
    observations.push(actual)
  }

  return observations
}

export function validateClockCases(clockCases, activityPolicy) {
  let eventCount = 0
  for (const fixtureCase of clockCases) {
    eventCount += evaluateClockCase(fixtureCase, activityPolicy).length
  }
  return { caseCount: clockCases.length, eventCount }
}

function validateRevokeResponse(step, validators) {
  if (step.transport !== 'response_delivered') {
    assert.equal(step.status, undefined, 'Lost responses cannot expose a status')
    assert.equal(step.body, undefined, 'Lost responses cannot expose a body')
    return false
  }

  assert.equal(typeof step.status, 'number', 'Delivered responses need a status')
  const schemaName =
    step.status === 200
      ? 'auth-revoke-all-response.v1.schema.json'
      : 'auth-error-response.v1.schema.json'
  const validate = validators.get(schemaName)
  const valid = validate(step.body)
  if (step.status !== 200) {
    assert.ok(
      valid,
      `Revoke fixture response failed ${schemaName}: ${formatValidationErrors(validate)}`
    )
  }
  return valid
}

export function evaluateRevokeCase(fixtureCase, validators) {
  const state = {
    authenticated: true,
    clientState: 'pending',
    confirmationStatus: null,
    finalCallerSessionRevoked: false,
    localEphemeralClosed: false,
    lostCommittedResponse: false,
    reauthenticated: false,
    requiredRetryAfter: 0,
    waitedSeconds: 0
  }

  for (const step of fixtureCase.steps) {
    if (step.kind === 'close_local_ephemeral') {
      state.localEphemeralClosed = true
    } else if (step.kind === 'reauthenticate') {
      state.authenticated = true
      state.finalCallerSessionRevoked = false
      state.lostCommittedResponse = false
      state.reauthenticated = true
    } else if (step.kind === 'wait_retry_after') {
      assert.equal(typeof step.seconds, 'number')
      assert.ok(
        step.seconds >= state.requiredRetryAfter,
        `${fixtureCase.id} did not honor Retry-After`
      )
      state.waitedSeconds += step.seconds
      state.requiredRetryAfter = 0
    } else if (step.kind === 'revoke_request') {
      assert.equal(
        state.requiredRetryAfter,
        0,
        `${fixtureCase.id} retried before honoring Retry-After`
      )
      if (!state.authenticated) {
        assert.ok(
          step.duplicate === true && state.lostCommittedResponse,
          `${fixtureCase.id} issued revoke-all without authentication`
        )
      }
      if (step.duplicate === true) {
        assert.ok(
          state.lostCommittedResponse,
          `${fixtureCase.id} duplicate lacks an in-flight lost response`
        )
      }
      const responseSchemaValid = validateRevokeResponse(step, validators)

      if (step.transport === 'request_dropped_before_commit') {
        assert.equal(step.server_commit, 'not_committed')
        state.clientState = 'revoke_outcome_unknown'
      } else if (step.transport === 'response_lost_after_commit') {
        assert.equal(step.server_commit, 'committed')
        state.authenticated = false
        state.finalCallerSessionRevoked = true
        state.lostCommittedResponse = true
        state.clientState = 'revoke_outcome_unknown'
      } else if (
        step.transport === 'response_lost_after_rate_limit_rejection'
      ) {
        assert.equal(step.server_commit, 'not_committed')
        state.clientState = 'revoke_outcome_unknown'
      } else {
        assert.equal(step.transport, 'response_delivered')
        if (step.status === 200) {
          assert.equal(step.server_commit, 'committed')
          state.authenticated = false
          state.finalCallerSessionRevoked = true
          if (responseSchemaValid) {
            state.clientState = 'confirmed'
            state.confirmationStatus = 200
          } else {
            state.clientState = 'revoke_outcome_unknown'
          }
        } else if (step.status === 429) {
          assert.equal(step.server_commit, 'not_committed')
          assert.equal(
            step.retry_after_seconds,
            step.body.error.retry_after_seconds
          )
          state.requiredRetryAfter = step.retry_after_seconds
          if (state.clientState !== 'revoke_outcome_unknown') {
            state.clientState = 'not_confirmed_rate_limited'
          }
        } else {
          assert.ok(
            step.status === 401 || step.status >= 500,
            `${fixtureCase.id} has an unsupported response status`
          )
          if (step.status === 401) state.authenticated = false
          state.clientState = 'revoke_outcome_unknown'
        }
      }
    } else {
      assert.fail(`${fixtureCase.id} has unknown step kind ${step.kind}`)
    }

    assert.equal(
      state.clientState,
      step.expected_client_state,
      `${fixtureCase.id} ${step.kind}`
    )
    if (step.status !== 200) {
      assert.notEqual(
        state.clientState,
        'confirmed',
        `${fixtureCase.id} confirmed without a 200`
      )
    }
  }

  const actual = {
    client_state: state.clientState,
    local_ephemeral_closed: state.localEphemeralClosed,
    reauthenticated: state.reauthenticated,
    final_caller_session_revoked: state.finalCallerSessionRevoked,
    confirmation_status: state.confirmationStatus,
    waited_seconds: state.waitedSeconds
  }
  assert.deepEqual(actual, fixtureCase.expected, fixtureCase.id)
  return actual
}

export function validateRevokeCases(revokeCases, validators) {
  let stepCount = 0
  for (const fixtureCase of revokeCases) {
    stepCount += fixtureCase.steps.length
    evaluateRevokeCase(fixtureCase, validators)
  }
  return { caseCount: revokeCases.length, stepCount }
}

export function validateAll() {
  const { fixture, schemas } = loadAuthContract()
  assert.equal(fixture.schema_version, 1)
  assert.equal(fixture.contract, 'auth-gateway.md')
  const ids = collectFixtureIds(fixture)
  const deploymentProfiles = validateDeploymentProfiles(
    fixture.deployment_profiles
  )
  const stagingProfileCases = validateStagingProfileCases(
    fixture.staging_profile_cases
  )
  const firstReleaseAuthPolicyCases = validateFirstReleaseAuthPolicyCases(
    fixture.first_release_auth_policy_cases
  )
  const durableStoreCases = validateDurableStoreCases(
    fixture.durable_store_cases
  )
  const maintenanceRestoreCases = validateMaintenanceRestoreCases(
    fixture.maintenance_restore_cases
  )
  const websocketSlaCases = validateWebsocketSlaCases(
    fixture.websocket_sla_cases
  )
  const validators = compileSchemas(schemas)
  const routeCases = validateRouteCases(
    fixture.cases,
    fixture.canonical_origin
  )
  const schemaCases = validateSchemaCases(fixture.schema_cases, validators)
  const rawJsonCases = validateRawJsonCases(
    fixture.raw_json_cases,
    validators
  )
  const clockCases = validateClockCases(
    fixture.session_clock_cases,
    fixture.activity_policy
  )
  const revokeCases = validateRevokeCases(
    fixture.revoke_all_convergence_cases,
    validators
  )

  return {
    clockCaseCount: clockCases.caseCount,
    clockEventCount: clockCases.eventCount,
    deploymentProfileCaseCount: deploymentProfiles.caseCount,
    durableStoreCaseCount: durableStoreCases.caseCount,
    firstReleaseAuthPolicyCaseCount: firstReleaseAuthPolicyCases.caseCount,
    fixtureIdCount: ids.length,
    localCoreSurfaceCount:
      firstReleaseAuthPolicyCases.localCoreSurfaceCount,
    maintenanceRestoreCaseCount: maintenanceRestoreCases.caseCount,
    negativeSchemaCaseCount: schemaCases.negativeCount,
    positiveSchemaCaseCount: schemaCases.positiveCount,
    rawJsonCaseCount: rawJsonCases.caseCount,
    rawJsonNegativeCount: rawJsonCases.negativeCount,
    rawJsonPositiveCount: rawJsonCases.positiveCount,
    revokeCaseCount: revokeCases.caseCount,
    revokeStepCount: revokeCases.stepCount,
    routeCaseCount: routeCases.caseCount,
    schemaCaseCount: schemaCases.caseCount,
    schemaCount: schemas.size,
    stagingProfileCaseCount: stagingProfileCases.caseCount,
    stagingStepCount: stagingProfileCases.stepCount,
    websocketSlaCaseCount: websocketSlaCases.caseCount
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (invokedPath === import.meta.url) {
  try {
    const result = validateAll()
    console.log(
      [
        'auth-contract artifact validation ok',
        `ajv=${dependencyVersions.ajv}`,
        `ajv_formats=${dependencyVersions['ajv-formats']}`,
        `schemas=${result.schemaCount}`,
        `route_cases=${result.routeCaseCount}`,
        `schema_cases=${result.schemaCaseCount}`,
        `positive=${result.positiveSchemaCaseCount}`,
        `negative=${result.negativeSchemaCaseCount}`,
        `raw_json_cases=${result.rawJsonCaseCount}`,
        `h2_policy_cases=${result.firstReleaseAuthPolicyCaseCount}`,
        `local_core_surfaces=${result.localCoreSurfaceCount}`,
        `clock_cases=${result.clockCaseCount}`,
        `clock_events=${result.clockEventCount}`,
        `deployment_profile_cases=${result.deploymentProfileCaseCount}`,
        `durable_store_cases=${result.durableStoreCaseCount}`,
        `maintenance_restore_cases=${result.maintenanceRestoreCaseCount}`,
        `revoke_cases=${result.revokeCaseCount}`,
        `revoke_steps=${result.revokeStepCount}`,
        `staging_profile_cases=${result.stagingProfileCaseCount}`,
        `staging_steps=${result.stagingStepCount}`,
        `websocket_sla_cases=${result.websocketSlaCaseCount}`,
        `unique_ids=${result.fixtureIdCount}`
      ].join(' ')
    )
  } catch (error) {
    console.error(error.stack ?? error.message)
    process.exitCode = 1
  }
}
