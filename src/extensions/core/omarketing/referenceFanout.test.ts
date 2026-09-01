import { describe, expect, it } from 'vitest'

import fanoutFixture from '../../../../.hermes/phase0/fixtures/fanout-session.cases.json' with { type: 'json' }

import {
  afterReferenceQueued,
  beforeReferenceQueued,
  applyConfirmedReferenceFanout,
  buildReferenceFanoutConfirmation,
  cancelReferenceFanout,
  cleanupReferenceFanout,
  createInactiveReferenceFanoutSession,
  getRetryableReferenceIds,
  prepareReferenceFanout,
  resolveReferenceFanoutOutcome
} from './referenceFanout'
import type { QueuePosition } from './referenceFanout'

const RUN_KEY = '123e4567-e89b-42d3-a456-426614174000'

interface PreparationDocument {
  readonly schema_version: 1
  readonly logical_reference_ids: readonly string[]
  readonly authoritative_reference_ids: readonly string[]
  readonly queue_position: QueuePosition
  readonly host_submission_active: boolean
  readonly fanout_request_id: string
  readonly run_key: string
  readonly project_context_revision: number
  readonly reference_selection_revision: number
  readonly snapshot_lease: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function readReferenceIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  const items: unknown[] = value
  if (!items.every((item): item is string => typeof item === 'string')) {
    throw new Error(`${label} must contain only strings`)
  }
  return items
}

function readFixtureCase(id: string): Record<string, unknown> {
  const fixtureCase: unknown = fanoutFixture.cases.find(
    (candidate) => candidate.id === id
  )
  if (!isRecord(fixtureCase)) throw new Error(`Missing fixture case: ${id}`)
  return fixtureCase
}

function readQueuePosition(value: unknown): QueuePosition {
  if (value === -1 || value === 0) return value
  throw new Error(`Invalid queue position fixture: ${String(value)}`)
}

function prepareInput(
  logicalReferenceIds: readonly string[],
  queuePosition: QueuePosition = 0,
  overrides: Partial<PreparationDocument> = {}
): PreparationDocument {
  return {
    schema_version: 1,
    logical_reference_ids: logicalReferenceIds,
    authoritative_reference_ids: logicalReferenceIds,
    queue_position: queuePosition,
    host_submission_active: false,
    fanout_request_id: 'fanout-request-fixture',
    run_key: RUN_KEY,
    project_context_revision: 7,
    reference_selection_revision: 11,
    snapshot_lease: 'snapshot-lease-fixture',
    ...overrides
  }
}

function withoutPreparationField(
  field: keyof PreparationDocument
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...prepareInput(['ref-A']) }
  delete input[field]
  return input
}

function prepareReady(
  logicalReferenceIds: readonly string[],
  queuePosition: QueuePosition = 0,
  overrides: Partial<PreparationDocument> = {}
) {
  const result = prepareReferenceFanout(
    prepareInput(logicalReferenceIds, queuePosition, overrides)
  )
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') {
    throw new Error(`Fan-out preparation failed: ${result.reason}`)
  }
  return result
}

describe('inactive fan-out fixture boundaries', () => {
  it.for([
    'normal-run-noop',
    'shift-run-queue-front-noop',
    'auto-queue-change-noop',
    'auto-queue-instant-noop'
  ])('keeps callbacks as a complete no-op for $id', (id) => {
    const fixtureCase = readFixtureCase(id)
    const expected = readRecord(fixtureCase.expected, `${id}.expected`)
    const session = createInactiveReferenceFanoutSession()

    const before = beforeReferenceQueued(session)
    const after = afterReferenceQueued(session)

    expect(expected.omarketing_queue_prompt_calls).toBe(0)
    expect(before.snapshot).toBeNull()
    expect(before.session).toBe(session)
    expect(after).toBe(session)
    expect(session).toEqual({ fanout_active: false })
    expect(Object.keys(session)).toEqual(['fanout_active'])
  })
})

