import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { defineComponent, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'

import enMessages from '@/locales/en/main.json' with { type: 'json' }
import MediaAssetFilterBar from '@/platform/assets/components/MediaAssetFilterBar.vue'
import { MEDIA_ASSET_VIEW_MODE } from '@/platform/assets/components/mediaAssetViewOptions'
import type { MediaAssetDateFilter } from '@/platform/assets/mediaAssetFilterOptions'

const distribution = vi.hoisted(() => ({ isCloud: true }))

vi.mock('@/platform/distribution/types', () => ({
  get isCloud() {
    return distribution.isCloud
  }
}))

const presentationMessages = {
  assetPresentation: {
    controls: {
      platform: 'Platform',
      contentType: 'Content type',
      verifiedOnly: 'Verified only'
    },
    options: {
      tiktok: 'TikTok',
      youtube: 'YouTube Shorts',
      shortForm: 'Short form',
      carousel: 'Carousel'
    },
    providerLoading: 'Loading extension filters…',
    providerError: 'Extension filters failed to load.',
    retry: 'Retry'
  }
}

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { ...enMessages, ...presentationMessages } }
})

interface PresentationFilterOption {
  readonly value: string
  readonly labelKey: string
}

type PresentationFilterControl =
  | {
      readonly kind: 'single-select'
      readonly id: string
      readonly labelKey: string
      readonly defaultValue: string | null
      readonly options: readonly PresentationFilterOption[]
    }
  | {
      readonly kind: 'multi-select'
      readonly id: string
      readonly labelKey: string
      readonly defaultValue: readonly string[]
      readonly options: readonly PresentationFilterOption[]
    }
  | {
      readonly kind: 'toggle'
      readonly id: string
      readonly labelKey: string
      readonly defaultValue: boolean
    }

interface PresentationProviderFixture {
  readonly id: string
  readonly order: number
  readonly environments: readonly string[]
  readonly controls: readonly PresentationFilterControl[]
  readonly actions: readonly []
  appliesTo: () => boolean
  predicate: () => 'match' | 'no-match' | 'pending'
  loadMetadataBatch: () => Promise<readonly []>
}

function makePresentationProvider(
  spec: Pick<PresentationProviderFixture, 'id' | 'order' | 'controls'>
): PresentationProviderFixture {
  return {
    environments: ['localhost'],
    actions: [],
    appliesTo: () => true,
    predicate: () => 'match',
    loadMetadataBatch: async () => [],
    ...spec
  }
}

const demoProvider = makePresentationProvider({
  id: 'org.demo.assets.v1',
  order: 10,
  controls: [
    {
      kind: 'multi-select',
      id: 'platform',
      labelKey: 'assetPresentation.controls.platform',
      defaultValue: [],
      options: [
        { value: 'tiktok', labelKey: 'assetPresentation.options.tiktok' },
        { value: 'youtube', labelKey: 'assetPresentation.options.youtube' }
      ]
    },
    {
      kind: 'single-select',
      id: 'content-type',
      labelKey: 'assetPresentation.controls.contentType',
      defaultValue: null,
      options: [
        { value: 'short', labelKey: 'assetPresentation.options.shortForm' },
        { value: 'carousel', labelKey: 'assetPresentation.options.carousel' }
      ]
    }
  ]
})

const sampleProvider = makePresentationProvider({
  id: 'net.sample.assets.v1',
  order: 20,
  controls: [
    {
      kind: 'toggle',
      id: 'verified-only',
      labelKey: 'assetPresentation.controls.verifiedOnly',
      defaultValue: false
    }
  ]
})

type PresentationProviderStateFixture =
  | {
      readonly providerId: string
      readonly status: 'idle' | 'loading' | 'ready'
    }
  | {
      readonly providerId: string
      readonly status: 'error'
      readonly safeMessageKey: string
    }

type PresentationFilterValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
type PresentationFilterState = Readonly<Record<string, PresentationFilterValue>>

interface FilterState {
  mediaTypeFilters?: string[]
  dateFilter?: MediaAssetDateFilter
  presentationProviders?: readonly PresentationProviderFixture[]
  presentationFilters?: PresentationFilterState
  presentationProviderStates?: readonly PresentationProviderStateFixture[]
}

