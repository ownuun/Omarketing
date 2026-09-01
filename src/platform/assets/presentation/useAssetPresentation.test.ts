import { fromPartial } from '@total-typescript/shoehorn'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { Ref } from 'vue'

import type { AssetItem } from '@/platform/assets/schemas/assetSchema'
import {
  createAssetPresentationRegistry,
  getPresentationFilterKey
} from './assetPresentationRegistry'
import type {
  AssetDetail,
  AssetPresentationProvider,
  AssetPresentationRegistry,
  AssetPresentationRegistration,
  AssetPresentationTarget,
  FilterControl,
  MetadataBatchEntry,
  MetadataBatchRequest,
  PresentationAction,
  PresentationActionResult,
  PresentationEnvironment
} from './assetPresentationRegistry'
import {
  createAssetPresentationTarget,
  deriveOutputLocatorCandidate,
  useAssetPresentation
} from './useAssetPresentation'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn
    reject = rejectFn
  })
  return { promise, resolve, reject }
}

function requireAbortSignal(signal: AbortSignal | null): AbortSignal {
  if (signal === null) throw new Error('Expected an AbortSignal')
  return signal
}

function createOutputAsset(overrides: Partial<AssetItem> = {}): AssetItem {
  return fromPartial({
    id: 'asset-1',
    name: 'render.png',
    mime_type: 'image/png',
    tags: ['output'],
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    user_metadata: { jobId: 'job-1', nodeId: 7, subfolder: 'outputs' },
    ...overrides
  })
}

function makeTarget(
  asset: AssetItem,
  tab: 'input' | 'output' = 'output'
): AssetPresentationTarget {
  return { assetId: asset.id, asset, tab, outputLocatorCandidate: null }
}

function contentControl(
  id: string,
  defaultValue: string = 'all'
): FilterControl {
  return {
    kind: 'single-select',
    id,
    labelKey: `testP.${id}`,
    defaultValue,
    options: [
      { value: 'all', labelKey: `testP.${id}.all` },
      { value: 'short', labelKey: `testP.${id}.short` }
    ]
  }
}

function makeProvider(
  overrides: Partial<AssetPresentationProvider> = {}
): AssetPresentationProvider {
  return fromPartial<AssetPresentationProvider>({
    id: 'test.provider',
    order: 100,
    environments: ['localhost'],
    controls: [contentControl('content')],
    actions: [],
    appliesTo: () => true,
    predicate: () => 'match',
    loadMetadataBatch: vi.fn(async () => []),
    ...overrides
  })
}

function makeDetail(overrides: Partial<AssetDetail> = {}): AssetDetail {
  return {
    sections: [
      {
        id: 'summary',
        headingKey: 'testP.detail.heading',
        fields: [
          {
            id: 'status',
            labelKey: 'testP.detail.status',
            value: 'acquired',
            href: null
          }
        ]
      }
    ],
    providerRevision: 'rev-1',
    // outputLocatorV1.generated.ts is intentionally absent in this phase, so
    // verified locators stay null.
    verifiedOutputLocator: null,
    actionContext: [{ id: 'reference_id', value: 'ref-1' }],
    ...overrides
  }
}

function notApplicableEntry(assetId: string): MetadataBatchEntry {
  return { assetId, state: { status: 'not-applicable' } }
}

function readyEntry(
  assetId: string,
  detail: AssetDetail = makeDetail()
): MetadataBatchEntry {
  return { assetId, state: { status: 'ready', detail } }
}

interface HarnessOptions {
  providers?: AssetPresentationProvider[]
  targets?: readonly AssetPresentationTarget[]
  activeTarget?: AssetPresentationTarget | null
  adjacentTargets?: readonly AssetPresentationTarget[]
  environment?: PresentationEnvironment
  scopeKey?: string | null
  workflowLocator?: string | null
}

interface PresentationHarness {
  registry: AssetPresentationRegistry
  registrations: AssetPresentationRegistration[]
  targetsRef: Ref<readonly AssetPresentationTarget[]>
  activeTargetRef: Ref<AssetPresentationTarget | null>
  adjacentTargetsRef: Ref<readonly AssetPresentationTarget[]>
  environmentRef: Ref<PresentationEnvironment>
  scopeKeyRef: Ref<string | null>
  presentation: ReturnType<typeof useAssetPresentation>
}

const pendingDisposals: Array<() => void> = []

