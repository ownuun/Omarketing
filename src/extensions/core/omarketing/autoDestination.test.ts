import { describe, expect, it } from 'vitest'

import {
  resolveAutoDestination,
  type AutoDestinationRegistration
} from './autoDestination'

const registrations: readonly AutoDestinationRegistration[] = [
  {
    platform: 'threads',
    accountAlias: 'acct-010',
    targetAlias: null,
    readiness: 'ready',
    verified: true
  },
  {
    platform: 'tistory',
    accountAlias: 'acct-022',
    targetAlias: 'tistory-01',
    readiness: 'login_required',
    verified: false
  }
]

describe('resolveAutoDestination', () => {
  it('makes one ready and verified registration selectable', () => {
    expect(
      resolveAutoDestination(registrations, {
        platform: 'threads',
        accountAlias: 'acct-010',
        targetAlias: null
      })
    ).toEqual({
      state: 'ready',
      destination: registrations[0]
    })
  })

  it('blocks a matching destination that is not ready and verified', () => {
    expect(
      resolveAutoDestination(registrations, {
        platform: 'tistory',
        accountAlias: 'acct-022',
        targetAlias: 'tistory-01'
      })
    ).toEqual({ state: 'blocked', reason: 'login_required' })
  })

  it('fails closed for missing or duplicate registrations', () => {
    expect(
      resolveAutoDestination(registrations, {
        platform: 'threads',
        accountAlias: 'acct-missing',
        targetAlias: null
      })
    ).toEqual({ state: 'blocked', reason: 'not_registered' })

    expect(
      resolveAutoDestination([...registrations, registrations[0]], {
        platform: 'threads',
        accountAlias: 'acct-010',
        targetAlias: null
      })
    ).toEqual({ state: 'blocked', reason: 'ambiguous_registration' })
  })
})
