const AUTH_REQUIRED_CODE = 'AUTH_REQUIRED' as const
const CSRF_REJECTED_CODE = 'CSRF_REJECTED' as const
const MAX_SESSION_CHECK_DELAY_MS = 60_000

const VALID_SESSION_FIXTURES = new Set([
  'valid',
  'valid-with-two-live-websockets',
  'valid-owner-with-multiple-sessions'
])

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const HTTP_METHOD_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Z]+$/
const ENCODED_PATH_SEPARATOR_PATTERN = /%(?:2f|5c)/i
const ENCODED_OCTET_PATTERN = /%[0-9a-f]{2}/i
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/
const UTC_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/

type AuthFailureReason =
  | 'auth_required'
  | 'csrf_rejected'
  | 'expired'
  | 'malformed'
  | 'origin_mismatch'
  | 'outcome_unknown'
  | 'revoked'
  | 'route_denied'

type AuthFixtureState = Readonly<{
  authenticated: boolean
  failClosed: boolean
  reason?: AuthFailureReason
}>

export interface AuthSessionFixtureEvaluation {
  state: AuthFixtureState
  status?: number
  code?: typeof AUTH_REQUIRED_CODE | typeof CSRF_REJECTED_CODE
  content?: 'self-contained-login'
  cache?: 'no-store'
  location?: string
  html_redirect?: boolean
  proxy?: boolean
  custom_csrf_header_required?: boolean
  password_hash_invoked?: boolean
  upgrade_accepted?: boolean
  bound_to_session?: boolean
  secret_logged?: boolean
  revoked?: boolean
  cookie_cleared?: boolean
  prior_session_disclosed?: boolean
  /**
   * The gateway consumes and removes `__Host-omarketing_session` before
   * proxying, so it never reaches Comfy or a custom-node handler. Reported only
   * when the request carried that cookie. Contract `auth-gateway.md:386`.
   */
  gateway_session_cookie_forwarded?: boolean
  /**
   * Client-supplied identity and forwarding headers are stripped before the
   * gateway adds its own trusted metadata. Reported only when the request
   * carried at least one. Contract `auth-gateway.md:386`.
   */
  client_identity_headers_stripped?: boolean
  /** Owner identity comes from the validated session only. `:388`. */
  owner_identity_source?: 'validated-session'
  websockets_closed_within_seconds?: number
  all_owner_sessions_revoked?: boolean
  all_owner_websockets_closed_within_seconds?: number
}

interface ValidatedAuthSession {
  ownerUserId: string
  idleExpiresAt: string
  absoluteExpiresAt: string
  nextCheckAt: string
}

export type AuthSessionObservationResult =
  | Readonly<{
      state: 'authenticated'
      authenticated: true
      failClosed: false
      session: ValidatedAuthSession
    }>
  | Readonly<{
      state: 'unauthenticated' | 'revoked' | 'outcome_unknown'
      authenticated: false
      failClosed: true
      reason: AuthFailureReason
      session: null
    }>

type UnknownRecord = Record<string, unknown>

const authenticatedFixtureState: AuthFixtureState = Object.freeze({
  authenticated: true,
  failClosed: false
})

const publicFixtureState: AuthFixtureState = Object.freeze({
  authenticated: false,
  failClosed: false
})

