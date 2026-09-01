import {
  isCanonicalRfc4122Uuid,
  isProjectContextRevision
} from './projectContext'
import type { ProjectContextRevision } from './projectContext'

declare const fanoutRequestIdBrand: unique symbol
declare const referenceIdBrand: unique symbol
declare const runKeyBrand: unique symbol

type FanoutRequestId = string & {
  readonly [fanoutRequestIdBrand]: 'FanoutRequestId'
}

export type ReferenceId = string & {
  readonly [referenceIdBrand]: 'ReferenceId'
}

type RunKey = string & {
  readonly [runKeyBrand]: 'RunKey'
}

export type QueuePosition = -1 | 0

export interface InactiveReferenceFanoutSession {
  readonly fanout_active: false
}

export interface ActiveReferenceFanoutSession {
  readonly fanout_active: true
  readonly fanout_request_id: FanoutRequestId
  readonly logical_reference_ids: readonly ReferenceId[]
  readonly ordered_reference_ids: readonly ReferenceId[]
  readonly run_key: RunKey
  readonly cursor: number
  readonly expected_count: number
  readonly accepted_count: number
  readonly accepted_reference_ids: readonly ReferenceId[]
  readonly queue_position: QueuePosition
  readonly project_context_revision: ProjectContextRevision
  readonly reference_selection_revision: number
  readonly snapshot_lease: string
  readonly in_flight_reference_id: ReferenceId | null
  readonly reconciliation_required: boolean
}

export type ReferenceFanoutSession =
  | InactiveReferenceFanoutSession
  | ActiveReferenceFanoutSession

interface FanoutIterationSnapshot {
  readonly schema_version: 1
  readonly fanout_request_id: FanoutRequestId
  readonly reference_id: ReferenceId
  /** Zero-based position in the user-confirmed logical order. */
  readonly logical_ordinal: number
  readonly expected_count: number
  readonly run_key: RunKey
  readonly project_context_revision: ProjectContextRevision
  readonly reference_selection_revision: number
  readonly snapshot_lease: string
}

export type PrepareReferenceFanoutResult =
  | {
      readonly status: 'ready'
      readonly session: ActiveReferenceFanoutSession
      readonly queue_prompt_arguments: readonly [QueuePosition, number]
    }
  | {
      readonly status: 'rejected'
      readonly reason:
        | 'submission_busy'
        | 'empty_selection'
        | 'duplicate_selection'
        | 'invalid_selection'
        | 'invalid_preparation'
    }

export type FanoutSubmissionOutcome =
  | {
      readonly status: 'complete'
      readonly accepted: readonly ReferenceId[]
      readonly expected_count: number
    }
  | {
      readonly status: 'partial'
      readonly accepted: readonly ReferenceId[]
      readonly unsubmitted: readonly ReferenceId[]
      readonly accepted_count: number
      readonly expected_count: number
      readonly safeMessageKey: 'fanout_submission_partial'
    }
  | {
      readonly status: 'unknown'
      readonly fanout_request_id: FanoutRequestId
      readonly expected_count: number
      readonly safeMessageKey: 'submission_outcome_unknown'
    }

type ParsedFanoutReconciliation =
  | { readonly schema_version: 1; readonly status: 'not_needed' }
  | {
      readonly schema_version: 1
      readonly status: 'reconciled'
      readonly accepted_reference_ids: readonly ReferenceId[]
    }
  | { readonly schema_version: 1; readonly status: 'unavailable' }

interface BeforeInactiveReferenceQueuedResult {
  readonly session: InactiveReferenceFanoutSession
  readonly snapshot: null
}

interface BeforeActiveReferenceQueuedResult {
  readonly session: ActiveReferenceFanoutSession
  readonly snapshot: FanoutIterationSnapshot | null
}

type ReferenceListValidation =
  | { readonly status: 'valid'; readonly referenceIds: readonly ReferenceId[] }
  | { readonly status: 'invalid' }
  | { readonly status: 'duplicate' }

