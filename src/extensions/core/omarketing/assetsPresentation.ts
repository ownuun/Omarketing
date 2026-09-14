/**
 * Omarketing Assets presentation providers.
 *
 * The default factory uses authoritative local selection APIs. The explicitly
 * named fixture factory below remains isolated and unregistered, solely for
 * preserving the existing offline demo tests.
 */
import { chunk } from 'es-toolkit'

import type {
  AssetDetail,
  AssetPresentationProvider,
  AssetPresentationTarget,
  MetadataBatchEntry,
  MetadataBatchRequest,
  PredicateDecision,
  PresentationAction,
  PresentationActionContext,
  PresentationActionResult
} from '@/platform/assets/presentation/assetPresentationRegistry'

import type {
  AssociationResult,
  Binding,
  ManifestResponse,
  Output,
  Target
} from './localSelectionApi.generated'
import type { SelectionApi } from './selectionApi'
import type { TestHandoffProjection } from './testHandoffApi.generated'
import type { TestHandoffApi } from './testHandoffApi'
import {
  createSelectionApi,
  sameOutput,
  SelectionApiError
} from './selectionApi'
import { createTestHandoffApi, TestHandoffApiError } from './testHandoffApi'

const selectionKey = (key: string) => `omarketing.assets.selection.${key}`
const testHandoffKey = (key: string) => `omarketing.assets.testHandoff.${key}`
// Wire limit; the generic presentation host independently batches up to 100.
const MAX_ASSOCIATION_TARGETS = 64

function canonicalMediaType(value: string): string {
  if (value === 'images') return 'image'
  if (value === 'videos') return 'video'
  return value
}
const tupleKey = (target: AssetPresentationTarget) =>
  JSON.stringify([target.assetId, target.tab, target.outputLocatorCandidate])
type BoundView = {
  token: number
  binding: Binding
  output: Output
  manifest: ManifestResponse
  testHandoff: TestHandoffProjection | null
  status: 'ready' | 'confirmed' | 'stale' | 'unavailable'
  selected: string | null
}