describe('selected-items fan-out fixture ordering', () => {
  it.for(['selected-items-back-three', 'selected-items-front-three'])(
    'plans one host batch and snapshots one reference per iteration for $id',
    (id) => {
      const fixtureCase = readFixtureCase(id)
      const logicalReferenceIds = readReferenceIds(
        fixtureCase.logical_reference_ids,
        `${id}.logical_reference_ids`
      )
      const queuePosition = readQueuePosition(fixtureCase.queue_position)
      const expected = readRecord(fixtureCase.expected, `${id}.expected`)
      const plan = prepareReady(logicalReferenceIds, queuePosition)

      expect(expected.omarketing_queue_prompt_calls).toBe(1)
      expect(plan.queue_prompt_arguments).toEqual([
        queuePosition,
        logicalReferenceIds.length
      ])

      let session = plan.session
      const submittedReferenceIds: string[] = []
      const submittedRunKeys: string[] = []

      for (let index = 0; index < logicalReferenceIds.length; index += 1) {
        const before = beforeReferenceQueued(session)
        expect(before.snapshot).not.toBeNull()
        if (before.snapshot === null) {
          throw new Error(`Missing iteration snapshot ${index} for ${id}`)
        }

        submittedReferenceIds.push(before.snapshot.reference_id)
        submittedRunKeys.push(before.snapshot.run_key)
        expect(before.snapshot.logical_ordinal).toBe(
          logicalReferenceIds.indexOf(before.snapshot.reference_id)
        )
        session = afterReferenceQueued(before.session)
      }

      const expectedSubmissionIds = readReferenceIds(
        queuePosition === 0
          ? expected.prompt_reference_ids
          : expected.submission_reference_ids,
        `${id}.expected submission IDs`
      )
      expect(submittedReferenceIds).toEqual(expectedSubmissionIds)
      expect(new Set(submittedRunKeys).size).toBe(expected.distinct_run_keys)
      expect(submittedRunKeys).toEqual(
        Array.from({ length: logicalReferenceIds.length }, () => RUN_KEY)
      )

      const outcome = resolveReferenceFanoutOutcome(session, {
        schema_version: 1,
        status: 'not_needed'
      })
      expect(outcome).toEqual({
        status: 'complete',
        accepted: logicalReferenceIds,
        expected_count: logicalReferenceIds.length
      })
      expect(cleanupReferenceFanout(session)).toEqual({
        fanout_active: false
      })
    }
  )

  it('copies the confirmed order so caller mutation cannot reorder a session', () => {
    const logicalReferenceIds = ['ref-B', 'ref-A', 'ref-C']
    const authoritativeReferenceIds = [...logicalReferenceIds]
    const plan = prepareReady(logicalReferenceIds, 0, {
      authoritative_reference_ids: authoritativeReferenceIds
    })

    logicalReferenceIds.reverse()
    authoritativeReferenceIds.splice(0)

    expect(plan.session.logical_reference_ids).toEqual([
      'ref-B',
      'ref-A',
      'ref-C'
    ])
    expect(plan.session.ordered_reference_ids).toEqual([
      'ref-B',
      'ref-A',
      'ref-C'
    ])
  })
})

