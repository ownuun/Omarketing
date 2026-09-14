import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import AssetsSidebarTab from './AssetsSidebarTab.vue'

const folderAsset = vi.hoisted(() => ({
  id: 'multi-output',
  name: 'multi-output.png',
  tags: ['output'],
  user_metadata: {
    jobId: 'multi-output-job',
    nodeId: '1',
    subfolder: '',
    outputCount: 2
  }
}))

/**
 * Mock state for the planned `useAssetPresentation` seam. The product module
 * does not exist yet; `vi.mock` with a factory registers without resolving the
 * file, so this stays inert (RED) until AssetsSidebarTab consumes the seam.
 */
const presentationMock = vi.hoisted(() => ({
  providers: [] as readonly unknown[],
  providerStates: [] as readonly unknown[],
  filters: {} as Record<string, unknown>,
  details: [] as readonly unknown[],
  actionStates: [] as readonly unknown[],
  matchesAll: true,
  setFilter: vi.fn(),
  resetFilter: vi.fn(),
  clearAllFilters: vi.fn(),
  clearProviderFilters: vi.fn(),
  retryProvider: vi.fn(),
  executeAction: vi.fn()
}))

vi.mock('@/platform/assets/presentation/useAssetPresentation', async () => {
  const { computed } = await import('vue')

  return {
    createAssetPresentationTarget: (
      asset: { id: string },
      tab: 'input' | 'output'
    ) => ({
      assetId: asset.id,
      asset,
      tab,
      outputLocatorCandidate: null
    }),
    useAssetPresentation: () => ({
      filterBarProps: computed(() => ({
        presentationProviders: presentationMock.providers,
        presentationFilters: presentationMock.filters,
        presentationProviderStates: presentationMock.providerStates
      })),
      lightboxProps: computed(() => ({
        presentationDetails: presentationMock.details,
        presentationActionStates: presentationMock.actionStates
      })),
      presentationDecision: () => presentationMock.matchesAll,
      requestMetadataWindow: vi.fn(),
      setFilter: presentationMock.setFilter,
      resetFilter: presentationMock.resetFilter,
      clearFilters: presentationMock.clearAllFilters,
      clearAllFilters: presentationMock.clearAllFilters,
      clearProviderFilters: presentationMock.clearProviderFilters,
      retryProvider: presentationMock.retryProvider,
      executeAction: presentationMock.executeAction
    })
  }
})

const demoPresentationProvider = {
  id: 'org.demo.assets.v1',
  order: 10,
  environments: ['localhost'],
  controls: [
    {
      kind: 'multi-select',
      id: 'platform',
      labelKey: 'assetPresentation.controls.platform',
      defaultValue: [],
      options: [
        { value: 'tiktok', labelKey: 'assetPresentation.options.tiktok' }
      ]
    }
  ],
  actions: [],
  appliesTo: () => true,
  predicate: () => 'match',
  loadMetadataBatch: async () => []
}

const demoPresentationDetail = {
  providerId: 'org.demo.assets.v1',
  order: 10,
  status: 'ready',
  sections: []
}

const demoPresentationAction = {
  assetId: 'multi-output',
  providerId: 'org.demo.assets.v1',
  actionId: 'exclude',
  labelKey: 'assetPresentation.actions.exclude',
  accessibleDescriptionKey: 'assetPresentation.actions.excludeDescription',
  intent: 'exclude',
  enabled: true,
  pending: false
}

vi.mock('@/platform/assets/composables/media/useAssetsApi', async () => {
  const { ref } = await import('vue')

  return {
    useAssetsApi: () => ({
      media: ref([folderAsset]),
      loading: ref(false),
      error: ref(null),
      fetchMediaList: vi.fn(async () => [folderAsset]),
      loadMore: vi.fn(),
      hasMore: ref(false),
      isLoadingMore: ref(false)
    })
  }
})

vi.mock('@/platform/assets/composables/useAssetGridSelection', async () => {
  const { ref } = await import('vue')
  return {
    useAssetGridSelection: () => ({ marqueeStyle: ref(null) })
  }
})