/** Default registered provider: server state only; fixtures are opt-in below. */
export function createOmarketingAssetsPresentationProvider(
  api?: SelectionApi,
  testApi?: TestHandoffApi
): AssetPresentationProvider {
  const selectionApi = api ?? createSelectionApi()
  const testHandoffApi =
    testApi ?? (api === undefined ? createTestHandoffApi() : undefined)
  let token = 0
  const views = new Map<string, BoundView>()
  const busyRuns = new Set<string>()
  const runKey = (b: Binding) =>
    JSON.stringify([b.project_key, b.workflow_locator, b.run_key])
  function current(input: PresentationActionContext): BoundView | undefined {
    if (input.context.signal.aborted || input.metadata.status !== 'ready')
      return
    const view = views.get(tupleKey(input.target))
    return view &&
      input.metadata.detail.actionContext.some(
        (e) => e.id === 'selection-token' && e.value === view.token
      )
      ? view
      : undefined
  }
  function detail(view: BoundView): AssetDetail {
    return {
      providerRevision: 'omarketing-local-selection-v1',
      verifiedOutputLocator: null,
      actionContext: [{ id: 'selection-token', value: view.token }],
      sections: [
        {
          id: 'local-selection',
          headingKey: selectionKey('heading'),
          fields: [
            {
              id: 'status',
              labelKey: selectionKey(view.status),
              value: '',
              href: null
            },
            {
              id: 'project',
              labelKey: selectionKey('project'),
              value: view.binding.project_key,
              href: null
            },
            {
              id: 'workflow',
              labelKey: selectionKey('workflow'),
              value: view.binding.workflow_locator,
              href: null
            },
            {
              id: 'reference',
              labelKey: selectionKey('reference'),
              value: view.binding.reference_id,
              href: null
            },
            {
              id: 'candidate',
              labelKey: selectionKey('candidate'),
              value: view.binding.candidate_id,
              href: null
            }
          ]
        },
        ...(view.testHandoff === null
          ? []
          : [
              {
                id: 'local-test-current',
                headingKey: testHandoffKey('current'),
                fields: [
                  {
                    id: 'status',
                    labelKey: testHandoffKey(
                      view.testHandoff.current.outcome === 'empty'
                        ? 'noCurrent'
                        : view.testHandoff.current.outcome
                    ),
                    value: '',
                    href: null
                  }
                ]
              },
              {
                id: 'local-test-fixture-copy',
                headingKey: testHandoffKey('fixtureCopy'),
                fields: [
                  {
                    id: 'body',
                    labelKey: testHandoffKey('fixtureCopy'),
                    value: view.testHandoff.fixture_copy.body,
                    href: null
                  }
                ]
              },
              {
                id: 'local-test-history',
                headingKey: testHandoffKey('history'),
                fields:
                  view.testHandoff.history.length === 0
                    ? [
                        {
                          id: 'empty',
                          labelKey: testHandoffKey('noHistory'),
                          value: '',
                          href: null
                        }
                      ]
                    : view.testHandoff.history.map((entry) => ({
                        id: entry.request_id,
                        labelKey: testHandoffKey(entry.outcome),
                        value: entry.request_id,
                        href: null
                      }))
              }
            ])
      ]
    }
  }
  function action(id: string, label: string): PresentationAction {
    return {
      id,
      labelKey: selectionKey(label),
      accessibleDescriptionKey: selectionKey(label),
      intent: id === 'refresh-selection' ? 'neutral' : 'confirm',
      requiresOutputLocator: false,
      isAvailable(input) {
        const view = current(input)
        if (!view || busyRuns.has(runKey(view.binding))) return false
        if (id === 'refresh-selection') return true
        if (view.status === 'unavailable' || view.status === 'confirmed')
          return false
        return id === 'select-final'
          ? view.selected === null
          : view.selected !== null
      },
      async execute(input) {
        const view = current(input)
        if (!view || !this.isAvailable(input))
          return {
            status: 'unchanged',
            safeMessageKey: selectionKey('unavailable')
          }
        if (id === 'refresh-selection')
          return {
            status: 'unchanged',
            safeMessageKey: selectionKey('checking')
          }
        const run = runKey(view.binding)
        busyRuns.add(run)
        try {
          const result = await selectionApi.select(
            view.binding,
            view.output,
            view.manifest.revision,
            input.context.signal
          )
          // All same-run candidates lose action authority; generic host refreshes the provider.
          for (const [key, candidate] of views)
            if (runKey(candidate.binding) === run) views.delete(key)
          return {
            status: result.status === 'confirmed' ? 'succeeded' : 'unchanged',
            safeMessageKey: selectionKey(result.status)
          }
        } catch (error) {
          views.clear()
          const auth =
            error instanceof SelectionApiError &&
            [401, 403].includes(error.status)
          return {
            status: 'unchanged',
            safeMessageKey: selectionKey(
              auth ? 'authRequired' : 'outcome_unknown'
            )
          }
        } finally {
          busyRuns.delete(run)
        }
      }
    }
  }
  function testAction(): PresentationAction {
    return {
      id: 'omarketing-local-test-handoff',
      labelKey: testHandoffKey('action'),
      accessibleDescriptionKey: testHandoffKey('description'),
      intent: 'confirm',
      requiresOutputLocator: false,
      isAvailable(input) {
        const view = current(input)
        const currentTest = view?.testHandoff?.current
        return Boolean(
          testHandoffApi &&
          view &&
          view.status === 'confirmed' &&
          !busyRuns.has(runKey(view.binding)) &&
          currentTest !== undefined &&
          currentTest.selection_state === 'selected' &&
          currentTest.manifest_revision === view.manifest.revision &&
          currentTest.candidate_id === view.binding.candidate_id &&
          ['empty', 'failed_hold'].includes(currentTest.outcome)
        )
      },
      async execute(input) {
        const view = current(input)
        if (!view || !this.isAvailable(input) || !testHandoffApi)
          return {
            status: 'unchanged',
            safeMessageKey: testHandoffKey('unavailable')
          }
        const run = runKey(view.binding)
        busyRuns.add(run)
        try {
          let projection: TestHandoffProjection
          let readBack = false
          try {
            projection = await testHandoffApi.create(
              view.binding,
              view.manifest.revision,
              crypto.randomUUID(),
              input.context.signal
            )
          } catch (error) {
            if (
              error instanceof TestHandoffApiError &&
              [401, 403].includes(error.status)
            )
              return {
                status: 'unchanged',
                safeMessageKey: testHandoffKey(
                  error.status === 401 ? 'authRequired' : 'forbidden'
                )
              }
            if (!input.context.signal.aborted) {
              try {
                projection = await testHandoffApi.read(
                  view.binding,
                  input.context.signal
                )
                readBack = true
              } catch {
                return {
                  status: 'unchanged',
                  safeMessageKey: testHandoffKey('outcome_unknown')
                }
              }
            } else
              return {
                status: 'unchanged',
                safeMessageKey: testHandoffKey('outcome_unknown')
              }
          }
          if (!readBack) {
            try {
              projection = await testHandoffApi.read(
                view.binding,
                input.context.signal
              )
            } catch (error) {
              if (
                error instanceof TestHandoffApiError &&
                [401, 403].includes(error.status)
              )
                return {
                  status: 'unchanged',
                  safeMessageKey: testHandoffKey(
                    error.status === 401 ? 'authRequired' : 'forbidden'
                  )
                }
              return {
                status: 'unchanged',
                safeMessageKey: testHandoffKey('outcome_unknown')
              }
            }
          }
          for (const [key, candidate] of views)
            if (runKey(candidate.binding) === run) views.delete(key)
          return {
            status:
              projection.current.outcome === 'accepted'
                ? 'succeeded'
                : 'unchanged',
            safeMessageKey: testHandoffKey(projection.current.outcome)
          }
        } finally {
          busyRuns.delete(run)
        }
      }
    }
  }
  return {
    id: OMARKETING_PROVIDER_ID,
    order: 100,
    environments: ['localhost'],
    controls: [],
    actions: [
      action('select-final', 'select'),
      action('reselect-final', 'reselect'),
      action('refresh-selection', 'refresh'),
      testAction()
    ],
    appliesTo: (target) => target.tab === 'output',
    predicate: () => 'match',
    async loadMetadataBatch(request) {
      const { signal } = request.context
      const candidates = request.targets.filter(
        (t) => t.tab === 'output' && t.outputLocatorCandidate !== null
      )
      if (!candidates.length)
        return request.targets.map((t) => ({
          assetId: t.assetId,
          state: { status: 'not-applicable' as const }
        }))
      const identities = new Map<string, string>()
      const ambiguous = new Set<string>()
      for (const target of candidates) {
        const identity = tupleKey(target)
        if (
          identities.has(target.assetId) &&
          identities.get(target.assetId) !== identity
        )
          ambiguous.add(target.assetId)
        identities.set(target.assetId, identity)
      }
      const eligible = candidates.filter((t) => !ambiguous.has(t.assetId))
      const entries = new Map<string, MetadataBatchEntry['state']>()
      const loads = new Map<
        string,
        Promise<{ manifest: ManifestResponse; fresh: boolean }>
      >()
      const stamp = ++token
      for (const target of candidates) views.delete(tupleKey(target))
      try {
        if (eligible.length) {
          const targets: Target[] = eligible.map((t, i) => {
            const c = t.outputLocatorCandidate!
            return {
              correlation_id: `t${i}`,
              job_id: c.job_id,
              node_id: c.node_id,
              directory_type: 'output',
              subfolder: c.subfolder,
              filename: c.filename,
              media_type: canonicalMediaType(c.media_type)
            }
          })
          const results: AssociationResult[] = []
          for (const batch of chunk(targets, MAX_ASSOCIATION_TARGETS)) {
            signal.throwIfAborted()
            const association = await selectionApi.associate(batch, signal)
            signal.throwIfAborted()
            results.push(...association.results)
          }
          await Promise.all(
            results.map(async (result) => {
              const index = targets.findIndex(
                (t) => t.correlation_id === result.correlation_id
              )
              const target = eligible[index]
              if (result.status !== 'bound') {
                entries.set(
                  target.assetId,
                  result.status === 'unavailable'
                    ? {
                        status: 'error',
                        safeMessageKey: selectionKey('unavailable')
                      }
                    : { status: 'not-applicable' }
                )
                return
              }
              const { binding, output } = result
              const run = runKey(binding)
              if (!loads.has(run))
                loads.set(
                  run,
                  (async () => {
                    let manifest = await selectionApi.read(binding, signal)
                    let fresh = manifest.revision === 0
                    if (
                      manifest.revision > 0 &&
                      manifest.selections.every(
                        (s) => s.availability === 'bound'
                      )
                    ) {
                      try {
                        await selectionApi.revalidate(
                          binding,
                          manifest.revision,
                          signal
                        )
                        manifest = await selectionApi.read(binding, signal)
                        fresh = true
                      } catch (error) {
                        if (
                          error instanceof SelectionApiError &&
                          [401, 403].includes(error.status)
                        )
                          throw error
                        fresh = false
                      }
                    }
                    return { manifest, fresh }
                  })()
                )
              const { manifest, fresh } = await loads.get(run)!
              signal.throwIfAborted()
              const selected = manifest.selections.find(
                (s) => s.reference_id === binding.reference_id
              )
              const confirmed =
                fresh &&
                selected?.availability === 'bound' &&
                selected.state === 'selected' &&
                selected.candidate_id === binding.candidate_id &&
                sameOutput(selected.output, output)
              const status = !fresh
                ? 'unavailable'
                : confirmed
                  ? 'confirmed'
                  : selected?.state === 'stale'
                    ? 'stale'
                    : 'ready'
              let testHandoff: TestHandoffProjection | null = null
              if (testHandoffApi) {
                try {
                  testHandoff = await testHandoffApi.read(binding, signal)
                } catch {
                  testHandoff = null
                }
              }
              const view: BoundView = {
                token: stamp,
                binding,
                output,
                manifest,
                testHandoff,
                status,
                selected: selected?.candidate_id ?? null
              }
              views.set(tupleKey(target), view)
              entries.set(target.assetId, {
                status: 'ready',
                detail: detail(view)
              })
            })
          )
        }
      } catch (error) {
        views.clear()
        if (signal.aborted) throw error
        const auth =
          error instanceof SelectionApiError &&
          [401, 403].includes(error.status)
        for (const target of candidates)
          entries.set(target.assetId, {
            status: 'error',
            safeMessageKey: selectionKey(auth ? 'authRequired' : 'unavailable')
          })
      }
      return request.targets.map((t) => ({
        assetId: t.assetId,
        state: ambiguous.has(t.assetId)
          ? {
              status: 'error' as const,
              safeMessageKey: selectionKey('ambiguous')
            }
          : (entries.get(t.assetId) ?? { status: 'not-applicable' as const })
      }))
    }
  }
}