describe('fan-out admission validation', () => {
  it('rejects non-objects, schema drift, and unexpected preparation fields', () => {
    const valid = prepareInput(['ref-A'])
    const { schema_version: _schemaVersion, ...missingSchemaVersion } = valid
    const malformedInputs: readonly unknown[] = [
      null,
      [],
      'preparation',
      1,
      new Date(0),
      missingSchemaVersion,
      { ...valid, schema_version: '1' },
      { ...valid, schema_version: 2 },
      { ...valid, unexpected: true }
    ]

    for (const input of malformedInputs) {
      let result: ReturnType<typeof prepareReferenceFanout> | undefined

      expect(() => {
        result = prepareReferenceFanout(input)
      }).not.toThrow()
      expect(result).toEqual({
        status: 'rejected',
        reason: 'invalid_preparation'
      })
      expect(result).not.toHaveProperty('queue_prompt_arguments')
    }
  })

  it.for([
    {
      label: 'revoked preparation proxy',
      createInput: () => {
        const { proxy, revoke } = Proxy.revocable(prepareInput(['ref-A']), {})
        revoke()
        return proxy
      }
    },
    {
      label: 'throwing reference iterator',
      createInput: () => {
        const logicalReferenceIds = ['ref-A']
        Object.defineProperty(logicalReferenceIds, Symbol.iterator, {
          value: () => {
            throw new Error('iterator trap')
          }
        })
        return {
          ...prepareInput(['ref-A']),
          logical_reference_ids: logicalReferenceIds
        }
      }
    },
    {
      label: 'iterator-hidden empty selection',
      createInput: () => {
        const referenceIds = ['ref-A']
        Object.defineProperty(referenceIds, Symbol.iterator, {
          value: function* () {}
        })
        return {
          ...prepareInput(['ref-A']),
          logical_reference_ids: referenceIds,
          authoritative_reference_ids: referenceIds
        }
      }
    },
    {
      label: 'changing queue-position accessor',
      createInput: () => {
        const input = { ...prepareInput(['ref-A']) }
        let reads = 0
        Object.defineProperty(input, 'queue_position', {
          enumerable: true,
          get: () => {
            reads += 1
            return reads === 1 ? 0 : 1
          }
        })
        return input
      }
    }
  ])('rejects hostile preparation objects: $label', ({ createInput }) => {
    let result: ReturnType<typeof prepareReferenceFanout> | undefined

    expect(() => {
      result = prepareReferenceFanout(createInput())
    }).not.toThrow()
    expect(result).toEqual({
      status: 'rejected',
      reason: 'invalid_preparation'
    })
    expect(result).not.toHaveProperty('queue_prompt_arguments')
  })

  it.for([
    {
      label: 'logical string',
      input: {
        ...prepareInput(['A', 'B']),
        logical_reference_ids: 'AB'
      },
      reason: 'invalid_preparation'
    },
    {
      label: 'logical null',
      input: {
        ...prepareInput(['ref-A']),
        logical_reference_ids: null
      },
      reason: 'invalid_preparation'
    },
    {
      label: 'logical object',
      input: {
        ...prepareInput(['ref-A']),
        logical_reference_ids: {}
      },
      reason: 'invalid_preparation'
    },
    {
      label: 'logical non-string element',
      input: {
        ...prepareInput(['ref-A']),
        logical_reference_ids: [1]
      },
      reason: 'invalid_selection'
    },
    {
      label: 'logical blank element',
      input: {
        ...prepareInput(['ref-A']),
        logical_reference_ids: [' ']
      },
      reason: 'invalid_selection'
    },
    {
      label: 'authoritative string',
      input: {
        ...prepareInput(['A', 'B']),
        authoritative_reference_ids: 'AB'
      },
      reason: 'invalid_preparation'
    },
    {
      label: 'authoritative null',
      input: {
        ...prepareInput(['ref-A']),
        authoritative_reference_ids: null
      },
      reason: 'invalid_preparation'
    },
    {
      label: 'authoritative object',
      input: {
        ...prepareInput(['ref-A']),
        authoritative_reference_ids: {}
      },
      reason: 'invalid_preparation'
    },
    {
      label: 'authoritative non-string element',
      input: {
        ...prepareInput(['ref-A']),
        authoritative_reference_ids: [null]
      },
      reason: 'invalid_preparation'
    }
  ])('rejects malformed reference lists: $label', ({ input, reason }) => {
    let result: ReturnType<typeof prepareReferenceFanout> | undefined

    expect(() => {
      result = prepareReferenceFanout(input)
    }).not.toThrow()
    expect(result).toEqual({ status: 'rejected', reason })
    expect(result).not.toHaveProperty('queue_prompt_arguments')
  })

  it.for([
    {
      label: 'missing fan-out request ID',
      input: withoutPreparationField('fanout_request_id')
    },
    {
      label: 'missing run key',
      input: withoutPreparationField('run_key')
    },
    {
      label: 'missing project context revision',
      input: withoutPreparationField('project_context_revision')
    },
    {
      label: 'missing reference selection revision',
      input: withoutPreparationField('reference_selection_revision')
    },
    {
      label: 'missing snapshot lease',
      input: withoutPreparationField('snapshot_lease')
    },
    {
      label: 'null fan-out request ID',
      input: { ...prepareInput(['ref-A']), fanout_request_id: null }
    },
    {
      label: 'blank fan-out request ID',
      input: { ...prepareInput(['ref-A']), fanout_request_id: '  ' }
    },
    {
      label: 'null run key',
      input: { ...prepareInput(['ref-A']), run_key: null }
    },
    {
      label: 'noncanonical run key',
      input: { ...prepareInput(['ref-A']), run_key: RUN_KEY.toUpperCase() }
    },
    {
      label: 'string project context revision',
      input: { ...prepareInput(['ref-A']), project_context_revision: '7' }
    },
    {
      label: 'fractional project context revision',
      input: { ...prepareInput(['ref-A']), project_context_revision: 1.5 }
    },
    {
      label: 'string reference selection revision',
      input: { ...prepareInput(['ref-A']), reference_selection_revision: '11' }
    },
    {
      label: 'negative reference selection revision',
      input: { ...prepareInput(['ref-A']), reference_selection_revision: -1 }
    },
    {
      label: 'null snapshot lease',
      input: { ...prepareInput(['ref-A']), snapshot_lease: null }
    },
    {
      label: 'object snapshot lease',
      input: { ...prepareInput(['ref-A']), snapshot_lease: {} }
    },
    {
      label: 'array snapshot lease',
      input: { ...prepareInput(['ref-A']), snapshot_lease: [] }
    },
    {
      label: 'blank snapshot lease',
      input: { ...prepareInput(['ref-A']), snapshot_lease: '  ' }
    }
  ])('rejects malformed preparation scalars: $label', ({ input }) => {
    let result: ReturnType<typeof prepareReferenceFanout> | undefined

    expect(() => {
      result = prepareReferenceFanout(input)
    }).not.toThrow()
    expect(result).toEqual({
      status: 'rejected',
      reason: 'invalid_preparation'
    })
    expect(result).not.toHaveProperty('queue_prompt_arguments')
  })

  it.for([
    {
      label: 'null host submission flag',
      input: { ...prepareInput(['ref-A']), host_submission_active: null }
    },
    {
      label: 'numeric host submission flag',
      input: { ...prepareInput(['ref-A']), host_submission_active: 0 }
    },
    {
      label: 'object host submission flag',
      input: { ...prepareInput(['ref-A']), host_submission_active: {} }
    },
    {
      label: 'queue position one',
      input: { ...prepareInput(['ref-A']), queue_position: 1 }
    },
    {
      label: 'queue position minus two',
      input: { ...prepareInput(['ref-A']), queue_position: -2 }
    },
    {
      label: 'string queue position',
      input: { ...prepareInput(['ref-A']), queue_position: '-1' }
    },
    {
      label: 'null queue position',
      input: { ...prepareInput(['ref-A']), queue_position: null }
    }
  ])('rejects non-exact runtime controls: $label', ({ input }) => {
    let result: ReturnType<typeof prepareReferenceFanout> | undefined

    expect(() => {
      result = prepareReferenceFanout(input)
    }).not.toThrow()
    expect(result).toEqual({
      status: 'rejected',
      reason: 'invalid_preparation'
    })
    expect(result).not.toHaveProperty('queue_prompt_arguments')
  })

  it.for([
    { ids: [], reason: 'empty_selection' },
    { ids: ['ref-A', 'ref-A'], reason: 'duplicate_selection' }
  ])('rejects $reason without producing queue arguments', ({ ids, reason }) => {
    const result = prepareReferenceFanout(prepareInput(ids))

    expect(result).toEqual({ status: 'rejected', reason })
    expect(result).not.toHaveProperty('queue_prompt_arguments')
  })

  it.for([
    {
      label: 'noncanonical run key',
      overrides: { run_key: RUN_KEY.toUpperCase() }
    },
    {
      label: 'missing authoritative reference',
      overrides: { authoritative_reference_ids: ['ref-A'] }
    },
    {
      label: 'extra authoritative reference',
      overrides: {
        authoritative_reference_ids: ['ref-A', 'ref-B', 'ref-C']
      }
    },
    {
      label: 'duplicate authoritative reference',
      overrides: {
        authoritative_reference_ids: ['ref-A', 'ref-A']
      }
    },
    {
      label: 'missing snapshot lease',
      overrides: { snapshot_lease: '' }
    },
    {
      label: 'invalid project context revision',
      overrides: { project_context_revision: -1 }
    }
  ] satisfies readonly {
    readonly label: string
    readonly overrides: Partial<PreparationDocument>
  }[])('rejects an invalid server preparation: $label', ({ overrides }) => {
    const result = prepareReferenceFanout(
      prepareInput(['ref-A', 'ref-B'], 0, overrides)
    )

    expect(result).toEqual({
      status: 'rejected',
      reason: 'invalid_preparation'
    })
  })

  it('refuses to activate while a host submission is already active', () => {
    const fixtureCase = readFixtureCase('busy-before-start')
    const expected = readRecord(
      fixtureCase.expected,
      'busy-before-start.expected'
    )
    const result = prepareReferenceFanout(
      prepareInput(['ref-A'], 0, { host_submission_active: true })
    )

    expect(result).toEqual({
      status: 'rejected',
      reason: expected.safe_error
    })
    expect(result).not.toHaveProperty('queue_prompt_arguments')
  })
})