vi.mock('@/platform/assets/composables/useAssetSelection', async () => {
  const { ref } = await import('vue')

  return {
    useAssetSelection: () => ({
      isSelected: vi.fn(() => false),
      selectedIds: ref(new Set<string>()),
      handleAssetClick: vi.fn(),
      selectAll: vi.fn(),
      setSelectedIds: vi.fn(),
      hasSelection: ref(false),
      clearSelection: vi.fn(),
      getSelectedAssets: vi.fn(() => []),
      reconcileSelection: vi.fn(),
      getOutputCount: vi.fn(() => 2),
      getTotalOutputCount: vi.fn(() => 0),
      activate: vi.fn(),
      deactivate: vi.fn()
    })
  }
})

vi.mock('@/platform/assets/composables/useMediaAssetActions', () => ({
  useMediaAssetActions: () => ({
    downloadAssets: vi.fn(),
    deleteAssets: vi.fn(),
    addMultipleToWorkflow: vi.fn(),
    openMultipleWorkflows: vi.fn(),
    exportMultipleWorkflows: vi.fn()
  })
}))

vi.mock('@/platform/assets/utils/outputAssetUtil', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveOutputAssetItems: vi.fn(async () => [folderAsset])
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      assetBrowser: { jobId: 'Job ID' },
      assetPresentation: {
        noMatch: {
          message: 'No assets match the current filters.'
        },
        filters: {
          clearProvider: 'Clear {provider} filters',
          clearAll: 'Clear all filters'
        }
      },
      g: { copyJobId: 'Copy Job ID' },
      sideToolbar: {
        backToAssets: 'Back to all assets',
        mediaAssets: {
          title: 'Media Assets',
          filterNoMatches: 'No matches'
        },
        noGeneratedFiles: 'No generated files found',
        noFilesFoundMessage:
          'Upload files or generate content to see them here',
        labels: { generated: 'Generated', imported: 'Imported' }
      }
    }
  }
})

const sidebarTabTemplateStub = {
  props: ['title'],
  template: `
    <section>
      <h2 v-if="title">{{ title }}</h2>
      <div data-testid="folder-title"><slot name="alt-title" /></div>
      <div data-testid="folder-controls"><slot name="header" /></div>
      <slot name="body" />
    </section>
  `
}

const assetsGridStub = {
  props: ['assets'],
  emits: ['output-count-click'],
  template: `
    <div>
      <span data-testid="grid-asset-count">{{ assets?.length ?? 0 }}</span>
      <button
        aria-label="Enter output folder"
        @click="$emit('output-count-click', assets[0])"
      />
    </div>
  `
}

/** Renders the registered presentation props it receives for host wiring assertions. */
const filterBarPresentationStub = {
  name: 'MediaAssetFilterBar',
  props: [
    'searchQuery',
    'sortBy',
    'viewMode',
    'dateFilter',
    'mediaTypeFilters',
    'presentationProviders',
    'presentationFilters',
    'presentationProviderStates'
  ],
  emits: [
    'update:searchQuery',
    'update:presentation-filter',
    'reset:presentation-filter',
    'clear:presentation-filters',
    'retry:presentation-provider'
  ],
  template: `
    <div data-testid="filter-bar">
      <span data-testid="presentation-provider-count">{{ presentationProviders?.length ?? 0 }}</span>
      <span data-testid="presentation-filter-keys">{{ Object.keys(presentationFilters ?? {}).join(',') }}</span>
      <span data-testid="presentation-state-count">{{ presentationProviderStates?.length ?? 0 }}</span>
      <button aria-label="Apply empty search" @click="$emit('update:searchQuery', 'no-such-asset')" />
      <button aria-label="Update provider filter" @click="$emit('update:presentation-filter', { key: 'org.demo.assets.v1/platform', value: ['tiktok'] })" />
      <button aria-label="Reset provider filter" @click="$emit('reset:presentation-filter', 'org.demo.assets.v1/platform')" />
      <button aria-label="Clear provider filters" @click="$emit('clear:presentation-filters')" />
      <button aria-label="Retry provider" @click="$emit('retry:presentation-provider', 'org.demo.assets.v1')" />
    </div>
  `
}