/** Stable provider id. */
export const OMARKETING_PROVIDER_ID = 'com.omarketing.assets.v1'

/**
 * The sole prepared output asset supplied by the browser fixture harness.
 *
 * This is an opaque correlation key, never a job, prompt, or persistence ID.
 */
export const OMARKETING_DEMO_ASSET_ID = 'job-queue-image'

/** Existing extension catalog keys consumed by the extension entry point. */
export const OMARKETING_PRESENTATION_LOCALE_KEYS = {
  statusChipLabel: 'omarketing.assets.statusChip.label',
  statusChipDisconnected: 'omarketing.assets.statusChip.disconnected',
  disconnectedMessage: 'omarketing.assets.disconnected.message',
  detailHeading: 'omarketing.assets.detail.heading',
  detailStatusLabel: 'omarketing.assets.detail.statusLabel',
  detailStatusDisconnected: 'omarketing.assets.detail.statusDisconnected'
} as const

/** Locale keys used only by the Revision 2 fixture. */
export const OMARKETING_FIXTURE_LOCALE_KEYS = {
  fixtureStateHeading: 'omarketing.assets.fixture.state.heading',
  fixtureMarkerLabel: 'omarketing.assets.fixture.marker.label',
  fixtureSelectionLabel: 'omarketing.assets.fixture.selection.label',
  fixtureHandoffLabel: 'omarketing.assets.fixture.handoff.label',
  candidatesHeading: 'omarketing.assets.fixture.candidates.heading',
  previewCandidateLabel: 'omarketing.assets.fixture.candidates.preview.label',
  copyCandidateLabel: 'omarketing.assets.fixture.candidates.copy.label',
  qaCandidateLabel: 'omarketing.assets.fixture.candidates.qa.label',
  passLabel: 'omarketing.assets.fixture.actions.pass.label',
  passDescription: 'omarketing.assets.fixture.actions.pass.description',
  passSucceeded: 'omarketing.assets.fixture.actions.pass.succeeded',
  passUnchanged: 'omarketing.assets.fixture.actions.pass.unchanged',
  deleteLabel: 'omarketing.assets.fixture.actions.delete.label',
  deleteDescription: 'omarketing.assets.fixture.actions.delete.description',
  deleteSucceeded: 'omarketing.assets.fixture.actions.delete.succeeded',
  deleteUnchanged: 'omarketing.assets.fixture.actions.delete.unchanged'
} as const