afterEach(() => {
  for (const dispose of pendingDisposals.splice(0)) {
    dispose()
  }
})

function createHarness(options: HarnessOptions = {}): PresentationHarness {
  const registry = createAssetPresentationRegistry()
  const registrations = (options.providers ?? [makeProvider()]).map(
    (provider) => registry.register(provider)
  )

  const targetsRef = ref<readonly AssetPresentationTarget[]>(
    options.targets ?? []
  )
  const activeTargetRef = ref<AssetPresentationTarget | null>(
    options.activeTarget ?? null
  )
  const adjacentTargetsRef = ref<readonly AssetPresentationTarget[]>(
    options.adjacentTargets ?? []
  )
  const environmentRef = ref<PresentationEnvironment>(
    options.environment ?? 'localhost'
  )
  const scopeKeyRef = ref<string | null>(options.scopeKey ?? 'scope-1')

  const presentation = useAssetPresentation({
    registry,
    targets: targetsRef,
    activeTarget: activeTargetRef,
    adjacentTargets: adjacentTargetsRef,
    environment: environmentRef,
    workflowLocator: () => options.workflowLocator ?? null,
    projectKey: () => null,
    runKey: () => null,
    scopeKey: scopeKeyRef
  })
  pendingDisposals.push(() => presentation.dispose())

  return {
    registry,
    registrations,
    targetsRef,
    activeTargetRef,
    adjacentTargetsRef,
    environmentRef,
    scopeKeyRef,
    presentation
  }
}