function deniedFixtureState(reason: AuthFailureReason): AuthFixtureState {
  return {
    authenticated: false,
    failClosed: true,
    reason
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalizeHttpsOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null

  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== '' ||
      url.origin !== value
    ) {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

function parseLocalRequestUrl(
  value: unknown,
  canonicalOrigin: string
): URL | null {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return null
  }

  try {
    const url = new URL(value, canonicalOrigin)
    if (
      url.origin !== canonicalOrigin ||
      url.hash !== '' ||
      url.pathname.includes('//') ||
      ENCODED_PATH_SEPARATOR_PATTERN.test(url.pathname)
    ) {
      return null
    }

    const decodedPath = decodeURIComponent(url.pathname)
    if (
      decodedPath.includes('\\') ||
      decodedPath.includes('//') ||
      CONTROL_CHARACTER_PATTERN.test(decodedPath) ||
      ENCODED_OCTET_PATTERN.test(decodedPath)
    ) {
      return null
    }

    url.pathname = decodedPath
    return url
  } catch {
    return null
  }
}

function isPathAtOrBelow(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`)
}

function isProtectedNavigationPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    isPathAtOrBelow(pathname, '/api') ||
    isPathAtOrBelow(pathname, '/internal') ||
    isPathAtOrBelow(pathname, '/extensions') ||
    isPathAtOrBelow(pathname, '/templates') ||
    pathname.startsWith('/view')
  )
}

function isValidSessionFixture(value: unknown): boolean {
  return typeof value === 'string' && VALID_SESSION_FIXTURES.has(value)
}

function isAllowedProtectedRequest(pathname: string, method: string): boolean {
  if (pathname === '/') return method === 'GET' || method === 'HEAD'
  if (
    isPathAtOrBelow(pathname, '/api') ||
    isPathAtOrBelow(pathname, '/internal')
  ) {
    return true
  }
  if (
    isPathAtOrBelow(pathname, '/extensions') ||
    isPathAtOrBelow(pathname, '/templates') ||
    pathname.startsWith('/view')
  ) {
    return method === 'GET' || method === 'HEAD'
  }
  return pathname === '/auth/session' && method === 'GET'
}

function authRequiredEvaluation(
  session: unknown
): AuthSessionFixtureEvaluation {
  return {
    status: 401,
    code: AUTH_REQUIRED_CODE,
    cache: 'no-store',
    html_redirect: false,
    proxy: false,
    state: deniedFixtureState(
      session === 'outcome_unknown' ? 'outcome_unknown' : 'auth_required'
    )
  }
}

function csrfRejectedEvaluation(
  reason: 'csrf_rejected' | 'origin_mismatch',
  websocket = false
): AuthSessionFixtureEvaluation {
  return {
    status: 403,
    code: CSRF_REJECTED_CODE,
    cache: 'no-store',
    proxy: false,
    ...(websocket ? { upgrade_accepted: false } : {}),
    state: deniedFixtureState(reason)
  }
}

function malformedEvaluation(): AuthSessionFixtureEvaluation {
  return {
    status: 400,
    cache: 'no-store',
    proxy: false,
    state: deniedFixtureState('malformed')
  }
}

function routeDeniedEvaluation(
  websocket = false
): AuthSessionFixtureEvaluation {
  return {
    status: 404,
    proxy: false,
    ...(websocket ? { upgrade_accepted: false } : {}),
    state: deniedFixtureState('route_denied')
  }
}

function validateUnsafeRequest(
  request: UnknownRecord,
  canonicalOrigin: string
): AuthSessionFixtureEvaluation | null {
  if (request.origin !== canonicalOrigin) {
    return csrfRejectedEvaluation('origin_mismatch')
  }
  if (request.sec_fetch_site !== 'same-origin') {
    return csrfRejectedEvaluation('csrf_rejected')
  }
  return null
}

function validateSafeRequest(
  request: UnknownRecord,
  canonicalOrigin: string
): AuthSessionFixtureEvaluation | null {
  if (request.origin !== undefined && request.origin !== canonicalOrigin) {
    return csrfRejectedEvaluation('origin_mismatch')
  }
  if (request.sec_fetch_site === 'cross-site') {
    return csrfRejectedEvaluation('csrf_rejected')
  }
  return null
}

function isTopLevelNavigation(method: string, request: UnknownRecord): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false
  if (request.sec_fetch_mode !== 'navigate') return false
  if (typeof request.accept !== 'string') return false

  return request.accept
    .toLowerCase()
    .split(',')
    .some((value) => {
      const mediaType = value.trim().split(';', 1)[0]
      return mediaType === 'text/html' || mediaType === 'application/xhtml+xml'
    })
}

function evaluateWebSocketFixture(
  request: UnknownRecord,
  url: URL,
  canonicalOrigin: string
): AuthSessionFixtureEvaluation {
  const queryKeys = [...url.searchParams.keys()]
  if (queryKeys.some((key) => key !== 'clientId')) {
    return {
      status: 400,
      upgrade_accepted: false,
      secret_logged: false,
      state: deniedFixtureState('malformed')
    }
  }

  if (
    request.origin !== canonicalOrigin ||
    (request.sec_fetch_site !== undefined &&
      request.sec_fetch_site !== 'same-origin')
  ) {
    return csrfRejectedEvaluation('origin_mismatch', true)
  }

  if (!isValidSessionFixture(request.session)) {
    return {
      ...authRequiredEvaluation(request.session),
      upgrade_accepted: false
    }
  }

  return {
    upgrade_accepted: true,
    bound_to_session: true,
    state: authenticatedFixtureState
  }
}

function evaluateLogoutFixture(
  request: UnknownRecord,
  canonicalOrigin: string
): AuthSessionFixtureEvaluation {
  const csrfFailure = validateUnsafeRequest(request, canonicalOrigin)
  if (csrfFailure) return csrfFailure

  const evaluation: AuthSessionFixtureEvaluation = {
    status: 200,
    cache: 'no-store',
    revoked: true,
    cookie_cleared: true,
    state: deniedFixtureState('revoked')
  }

  if (request.session === 'valid-with-two-live-websockets') {
    evaluation.websockets_closed_within_seconds = 5
  }
  if (request.session === 'absent-or-already-revoked') {
    evaluation.prior_session_disclosed = false
  }

  return evaluation
}

function evaluateRevokeAllFixture(
  request: UnknownRecord,
  canonicalOrigin: string
): AuthSessionFixtureEvaluation {
  const csrfFailure = validateUnsafeRequest(request, canonicalOrigin)
  if (csrfFailure) return csrfFailure
  if (!isValidSessionFixture(request.session)) {
    return authRequiredEvaluation(request.session)
  }

  return {
    status: 200,
    cache: 'no-store',
    revoked: true,
    cookie_cleared: true,
    all_owner_sessions_revoked: true,
    all_owner_websockets_closed_within_seconds: 5,
    state: deniedFixtureState('revoked')
  }
}

/**
 * Accessible text for the Phase 1 About badge.
 *
 * Phase 1 hides the Comfy sign-in controls but ships **no** gateway, session, or
 * access control. Wording that implies otherwise would be a security
 * misstatement, so anything equivalent to `authenticated`, `protected`, or
 * `private access` is prohibited here. The badge states the two true facts: no
 * external account is connected, and this build is not access-controlled.
 *
 * Contract: `auth-gateway.md`, and the Phase 1 GO scope note in
 * `.hermes/phase0/phase0-result.md`.
 */
export const OMARKETING_ABOUT_BADGE_LABEL =
  'Omarketing Phase 1 — no external account, no access control'

/** Wording that would misrepresent Phase 1 as access-controlled. */
export const PROHIBITED_ABOUT_BADGE_TERMS = Object.freeze([
  'authenticated',
  'protected',
  'private access',
  'secure',
  'signed in',
  'logged in'
] as const)

/** Fails closed: an unsafe label is rejected rather than silently displayed. */
export function isAboutBadgeLabelSafe(label: string): boolean {
  const lower = label.toLowerCase()
  return !PROHIBITED_ABOUT_BADGE_TERMS.some((term) => lower.includes(term))
}

/** The gateway session cookie name. It must never reach an upstream handler. */
const GATEWAY_SESSION_COOKIE = '__Host-omarketing_session'

/**
 * Client-supplied headers that must be stripped before proxying.
 *
 * `X-Omarketing-*` and `X-Forwarded-*` are prefix matches; the rest are exact.
 * Contract `auth-gateway.md:386-388`.
 */
const STRIPPED_HEADER_PREFIXES = ['x-omarketing-', 'x-forwarded-'] as const
const STRIPPED_HEADER_NAMES = ['forwarded', 'comfy-user'] as const

function isStrippedHeader(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    STRIPPED_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix)) ||
    STRIPPED_HEADER_NAMES.includes(
      lower as (typeof STRIPPED_HEADER_NAMES)[number]
    )
  )
}

/**
 * Reports what the gateway removed before proxying an authenticated request.
 *
 * Each field is emitted only when the request actually carried the thing being
 * stripped, so an ordinary request keeps its existing evaluation shape and no
 * caller can read a blanket "nothing was spoofed" claim from a quiet response.
 */
function describeGatewayStripping(
  input: UnknownRecord
): Partial<AuthSessionFixtureEvaluation> {
  const result: {
    gateway_session_cookie_forwarded?: boolean
    client_identity_headers_stripped?: boolean
    owner_identity_source?: 'validated-session'
  } = {}

  const cookieNames = snapshotJsonArrayOfStrings(input.request_cookie_names)
  if (cookieNames.includes(GATEWAY_SESSION_COOKIE)) {
    // Consumed by the gateway, so it is never forwarded upstream.
    result.gateway_session_cookie_forwarded = false
  }

  const headers = isRecord(input.request_headers) ? input.request_headers : null
  if (headers && Object.keys(headers).some(isStrippedHeader)) {
    result.client_identity_headers_stripped = true
    // Identity is re-derived from the validated session, never from the client.
    result.owner_identity_source = 'validated-session'
  }

  return result
}

/** Reads a string array defensively; any non-string entry yields an empty list. */
function snapshotJsonArrayOfStrings(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return value.every((entry) => typeof entry === 'string')
    ? (value as readonly string[])
    : []
}

/**
 * Evaluates Phase 0 contract fixtures only. It performs no request and does not
 * read cookies, credentials, browser storage, or client-supplied authority.
 */
export function evaluateAuthSessionFixture(
  input: unknown
): AuthSessionFixtureEvaluation {
  if (!isRecord(input)) {
    return malformedEvaluation()
  }

  const canonicalOrigin = canonicalizeHttpsOrigin(input.canonicalOrigin)
  if (!canonicalOrigin) {
    return malformedEvaluation()
  }

  const method =
    typeof input.method === 'string' ? input.method.toUpperCase() : ''
  const url = parseLocalRequestUrl(input.path, canonicalOrigin)
  if (!HTTP_METHOD_PATTERN.test(method) || !url) {
    return malformedEvaluation()
  }

  if (url.pathname === '/auth/login' && method === 'GET') {
    return {
      status: 200,
      content: 'self-contained-login',
      cache: 'no-store',
      state: publicFixtureState
    }
  }

  if (url.pathname === '/auth/login' && method === 'POST') {
    const csrfFailure = validateUnsafeRequest(input, canonicalOrigin)
    if (csrfFailure) {
      return {
        ...csrfFailure,
        password_hash_invoked: false
      }
    }

    return {
      cache: 'no-store',
      state: deniedFixtureState('outcome_unknown')
    }
  }

  if (url.pathname === '/auth/logout' && method === 'POST') {
    return evaluateLogoutFixture(input, canonicalOrigin)
  }

  if (url.pathname === '/auth/revoke-all' && method === 'POST') {
    return evaluateRevokeAllFixture(input, canonicalOrigin)
  }

  if (url.pathname === '/ws') {
    if (method !== 'GET' || input.upgrade !== 'websocket') {
      return routeDeniedEvaluation(true)
    }
    return evaluateWebSocketFixture(input, url, canonicalOrigin)
  }

  if (!isAllowedProtectedRequest(url.pathname, method)) {
    return routeDeniedEvaluation()
  }

  const topLevelNavigation = isTopLevelNavigation(method, input)
  if (!topLevelNavigation) {
    const requestPolicyFailure =
      method === 'OPTIONS' || UNSAFE_METHODS.has(method)
        ? validateUnsafeRequest(input, canonicalOrigin)
        : validateSafeRequest(input, canonicalOrigin)
    if (requestPolicyFailure) return requestPolicyFailure
  }

  if (!isValidSessionFixture(input.session)) {
    if (topLevelNavigation) {
      return {
        status: 303,
        location: `/auth/login?return_to=${encodeURIComponent(
          normalizeAuthReturnTo(`${url.pathname}${url.search}`)
        )}`,
        state: deniedFixtureState('auth_required')
      }
    }
    return authRequiredEvaluation(input.session)
  }

  if (url.pathname === '/auth/session') {
    return {
      status: 200,
      cache: 'no-store',
      state: authenticatedFixtureState
    }
  }

  return {
    proxy: true,
    ...(UNSAFE_METHODS.has(method)
      ? { custom_csrf_header_required: false }
      : {}),
    ...describeGatewayStripping(input),
    state: authenticatedFixtureState
  }
}

function parseUtcTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null

  const match = UTC_TIMESTAMP_PATTERN.exec(value)
  if (!match) return null

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null

  const date = new Date(timestamp)
  const sourceSecond = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`
  if (date.toISOString().slice(0, 19) !== sourceSecond) return null

  return timestamp
}

function observationFailure(
  state: 'unauthenticated' | 'revoked' | 'outcome_unknown',
  reason: AuthFailureReason
): AuthSessionObservationResult {
  return {
    state,
    authenticated: false,
    failClosed: true,
    reason,
    session: null
  }
}

/**
 * Validates one untrusted same-origin gateway observation. The returned session
 * contains only owner identity and expiry metadata; all failures are closed.
 */
export function validateAuthSessionObservation(
  input: unknown
): AuthSessionObservationResult {
  if (!isRecord(input)) {
    return observationFailure('unauthenticated', 'malformed')
  }

  const canonicalOrigin = canonicalizeHttpsOrigin(input.canonicalOrigin)
  if (!canonicalOrigin) {
    return observationFailure('unauthenticated', 'malformed')
  }
  if (input.responseOrigin !== canonicalOrigin) {
    return observationFailure('unauthenticated', 'origin_mismatch')
  }

  const checkedAt = parseUtcTimestamp(input.checkedAt)
  if (checkedAt === null || !isRecord(input.outcome)) {
    return observationFailure('unauthenticated', 'malformed')
  }

  if (input.outcome.kind === 'revoked') {
    return observationFailure('revoked', 'revoked')
  }
  if (input.outcome.kind === 'outcome_unknown') {
    return observationFailure('outcome_unknown', 'outcome_unknown')
  }
  if (input.outcome.kind !== 'response') {
    return observationFailure('unauthenticated', 'malformed')
  }
  if (input.outcome.status === 401) {
    return observationFailure('unauthenticated', 'auth_required')
  }
  if (input.outcome.status !== 200) {
    return observationFailure('outcome_unknown', 'outcome_unknown')
  }

  const body = input.outcome.body
  if (!isRecord(body)) {
    return observationFailure('unauthenticated', 'malformed')
  }

  const allowedKeys = new Set([
    'owner_user_id',
    'idle_expires_at',
    'absolute_expires_at'
  ])
  if (
    Object.keys(body).length !== allowedKeys.size ||
    Object.keys(body).some((key) => !allowedKeys.has(key)) ||
    typeof body.owner_user_id !== 'string' ||
    body.owner_user_id.trim() === '' ||
    body.owner_user_id !== body.owner_user_id.trim()
  ) {
    return observationFailure('unauthenticated', 'malformed')
  }

  const idleExpiresAt = parseUtcTimestamp(body.idle_expires_at)
  const absoluteExpiresAt = parseUtcTimestamp(body.absolute_expires_at)
  if (idleExpiresAt === null || absoluteExpiresAt === null) {
    return observationFailure('unauthenticated', 'malformed')
  }
  if (idleExpiresAt <= checkedAt || absoluteExpiresAt <= checkedAt) {
    return observationFailure('unauthenticated', 'expired')
  }
  if (idleExpiresAt > absoluteExpiresAt) {
    return observationFailure('unauthenticated', 'malformed')
  }

  const nextCheckAt = Math.min(
    checkedAt + MAX_SESSION_CHECK_DELAY_MS,
    idleExpiresAt,
    absoluteExpiresAt
  )

  return {
    state: 'authenticated',
    authenticated: true,
    failClosed: false,
    session: {
      ownerUserId: body.owner_user_id,
      idleExpiresAt: new Date(idleExpiresAt).toISOString(),
      absoluteExpiresAt: new Date(absoluteExpiresAt).toISOString(),
      nextCheckAt: new Date(nextCheckAt).toISOString()
    }
  }
}

/** Normalizes a protected local navigation target for gateway login. */
export function normalizeAuthReturnTo(value: string): string {
  const localOrigin = 'https://return-to.invalid'
  const url = parseLocalRequestUrl(value, localOrigin)
  if (!url || !isProtectedNavigationPath(url.pathname)) return '/'

  return `${url.pathname}${url.search}`
}