describe('submission failure and retry boundaries', () => {
  it('advances only accepted callbacks and reconciles a rejected second submission', () => {
    const fixtureCase = readFixtureCase('second-submission-rejected')
    const logicalReferenceIds = readReferenceIds(
      fixtureCase.logical_reference_ids,
      'second-submission-rejected.logical_reference_ids'
    )
    const expected = readRecord(
      fixtureCase.expected,
      'second-submission-rejected.expected'
    )
    const plan = prepareReady(logicalReferenceIds)

    const firstBefore = beforeReferenceQueued(plan.session)
    const afterFirst = afterReferenceQueued(firstBefore.session)
    const rejectedBefore = beforeReferenceQueued(afterFirst)

    expect(rejectedBefore.session).toMatchObject({
      cursor: 1,
      accepted_count: 1,
      accepted_reference_ids: expected.accepted_reference_ids,
      in_flight_reference_id: 'ref-B'
    })

    const outcome = resolveReferenceFanoutOutcome(rejectedBefore.session, {
      schema_version: 1,
      status: 'reconciled',
      accepted_reference_ids: readReferenceIds(
        expected.accepted_reference_ids,
        'second-submission-rejected.expected.accepted_reference_ids'
      )
    })
    expect(outcome).toMatchObject({
      status: 'partial',
      accepted: expected.accepted_reference_ids,
      unsubmitted: expected.unsubmitted_reference_ids,
      accepted_count: expected.accepted_count,
      expected_count: logicalReferenceIds.length
    })
    expect(getRetryableReferenceIds(outcome)).toEqual(
      expected.unsubmitted_reference_ids
    )
    expect(cleanupReferenceFanout(rejectedBefore.session)).toEqual({
      fanout_active: false
    })
  })

  it('keeps queue-front retry items in user-confirmed logical order', () => {
    const plan = prepareReady(['ref-A', 'ref-B', 'ref-C'], -1)
    const firstBefore = beforeReferenceQueued(plan.session)
    expect(firstBefore.snapshot?.reference_id).toBe('ref-C')
    const afterFirst = afterReferenceQueued(firstBefore.session)
    const rejectedBefore = beforeReferenceQueued(afterFirst)
    expect(rejectedBefore.snapshot?.reference_id).toBe('ref-B')

    const outcome = resolveReferenceFanoutOutcome(rejectedBefore.session, {
      schema_version: 1,
      status: 'reconciled',
      accepted_reference_ids: ['ref-C']
    })

    expect(outcome).toMatchObject({
      status: 'partial',
      accepted: ['ref-C'],
      unsubmitted: ['ref-A', 'ref-B']
    })
    expect(getRetryableReferenceIds(outcome)).toEqual(['ref-A', 'ref-B'])
  })

  it.for([
    { label: 'queue back', queuePosition: 0 as const },
    { label: 'queue front', queuePosition: -1 as const }
  ])(
    'does not authorize retries from a non-prefix receipt for $label',
    ({ queuePosition }) => {
      const plan = prepareReady(['ref-A', 'ref-B', 'ref-C'], queuePosition)
      const outcome = resolveReferenceFanoutOutcome(plan.session, {
        schema_version: 1,
        status: 'reconciled',
        accepted_reference_ids: ['ref-B']
      })

      expect(outcome).toEqual({
        status: 'unknown',
        fanout_request_id: 'fanout-request-fixture',
        expected_count: 3,
        safeMessageKey: 'submission_outcome_unknown'
      })
      expect(getRetryableReferenceIds(outcome)).toEqual([])
    }
  )

  it.for([
    {
      label: 'queue back',
      queuePosition: 0 as const,
      orderedReferenceIds: ['ref-A', 'ref-B', 'ref-C'],
      acceptedReferenceIds: ['ref-B', 'ref-A']
    },
    {
      label: 'queue front',
      queuePosition: -1 as const,
      orderedReferenceIds: ['ref-C', 'ref-B', 'ref-A'],
      acceptedReferenceIds: ['ref-B', 'ref-C']
    }
  ])(
    'does not authorize retries from a permuted prefix receipt for $label',
    ({ queuePosition, orderedReferenceIds, acceptedReferenceIds }) => {
      const plan = prepareReady(['ref-A', 'ref-B', 'ref-C'], queuePosition)
      expect(plan.session.ordered_reference_ids).toEqual(orderedReferenceIds)

      const outcome = resolveReferenceFanoutOutcome(plan.session, {
        schema_version: 1,
        status: 'reconciled',
        accepted_reference_ids: acceptedReferenceIds
      })

      expect(outcome).toEqual({
        status: 'unknown',
        fanout_request_id: 'fanout-request-fixture',
        expected_count: 3,
        safeMessageKey: 'submission_outcome_unknown'
      })
      expect(getRetryableReferenceIds(outcome)).toEqual([])
    }
  )

  it('uses authoritative reconciliation when acceptance preceded a sibling callback failure', () => {
    const fixtureCase = readFixtureCase(
      'accepted-before-sibling-callback-throws'
    )
    const logicalReferenceIds = readReferenceIds(
      fixtureCase.logical_reference_ids,
      'accepted-before-sibling-callback-throws.logical_reference_ids'
    )
    const expected = readRecord(
      fixtureCase.expected,
      'accepted-before-sibling-callback-throws.expected'
    )
    const plan = prepareReady(logicalReferenceIds)
    const acceptedWithoutLocalCallback = beforeReferenceQueued(plan.session)

    expect(acceptedWithoutLocalCallback.session).toMatchObject({
      accepted_count: expected.client_callback_accepted_count,
      cursor: 0,
      in_flight_reference_id: 'ref-A'
    })

    const outcome = resolveReferenceFanoutOutcome(
      acceptedWithoutLocalCallback.session,
      {
        schema_version: 1,
        status: 'reconciled',
        accepted_reference_ids: readReferenceIds(
          expected.accepted_reference_ids,
          'accepted-before-sibling-callback-throws.expected.accepted_reference_ids'
        )
      }
    )
    expect(outcome).toMatchObject({
      status: 'partial',
      accepted: expected.accepted_reference_ids,
      unsubmitted: expected.unsubmitted_reference_ids,
      accepted_count: expected.server_authoritative_accepted_count
    })
    expect(getRetryableReferenceIds(outcome)).toEqual(
      expected.unsubmitted_reference_ids
    )
    expect(getRetryableReferenceIds(outcome)).not.toContain('ref-A')
  })

  it('returns unknown and no retry list when reconciliation is unavailable', () => {
    const fixtureCase = readFixtureCase('reconciliation-unavailable')
    const logicalReferenceIds = readReferenceIds(
      fixtureCase.logical_reference_ids,
      'reconciliation-unavailable.logical_reference_ids'
    )
    const expected = readRecord(
      fixtureCase.expected,
      'reconciliation-unavailable.expected'
    )
    const plan = prepareReady(logicalReferenceIds)

    const outcome = resolveReferenceFanoutOutcome(plan.session, {
      schema_version: 1,
      status: 'unavailable'
    })

    expect(outcome).toEqual({
      status: 'unknown',
      fanout_request_id: 'fanout-request-fixture',
      expected_count: logicalReferenceIds.length,
      safeMessageKey: expected.receipt
    })
    expect(getRetryableReferenceIds(outcome)).toEqual([])
  })

  it.for([
    { label: 'null', input: null },
    { label: 'array', input: [] },
    { label: 'string', input: 'reconciled' },
    { label: 'non-plain object', input: new Date(0) },
    {
      label: 'missing schema version',
      input: { status: 'reconciled', accepted_reference_ids: [] }
    },
    {
      label: 'string schema version',
      input: {
        schema_version: '1',
        status: 'reconciled',
        accepted_reference_ids: []
      }
    },
    {
      label: 'future schema version',
      input: {
        schema_version: 2,
        status: 'reconciled',
        accepted_reference_ids: []
      }
    },
    {
      label: 'unexpected field',
      input: {
        schema_version: 1,
        status: 'reconciled',
        accepted_reference_ids: [],
        unexpected: true
      }
    },
    {
      label: 'missing accepted IDs',
      input: { schema_version: 1, status: 'reconciled' }
    },
    {
      label: 'string accepted IDs',
      input: {
        schema_version: 1,
        status: 'reconciled',
        accepted_reference_ids: 'AB'
      }
    },
    {
      label: 'null accepted IDs',
      input: {
        schema_version: 1,
        status: 'reconciled',
        accepted_reference_ids: null
      }
    },
    {
      label: 'object accepted IDs',
      input: {
        schema_version: 1,
        status: 'reconciled',
        accepted_reference_ids: {}
      }
    },
    {
      label: 'non-string accepted ID',
      input: {
        schema_version: 1,
        status: 'reconciled',
        accepted_reference_ids: [1]
      }
    },
    {
      label: 'duplicate accepted ID',
      input: {
        schema_version: 1,
        status: 'reconciled',
        accepted_reference_ids: ['A', 'A']
      }
    },
    {
      label: 'unknown status',
      input: {
        schema_version: 1,
        status: 'complete',
        accepted_reference_ids: []
      }
    },
    {
      label: 'status-field mismatch',
      input: {
        schema_version: 1,
        status: 'unavailable',
        accepted_reference_ids: []
      }
    }
  ])('fails closed for malformed reconciliation: $label', ({ input }) => {
    const session = prepareReady(['A', 'B']).session
    let outcome: ReturnType<typeof resolveReferenceFanoutOutcome> | undefined

    expect(() => {
      outcome = resolveReferenceFanoutOutcome(session, input)
    }).not.toThrow()
    expect(outcome).toEqual({
      status: 'unknown',
      fanout_request_id: 'fanout-request-fixture',
      expected_count: 2,
      safeMessageKey: 'submission_outcome_unknown'
    })
    expect(getRetryableReferenceIds(outcome!)).toEqual([])
  })

  it.for([
    {
      label: 'revoked reconciliation proxy',
      createInput: () => {
        const { proxy, revoke } = Proxy.revocable(
          {
            schema_version: 1,
            status: 'reconciled',
            accepted_reference_ids: []
          },
          {}
        )
        revoke()
        return proxy
      }
    },
    {
      label: 'throwing accepted-ID iterator',
      createInput: () => {
        const acceptedReferenceIds: unknown[] = []
        Object.defineProperty(acceptedReferenceIds, Symbol.iterator, {
          value: () => {
            throw new Error('iterator trap')
          }
        })
        return {
          schema_version: 1,
          status: 'reconciled',
          accepted_reference_ids: acceptedReferenceIds
        }
      }
    },
    {
      label: 'throwing status accessor',
      createInput: () => {
        const input = {
          schema_version: 1,
          accepted_reference_ids: []
        }
        return Object.defineProperty(input, 'status', {
          enumerable: true,
          get: () => {
            throw new Error('status trap')
          }
        })
      }
    }
  ])('fails closed for hostile reconciliation: $label', ({ createInput }) => {
    const session = prepareReady(['ref-A']).session
    let outcome: ReturnType<typeof resolveReferenceFanoutOutcome> | undefined

    expect(() => {
      outcome = resolveReferenceFanoutOutcome(session, createInput())
    }).not.toThrow()
    expect(outcome).toEqual({
      status: 'unknown',
      fanout_request_id: 'fanout-request-fixture',
      expected_count: 1,
      safeMessageKey: 'submission_outcome_unknown'
    })
    expect(getRetryableReferenceIds(outcome!)).toEqual([])
  })

  it('rejects reconciliation fields that do not match not-needed status', () => {
    const plan = prepareReady(['ref-A'])
    const before = beforeReferenceQueued(plan.session)
    const completeSession = afterReferenceQueued(before.session)
    const outcome = resolveReferenceFanoutOutcome(completeSession, {
      schema_version: 1,
      status: 'not_needed',
      accepted_reference_ids: []
    })

    expect(outcome.status).toBe('unknown')
    expect(getRetryableReferenceIds(outcome)).toEqual([])
  })

  it('does not expose retry items after complete submission', () => {
    const plan = prepareReady(['ref-A'])
    const before = beforeReferenceQueued(plan.session)
    const completeSession = afterReferenceQueued(before.session)
    const outcome = resolveReferenceFanoutOutcome(completeSession, {
      schema_version: 1,
      status: 'not_needed'
    })

    expect(getRetryableReferenceIds(outcome)).toEqual([])
  })
})