type UnknownRecord = Record<string, unknown>

const INACTIVE_SESSION: InactiveReferenceFanoutSession = Object.freeze({
  fanout_active: false
})
const EMPTY_REFERENCE_IDS: readonly ReferenceId[] = Object.freeze([])
const PREPARATION_KEYS = new Set([
  'schema_version',
  'logical_reference_ids',
  'authoritative_reference_ids',
  'queue_position',
  'host_submission_active',
  'fanout_request_id',
  'run_key',
  'project_context_revision',
  'reference_selection_revision',
  'snapshot_lease'
])
const RECONCILIATION_STATUS_KEYS = new Set(['schema_version', 'status'])
const RECONCILED_KEYS = new Set([
  'schema_version',
  'status',
  'accepted_reference_ids'
])

function snapshotPlainRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== 'object' || value === null) return null

  try {
    if (Array.isArray(value)) return null

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null

    const snapshot: UnknownRecord = Object.create(null)
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return null

      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        return null
      }
      snapshot[key] = descriptor.value
    }
    return snapshot
  } catch {
    return null
  }
}

function snapshotJsonArray(value: unknown): readonly unknown[] | null {
  try {
    if (!Array.isArray(value)) return null

    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (
      lengthDescriptor === undefined ||
      !('value' in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      Number(lengthDescriptor.value) < 0
    ) {
      return null
    }

    const length = Number(lengthDescriptor.value)
    if (Reflect.ownKeys(value).length !== length + 1) return null

    const snapshot: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        return null
      }
      snapshot.push(descriptor.value)
    }
    return Object.freeze(snapshot)
  } catch {
    return null
  }
}