type FixtureCandidateId = 'preview' | 'copy' | 'qa'
type FixtureCandidateState = 'unreviewed' | 'passed' | 'deleted'

type FixtureCandidateDefinition =
  | {
      readonly id: 'preview'
      readonly labelKey: typeof OMARKETING_FIXTURE_LOCALE_KEYS.previewCandidateLabel
    }
  | {
      readonly id: 'copy'
      readonly labelKey: typeof OMARKETING_FIXTURE_LOCALE_KEYS.copyCandidateLabel
    }
  | {
      readonly id: 'qa'
      readonly labelKey: typeof OMARKETING_FIXTURE_LOCALE_KEYS.qaCandidateLabel
    }

type FixtureCandidate = FixtureCandidateDefinition & {
  readonly state: FixtureCandidateState
}

const FIXTURE_CANDIDATES: readonly FixtureCandidateDefinition[] = Object.freeze(
  [
    Object.freeze({
      id: 'preview',
      labelKey: OMARKETING_FIXTURE_LOCALE_KEYS.previewCandidateLabel
    }),
    Object.freeze({
      id: 'copy',
      labelKey: OMARKETING_FIXTURE_LOCALE_KEYS.copyCandidateLabel
    }),
    Object.freeze({
      id: 'qa',
      labelKey: OMARKETING_FIXTURE_LOCALE_KEYS.qaCandidateLabel
    })
  ]
)

