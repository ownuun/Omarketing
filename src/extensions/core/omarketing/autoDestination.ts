export type AutoPlatform =
  | 'threads'
  | 'tistory'
  | 'instagram'
  | 'facebook'
  | 'youtube_shorts'

export type AutoDestinationReadiness =
  | 'ready'
  | 'login_required'
  | 'unverified'
  | 'blocked'

export interface AutoDestinationRegistration {
  readonly platform: AutoPlatform
  readonly accountAlias: string
  readonly targetAlias: string | null
  readonly readiness: AutoDestinationReadiness
  readonly verified: boolean
}

export interface AutoDestinationRequest {
  readonly platform: AutoPlatform
  readonly accountAlias: string
  readonly targetAlias: string | null
}

export type AutoDestinationResolution =
  | {
      readonly state: 'ready'
      readonly destination: AutoDestinationRegistration
    }
  | {
      readonly state: 'blocked'
      readonly reason:
        | 'not_registered'
        | 'ambiguous_registration'
        | AutoDestinationReadiness
    }

/**
 * Resolves one exact Auto-owned destination for display or prepared handoff.
 *
 * The frontend never guesses account/target aliases and never persists the
 * registry. A missing, duplicate, unverified, or non-ready row is blocked.
 */
export function resolveAutoDestination(
  registrations: readonly AutoDestinationRegistration[],
  request: AutoDestinationRequest
): AutoDestinationResolution {
  const matches = registrations.filter(
    (registration) =>
      registration.platform === request.platform &&
      registration.accountAlias === request.accountAlias &&
      registration.targetAlias === request.targetAlias
  )

  if (matches.length === 0) {
    return { state: 'blocked', reason: 'not_registered' }
  }

  if (matches.length !== 1) {
    return { state: 'blocked', reason: 'ambiguous_registration' }
  }

  const [destination] = matches
  if (destination.readiness !== 'ready') {
    return { state: 'blocked', reason: destination.readiness }
  }

  if (!destination.verified) {
    return { state: 'blocked', reason: 'unverified' }
  }

  return { state: 'ready', destination }
}