describe('useAssetPresentation', () => {
  it('loads the deduplicated window in sequential batches of at most 100 targets, active target first', async () => {
    const totalTargets = 205
    const assets = Array.from({ length: totalTargets }, (_, index) =>
      createOutputAsset({ id: `asset-${index}` })
    )
    const targets = assets.map((asset) => makeTarget(asset))
    const activeIndex = 102
    const adjacentTargets = [targets[activeIndex - 1], targets[activeIndex + 1]]

    const batchAssetIds: string[][] = []
    const batchSignals: AbortSignal[] = []
    const deferreds: Deferred<readonly MetadataBatchEntry[]>[] = []
    const provider = makeProvider({
      loadMetadataBatch: vi.fn((request: MetadataBatchRequest) => {
        batchAssetIds.push(request.targets.map((target) => target.assetId))
        batchSignals.push(request.context.signal)
        const deferred = createDeferred<readonly MetadataBatchEntry[]>()
        deferreds.push(deferred)
        return deferred.promise
      })
    })

    const { presentation } = createHarness({
      providers: [provider],
      targets,
      activeTarget: targets[activeIndex],
      adjacentTargets
    })

    await vi.waitFor(() => expect(batchAssetIds).toHaveLength(1))
    expect(batchAssetIds[0]).toHaveLength(100)
    // The active lightbox item is prioritized and the adjacent items ride
    // along in the first batch instead of triggering per-card requests.
    expect(batchAssetIds[0][0]).toBe(`asset-${activeIndex}`)
    expect(batchAssetIds[0]).toEqual(
      expect.arrayContaining([
        `asset-${activeIndex - 1}`,
        `asset-${activeIndex + 1}`
      ])
    )
    expect(batchSignals[0]).toBeInstanceOf(AbortSignal)

    await new Promise((resolve) => setTimeout(resolve, 0))
    // Sequential batching: no second request before the first settles.
    expect(batchAssetIds).toHaveLength(1)

    deferreds[0].resolve(
      batchAssetIds[0].map((assetId) => notApplicableEntry(assetId))
    )
    await vi.waitFor(() => expect(batchAssetIds).toHaveLength(2))
    expect(batchAssetIds[1]).toHaveLength(100)

    deferreds[1].resolve(
      batchAssetIds[1].map((assetId) => notApplicableEntry(assetId))
    )
    await vi.waitFor(() => expect(batchAssetIds).toHaveLength(3))
    expect(batchAssetIds[2]).toHaveLength(5)

    deferreds[2].resolve(
      batchAssetIds[2].map((assetId) => notApplicableEntry(assetId))
    )
    await vi.waitFor(() =>
      expect(presentation.providerStates.value[provider.id]).toEqual({
        status: 'ready'
      })
    )

    const requested = batchAssetIds.flat()
    expect(requested).toHaveLength(totalTargets)
    expect(new Set(requested).size).toBe(totalTargets)
  })

  it('keeps assets visible while a provider predicate is pending and recomputes after metadata settles', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const deferred = createDeferred<readonly MetadataBatchEntry[]>()
    const provider = makeProvider({
      predicate: ({ metadata }) =>
        metadata.status === 'ready' ? 'no-match' : 'pending',
      loadMetadataBatch: vi.fn(() => deferred.promise)
    })

    const { presentation } = createHarness({
      providers: [provider],
      targets: [target],
      activeTarget: target
    })
    presentation.setFilter(provider.id, 'content', 'short')

    await vi.waitFor(() =>
      expect(presentation.metadataFor(provider.id, asset.id)).toEqual({
        status: 'loading'
      })
    )
    expect(presentation.matchesTarget(target)).toBe(true)

    deferred.resolve([readyEntry(asset.id)])

    await vi.waitFor(() =>
      expect(presentation.detailsFor(provider.id, asset.id)).not.toBeNull()
    )
    expect(presentation.matchesTarget(target)).toBe(false)
  })

  it('treats a not-applicable provider result as no-match only while that provider has an active filter', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const provider = makeProvider({
      predicate: () => 'match',
      loadMetadataBatch: vi.fn(async () => [notApplicableEntry(asset.id)])
    })

    const { presentation } = createHarness({
      providers: [provider],
      targets: [target],
      activeTarget: target
    })

    await vi.waitFor(() =>
      expect(presentation.metadataFor(provider.id, asset.id)).toEqual({
        status: 'not-applicable'
      })
    )
    expect(presentation.matchesTarget(target)).toBe(true)

    presentation.setFilter(provider.id, 'content', 'short')
    expect(presentation.hasActiveFilters.value).toBe(true)
    expect(presentation.matchesTarget(target)).toBe(false)

    presentation.resetFilter(provider.id, 'content')
    expect(presentation.hasActiveFilters.value).toBe(false)
    expect(presentation.matchesTarget(target)).toBe(true)
  })

  it('namespaces filter values per provider and clears only the targeted provider', () => {
    const providerA = makeProvider({ id: 'provider.a' })
    const providerB = makeProvider({
      id: 'provider.b',
      controls: [contentControl('status')]
    })
    const { presentation } = createHarness({
      providers: [providerA, providerB]
    })

    presentation.setFilter('provider.a', 'content', 'short')
    presentation.setFilter('provider.b', 'status', 'short')

    expect(presentation.filters.value).toEqual({
      [getPresentationFilterKey('provider.a', 'content')]: 'short',
      [getPresentationFilterKey('provider.b', 'status')]: 'short'
    })
    expect(presentation.hasActiveFilters.value).toBe(true)

    presentation.clearProviderFilters('provider.a')
    expect(presentation.filters.value).toEqual({
      [getPresentationFilterKey('provider.b', 'status')]: 'short'
    })
    expect(presentation.hasActiveFilters.value).toBe(true)

    presentation.clearAllFilters()
    expect(presentation.filters.value).toEqual({})
    expect(presentation.hasActiveFilters.value).toBe(false)
  })

  it('resets one control without disturbing another provider', () => {
    const providerA = makeProvider({ id: 'provider.a' })
    const providerB = makeProvider({
      id: 'provider.b',
      controls: [contentControl('status')]
    })
    const { presentation } = createHarness({
      providers: [providerA, providerB]
    })

    presentation.setFilter('provider.a', 'content', 'short')
    presentation.setFilter('provider.b', 'status', 'short')

    presentation.resetFilter('provider.a', 'content')
    expect(presentation.hasActiveFilters.value).toBe(true)
    expect(
      presentation.filters.value[
        getPresentationFilterKey('provider.b', 'status')
      ]
    ).toBe('short')

    presentation.resetFilter('provider.b', 'status')
    expect(presentation.hasActiveFilters.value).toBe(false)
  })

  it('isolates a failing provider batch while another provider succeeds and retries on demand', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const failing = makeProvider({
      id: 'failing.provider',
      loadMetadataBatch: vi
        .fn<() => Promise<readonly MetadataBatchEntry[]>>()
        .mockRejectedValueOnce(new Error('provider transport failed'))
        .mockResolvedValueOnce([readyEntry(asset.id)])
    })
    const healthy = makeProvider({
      id: 'healthy.provider',
      controls: [contentControl('status')],
      loadMetadataBatch: vi.fn(async () => [
        readyEntry(asset.id, makeDetail({ providerRevision: 'rev-healthy' }))
      ])
    })

    const { presentation } = createHarness({
      providers: [failing, healthy],
      targets: [target],
      activeTarget: target
    })

    await vi.waitFor(() =>
      expect(presentation.providerStates.value['failing.provider']).toEqual({
        status: 'error',
        safeMessageKey: expect.any(String)
      })
    )
    expect(presentation.providerStates.value['healthy.provider']).toEqual({
      status: 'ready'
    })

    // The failing provider fails open: the asset stays visible and the
    // healthy provider's detail is intact.
    expect(presentation.matchesTarget(target)).toBe(true)
    expect(
      presentation.detailsFor('healthy.provider', asset.id)?.providerRevision
    ).toBe('rev-healthy')

    presentation.retryProvider('failing.provider')

    await vi.waitFor(() =>
      expect(presentation.providerStates.value['failing.provider']).toEqual({
        status: 'ready'
      })
    )
    expect(presentation.detailsFor('failing.provider', asset.id)).not.toBeNull()
  })

  it('turns missing batch entries into provider errors instead of fabricated results', async () => {
    const reported = createOutputAsset({ id: 'reported-asset' })
    const omitted = createOutputAsset({ id: 'omitted-asset' })
    const provider = makeProvider({
      loadMetadataBatch: vi.fn(async () => [
        notApplicableEntry('reported-asset')
      ])
    })

    const { presentation } = createHarness({
      providers: [provider],
      targets: [makeTarget(reported), makeTarget(omitted)],
      activeTarget: makeTarget(reported)
    })

    await vi.waitFor(() =>
      expect(presentation.metadataFor(provider.id, 'reported-asset')).toEqual({
        status: 'not-applicable'
      })
    )
    expect(presentation.metadataFor(provider.id, 'omitted-asset')).toEqual({
      status: 'error',
      safeMessageKey: expect.any(String)
    })
    expect(presentation.matchesTarget(makeTarget(omitted))).toBe(true)
  })

  it('ignores results from an older scope generation and reloads under the new scope', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const oldGeneration = createDeferred<readonly MetadataBatchEntry[]>()
    const currentGeneration = createDeferred<readonly MetadataBatchEntry[]>()
    const provider = makeProvider({
      loadMetadataBatch: vi
        .fn<() => Promise<readonly MetadataBatchEntry[]>>()
        .mockReturnValueOnce(oldGeneration.promise)
        .mockReturnValueOnce(currentGeneration.promise)
    })

    const { presentation, scopeKeyRef } = createHarness({
      providers: [provider],
      targets: [target],
      activeTarget: target,
      scopeKey: 'owner-a'
    })

    await vi.waitFor(() =>
      expect(vi.mocked(provider.loadMetadataBatch)).toHaveBeenCalledTimes(1)
    )

    presentation.setFilter(provider.id, 'content', 'short')
    expect(presentation.hasActiveFilters.value).toBe(true)

    scopeKeyRef.value = 'owner-b'
    await vi.waitFor(() =>
      expect(vi.mocked(provider.loadMetadataBatch)).toHaveBeenCalledTimes(2)
    )
    // Ephemeral owner/session state does not leak across scopes.
    expect(presentation.hasActiveFilters.value).toBe(false)

    oldGeneration.resolve([readyEntry(asset.id)])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(presentation.metadataFor(provider.id, asset.id).status).toBe(
      'loading'
    )
    expect(presentation.detailsFor(provider.id, asset.id)).toBeNull()
  })

  it('aborts in-flight batches, drops provider state, and clears filter values on unregister', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const signals: AbortSignal[] = []
    const deferred = createDeferred<readonly MetadataBatchEntry[]>()
    const provider = makeProvider({
      loadMetadataBatch: vi.fn((request: MetadataBatchRequest) => {
        signals.push(request.context.signal)
        return deferred.promise
      })
    })

    const { presentation, registrations } = createHarness({
      providers: [provider],
      targets: [target],
      activeTarget: target
    })

    await vi.waitFor(() => expect(signals).toHaveLength(1))
    presentation.setFilter(provider.id, 'content', 'short')
    expect(presentation.hasActiveFilters.value).toBe(true)

    registrations[0].unregister()

    expect(signals[0].aborted).toBe(true)
    expect(
      presentation.providers.value.map((candidate) => candidate.id)
    ).not.toContain(provider.id)
    expect(presentation.providerStates.value[provider.id]).toBeUndefined()
    expect(presentation.hasActiveFilters.value).toBe(false)

    deferred.resolve([readyEntry(asset.id)])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(presentation.detailsFor(provider.id, asset.id)).toBeNull()
  })

  it('unregisters one provider without restarting another provider batch', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const deferredA = createDeferred<readonly MetadataBatchEntry[]>()
    const deferredB = createDeferred<readonly MetadataBatchEntry[]>()
    let signalA: AbortSignal | null = null
    let signalB: AbortSignal | null = null
    const providerA = makeProvider({
      id: 'provider.a',
      controls: [contentControl('content-a')],
      loadMetadataBatch: vi.fn((request) => {
        signalA = request.context.signal
        return deferredA.promise
      })
    })
    const providerB = makeProvider({
      id: 'provider.b',
      controls: [contentControl('content-b')],
      loadMetadataBatch: vi.fn((request) => {
        signalB = request.context.signal
        return deferredB.promise
      })
    })
    const { presentation, registrations } = createHarness({
      providers: [providerA, providerB],
      targets: [target],
      activeTarget: target
    })

    await vi.waitFor(() => {
      expect(signalA).not.toBeNull()
      expect(signalB).not.toBeNull()
    })
    registrations[0].unregister()

    expect(requireAbortSignal(signalA).aborted).toBe(true)
    expect(requireAbortSignal(signalB).aborted).toBe(false)
    expect(providerB.loadMetadataBatch).toHaveBeenCalledTimes(1)

    deferredB.resolve([readyEntry(asset.id)])
    await vi.waitFor(() =>
      expect(presentation.providerStates.value[providerB.id]).toEqual({
        status: 'ready'
      })
    )

    deferredA.resolve([readyEntry(asset.id)])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(presentation.providerStates.value[providerA.id]).toBeUndefined()
  })

  it('aborts in-flight batches on dispose and ignores late results', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const signals: AbortSignal[] = []
    const deferred = createDeferred<readonly MetadataBatchEntry[]>()
    const provider = makeProvider({
      loadMetadataBatch: vi.fn((request: MetadataBatchRequest) => {
        signals.push(request.context.signal)
        return deferred.promise
      })
    })

    const { presentation } = createHarness({
      providers: [provider],
      targets: [target],
      activeTarget: target
    })

    await vi.waitFor(() => expect(signals).toHaveLength(1))

    presentation.dispose()

    expect(signals[0].aborted).toBe(true)
    deferred.resolve([readyEntry(asset.id)])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(presentation.detailsFor(provider.id, asset.id)).toBeNull()
  })

  it('leaves the source AssetItem objects untouched', async () => {
    const assets = [
      createOutputAsset({ id: 'asset-a' }),
      createOutputAsset({ id: 'asset-b' })
    ]
    const assetsBefore = assets.map((asset) => structuredClone(asset))
    const provider = makeProvider({
      loadMetadataBatch: vi.fn(async (request: MetadataBatchRequest) => {
        const providerAsset = request.targets[0].asset
        expect(providerAsset).not.toBe(assets[0])
        expect(Object.isFrozen(providerAsset)).toBe(true)
        expect(Object.isFrozen(providerAsset.tags)).toBe(true)
        expect(() => {
          ;(providerAsset.tags as unknown as string[]).push('mutated')
        }).toThrow()

        return request.targets.map((target) => readyEntry(target.assetId))
      })
    })
    const targets = assets.map((asset) => makeTarget(asset))
    const targetsBefore = [...targets]

    const { presentation } = createHarness({
      providers: [provider],
      targets,
      activeTarget: targets[0]
    })
    presentation.setFilter(provider.id, 'content', 'short')

    await vi.waitFor(() =>
      expect(presentation.metadataFor(provider.id, 'asset-a')).toEqual({
        status: 'ready',
        detail: expect.anything()
      })
    )

    expect(assets).toEqual(assetsBefore)
    expect(targets).toEqual(targetsBefore)
  })

  it('skips providers that do not support the current environment', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const local = makeProvider({ id: 'local.provider' })
    const cloudOnly = makeProvider({
      id: 'cloud.provider',
      environments: ['cloud'],
      controls: [contentControl('cloudOnly')]
    })

    const { presentation } = createHarness({
      providers: [local, cloudOnly],
      targets: [target],
      activeTarget: target
    })

    expect(presentation.providers.value.map((provider) => provider.id)).toEqual(
      ['local.provider']
    )
    await vi.waitFor(() =>
      expect(vi.mocked(local.loadMetadataBatch)).toHaveBeenCalledTimes(1)
    )
    expect(vi.mocked(cloudOnly.loadMetadataBatch)).not.toHaveBeenCalled()
  })

  it('exposes derived filter-bar and active-lightbox view models', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const provider = makeProvider({
      actions: [
        {
          id: 'finalize',
          labelKey: 'testP.action.finalize',
          accessibleDescriptionKey: 'testP.action.finalize.description',
          intent: 'confirm',
          requiresOutputLocator: true,
          isAvailable: () => true,
          execute: vi.fn(
            async (): Promise<PresentationActionResult> => ({
              status: 'succeeded',
              safeMessageKey: 'testP.action.done'
            })
          )
        }
      ],
      loadMetadataBatch: vi.fn(async () => [readyEntry(asset.id)])
    })
    const { presentation } = createHarness({
      providers: [provider],
      targets: [target],
      activeTarget: target
    })

    expect(
      presentation.filterBarProps.value.presentationProviders.map(
        (candidate) => candidate.id
      )
    ).toEqual([provider.id])

    await vi.waitFor(() =>
      expect(
        presentation.lightboxProps.value.presentationDetails[0]?.status
      ).toBe('ready')
    )
    expect(
      presentation.lightboxProps.value.presentationDetails[0]?.sections
    ).toEqual(makeDetail().sections)
    expect(
      presentation.lightboxProps.value.presentationActionStates[0]
    ).toMatchObject({
      providerId: provider.id,
      actionId: 'finalize',
      enabled: false,
      pending: false,
      disabledReasonKey: 'assetPresentation.actions.locatorRequired'
    })

    presentation.setFilter(provider.id, 'content', 'short')
    expect(
      presentation.filterBarProps.value.presentationFilters[
        getPresentationFilterKey(provider.id, 'content')
      ]
    ).toBe('short')
  })

  it('treats appliesTo false as no-match only while that provider filter is active', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const provider = makeProvider({
      appliesTo: () => false,
      loadMetadataBatch: vi.fn(async () => [])
    })
    const { presentation } = createHarness({
      providers: [provider],
      targets: [target],
      activeTarget: target
    })

    await vi.waitFor(() =>
      expect(presentation.providerStates.value[provider.id]).toEqual({
        status: 'ready'
      })
    )
    expect(presentation.matchesTarget(target)).toBe(true)

    presentation.setFilter(provider.id, 'content', 'short')
    expect(presentation.matchesTarget(target)).toBe(false)
    expect(provider.loadMetadataBatch).not.toHaveBeenCalled()
  })

  it('reports idle metadata and no details before any batch settles', () => {
    const provider = makeProvider()
    const { presentation } = createHarness({ providers: [provider] })

    expect(presentation.metadataFor(provider.id, 'unknown-asset')).toEqual({
      status: 'idle'
    })
    expect(presentation.detailsFor(provider.id, 'unknown-asset')).toBeNull()
    expect(presentation.hasActiveFilters.value).toBe(false)
  })

  it('executes a registered action once at a time for the active target', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const deferred = createDeferred<PresentationActionResult>()
    const execute = vi.fn(() => deferred.promise)
    const provider = makeProvider({
      actions: [
        {
          id: 'finalizeSelection',
          labelKey: 'testP.action.finalize',
          accessibleDescriptionKey: 'testP.action.finalize.description',
          intent: 'confirm',
          requiresOutputLocator: false,
          isAvailable: () => true,
          execute
        }
      ],
      loadMetadataBatch: vi.fn(async () => [readyEntry(asset.id)])
    })

    const { presentation } = createHarness({
      providers: [provider],
      targets: [target],
      activeTarget: target,
      workflowLocator: 'workflows/campaign.json'
    })

    await vi.waitFor(() =>
      expect(presentation.metadataFor(provider.id, asset.id).status).toBe(
        'ready'
      )
    )

    const firstRun = presentation.executeAction(
      provider.id,
      'finalizeSelection'
    )
    const concurrentRun = presentation.executeAction(
      provider.id,
      'finalizeSelection'
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ assetId: asset.id }),
        metadata: expect.objectContaining({ status: 'ready' }),
        context: expect.objectContaining({
          environment: 'localhost',
          workflowLocator: 'workflows/campaign.json'
        })
      })
    )

    const result: PresentationActionResult = {
      status: 'succeeded',
      safeMessageKey: 'testP.action.succeeded'
    }
    deferred.resolve(result)
    await expect(firstRun).resolves.toEqual(result)
    await expect(concurrentRun).resolves.toEqual(result)
  })

  it('aborts an active detail action on navigation and ignores its late result', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const deferred = createDeferred<PresentationActionResult>()
    let actionSignal: AbortSignal | null = null
    const execute = vi.fn(
      (input: Parameters<PresentationAction['execute']>[0]) => {
        actionSignal = input.context.signal
        return deferred.promise
      }
    )
    const provider = makeProvider({
      actions: [
        {
          id: 'exclude',
          labelKey: 'testP.action.exclude',
          accessibleDescriptionKey: 'testP.action.exclude.description',
          intent: 'exclude',
          requiresOutputLocator: false,
          isAvailable: () => true,
          execute
        }
      ],
      loadMetadataBatch: vi.fn(async () => [readyEntry(asset.id)])
    })
    const { presentation, activeTargetRef } = createHarness({
      providers: [provider],
      targets: [target],
      activeTarget: target
    })

    await vi.waitFor(() =>
      expect(presentation.metadataFor(provider.id, asset.id).status).toBe(
        'ready'
      )
    )
    const run = presentation.executeAction(provider.id, 'exclude')
    await vi.waitFor(() => expect(actionSignal).not.toBeNull())

    activeTargetRef.value = null
    await vi.waitFor(() =>
      expect(requireAbortSignal(actionSignal).aborted).toBe(true)
    )

    activeTargetRef.value = target
    const duplicateRun = presentation.executeAction(provider.id, 'exclude')
    expect(execute).toHaveBeenCalledTimes(1)

    deferred.resolve({
      status: 'succeeded',
      safeMessageKey: 'testP.action.succeeded'
    })
    await expect(run).rejects.toMatchObject({
      safeMessageKey: 'assetPresentation.actions.failed'
    })
    await expect(duplicateRun).rejects.toMatchObject({
      safeMessageKey: 'assetPresentation.actions.failed'
    })
  })

  it('unregisters one provider without aborting another provider action', async () => {
    const asset = createOutputAsset()
    const target = makeTarget(asset)
    const actionA = createDeferred<PresentationActionResult>()
    const actionB = createDeferred<PresentationActionResult>()
    let signalA: AbortSignal | null = null
    let signalB: AbortSignal | null = null
    const providerA = makeProvider({
      id: 'provider.a',
      controls: [contentControl('content-a')],
      actions: [
        {
          id: 'action-a',
          labelKey: 'testP.action.a',
          accessibleDescriptionKey: 'testP.action.a.description',
          intent: 'neutral',
          requiresOutputLocator: false,
          isAvailable: () => true,
          execute: vi.fn((input) => {
            signalA = input.context.signal
            return actionA.promise
          })
        }
      ],
      loadMetadataBatch: vi.fn(async () => [readyEntry(asset.id)])
    })
    const providerB = makeProvider({
      id: 'provider.b',
      controls: [contentControl('content-b')],
      actions: [
        {
          id: 'action-b',
          labelKey: 'testP.action.b',
          accessibleDescriptionKey: 'testP.action.b.description',
          intent: 'neutral',
          requiresOutputLocator: false,
          isAvailable: () => true,
          execute: vi.fn((input) => {
            signalB = input.context.signal
            return actionB.promise
          })
        }
      ],
      loadMetadataBatch: vi.fn(async () => [readyEntry(asset.id)])
    })
    const { presentation, registrations } = createHarness({
      providers: [providerA, providerB],
      targets: [target],
      activeTarget: target
    })

    await vi.waitFor(() => {
      expect(presentation.metadataFor(providerA.id, asset.id).status).toBe(
        'ready'
      )
      expect(presentation.metadataFor(providerB.id, asset.id).status).toBe(
        'ready'
      )
    })
    const runA = presentation.executeAction(providerA.id, 'action-a')
    const runB = presentation.executeAction(providerB.id, 'action-b')
    await vi.waitFor(() => {
      expect(signalA).not.toBeNull()
      expect(signalB).not.toBeNull()
    })

    registrations[0].unregister()
    expect(requireAbortSignal(signalA).aborted).toBe(true)
    expect(requireAbortSignal(signalB).aborted).toBe(false)

    const success: PresentationActionResult = {
      status: 'succeeded',
      safeMessageKey: 'testP.action.succeeded'
    }
    actionB.resolve(success)
    await expect(runB).resolves.toEqual(success)

    actionA.resolve(success)
    await expect(runA).rejects.toMatchObject({
      safeMessageKey: 'assetPresentation.actions.failed'
    })
  })
})

