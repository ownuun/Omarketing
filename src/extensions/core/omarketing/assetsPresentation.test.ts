import { ref } from 'vue'
import { describe, expect, it } from 'vitest'

import type {
  AssetPresentationContext,
  AssetPresentationTarget
} from '@/platform/assets/presentation/assetPresentationRegistry'
import type { ProviderPresentationState } from '@/platform/assets/presentation/assetPresentationRegistry'
import { createAssetPresentationRegistry } from '@/platform/assets/presentation/assetPresentationRegistry'
import { useAssetPresentation } from '@/platform/assets/presentation/useAssetPresentation'

import {
  OMARKETING_PRESENTATION_LOCALE_KEYS,
  OMARKETING_PROVIDER_ID,
  createOmarketingAssetsPresentationProvider,
  omarketingDisconnectedState
} from './assetsPresentation'

function target(
  assetId: string,
  tab: 'input' | 'output' = 'output'
): AssetPresentationTarget {
  return {
    assetId,
    // Only the fields the provider is allowed to read matter here.
    asset: { id: assetId } as AssetPresentationTarget['asset'],
    tab,
    outputLocatorCandidate: null
  }
}

const context = {
  environment: 'localhost',
  tab: 'output'
} as unknown as AssetPresentationContext

describe('Omarketing assets presentation provider (Phase 1, disconnected)', () => {
  it('registers exactly one control and zero actions', () => {
    const provider = createOmarketingAssetsPresentationProvider()

    expect(OMARKETING_PROVIDER_ID).toBe('com.omarketing.assets.v1')
    expect(provider.id).toBe(OMARKETING_PROVIDER_ID)
    expect(provider.controls).toHaveLength(1)
    // Zero actions is a hard Phase 1 requirement: a disconnected provider must
    // not offer a button that cannot do anything.
    expect(provider.actions).toHaveLength(0)
  })

  it('exposes a disconnected state that is not an error state', () => {
    expect(omarketingDisconnectedState.status).toBe('disconnected')
    expect(omarketingDisconnectedState).not.toHaveProperty('status', 'error')
    expect(
      (omarketingDisconnectedState as { safeMessageKey: string }).safeMessageKey
    ).toBe(OMARKETING_PRESENTATION_LOCALE_KEYS.disconnectedMessage)
  })

  it('registers into the generic registry without the registry knowing Omarketing', () => {
    const registry = createAssetPresentationRegistry()
    const registration = registry.register(
      createOmarketingAssetsPresentationProvider()
    )

    expect(registration.providerId).toBe(OMARKETING_PROVIDER_ID)
    expect(registry.snapshot()).toHaveLength(1)
    expect(registry.snapshot()[0]?.id).toBe(OMARKETING_PROVIDER_ID)
  })

  it('annotates output assets only and leaves input assets untouched', () => {
    const provider = createOmarketingAssetsPresentationProvider()

    expect(provider.appliesTo(target('a', 'output'))).toBe(true)
    expect(provider.appliesTo(target('a', 'input'))).toBe(false)
  })

  it('never filters an asset out while disconnected', () => {
    const provider = createOmarketingAssetsPresentationProvider()

    // A disconnected provider must not be able to hide a real local output or
    // manufacture an empty asset list.
    expect(
      provider.predicate({
        target: target('a'),
        filters: {},
        metadata: { status: 'not-applicable' }
      })
    ).toBe('match')
    expect(
      provider.predicate({
        target: target('b'),
        filters: { 'omarketing/backend-status': 'disconnected' },
        metadata: { status: 'idle' }
      })
    ).toBe('match')
  })

  it('resolves not-applicable for every target instead of fabricating metadata', async () => {
    const provider = createOmarketingAssetsPresentationProvider()

    const entries = await provider.loadMetadataBatch({
      targets: [target('a'), target('b'), target('c')],
      context
    })

    expect(entries).toHaveLength(3)
    expect(entries.map((entry) => entry.assetId)).toEqual(['a', 'b', 'c'])
    for (const entry of entries) {
      // not-applicable is the honest answer. `ready` with empty fields would be
      // fabricated metadata, and `error` would claim something failed.
      expect(entry.state.status).toBe('not-applicable')
      expect(entry.state).not.toHaveProperty('detail')
    }
  })

  it('resolves an empty batch without inventing entries', async () => {
    const provider = createOmarketingAssetsPresentationProvider()

    await expect(
      provider.loadMetadataBatch({ targets: [], context })
    ).resolves.toEqual([])
  })

  it('declares only the localhost environment for Phase 1', () => {
    const provider = createOmarketingAssetsPresentationProvider()

    expect([...provider.environments]).toEqual(['localhost'])
  })

  it('keeps its single control namespaced and read-only in Phase 1', () => {
    const [control] = createOmarketingAssetsPresentationProvider().controls

    expect(control?.id).toBe('backend-status')
    expect(control?.kind).toBe('single-select')
    // Exactly one option means the chip reports a state rather than offering a
    // second Omarketing filter dimension that Phase 1 cannot honor.
    expect(control && 'options' in control ? control.options : []).toHaveLength(
      1
    )
  })

  it('surfaces disconnected through the composable even with zero assets', () => {
    // Mirrors the real host path: no assets means no load cycle runs, so the
    // standing state must be resolved on read or the surface renders nothing.
    const registry = createAssetPresentationRegistry()
    registry.register(createOmarketingAssetsPresentationProvider())

    const presentation = useAssetPresentation({
      registry,
      targets: () => [],
      activeTarget: () => null,
      adjacentTargets: () => [],
      environment: () => 'localhost' as const,
      scopeKey: () => null
    })

    const states = presentation.filterBarProps.value.presentationProviderStates
    expect(states).toHaveLength(1)
    expect(states[0]).toMatchObject({
      providerId: OMARKETING_PROVIDER_ID,
      status: 'disconnected'
    })
  })

  it('isolates a provider whose standing state throws', () => {
    const registry = createAssetPresentationRegistry()
    const base = createOmarketingAssetsPresentationProvider()
    registry.register({
      ...base,
      getStandingState() {
        throw new Error('provider exploded')
      }
    })

    const presentation = useAssetPresentation({
      registry,
      targets: () => [],
      activeTarget: () => null,
      adjacentTargets: () => [],
      environment: () => 'localhost' as const,
      scopeKey: () => null
    })

    // A throwing provider must surface as an isolated error, never be
    // silently treated as healthy.
    expect(
      presentation.filterBarProps.value.presentationProviderStates[0]
    ).toMatchObject({ providerId: OMARKETING_PROVIDER_ID, status: 'error' })
  })

  it('rejects a malformed standing state instead of coercing it', () => {
    const registry = createAssetPresentationRegistry()
    const base = createOmarketingAssetsPresentationProvider()
    registry.register({
      ...base,
      getStandingState: (() => ({ status: 'not-a-status' })) as never
    })

    const presentation = useAssetPresentation({
      registry,
      targets: () => [],
      activeTarget: () => null,
      adjacentTargets: () => [],
      environment: () => 'localhost' as const,
      scopeKey: () => null
    })

    expect(
      presentation.filterBarProps.value.presentationProviderStates[0]
    ).toMatchObject({ status: 'error' })
  })

  it('stops reporting disconnected once the provider drops its standing state', () => {
    // Regression: the read-time overlay must not cache. A computed that only
    // reads providerStates in the fallback branch has no reactive dependency,
    // so it would keep serving the first standing state forever.
    let standing: ProviderPresentationState | null = {
      status: 'disconnected',
      safeMessageKey: 'omarketing.assets.disconnected.message'
    }
    const registry = createAssetPresentationRegistry()
    const base = createOmarketingAssetsPresentationProvider()
    registry.register({ ...base, getStandingState: () => standing })

    const presentation = useAssetPresentation({
      registry,
      targets: () => [],
      activeTarget: () => null,
      adjacentTargets: () => [],
      environment: () => 'localhost' as const,
      scopeKey: () => null
    })

    expect(
      presentation.filterBarProps.value.presentationProviderStates[0]
    ).toMatchObject({ status: 'disconnected' })

    // The backend connects: the provider stops declaring a standing state.
    // The standing state is polled, not pushed, so it is re-read on the next
    // presentation change rather than spontaneously.
    standing = null
    presentation.requestMetadataWindow()

    expect(
      presentation.filterBarProps.value.presentationProviderStates[0]?.status
    ).not.toBe('disconnected')
  })

  it('tracks a reactive standing state without an explicit refresh', () => {
    // A provider backed by a ref is tracked normally: no presentation change is
    // needed for the new value to appear. This is the documented reactive path.
    const standing = ref<ProviderPresentationState | null>({
      status: 'disconnected',
      safeMessageKey: 'omarketing.assets.disconnected.message'
    })
    const registry = createAssetPresentationRegistry()
    const base = createOmarketingAssetsPresentationProvider()
    registry.register({ ...base, getStandingState: () => standing.value })

    const presentation = useAssetPresentation({
      registry,
      targets: () => [],
      activeTarget: () => null,
      adjacentTargets: () => [],
      environment: () => 'localhost' as const,
      scopeKey: () => null
    })

    expect(
      presentation.filterBarProps.value.presentationProviderStates[0]
    ).toMatchObject({ status: 'disconnected' })

    standing.value = null

    expect(
      presentation.filterBarProps.value.presentationProviderStates[0]?.status
    ).not.toBe('disconnected')
  })
})
