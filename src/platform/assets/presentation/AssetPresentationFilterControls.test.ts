import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'

import type {
  AssetPresentationProvider,
  FilterControl,
  FilterState,
  FilterValue
} from './assetPresentationRegistry'
import { getPresentationFilterKey } from './assetPresentationRegistry'
import AssetPresentationFilterControls from './AssetPresentationFilterControls.vue'

// A tiny dictionary so no assertion bypasses i18n with raw product strings.
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      assetPresentation: {
        loading: 'Loading presentation data',
        retry: 'Retry',
        filters: {
          any: 'Any'
        }
      },
      testP: {
        content: 'Content type',
        contentAll: 'All content',
        contentShort: 'Short form',
        contentCarousel: 'Carousel',
        status: 'Status',
        statusAll: 'Any status',
        statusAcquired: 'Acquired',
        platform: 'Platform',
        platformShorts: 'YouTube Shorts',
        platformTiktok: 'TikTok',
        hideExcluded: 'Hide excluded',
        providerError: 'Metadata unavailable',
        providerDisconnected: 'Backend not connected',
        retry: 'Retry'
      }
    }
  }
})

const contentControl: FilterControl = {
  kind: 'single-select',
  id: 'content',
  labelKey: 'testP.content',
  defaultValue: 'all',
  options: [
    { value: 'all', labelKey: 'testP.contentAll' },
    { value: 'short', labelKey: 'testP.contentShort' },
    { value: 'carousel', labelKey: 'testP.contentCarousel' }
  ]
}

const platformControl: FilterControl = {
  kind: 'multi-select',
  id: 'platform',
  labelKey: 'testP.platform',
  defaultValue: [],
  options: [
    { value: 'youtube-shorts', labelKey: 'testP.platformShorts' },
    { value: 'tiktok', labelKey: 'testP.platformTiktok' }
  ]
}

const hideExcludedControl: FilterControl = {
  kind: 'toggle',
  id: 'hideExcluded',
  labelKey: 'testP.hideExcluded',
  defaultValue: false
}

const statusControl: FilterControl = {
  kind: 'single-select',
  id: 'status',
  labelKey: 'testP.status',
  defaultValue: 'all',
  options: [
    { value: 'all', labelKey: 'testP.statusAll' },
    { value: 'acquired', labelKey: 'testP.statusAcquired' }
  ]
}

const provider: AssetPresentationProvider = {
  id: 'test.provider',
  order: 100,
  environments: ['localhost'],
  controls: [contentControl, platformControl, hideExcludedControl],
  actions: [],
  appliesTo: () => true,
  predicate: () => 'match',
  loadMetadataBatch: async () => []
}

const brokenProvider: AssetPresentationProvider = {
  ...provider,
  id: 'broken.provider',
  order: 200,
  controls: [statusControl]
}

type ProviderStateLiteral =
  | { status: 'idle' | 'loading' | 'ready' }
  | { status: 'error'; safeMessageKey: string }
  | { status: 'disconnected'; safeMessageKey: string }

interface RenderOptions {
  providers?: readonly AssetPresentationProvider[]
  filters?: FilterState
  providerStates?: Readonly<Record<string, ProviderStateLiteral>>
  onUpdateFilter?: (
    providerId: string,
    controlId: string,
    value: FilterValue
  ) => void
  onRetry?: (providerId: string) => void
}

function renderFilterControls({
  providers = [provider],
  filters = {},
  providerStates = {},
  onUpdateFilter,
  onRetry
}: RenderOptions = {}) {
  const user = userEvent.setup()
  const view = render(AssetPresentationFilterControls, {
    props: {
      providers,
      filters,
      providerStates,
      ...(onUpdateFilter ? { 'onUpdate-filter': onUpdateFilter } : {}),
      ...(onRetry ? { onRetry } : {})
    },
    global: { plugins: [i18n] }
  })
  return { user, ...view }
}