describe('createAssetPresentationTarget', () => {
  it('derives a display-correlation target with a locator candidate for output assets', () => {
    const asset = createOutputAsset({ id: 'output-asset' })
    const target = createAssetPresentationTarget(asset, 'output')

    expect(target.assetId).toBe('output-asset')
    expect(target.asset).not.toBe(asset)
    expect(target.asset).toEqual(asset)
    expect(Object.isFrozen(target.asset)).toBe(true)
    expect(target.tab).toBe('output')
    expect(target.outputLocatorCandidate).not.toBeNull()
  })

  it('derives a null locator candidate for the input tab', () => {
    const asset = createOutputAsset()
    const target = createAssetPresentationTarget(asset, 'input')

    expect(target.tab).toBe('input')
    expect(target.outputLocatorCandidate).toBeNull()
  })
})

describe('deriveOutputLocatorCandidate', () => {
  it('maps existing output primitives into a candidate without synthesizing an asset id', () => {
    const asset = createOutputAsset({
      name: 'render.png',
      mime_type: 'image/png',
      user_metadata: {
        jobId: '0b2a19bb-1d5a-4c8e-9f0d-6f3f51d1a2b3',
        nodeId: 7,
        subfolder: 'outputs'
      }
    })

    const candidate = deriveOutputLocatorCandidate(asset, 'output')

    expect(candidate).toEqual(
      expect.objectContaining({
        job_id: '0b2a19bb-1d5a-4c8e-9f0d-6f3f51d1a2b3',
        node_id: '7',
        directory_type: 'output',
        subfolder: 'outputs',
        filename: 'render.png'
      })
    )
    // The backend-issued asset id is never synthesized from AssetItem.id.
    expect(candidate?.asset_id).toBeNull()
    expect(candidate?.media_type).toMatch(/^[a-z][a-z0-9_-]*$/)
  })

  it('yields null when required primitives are missing or invalid', () => {
    // No output metadata at all.
    expect(
      deriveOutputLocatorCandidate(
        createOutputAsset({ user_metadata: undefined }),
        'output'
      )
    ).toBeNull()
    // Missing job primitive.
    expect(
      deriveOutputLocatorCandidate(
        createOutputAsset({
          user_metadata: { nodeId: 7, subfolder: 'outputs' }
        }),
        'output'
      )
    ).toBeNull()
    // Missing node primitive.
    expect(
      deriveOutputLocatorCandidate(
        createOutputAsset({
          user_metadata: { jobId: 'job-1', subfolder: 'outputs' }
        }),
        'output'
      )
    ).toBeNull()
    // Missing subfolder primitive.
    expect(
      deriveOutputLocatorCandidate(
        createOutputAsset({ user_metadata: { jobId: 'job-1', nodeId: 7 } }),
        'output'
      )
    ).toBeNull()
    // Missing filename primitive.
    expect(
      deriveOutputLocatorCandidate(createOutputAsset({ name: '' }), 'output')
    ).toBeNull()
    // No media primitive anywhere on the asset.
    expect(
      deriveOutputLocatorCandidate(
        createOutputAsset({
          mime_type: undefined,
          preview_url: undefined,
          thumbnail_url: undefined
        }),
        'output'
      )
    ).toBeNull()
    // Traversal inside the subfolder primitive.
    expect(
      deriveOutputLocatorCandidate(
        createOutputAsset({
          user_metadata: { jobId: 'job-1', nodeId: 7, subfolder: '../root' }
        }),
        'output'
      )
    ).toBeNull()
    // Directory separator inside the filename primitive.
    expect(
      deriveOutputLocatorCandidate(
        createOutputAsset({ name: 'nested/render.png' }),
        'output'
      )
    ).toBeNull()
    // Input-tab assets never resolve to an output locator.
    expect(
      deriveOutputLocatorCandidate(createOutputAsset(), 'input')
    ).toBeNull()
  })
})