function renderFilterBar({
  mediaTypeFilters = [],
  dateFilter = '',
  presentationProviders = [],
  presentationFilters = {},
  presentationProviderStates = []
}: FilterState = {}) {
  const hostDateFilter = ref(dateFilter)
  const hostMediaTypeFilters = ref(mediaTypeFilters)
  const onUpdatePresentationFilter = vi.fn()
  const onResetPresentationFilter = vi.fn()
  const onClearPresentationFilters = vi.fn()
  const onRetryPresentationProvider = vi.fn()
  const TestHost = defineComponent({
    components: { MediaAssetFilterBar },
    setup() {
      return {
        searchQuery: ref(''),
        sortBy: ref('newest'),
        viewMode: ref(MEDIA_ASSET_VIEW_MODE.grid),
        dateFilter: hostDateFilter,
        mediaTypeFilters: hostMediaTypeFilters,
        presentationProviders,
        presentationFilters,
        presentationProviderStates,
        onUpdatePresentationFilter,
        onResetPresentationFilter,
        onClearPresentationFilters,
        onRetryPresentationProvider
      }
    },
    template: `
      <MediaAssetFilterBar
        v-model:search-query="searchQuery"
        v-model:sort-by="sortBy"
        v-model:view-mode="viewMode"
        v-model:date-filter="dateFilter"
        v-model:media-type-filters="mediaTypeFilters"
        :presentation-providers="presentationProviders"
        :presentation-filters="presentationFilters"
        :presentation-provider-states="presentationProviderStates"
        @update:presentation-filter="onUpdatePresentationFilter"
        @reset:presentation-filter="onResetPresentationFilter"
        @clear:presentation-filters="onClearPresentationFilters"
        @retry:presentation-provider="onRetryPresentationProvider"
      />
    `
  })

  return {
    ...render(TestHost, {
      global: {
        plugins: [i18n],
        directives: { tooltip: () => {} }
      }
    }),
    user: userEvent.setup(),
    hostDateFilter,
    hostMediaTypeFilters,
    onUpdatePresentationFilter,
    onResetPresentationFilter,
    onClearPresentationFilters,
    onRetryPresentationProvider
  }
}

describe('MediaAssetFilterBar', () => {
  it('hides filter actions when no filters are active', () => {
    renderFilterBar()

    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /^Remove .+ filter$/ })
    ).toBeNull()
  })

  it('switches directly from filters to view settings', async () => {
    const { user } = renderFilterBar()
    const filterButton = screen.getByRole('button', { name: 'Filter by' })
    const settingsButton = screen.getByRole('button', {
      name: 'View settings'
    })

    await user.click(filterButton)
    expect(filterButton).toHaveAttribute('aria-expanded', 'true')

    await user.click(settingsButton)

    expect(filterButton).toHaveAttribute('aria-expanded', 'false')
    expect(settingsButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('List view')).toBeVisible()
  })

  it('manages applied filters without changing unrelated filters', async () => {
    const { user } = renderFilterBar({
      mediaTypeFilters: ['image', 'video'],
      dateFilter: 'week'
    })

    expect(
      screen.getByRole('button', { name: 'Remove Image filter' })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Remove Video filter' })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Remove Past 7 days filter' })
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Remove Image filter' })
    )

    expect(
      screen.queryByRole('button', { name: 'Remove Image filter' })
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Remove Video filter' })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Remove Past 7 days filter' })
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Remove Past 7 days filter' })
    )

    expect(
      screen.queryByRole('button', { name: 'Remove Past 7 days filter' })
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Remove Video filter' })
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))

    expect(
      screen.queryByRole('button', { name: 'Remove Video filter' })
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
  })
})

