import { fromPartial } from '@total-typescript/shoehorn'
import { describe, expect, it, vi } from 'vitest'

import {
  assetPresentationRegistry,
  createAssetPresentationRegistry,
  getPresentationFilterKey,
  isFilterControlActive
} from './assetPresentationRegistry'
import type {
  AssetPresentationProvider,
  AssetPresentationRegistration,
  FilterControl,
  PresentationAction,
  PresentationActionResult
} from './assetPresentationRegistry'

function singleSelectControl(
  id: string,
  defaultValue: string | null = null
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

function makeAction(id: string): PresentationAction {
  return {
    id,
    labelKey: `testP.action.${id}`,
    accessibleDescriptionKey: `testP.action.${id}.description`,
    intent: 'neutral',
    requiresOutputLocator: false,
    isAvailable: () => true,
    execute: vi.fn(
      async (): Promise<PresentationActionResult> => ({
        status: 'succeeded',
        safeMessageKey: `testP.action.${id}.done`
      })
    )
  }
}

function makeProvider(
  overrides: Partial<AssetPresentationProvider> = {}
): AssetPresentationProvider {
  const id = overrides.id ?? 'test.provider'
  return fromPartial<AssetPresentationProvider>({
    id,
    order: 100,
    environments: ['localhost'],
    controls: [singleSelectControl(`content-${id}`)],
    actions: [],
    appliesTo: () => true,
    predicate: () => 'match',
    loadMetadataBatch: vi.fn(async () => []),
    ...overrides
  })
}

describe('createAssetPresentationRegistry', () => {
  it('sorts snapshots by ascending order and then lexical provider id', () => {
    const registry = createAssetPresentationRegistry()
    registry.register(makeProvider({ id: 'c.provider', order: 20 }))
    registry.register(makeProvider({ id: 'a.provider', order: 10 }))
    registry.register(makeProvider({ id: 'b.provider', order: 20 }))
    registry.register(makeProvider({ id: 'a2.provider', order: 10 }))

    expect(registry.snapshot().map((provider) => provider.id)).toEqual([
      'a.provider',
      'a2.provider',
      'b.provider',
      'c.provider'
    ])
  })

  it('returns frozen snapshots that reject mutation', () => {
    const registry = createAssetPresentationRegistry()
    registry.register(makeProvider())
    const snapshot = registry.snapshot()

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(() => {
      ;(snapshot as unknown as AssetPresentationProvider[]).push(
        makeProvider({ id: 'other.provider' })
      )
    }).toThrow()
    expect(registry.snapshot()).toHaveLength(1)
  })

  it('returns a registration handle carrying the provider id', () => {
    const registry = createAssetPresentationRegistry()
    const provider = makeProvider()

    const registration: AssetPresentationRegistration =
      registry.register(provider)

    expect(registration.providerId).toBe(provider.id)
  })

  it('rejects a duplicate provider id and keeps the prior provider', () => {
    const registry = createAssetPresentationRegistry()
    const first = makeProvider({ id: 'dupe.provider', order: 5 })
    registry.register(first)

    expect(() =>
      registry.register(makeProvider({ id: 'dupe.provider', order: 1 }))
    ).toThrow()

    const snapshot = registry.snapshot()
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0]).toMatchObject({ id: 'dupe.provider', order: 5 })
  })

  it('keeps snapshots detached from later caller mutations', () => {
    const registry = createAssetPresentationRegistry()
    const provider = makeProvider({ id: 'stable.provider', order: 5 })
    registry.register(provider)

    ;(provider as { order: number }).order = 999

    expect(registry.snapshot()[0]).toMatchObject({
      id: 'stable.provider',
      order: 5
    })
  })

  it('rejects a control id already registered by any provider', () => {
    const registry = createAssetPresentationRegistry()
    registry.register(
      makeProvider({
        id: 'first.provider',
        controls: [singleSelectControl('sharedControl')]
      })
    )

    expect(() =>
      registry.register(
        makeProvider({
          id: 'second.provider',
          controls: [singleSelectControl('sharedControl')]
        })
      )
    ).toThrow()

    expect(registry.snapshot().map((provider) => provider.id)).toEqual([
      'first.provider'
    ])
  })

  it('rejects duplicate control ids inside a single provider', () => {
    const registry = createAssetPresentationRegistry()

    expect(() =>
      registry.register(
        makeProvider({
          controls: [
            singleSelectControl('dupControl'),
            singleSelectControl('dupControl')
          ]
        })
      )
    ).toThrow()

    expect(registry.snapshot()).toHaveLength(0)
  })

  it('rejects an action id already registered by any provider', () => {
    const registry = createAssetPresentationRegistry()
    registry.register(
      makeProvider({ id: 'first.provider', actions: [makeAction('finalize')] })
    )

    expect(() =>
      registry.register(
        makeProvider({
          id: 'second.provider',
          actions: [makeAction('finalize')]
        })
      )
    ).toThrow()

    expect(registry.snapshot().map((provider) => provider.id)).toEqual([
      'first.provider'
    ])
  })

  it('rejects a contribution id shared by a control and an action', () => {
    const registry = createAssetPresentationRegistry()
    registry.register(
      makeProvider({
        id: 'first.provider',
        controls: [singleSelectControl('sharedContribution')]
      })
    )

    expect(() =>
      registry.register(
        makeProvider({
          id: 'second.provider',
          controls: [],
          actions: [makeAction('sharedContribution')]
        })
      )
    ).toThrow()
    expect(registry.snapshot().map((provider) => provider.id)).toEqual([
      'first.provider'
    ])
  })

  it('notifies subscribers on register and unregister and stops after unsubscribe', () => {
    const registry = createAssetPresentationRegistry()
    const listener = vi.fn()
    const unsubscribe = registry.subscribe(listener)

    const registration = registry.register(makeProvider())
    expect(listener).toHaveBeenCalledTimes(1)

    registration.unregister()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    registry.register(makeProvider({ id: 'later.provider' }))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('treats unregister as idempotent', () => {
    const registry = createAssetPresentationRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)
    const registration = registry.register(makeProvider())

    registration.unregister()
    expect(() => registration.unregister()).not.toThrow()

    // One notification for the registration, one for the single effective
    // unregister; the second unregister is a silent no-op.
    expect(listener).toHaveBeenCalledTimes(2)
    expect(registry.snapshot()).toHaveLength(0)
  })
})