const lightboxPresentationStub = {
  name: 'MediaLightbox',
  props: [
    'allGalleryItems',
    'activeIndex',
    'presentationDetails',
    'presentationActionStates'
  ],
  template: `
    <div data-testid="lightbox">
      <span data-testid="presentation-details-count">{{ presentationDetails?.length ?? 0 }}</span>
      <span data-testid="presentation-action-count">{{ presentationActionStates?.length ?? 0 }}</span>
      <span data-testid="first-gallery-url">{{ allGalleryItems?.[0]?.url ?? '' }}</span>
    </div>
  `
}

const noResultsStub = {
  name: 'NoResultsPlaceholder',
  props: ['title', 'message'],
  template: `
    <div data-testid="no-results">
      <p>{{ title }}</p>
      <p>{{ message }}</p>
    </div>
  `
}

const buttonStub = {
  template: '<button><slot /></button>'
}

function renderTab(stubOverrides: Record<string, unknown> = {}) {
  return render(AssetsSidebarTab, {
    global: {
      plugins: [createPinia(), i18n],
      directives: {
        tooltip: {}
      },
      stubs: {
        SidebarTabTemplate: sidebarTabTemplateStub,
        AssetsSidebarGridView: assetsGridStub,
        AssetsSidebarListView: true,
        Button: buttonStub,
        MediaAssetFilterBar: true,
        MediaAssetSelectionBar: true,
        MediaLightbox: true,
        MediaAssetContextMenu: true,
        NoResultsPlaceholder: true,
        Skeleton: true,
        ...stubOverrides
      }
    }
  })
}