describe('callback invariant isolation and cleanup', () => {
  it('marks reconciliation required instead of throwing or advancing twice', () => {
    const plan = prepareReady(['ref-A', 'ref-B'])
    const firstBefore = beforeReferenceQueued(plan.session)

    const duplicateBefore = beforeReferenceQueued(firstBefore.session)
    expect(duplicateBefore.snapshot).toBeNull()
    expect(duplicateBefore.session).toMatchObject({
      cursor: 0,
      accepted_count: 0,
      in_flight_reference_id: 'ref-A',
      reconciliation_required: true
    })

    const ignoredAfter = afterReferenceQueued(duplicateBefore.session)
    expect(ignoredAfter).toBe(duplicateBefore.session)
  })

  it('marks reconciliation required when afterQueued has no in-flight item', () => {
    const plan = prepareReady(['ref-A'])

    expect(afterReferenceQueued(plan.session)).toMatchObject({
      cursor: 0,
      accepted_count: 0,
      reconciliation_required: true
    })
  })

  it('cleans up idempotently without retaining fan-out state', () => {
    const plan = prepareReady(['ref-A'])
    const inactive = cleanupReferenceFanout(plan.session)

    expect(inactive).toEqual({ fanout_active: false })
    expect(cleanupReferenceFanout(inactive)).toBe(inactive)
  })
})