describe('assetPresentationRegistry', () => {
  it('exposes a default registry that stays free of provider-specific registrations', () => {
    expect(assetPresentationRegistry.register).toBeTypeOf('function')
    // Generic code never registers the Omarketing provider by importing it.
    expect(
      assetPresentationRegistry.snapshot().map((provider) => provider.id)
    ).not.toContain('com.omarketing.assets.v1')

    const registration = assetPresentationRegistry.register(
      makeProvider({ id: 'singleton.test.provider' })
    )
    expect(
      assetPresentationRegistry.snapshot().map((provider) => provider.id)
    ).toContain('singleton.test.provider')

    registration.unregister()
    expect(
      assetPresentationRegistry.snapshot().map((provider) => provider.id)
    ).not.toContain('singleton.test.provider')
  })
})

describe('getPresentationFilterKey', () => {
  it('namespaces a control id under its provider id', () => {
    expect(
      getPresentationFilterKey('com.example.assets.v1', 'contentType')
    ).toBe('com.example.assets.v1/contentType')
  })
})

describe('isFilterControlActive', () => {
  it('marks single-select values active only when they differ from the declared default', () => {
    const control = singleSelectControl('contentType', 'all')

    expect(isFilterControlActive(control, 'all')).toBe(false)
    expect(isFilterControlActive(control, 'short')).toBe(true)
    expect(isFilterControlActive(control, null)).toBe(true)
  })

  it('marks multi-select values active only when the selection differs from the declared default', () => {
    const control: FilterControl = {
      kind: 'multi-select',
      id: 'platform',
      labelKey: 'testP.platform',
      defaultValue: ['all'],
      options: [
        { value: 'all', labelKey: 'testP.platform.all' },
        { value: 'shorts', labelKey: 'testP.platform.shorts' }
      ]
    }

    expect(isFilterControlActive(control, ['all'])).toBe(false)
    expect(isFilterControlActive(control, [])).toBe(true)
    expect(isFilterControlActive(control, ['shorts'])).toBe(true)

    const emptyDefault: FilterControl = { ...control, defaultValue: [] }
    expect(isFilterControlActive(emptyDefault, [])).toBe(false)
  })

  it('marks toggle values active only when they differ from the declared default', () => {
    const control: FilterControl = {
      kind: 'toggle',
      id: 'hideExcluded',
      labelKey: 'testP.hideExcluded',
      defaultValue: false
    }

    expect(isFilterControlActive(control, false)).toBe(false)
    expect(isFilterControlActive(control, true)).toBe(true)
  })
})