function hasExactKeys(
  value: UnknownRecord,
  allowedKeys: ReadonlySet<string>
): boolean {
  const keys = Object.keys(value)
  return (
    keys.length === allowedKeys.size &&
    keys.every((key) => allowedKeys.has(key))
  )
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFanoutRequestId(value: unknown): value is FanoutRequestId {
  return isNonBlankString(value)
}

function isReferenceId(value: unknown): value is ReferenceId {
  return isNonBlankString(value)
}

function isRunKey(value: unknown): value is RunKey {
  return isCanonicalRfc4122Uuid(value)
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isQueuePosition(value: unknown): value is QueuePosition {
  return value === -1 || value === 0
}

function validateReferenceIds(
  values: readonly unknown[]
): ReferenceListValidation {
  const result: ReferenceId[] = []
  const seen = new Set<string>()

  for (const value of values) {
    if (!isReferenceId(value)) return { status: 'invalid' }
    if (seen.has(value)) return { status: 'duplicate' }
    seen.add(value)
    result.push(value)
  }

  return {
    status: 'valid',
    referenceIds: Object.freeze(result)
  }
}

function parseFanoutReconciliation(
  input: unknown
): ParsedFanoutReconciliation | null {
  try {
    return parseFanoutReconciliationUnchecked(input)
  } catch {
    return null
  }
}

function parseFanoutReconciliationUnchecked(
  input: unknown
): ParsedFanoutReconciliation | null {
  const snapshot = snapshotPlainRecord(input)
  if (snapshot === null || snapshot.schema_version !== 1) return null

  if (snapshot.status === 'not_needed' || snapshot.status === 'unavailable') {
    if (!hasExactKeys(snapshot, RECONCILIATION_STATUS_KEYS)) return null
    return Object.freeze({
      schema_version: 1,
      status: snapshot.status
    })
  }

  if (
    snapshot.status !== 'reconciled' ||
    !hasExactKeys(snapshot, RECONCILED_KEYS)
  ) {
    return null
  }

  const acceptedReferenceValues = snapshotJsonArray(
    snapshot.accepted_reference_ids
  )
  if (acceptedReferenceValues === null) return null

  const acceptedReferenceIds = validateReferenceIds(acceptedReferenceValues)
  if (acceptedReferenceIds.status !== 'valid') return null

  return Object.freeze({
    schema_version: 1,
    status: 'reconciled',
    accepted_reference_ids: acceptedReferenceIds.referenceIds
  })
}

function referenceIdsEqual(
  first: readonly ReferenceId[],
  second: readonly ReferenceId[]
): boolean {
  if (first.length !== second.length) return false
  return first.every((referenceId, index) => referenceId === second[index])
}

function referenceIdsMatchSubmissionPrefix(
  orderedReferenceIds: readonly ReferenceId[],
  acceptedReferenceIds: readonly ReferenceId[]
): boolean {
  if (acceptedReferenceIds.length > orderedReferenceIds.length) return false

  return acceptedReferenceIds.every(
    (referenceId, index) => referenceId === orderedReferenceIds[index]
  )
}

function markReconciliationRequired(
  session: ActiveReferenceFanoutSession
): ActiveReferenceFanoutSession {
  if (session.reconciliation_required) return session
  return Object.freeze({ ...session, reconciliation_required: true })
}

function acceptedPrefixIsValid(session: ActiveReferenceFanoutSession): boolean {
  if (
    !Number.isSafeInteger(session.cursor) ||
    session.cursor < 0 ||
    session.cursor > session.expected_count ||
    session.accepted_count !== session.cursor ||
    session.accepted_reference_ids.length !== session.accepted_count ||
    session.expected_count !== session.logical_reference_ids.length ||
    session.expected_count !== session.ordered_reference_ids.length
  ) {
    return false
  }

  return session.accepted_reference_ids.every(
    (referenceId, index) => referenceId === session.ordered_reference_ids[index]
  )
}

function unknownOutcome(
  session: ActiveReferenceFanoutSession
): FanoutSubmissionOutcome {
  return Object.freeze({
    status: 'unknown',
    fanout_request_id: session.fanout_request_id,
    expected_count: session.expected_count,
    safeMessageKey: 'submission_outcome_unknown'
  })
}

/**
 * What the widget action shows the owner before anything is submitted.
 *
 * Built entirely from locally selected references. It exists so preflight step
 * 4 can present the exact N, the queue position, and the cost/time estimate for
 * confirmation before any server call and before `fanout_active` is set.
 *
 * `expected_count` is the reference count itself. The existing UI Batch Count is
 * neither read nor multiplied here, per `project-key-and-fanout.md:341`.
 */
interface ReferenceFanoutConfirmation {
  readonly expected_count: number
  readonly queue_position: QueuePosition
  readonly ordered_reference_ids: readonly ReferenceId[]
  /** One job per reference; the contract fixes this rule. */
  readonly jobs_per_reference: 1
}

export type BuildReferenceFanoutConfirmationResult =
  | {
      readonly status: 'ready'
      readonly confirmation: ReferenceFanoutConfirmation
    }
  | {
      readonly status: 'rejected'
      readonly reason:
        | 'empty_selection'
        | 'duplicate_selection'
        | 'invalid_selection'
    }

/**
 * Builds the pre-submission confirmation summary for the widget action.
 *
 * This never activates a session, never contacts a server, and never invents a
 * `run_key`. It is the last purely local step before preflight step 6.
 */
export function buildReferenceFanoutConfirmation(
  logicalReferenceIds: unknown,
  queuePosition: unknown
): BuildReferenceFanoutConfirmationResult {
  const list = snapshotJsonArray(logicalReferenceIds)
  if (list === null || !isQueuePosition(queuePosition)) {
    return Object.freeze({ status: 'rejected', reason: 'invalid_selection' })
  }

  const validation = validateReferenceIds(list)
  if (validation.status !== 'valid') {
    return Object.freeze({
      status: 'rejected',
      reason:
        validation.status === 'duplicate'
          ? 'duplicate_selection'
          : 'invalid_selection'
    })
  }
  if (validation.referenceIds.length === 0) {
    return Object.freeze({ status: 'rejected', reason: 'empty_selection' })
  }

  // Queue back preserves the confirmed order; queue front reverses it so the
  // first confirmed reference still runs first. Contract step 7.
  const ordered =
    queuePosition === 0
      ? validation.referenceIds
      : [...validation.referenceIds].reverse()

  return Object.freeze({
    status: 'ready',
    confirmation: Object.freeze({
      expected_count: validation.referenceIds.length,
      queue_position: queuePosition,
      ordered_reference_ids: Object.freeze(ordered),
      jobs_per_reference: 1
    })
  })
}

/**
 * Terminal outcome of the Phase 1 widget action after the owner confirms.
 *
 * Phase 1 ships no Omarketing backend, so the prepare endpoint of step 6 cannot
 * be reached and no `snapshot_lease`, `fanout_request_id`, or `run_key` can be
 * issued. The action therefore ends `server_unavailable` with the session still
 * inactive. Fabricating those identifiers locally would activate a session the
 * server never authorized, so it is never done.
 */
export type ConfirmedReferenceFanoutOutcome =
  | { readonly status: 'ready'; readonly session: ActiveReferenceFanoutSession }
  | {
      readonly status: 'server_unavailable'
      readonly session: InactiveReferenceFanoutSession
    }
  | {
      readonly status: 'rejected'
      readonly session: InactiveReferenceFanoutSession
      readonly reason:
        | 'submission_busy'
        | 'empty_selection'
        | 'duplicate_selection'
        | 'invalid_selection'
        | 'invalid_preparation'
    }

/**
 * Applies a prepare-endpoint response after the owner confirmed.
 *
 * `preparation` is the opaque server response. `null` or `undefined` means the
 * endpoint was unreachable, which is the normal Phase 1 path and is reported as
 * `server_unavailable` rather than as a failure of the owner's input.
 */
export function applyConfirmedReferenceFanout(
  preparation: unknown
): ConfirmedReferenceFanoutOutcome {
  if (preparation === null || preparation === undefined) {
    return Object.freeze({
      status: 'server_unavailable',
      session: INACTIVE_SESSION
    })
  }

  const prepared = prepareReferenceFanout(preparation)
  return prepared.status === 'ready'
    ? Object.freeze({ status: 'ready', session: prepared.session })
    : Object.freeze({
        status: 'rejected',
        session: INACTIVE_SESSION,
        reason: prepared.reason
      })
}

/**
 * Cancels the widget action and returns a fully inactive session.
 *
 * Idempotent: cancelling an already-inactive session is a no-op. Phase 1
 * exposes no retry entry point, so cancellation is always a complete teardown
 * rather than a pause that could later resume with stale identifiers.
 */
export function cancelReferenceFanout(
  session: ReferenceFanoutSession
): InactiveReferenceFanoutSession {
  return cleanupReferenceFanout(session)
}

export function createInactiveReferenceFanoutSession(): InactiveReferenceFanoutSession {
  return INACTIVE_SESSION
}

export function prepareReferenceFanout(
  input: unknown
): PrepareReferenceFanoutResult {
  try {
    return prepareReferenceFanoutUnchecked(input)
  } catch {
    return Object.freeze({
      status: 'rejected',
      reason: 'invalid_preparation'
    })
  }
}

function prepareReferenceFanoutUnchecked(
  input: unknown
): PrepareReferenceFanoutResult {
  const preparation = snapshotPlainRecord(input)
  if (
    preparation === null ||
    preparation.schema_version !== 1 ||
    !hasExactKeys(preparation, PREPARATION_KEYS)
  ) {
    return Object.freeze({
      status: 'rejected',
      reason: 'invalid_preparation'
    })
  }

  if (
    typeof preparation.host_submission_active !== 'boolean' ||
    !isQueuePosition(preparation.queue_position)
  ) {
    return Object.freeze({
      status: 'rejected',
      reason: 'invalid_preparation'
    })
  }

  if (preparation.host_submission_active) {
    return Object.freeze({ status: 'rejected', reason: 'submission_busy' })
  }

  const logicalReferenceValues = snapshotJsonArray(
    preparation.logical_reference_ids
  )
  const authoritativeReferenceValues = snapshotJsonArray(
    preparation.authoritative_reference_ids
  )
  if (
    logicalReferenceValues === null ||
    authoritativeReferenceValues === null
  ) {
    return Object.freeze({
      status: 'rejected',
      reason: 'invalid_preparation'
    })
  }

  const logical = validateReferenceIds(logicalReferenceValues)
  if (logical.status === 'duplicate') {
    return Object.freeze({ status: 'rejected', reason: 'duplicate_selection' })
  }
  if (logical.status === 'invalid') {
    return Object.freeze({ status: 'rejected', reason: 'invalid_selection' })
  }
  if (logical.referenceIds.length === 0) {
    return Object.freeze({ status: 'rejected', reason: 'empty_selection' })
  }

  const authoritative = validateReferenceIds(authoritativeReferenceValues)
  if (
    authoritative.status !== 'valid' ||
    !referenceIdsEqual(logical.referenceIds, authoritative.referenceIds) ||
    !isFanoutRequestId(preparation.fanout_request_id) ||
    !isRunKey(preparation.run_key) ||
    !isProjectContextRevision(preparation.project_context_revision) ||
    !isRevision(preparation.reference_selection_revision) ||
    !isNonBlankString(preparation.snapshot_lease)
  ) {
    return Object.freeze({
      status: 'rejected',
      reason: 'invalid_preparation'
    })
  }

  const orderedReferenceIds = Object.freeze(
    preparation.queue_position === -1
      ? [...logical.referenceIds].reverse()
      : [...logical.referenceIds]
  )
  const session: ActiveReferenceFanoutSession = Object.freeze({
    fanout_active: true,
    fanout_request_id: preparation.fanout_request_id,
    logical_reference_ids: logical.referenceIds,
    ordered_reference_ids: orderedReferenceIds,
    run_key: preparation.run_key,
    cursor: 0,
    expected_count: logical.referenceIds.length,
    accepted_count: 0,
    accepted_reference_ids: EMPTY_REFERENCE_IDS,
    queue_position: preparation.queue_position,
    project_context_revision: preparation.project_context_revision,
    reference_selection_revision: preparation.reference_selection_revision,
    snapshot_lease: preparation.snapshot_lease,
    in_flight_reference_id: null,
    reconciliation_required: false
  })
  const queuePromptArguments: readonly [QueuePosition, number] = Object.freeze([
    preparation.queue_position,
    session.expected_count
  ])

  return Object.freeze({
    status: 'ready',
    session,
    queue_prompt_arguments: queuePromptArguments
  })
}

export function beforeReferenceQueued(
  session: InactiveReferenceFanoutSession
): BeforeInactiveReferenceQueuedResult
export function beforeReferenceQueued(
  session: ActiveReferenceFanoutSession
): BeforeActiveReferenceQueuedResult
export function beforeReferenceQueued(
  session: ReferenceFanoutSession
): BeforeInactiveReferenceQueuedResult | BeforeActiveReferenceQueuedResult {
  if (!session.fanout_active) {
    return Object.freeze({ session, snapshot: null })
  }

  if (
    session.reconciliation_required ||
    !acceptedPrefixIsValid(session) ||
    session.cursor >= session.expected_count ||
    session.in_flight_reference_id !== null
  ) {
    return Object.freeze({
      session: markReconciliationRequired(session),
      snapshot: null
    })
  }

  const referenceId = session.ordered_reference_ids[session.cursor]
  const logicalOrdinal = session.logical_reference_ids.indexOf(referenceId)
  if (logicalOrdinal < 0) {
    return Object.freeze({
      session: markReconciliationRequired(session),
      snapshot: null
    })
  }

  const snapshot: FanoutIterationSnapshot = Object.freeze({
    schema_version: 1,
    fanout_request_id: session.fanout_request_id,
    reference_id: referenceId,
    logical_ordinal: logicalOrdinal,
    expected_count: session.expected_count,
    run_key: session.run_key,
    project_context_revision: session.project_context_revision,
    reference_selection_revision: session.reference_selection_revision,
    snapshot_lease: session.snapshot_lease
  })

  return Object.freeze({
    session: Object.freeze({
      ...session,
      in_flight_reference_id: referenceId
    }),
    snapshot
  })
}

export function afterReferenceQueued(
  session: InactiveReferenceFanoutSession
): InactiveReferenceFanoutSession
export function afterReferenceQueued(
  session: ActiveReferenceFanoutSession
): ActiveReferenceFanoutSession
export function afterReferenceQueued(
  session: ReferenceFanoutSession
): ReferenceFanoutSession {
  if (!session.fanout_active || session.reconciliation_required) return session

  const expectedReferenceId = session.ordered_reference_ids[session.cursor]
  if (
    !acceptedPrefixIsValid(session) ||
    session.cursor >= session.expected_count ||
    session.in_flight_reference_id !== expectedReferenceId
  ) {
    return markReconciliationRequired(session)
  }

  return Object.freeze({
    ...session,
    cursor: session.cursor + 1,
    accepted_count: session.accepted_count + 1,
    accepted_reference_ids: Object.freeze([
      ...session.accepted_reference_ids,
      expectedReferenceId
    ]),
    in_flight_reference_id: null
  })
}

export function resolveReferenceFanoutOutcome(
  session: ActiveReferenceFanoutSession,
  input: unknown
): FanoutSubmissionOutcome {
  const reconciliation = parseFanoutReconciliation(input)
  if (reconciliation === null) return unknownOutcome(session)

  if (reconciliation.status === 'unavailable') return unknownOutcome(session)

  if (reconciliation.status === 'not_needed') {
    if (
      session.reconciliation_required ||
      !acceptedPrefixIsValid(session) ||
      session.cursor !== session.expected_count ||
      session.in_flight_reference_id !== null
    ) {
      return unknownOutcome(session)
    }

    return Object.freeze({
      status: 'complete',
      accepted: session.logical_reference_ids,
      expected_count: session.expected_count
    })
  }

  const authoritative = reconciliation.accepted_reference_ids
  if (
    !acceptedPrefixIsValid(session) ||
    !referenceIdsMatchSubmissionPrefix(
      session.ordered_reference_ids,
      authoritative
    )
  ) {
    return unknownOutcome(session)
  }

  const authoritativeSet = new Set<string>(authoritative)
  const logicalSet = new Set<string>(session.logical_reference_ids)
  if (
    authoritative.some((referenceId) => !logicalSet.has(referenceId)) ||
    session.accepted_reference_ids.some(
      (referenceId) => !authoritativeSet.has(referenceId)
    )
  ) {
    return unknownOutcome(session)
  }

  const accepted = Object.freeze(
    session.logical_reference_ids.filter((referenceId) =>
      authoritativeSet.has(referenceId)
    )
  )
  if (accepted.length === session.expected_count) {
    return Object.freeze({
      status: 'complete',
      accepted,
      expected_count: session.expected_count
    })
  }

  const unsubmitted = Object.freeze(
    session.logical_reference_ids.filter(
      (referenceId) => !authoritativeSet.has(referenceId)
    )
  )
  return Object.freeze({
    status: 'partial',
    accepted,
    unsubmitted,
    accepted_count: accepted.length,
    expected_count: session.expected_count,
    safeMessageKey: 'fanout_submission_partial'
  })
}

export function getRetryableReferenceIds(
  outcome: FanoutSubmissionOutcome
): readonly ReferenceId[] {
  return outcome.status === 'partial'
    ? outcome.unsubmitted
    : EMPTY_REFERENCE_IDS
}

export function cleanupReferenceFanout(
  session: ReferenceFanoutSession
): InactiveReferenceFanoutSession {
  return session.fanout_active ? INACTIVE_SESSION : session
}
