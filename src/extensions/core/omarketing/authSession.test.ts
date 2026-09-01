import { describe, expect, it } from 'vitest'

import authGatewayFixture from '../../../../.hermes/phase0/fixtures/auth-gateway.cases.json' with { type: 'json' }

import {
  evaluateAuthSessionFixture,
  normalizeAuthReturnTo,
  validateAuthSessionObservation
} from './authSession'

const canonicalOrigin = authGatewayFixture.canonical_origin
const checkedAt = '2026-08-26T12:00:00.000Z'
const validPayload = {
  owner_user_id: 'owner_opaque_1',
  idle_expires_at: '2026-08-26T12:30:00.000Z',
  absolute_expires_at: '2026-08-27T00:00:00.000Z'
}

describe('auth gateway contract fixtures', () => {
  it.each(authGatewayFixture.cases)(
    'evaluates $id without widening the gateway contract',
    (fixtureCase) => {
      const { expected, ...request } = fixtureCase

      const evaluation = evaluateAuthSessionFixture({
        ...request,
        canonicalOrigin
      })

      expect(evaluation).toMatchObject(expected)
    }
  )

  it.each(['malformed', 'expired', 'revoked', 'outcome_unknown'])(
    'fails closed for a %s session without disclosing its cause',
    (session) => {
      const evaluation = evaluateAuthSessionFixture({
        canonicalOrigin,
        method: 'GET',
        path: '/auth/session',
        session
      })

      expect(evaluation).toMatchObject({
        status: 401,
        code: 'AUTH_REQUIRED',
        html_redirect: false,
        state: {
          authenticated: false,
          failClosed: true
        }
      })
    }
  )

  it.each([
    null,
    'null',
    'https://attacker.example.invalid',
    'https://omarketing.example.invalid.attacker.invalid',
    'https://omarketing.example.invalid:444'
  ])('rejects unsafe request origin %s', (origin) => {
    const evaluation = evaluateAuthSessionFixture({
      canonicalOrigin,
      method: 'POST',
      path: '/api/prompt',
      session: 'valid',
      origin,
      sec_fetch_site: 'same-origin'
    })

    expect(evaluation).toMatchObject({
      status: 403,
      code: 'CSRF_REJECTED',
      proxy: false,
      state: {
        authenticated: false,
        failClosed: true,
        reason: 'origin_mismatch'
      }
    })
  })

  it('ignores client authority claims', () => {
    const baseline = evaluateAuthSessionFixture({
      canonicalOrigin,
      method: 'POST',
      path: '/api/prompt',
      session: 'valid',
      origin: canonicalOrigin,
      sec_fetch_site: 'same-origin'
    })
    const withClaims = evaluateAuthSessionFixture({
      canonicalOrigin,
      method: 'POST',
      path: '/api/prompt',
      session: 'valid',
      origin: canonicalOrigin,
      sec_fetch_site: 'same-origin',
      body: {
        tenant_id: 'forged-tenant',
        actor: 'forged-actor',
        project_id: 'forged-project'
      }
    })

    expect(withClaims).toEqual(baseline)
    expect(JSON.stringify(withClaims)).not.toContain('forged-')
  })

  it('rejects reusable WebSocket query credentials without reflecting them', () => {
    const evaluation = evaluateAuthSessionFixture({
      canonicalOrigin,
      method: 'GET',
      path: '/ws?token=reusable-secret',
      upgrade: 'websocket',
      session: 'valid',
      origin: canonicalOrigin,
      sec_fetch_site: 'same-origin'
    })

    expect(evaluation).toMatchObject({
      status: 400,
      upgrade_accepted: false,
      secret_logged: false,
      state: {
        authenticated: false,
        failClosed: true
      }
    })
    expect(JSON.stringify(evaluation)).not.toContain('reusable-secret')
  })

  it.each([
    ['root mutation', 'POST', '/', undefined],
    ['extension mutation', 'POST', '/extensions/example.js', undefined],
    ['template mutation', 'POST', '/templates/index.json', undefined],
    ['view mutation', 'POST', '/view?filename=x.png', undefined],
    ['session mutation', 'POST', '/auth/session', undefined],
    ['logout read', 'GET', '/auth/logout', undefined],
    ['revoke-all read', 'GET', '/auth/revoke-all', undefined],
    ['non-GET WebSocket upgrade', 'POST', '/ws', 'websocket']
  ] as const)('default-denies %s', (_, method, path, upgrade) => {
    const evaluation = evaluateAuthSessionFixture({
      canonicalOrigin,
      method,
      path,
      upgrade,
      session: 'valid',
      origin: canonicalOrigin,
      sec_fetch_site: 'same-origin'
    })

    expect(evaluation).toMatchObject({
      status: 404,
      proxy: false,
      state: {
        authenticated: false,
        failClosed: true,
        reason: 'route_denied'
      }
    })
  })

  it.each([
    '/api//prompt',
    '/api/%2Fprompt',
    '/api/%252Fprompt',
    '/api/%C0%AFprompt'
  ])('rejects ambiguous protected path %s before proxying', (path) => {
    const evaluation = evaluateAuthSessionFixture({
      canonicalOrigin,
      method: 'GET',
      path,
      session: 'valid'
    })

    expect(evaluation).toMatchObject({
      status: 400,
      proxy: false,
      state: {
        authenticated: false,
        failClosed: true,
        reason: 'malformed'
      }
    })
  })

  it('matches protected routes after one decoding and dot-segment pass', () => {
    const evaluation = evaluateAuthSessionFixture({
      canonicalOrigin,
      method: 'GET',
      path: '/unreviewed/../%61pi/object_info',
      session: 'valid'
    })

    expect(evaluation).toMatchObject({
      proxy: true,
      state: {
        authenticated: true,
        failClosed: false
      }
    })
  })

  it('marks revoke-all as clearing the caller cookie', () => {
    const evaluation = evaluateAuthSessionFixture({
      canonicalOrigin,
      method: 'POST',
      path: '/auth/revoke-all',
      session: 'valid-owner-with-multiple-sessions',
      origin: canonicalOrigin,
      sec_fetch_site: 'same-origin'
    })

    expect(evaluation).toMatchObject({
      status: 200,
      revoked: true,
      cookie_cleared: true,
      state: {
        authenticated: false,
        failClosed: true,
        reason: 'revoked'
      }
    })
  })

  it('marks authentication failures as non-cacheable', () => {
    const evaluation = evaluateAuthSessionFixture({
      canonicalOrigin,
      method: 'GET',
      path: '/auth/session',
      session: 'expired'
    })

    expect(evaluation).toMatchObject({
      status: 401,
      cache: 'no-store',
      state: {
        authenticated: false,
        failClosed: true
      }
    })
  })
})