describe('widget action confirmation summary (preflight step 4)', () => {
  it('reports the exact N without consulting any batch count', () => {
    const result = buildReferenceFanoutConfirmation(
      ['ref-A', 'ref-B', 'ref-C'],
      0
    )

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.confirmation.expected_count).toBe(3)
    expect(result.confirmation.queue_position).toBe(0)
    // One job per reference is fixed by contract; N is never multiplied.
    expect(result.confirmation.jobs_per_reference).toBe(1)
  })

  it('preserves confirmed order for queue back and reverses it for queue front', () => {
    const back = buildReferenceFanoutConfirmation(['a', 'b', 'c'], 0)
    const front = buildReferenceFanoutConfirmation(['a', 'b', 'c'], -1)

    expect(
      back.status === 'ready' && back.confirmation.ordered_reference_ids
    ).toEqual(['a', 'b', 'c'])
    // Reversing for queue front keeps the first confirmed reference running first.
    expect(
      front.status === 'ready' && front.confirmation.ordered_reference_ids
    ).toEqual(['c', 'b', 'a'])
  })

  it('rejects an empty, duplicate, or malformed selection before any server call', () => {
    expect(buildReferenceFanoutConfirmation([], 0)).toMatchObject({
      status: 'rejected',
      reason: 'empty_selection'
    })
    expect(buildReferenceFanoutConfirmation(['a', 'a'], 0)).toMatchObject({
      status: 'rejected',
      reason: 'duplicate_selection'
    })
    expect(buildReferenceFanoutConfirmation(['a'], 5)).toMatchObject({
      status: 'rejected',
      reason: 'invalid_selection'
    })
    expect(buildReferenceFanoutConfirmation('not-a-list', 0)).toMatchObject({
      status: 'rejected',
      reason: 'invalid_selection'
    })
  })

  it('never activates a session while building the confirmation', () => {
    const result = buildReferenceFanoutConfirmation(['ref-A'], 0)

    expect(result).not.toHaveProperty('session')
    expect(JSON.stringify(result)).not.toContain('fanout_active')
  })
})