describe('AssetsSidebarTab folder navigation', () => {
  it('places accessible folder actions beside the job ID', async () => {
    renderTab()
    await userEvent.click(
      screen.getByRole('button', { name: 'Enter output folder' })
    )

    const folderTitle = screen.getByTestId('folder-title')
    const backButton = within(folderTitle).getByRole('button', {
      name: 'Back to all assets'
    })
    within(folderTitle).getByRole('button', {
      name: 'Copy Job ID'
    })
    const jobId = within(folderTitle).getByText('multi-output-job')

    expect(backButton).not.toHaveTextContent(/\S/)
    expect(jobId).toBeVisible()
    expect(screen.getByTestId('folder-controls')).not.toHaveTextContent(
      'Back to all assets'
    )

    await userEvent.click(backButton)
    expect(screen.getByText('Media Assets')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Back to all assets' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('multi-output-job')).not.toBeInTheDocument()
  })
})

describe('AssetsSidebarTab registered presentation integration', () => {
  beforeEach(() => {
    presentationMock.providers = []
    presentationMock.providerStates = []
    presentationMock.filters = {}
    presentationMock.details = []
    presentationMock.actionStates = []
    presentationMock.matchesAll = true
    presentationMock.setFilter.mockClear()
    presentationMock.resetFilter.mockClear()
    presentationMock.clearAllFilters.mockClear()
    presentationMock.clearProviderFilters.mockClear()
    presentationMock.retryProvider.mockClear()
    presentationMock.executeAction.mockClear()
  })

  it('passes generic presentation props to the filter bar and lightbox', () => {
    presentationMock.providers = [demoPresentationProvider]
    presentationMock.providerStates = [
      { providerId: 'org.demo.assets.v1', status: 'ready' }
    ]
    presentationMock.filters = { 'org.demo.assets.v1/platform': ['tiktok'] }
    presentationMock.details = [demoPresentationDetail]
    presentationMock.actionStates = [demoPresentationAction]

    renderTab({
      MediaAssetFilterBar: filterBarPresentationStub,
      MediaLightbox: lightboxPresentationStub
    })

    expect(screen.getByTestId('presentation-provider-count')).toHaveTextContent(
      '1'
    )
    expect(screen.getByTestId('presentation-filter-keys')).toHaveTextContent(
      'org.demo.assets.v1/platform'
    )
    expect(screen.getByTestId('presentation-state-count')).toHaveTextContent(
      '1'
    )
    expect(screen.getByTestId('presentation-details-count')).toHaveTextContent(
      '1'
    )
    expect(screen.getByTestId('presentation-action-count')).toHaveTextContent(
      '1'
    )
    expect(screen.getByTestId('first-gallery-url')).not.toBeEmptyDOMElement()
  })

  it('keeps core assets visible while provider metadata loads', () => {
    presentationMock.providerStates = [
      { providerId: 'org.demo.assets.v1', status: 'loading' }
    ]

    renderTab({
      MediaAssetFilterBar: filterBarPresentationStub,
      MediaLightbox: lightboxPresentationStub,
      NoResultsPlaceholder: noResultsStub
    })

    // Fail-open loading: no false empty state, no skeleton replacing the grid.
    expect(screen.getByTestId('grid-asset-count')).toHaveTextContent('1')
    expect(screen.queryByText('No matches')).toBeNull()
    expect(screen.queryByText('No generated files found')).toBeNull()
  })

  it('routes filter-bar commands to the namespaced presentation state', async () => {
    renderTab({ MediaAssetFilterBar: filterBarPresentationStub })

    await userEvent.click(
      screen.getByRole('button', { name: 'Update provider filter' })
    )
    expect(presentationMock.setFilter).toHaveBeenCalledWith(
      'org.demo.assets.v1',
      'platform',
      ['tiktok']
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Reset provider filter' })
    )
    expect(presentationMock.resetFilter).toHaveBeenCalledWith(
      'org.demo.assets.v1',
      'platform'
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Clear provider filters' })
    )
    expect(presentationMock.clearAllFilters).toHaveBeenCalledOnce()

    await userEvent.click(
      screen.getByRole('button', { name: 'Retry provider' })
    )
    expect(presentationMock.retryProvider).toHaveBeenCalledWith(
      'org.demo.assets.v1'
    )
  })

  it('treats a core-filter zero as settled and clears search from no-match', async () => {
    presentationMock.filters = {
      'org.demo.assets.v1/platform': ['tiktok']
    }
    presentationMock.providerStates = [
      { providerId: 'org.demo.assets.v1', status: 'loading' }
    ]
    renderTab({ MediaAssetFilterBar: filterBarPresentationStub })

    await userEvent.click(
      screen.getByRole('button', { name: 'Apply empty search' })
    )
    expect(await screen.findByText('No matches')).toBeVisible()

    await userEvent.click(
      screen.getByRole('button', { name: 'Clear all filters' })
    )
    expect(await screen.findByTestId('grid-asset-count')).toHaveTextContent('1')
    expect(presentationMock.clearAllFilters).toHaveBeenCalledOnce()
  })

  it('shows the settled provider no-match state with scoped clear actions', async () => {
    presentationMock.filters = { 'org.demo.assets.v1/platform': ['tiktok'] }
    presentationMock.providerStates = [
      { providerId: 'org.demo.assets.v1', status: 'ready' }
    ]
    presentationMock.matchesAll = false

    renderTab({
      MediaAssetFilterBar: filterBarPresentationStub,
      MediaLightbox: lightboxPresentationStub,
      NoResultsPlaceholder: noResultsStub
    })

    expect(screen.getByText('No matches')).toBeVisible()
    expect(screen.queryByText('No generated files found')).toBeNull()

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Clear org.demo.assets.v1 filters'
      })
    )
    expect(presentationMock.clearProviderFilters).toHaveBeenCalledWith(
      'org.demo.assets.v1'
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Clear all filters' })
    )
    expect(presentationMock.clearAllFilters).toHaveBeenCalledOnce()
  })
})