describe('MediaAssetFilterBar registered presentation controls', () => {
  afterEach(() => {
    // Existing suites rely on the cloud distribution; restore it after the
    // localhost-only rendering scenarios.
    distribution.isCloud = true
  })

  it('renders registered controls even when the cloud-only core filter button is hidden', () => {
    distribution.isCloud = false
    renderFilterBar({
      presentationProviders: [demoProvider, sampleProvider]
    })

    expect(screen.queryByRole('button', { name: 'Filter by' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Platform' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Content type' })).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Verified only' })).toBeVisible()
  })

  it('emits update:presentation-filter with the fully-qualified provider control key', async () => {
    const { user, onUpdatePresentationFilter } = renderFilterBar({
      presentationProviders: [demoProvider, sampleProvider]
    })

    const platformGroup = screen.getByRole('group', { name: 'Platform' })
    await user.click(
      within(platformGroup).getByRole('checkbox', { name: 'TikTok' })
    )
    expect(onUpdatePresentationFilter).toHaveBeenCalledWith({
      key: 'org.demo.assets.v1/platform',
      value: ['tiktok']
    })

    await user.click(screen.getByRole('switch', { name: 'Verified only' }))
    expect(onUpdatePresentationFilter).toHaveBeenCalledWith({
      key: 'net.sample.assets.v1/verified-only',
      value: true
    })
  })

  it('removes only the fully-qualified provider control behind a registered chip', async () => {
    const {
      user,
      hostDateFilter,
      hostMediaTypeFilters,
      onResetPresentationFilter,
      onClearPresentationFilters
    } = renderFilterBar({
      mediaTypeFilters: ['image'],
      dateFilter: 'week',
      presentationProviders: [demoProvider, sampleProvider],
      presentationFilters: {
        'org.demo.assets.v1/platform': ['tiktok'],
        'net.sample.assets.v1/verified-only': true
      }
    })

    expect(
      screen.getByRole('button', { name: 'Remove TikTok filter' })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Remove Verified only filter' })
    ).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'Remove TikTok filter' })
    )

    expect(onResetPresentationFilter).toHaveBeenCalledTimes(1)
    expect(onResetPresentationFilter).toHaveBeenCalledWith(
      'org.demo.assets.v1/platform'
    )
    // Core filters keep their values and the other provider is untouched.
    expect(hostDateFilter.value).toBe('week')
    expect(hostMediaTypeFilters.value).toEqual(['image'])
    expect(onClearPresentationFilters).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Remove Image filter' })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Remove Past 7 days filter' })
    ).toBeVisible()
  })

  it('clears both existing and registered filters from Clear all', async () => {
    const {
      user,
      hostDateFilter,
      hostMediaTypeFilters,
      onClearPresentationFilters
    } = renderFilterBar({
      mediaTypeFilters: ['image'],
      dateFilter: 'week',
      presentationProviders: [demoProvider],
      presentationFilters: { 'org.demo.assets.v1/platform': ['tiktok'] }
    })

    await user.click(screen.getByRole('button', { name: 'Clear all' }))

    expect(onClearPresentationFilters).toHaveBeenCalledTimes(1)
    expect(hostDateFilter.value).toBe('')
    expect(hostMediaTypeFilters.value).toEqual([])
    expect(
      screen.queryByRole('button', { name: 'Remove Image filter' })
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Remove Past 7 days filter' })
    ).toBeNull()
  })

  it('exposes provider loading, error, and retry accessibly', async () => {
    const { user, onRetryPresentationProvider } = renderFilterBar({
      presentationProviders: [demoProvider, sampleProvider],
      presentationProviderStates: [
        { providerId: 'org.demo.assets.v1', status: 'loading' },
        {
          providerId: 'net.sample.assets.v1',
          status: 'error',
          safeMessageKey: 'assetPresentation.providerError'
        }
      ]
    })

    // Pending provider work is announced politely and marks its controls busy.
    expect(screen.getByRole('group', { name: 'Platform' })).toHaveAttribute(
      'aria-busy',
      'true'
    )
    expect(screen.getByRole('status')).toBeVisible()
    // A failed provider reports an alert and keeps its controls rendered.
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Verified only' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetryPresentationProvider).toHaveBeenCalledTimes(1)
    expect(onRetryPresentationProvider).toHaveBeenCalledWith(
      'net.sample.assets.v1'
    )
  })
})