describe('auth session observation validation', () => {
  it('accepts only the gateway session fields and schedules the next check', () => {
    expect(
      validateAuthSessionObservation({
        canonicalOrigin,
        responseOrigin: canonicalOrigin,
        checkedAt,
        outcome: {
          kind: 'response',
          status: 200,
          body: validPayload
        }
      })
    ).toEqual({
      state: 'authenticated',
      authenticated: true,
      failClosed: false,
      session: {
        ownerUserId: 'owner_opaque_1',
        idleExpiresAt: '2026-08-26T12:30:00.000Z',
        absoluteExpiresAt: '2026-08-27T00:00:00.000Z',
        nextCheckAt: '2026-08-26T12:01:00.000Z'
      }
    })
  })

  it.each([
    ['malformed payload', { ...validPayload, owner_user_id: '' }, 'malformed'],
    [
      'expired idle deadline',
      { ...validPayload, idle_expires_at: checkedAt },
      'expired'
    ],
    [
      'expired absolute deadline',
      { ...validPayload, absolute_expires_at: checkedAt },
      'expired'
    ],
    [
      'client authority claim',
      { ...validPayload, tenant_id: 'forged-tenant' },
      'malformed'
    ],
    [
      'credential metadata',
      { ...validPayload, credential_version: 7 },
      'malformed'
    ]
  ] as const)('fails closed for %s', (_, body, reason) => {
    expect(
      validateAuthSessionObservation({
        canonicalOrigin,
        responseOrigin: canonicalOrigin,
        checkedAt,
        outcome: { kind: 'response', status: 200, body }
      })
    ).toEqual({
      state: 'unauthenticated',
      authenticated: false,
      failClosed: true,
      reason,
      session: null
    })
  })

  it('fails closed when the response origin does not exactly match', () => {
    expect(
      validateAuthSessionObservation({
        canonicalOrigin,
        responseOrigin: 'https://attacker.example.invalid',
        checkedAt,
        outcome: {
          kind: 'response',
          status: 200,
          body: validPayload
        }
      })
    ).toEqual({
      state: 'unauthenticated',
      authenticated: false,
      failClosed: true,
      reason: 'origin_mismatch',
      session: null
    })
  })

  it.each([
    ['revoked', { kind: 'revoked' }, { state: 'revoked', reason: 'revoked' }],
    [
      'unknown mutation outcome',
      { kind: 'outcome_unknown' },
      { state: 'outcome_unknown', reason: 'outcome_unknown' }
    ],
    [
      'authentication required',
      { kind: 'response', status: 401, body: {} },
      { state: 'unauthenticated', reason: 'auth_required' }
    ],
    [
      'unexpected gateway response',
      { kind: 'response', status: 503, body: {} },
      { state: 'outcome_unknown', reason: 'outcome_unknown' }
    ]
  ] as const)('fails closed for %s', (_, outcome, expectedState) => {
    expect(
      validateAuthSessionObservation({
        canonicalOrigin,
        responseOrigin: canonicalOrigin,
        checkedAt,
        outcome
      })
    ).toEqual({
      ...expectedState,
      authenticated: false,
      failClosed: true,
      session: null
    })
  })
})

describe('auth return path normalization', () => {
  it.each([
    ['/', '/'],
    ['/api/object_info?refresh=1', '/api/object_info?refresh=1'],
    ['/%61pi/object_info?refresh=1', '/api/object_info?refresh=1'],
    ['https://attacker.example.invalid/path', '/'],
    ['//attacker.example.invalid/path', '/'],
    ['/safe\\attacker', '/'],
    ['not-local', '/']
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeAuthReturnTo(value)).toBe(expected)
  })
})