describe('confirmed action outcome without a reachable server (Phase 1)', () => {
  it('ends server_unavailable and inactive when the prepare endpoint is unreachable', () => {
    for (const unreachable of [null, undefined]) {
      const outcome = applyConfirmedReferenceFanout(unreachable)

      expect(outcome.status).toBe('server_unavailable')
      expect(outcome.session).toEqual({ fanout_active: false })
    }
  })

  it('never fabricates server-issued identifiers to activate a session', () => {
    const outcome = applyConfirmedReferenceFanout(null)

    const serialized = JSON.stringify(outcome)
    expect(serialized).not.toContain('run_key')
    expect(serialized).not.toContain('snapshot_lease')
    expect(serialized).not.toContain('fanout_request_id')
  })

  it('stays inactive when the server response is malformed', () => {
    const outcome = applyConfirmedReferenceFanout({ schema_version: 99 })

    expect(outcome.status).toBe('rejected')
    expect(outcome.session).toEqual({ fanout_active: false })
  })

  it('activates only on a valid server preparation', () => {
    const outcome = applyConfirmedReferenceFanout(prepareInput(['ref-A'], 0))

    expect(outcome.status).toBe('ready')
    expect(outcome.session).toMatchObject({ fanout_active: true })
  })
})

describe('cancellation and the absence of a retry entry point', () => {
  it('fully deactivates an active session and is idempotent', () => {
    const plan = prepareReady(['ref-A', 'ref-B'])
    const cancelled = cancelReferenceFanout(plan.session)

    expect(cancelled).toEqual({ fanout_active: false })
    expect(cancelReferenceFanout(cancelled)).toBe(cancelled)
  })

  it('retains no reference, cursor, or lease after cancellation', () => {
    const plan = prepareReady(['ref-A', 'ref-B'])
    const cancelled = cancelReferenceFanout(plan.session)

    expect(Object.keys(cancelled)).toEqual(['fanout_active'])
  })

  it('offers no retryable references for a session that never submitted', () => {
    // Phase 1 reaches no outcome, so there is nothing to retry and no retry
    // affordance may be derived from a cancelled or unstarted action.
    const plan = prepareReady(['ref-A'])
    const cancelled = cancelReferenceFanout(plan.session)

    expect(cancelled).toEqual({ fanout_active: false })
    expect(applyConfirmedReferenceFanout(null).status).toBe(
      'server_unavailable'
    )
  })
})