describe('AssetPresentationFilterControls', () => {
  it('renders single-select, multi-select, and toggle controls with accessible names', () => {
    renderFilterControls()

    expect(
      screen.getByRole('combobox', { name: 'Content type' })
    ).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Platform' })).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'YouTube Shorts' })
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'TikTok' })).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Hide excluded' })
    ).toBeInTheDocument()
  })

  it('renders providers and controls in the given registry order', () => {
    renderFilterControls({ providers: [provider, brokenProvider] })

    const content = screen.getByRole('combobox', { name: 'Content type' })
    const platform = screen.getByRole('checkbox', { name: 'YouTube Shorts' })
    const toggle = screen.getByRole('switch', { name: 'Hide excluded' })
    const status = screen.getByRole('combobox', { name: 'Status' })

    expect(
      content.compareDocumentPosition(platform) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      platform.compareDocumentPosition(toggle) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      toggle.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('emits update-filter when a single-select changes', async () => {
    const onUpdateFilter = vi.fn()
    const { user } = renderFilterControls({ onUpdateFilter })

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Content type' }),
      'short'
    )

    expect(onUpdateFilter).toHaveBeenCalledWith(
      'test.provider',
      'content',
      'short'
    )
  })

  it('preserves a null single-select default as an explicit Any option', async () => {
    const onUpdateFilter = vi.fn()
    const nullDefaultProvider: AssetPresentationProvider = {
      ...provider,
      controls: [{ ...contentControl, defaultValue: null }]
    }
    const { user } = renderFilterControls({
      providers: [nullDefaultProvider],
      onUpdateFilter
    })
    const select = screen.getByRole('combobox', { name: 'Content type' })

    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Any' })).toBeInTheDocument()

    await user.selectOptions(select, 'short')
    await user.selectOptions(select, '')

    expect(onUpdateFilter).toHaveBeenLastCalledWith(
      'test.provider',
      'content',
      null
    )
  })

  it('emits update-filter with the next multi-select value from the current selection', async () => {
    const onUpdateFilter = vi.fn()
    const filters: FilterState = {
      [getPresentationFilterKey('test.provider', 'platform')]: []
    }
    const { user } = renderFilterControls({ filters, onUpdateFilter })

    await user.click(screen.getByRole('checkbox', { name: 'YouTube Shorts' }))

    expect(onUpdateFilter).toHaveBeenCalledWith('test.provider', 'platform', [
      'youtube-shorts'
    ])
  })

  it('emits update-filter when a toggle switches', async () => {
    const onUpdateFilter = vi.fn()
    const { user } = renderFilterControls({ onUpdateFilter })

    await user.click(screen.getByRole('switch', { name: 'Hide excluded' }))

    expect(onUpdateFilter).toHaveBeenCalledWith(
      'test.provider',
      'hideExcluded',
      true
    )
  })

  it('announces provider loading politely and clears the status once ready', async () => {
    const { rerender } = renderFilterControls({
      providerStates: { 'test.provider': { status: 'loading' } }
    })

    const status = screen.getByRole('status')
    expect(status.textContent ?? '').not.toBe('')

    await rerender({
      providers: [provider],
      filters: {},
      providerStates: { 'test.provider': { status: 'ready' } }
    })

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('isolates a provider error with an alert and a retry control', async () => {
    const onRetry = vi.fn()
    const { user } = renderFilterControls({
      providers: [provider, brokenProvider],
      providerStates: {
        'test.provider': { status: 'ready' },
        'broken.provider': {
          status: 'error',
          safeMessageKey: 'testP.providerError'
        }
      },
      onRetry
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Metadata unavailable')
    // The healthy provider's controls remain usable beside the error.
    expect(
      screen.getByRole('combobox', { name: 'Content type' })
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledWith('broken.provider')
  })

  describe('disconnected provider state', () => {
    it('renders a dedicated status region that is not an alert', () => {
      renderFilterControls({
        providers: [provider],
        providerStates: {
          'test.provider': {
            status: 'disconnected',
            safeMessageKey: 'testP.providerDisconnected'
          }
        }
      })

      const status = screen.getByTestId('asset-presentation-disconnected')
      expect(status).toHaveAttribute('role', 'status')
      expect(status).toHaveTextContent('Backend not connected')
      // A disconnected provider is not a failure, so no alert is raised and no
      // retry affordance is offered.
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    })

    it('identifies which provider is disconnected', () => {
      renderFilterControls({
        providers: [provider, brokenProvider],
        providerStates: {
          'test.provider': { status: 'ready' },
          'broken.provider': {
            status: 'disconnected',
            safeMessageKey: 'testP.providerDisconnected'
          }
        }
      })

      expect(
        screen.getByTestId('asset-presentation-disconnected')
      ).toHaveAttribute('data-disconnected-provider-id', 'broken.provider')
      // The healthy provider keeps working beside the disconnected one.
      expect(
        screen.getByRole('combobox', { name: 'Content type' })
      ).toBeInTheDocument()
    })

    it('keeps disconnected separate from error and from loading', () => {
      renderFilterControls({
        providers: [provider, brokenProvider],
        providerStates: {
          'test.provider': {
            status: 'disconnected',
            safeMessageKey: 'testP.providerDisconnected'
          },
          'broken.provider': {
            status: 'error',
            safeMessageKey: 'testP.providerError'
          }
        }
      })

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Metadata unavailable'
      )
      expect(
        screen.getByTestId('asset-presentation-disconnected')
      ).toHaveTextContent('Backend not connected')
      // Loading has its own status region and must not be conflated.
      expect(screen.queryByText('Loading presentation data')).toBeNull()
    })

    it('contributes no synthetic control, card, or action while disconnected', () => {
      renderFilterControls({
        providers: [{ ...provider, controls: [] as readonly FilterControl[] }],
        providerStates: {
          'test.provider': {
            status: 'disconnected',
            safeMessageKey: 'testP.providerDisconnected'
          }
        }
      })

      expect(
        screen.getByTestId('asset-presentation-disconnected')
      ).toBeInTheDocument()
      // Nothing is fabricated to fill the empty surface.
      expect(screen.queryAllByRole('combobox')).toHaveLength(0)
      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })
  })
})