function isDemoTarget(target: AssetPresentationTarget): boolean {
  return target.tab === 'output' && target.assetId === OMARKETING_DEMO_ASSET_ID
}

function actionContextValue(
  detail: AssetDetail,
  id: string
): string | number | boolean | null | undefined {
  return detail.actionContext.find((entry) => entry.id === id)?.value
}

function stateFor(
  candidates: readonly FixtureCandidate[],
  id: FixtureCandidateId
): FixtureCandidateState {
  return candidates.find((candidate) => candidate.id === id)!.state
}

/**
 * Creates an isolated fixture provider. No state is shared between instances,
 * persisted, or synchronized outside its action closures.
 */
export function createOmarketingFixtureAssetsPresentationProvider(): AssetPresentationProvider {
  const candidateStates: Record<FixtureCandidateId, FixtureCandidateState> = {
    preview: 'unreviewed',
    copy: 'unreviewed',
    qa: 'unreviewed'
  }
  let selectedCandidateId: FixtureCandidateId | null = 'preview'
  let fixtureHandoff: string | null = null

  function candidates(): readonly FixtureCandidate[] {
    return FIXTURE_CANDIDATES.map((candidate) => ({
      ...candidate,
      state: candidateStates[candidate.id]
    }))
  }

  function hasPassedCandidate(): boolean {
    return candidates().some((candidate) => candidate.state === 'passed')
  }

  function selectedUnreviewedCandidate(
    input: PresentationActionContext
  ): FixtureCandidateId | null {
    if (!isDemoTarget(input.target) || input.metadata.status !== 'ready') {
      return null
    }
    const { detail } = input.metadata
    const selected = actionContextValue(detail, 'selected-candidate')
    if (
      actionContextValue(detail, 'fixture-marker') !== true ||
      selected !== selectedCandidateId ||
      typeof selected !== 'string' ||
      !FIXTURE_CANDIDATES.some((candidate) => candidate.id === selected)
    ) {
      return null
    }
    const candidateId = selected as FixtureCandidateId
    return stateFor(candidates(), candidateId) === 'unreviewed'
      ? candidateId
      : null
  }

  function detail(): AssetDetail {
    const currentCandidates = candidates()
    return {
      providerRevision: 'omarketing-fixture-r2',
      verifiedOutputLocator: null,
      sections: [
        {
          id: 'fixture-state',
          headingKey: OMARKETING_FIXTURE_LOCALE_KEYS.fixtureStateHeading,
          fields: [
            {
              id: 'fixture-marker',
              labelKey: OMARKETING_FIXTURE_LOCALE_KEYS.fixtureMarkerLabel,
              value: 'Fixture-only demo',
              href: null
            },
            {
              id: 'selected-candidate',
              labelKey: OMARKETING_FIXTURE_LOCALE_KEYS.fixtureSelectionLabel,
              value: selectedCandidateId ?? 'none',
              href: null
            },
            {
              id: 'fixture-handoff',
              labelKey: OMARKETING_FIXTURE_LOCALE_KEYS.fixtureHandoffLabel,
              value: fixtureHandoff ?? 'none',
              href: null
            }
          ]
        },
        {
          id: 'fixture-candidates',
          headingKey: OMARKETING_FIXTURE_LOCALE_KEYS.candidatesHeading,
          fields: currentCandidates.map((candidate) => ({
            id: candidate.id,
            labelKey: candidate.labelKey,
            value: candidate.state,
            href: null
          }))
        }
      ],
      actionContext: [
        { id: 'fixture-marker', value: true },
        { id: 'selected-candidate', value: selectedCandidateId },
        { id: 'fixture-handoff', value: fixtureHandoff }
      ]
    }
  }

  function passResult(
    input: PresentationActionContext
  ): PresentationActionResult {
    const candidateId = selectedUnreviewedCandidate(input)
    if (!candidateId || hasPassedCandidate()) {
      return {
        status: 'unchanged',
        safeMessageKey: OMARKETING_FIXTURE_LOCALE_KEYS.passUnchanged
      }
    }

    candidateStates[candidateId] = 'passed'
    selectedCandidateId = null
    fixtureHandoff = `${candidateId}:passed:awaiting_auto_registration`
    return {
      status: 'succeeded',
      safeMessageKey: OMARKETING_FIXTURE_LOCALE_KEYS.passSucceeded
    }
  }

  function deleteResult(
    input: PresentationActionContext
  ): PresentationActionResult {
    const candidateId = selectedUnreviewedCandidate(input)
    if (!candidateId) {
      return {
        status: 'unchanged',
        safeMessageKey: OMARKETING_FIXTURE_LOCALE_KEYS.deleteUnchanged
      }
    }

    candidateStates[candidateId] = 'deleted'
    const nextCandidate = candidates().find(
      (candidate) => candidate.state === 'unreviewed'
    )
    selectedCandidateId = nextCandidate?.id ?? null
    fixtureHandoff = nextCandidate
      ? `${candidateId}:deleted->${nextCandidate.id}`
      : `${candidateId}:deleted`
    return {
      status: 'succeeded',
      safeMessageKey: OMARKETING_FIXTURE_LOCALE_KEYS.deleteSucceeded
    }
  }

  const actions: readonly PresentationAction[] = [
    {
      id: 'pass-candidate',
      labelKey: OMARKETING_FIXTURE_LOCALE_KEYS.passLabel,
      accessibleDescriptionKey: OMARKETING_FIXTURE_LOCALE_KEYS.passDescription,
      intent: 'confirm',
      requiresOutputLocator: false,
      isAvailable(input): boolean {
        return (
          selectedUnreviewedCandidate(input) !== null && !hasPassedCandidate()
        )
      },
      async execute(input): Promise<PresentationActionResult> {
        return passResult(input)
      }
    },
    {
      id: 'delete-candidate',
      labelKey: OMARKETING_FIXTURE_LOCALE_KEYS.deleteLabel,
      accessibleDescriptionKey:
        OMARKETING_FIXTURE_LOCALE_KEYS.deleteDescription,
      intent: 'exclude',
      requiresOutputLocator: false,
      isAvailable(input): boolean {
        return selectedUnreviewedCandidate(input) !== null
      },
      async execute(input): Promise<PresentationActionResult> {
        return deleteResult(input)
      }
    }
  ]

  return {
    id: OMARKETING_PROVIDER_ID,
    order: 100,
    environments: Object.freeze(['localhost'] as const),
    controls: Object.freeze([]),
    actions: Object.freeze(actions),
    appliesTo: isDemoTarget,
    predicate(): PredicateDecision {
      // This provider never filters an asset; applicability controls its UI.
      return 'match'
    },
    async loadMetadataBatch(
      request: MetadataBatchRequest
    ): Promise<readonly MetadataBatchEntry[]> {
      return request.targets.map((target) => ({
        assetId: target.assetId,
        state: isDemoTarget(target)
          ? { status: 'ready' as const, detail: detail() }
          : { status: 'not-applicable' as const }
      }))
    }
  }
}
