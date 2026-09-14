<template>
  <div>
    <SidebarTopArea>
      <SearchInput
        v-model="searchQuery"
        :placeholder="
          $t('g.searchPlaceholder', {
            subject: $t('sideToolbar.labels.assets')
          })
        "
      />
      <template #actions>
        <MediaAssetFilterButton
          v-if="isCloud"
          v-tooltip.top="{ value: $t('assetBrowser.filterBy') }"
          :active="hasActiveCoreFilters"
        >
          <template #default>
            <MediaAssetFilterMenu
              v-model:date-filter="dateFilter"
              v-model:media-type-filters="mediaTypeFilters"
            />
          </template>
        </MediaAssetFilterButton>
        <MediaAssetSettingsButton
          v-tooltip.top="{ value: $t('sideToolbar.mediaAssets.viewSettings') }"
        >
          <template #default>
            <MediaAssetSettingsMenu
              v-model:view-mode="viewMode"
              v-model:sort-by="sortBy"
              :show-sort-options="isCloud"
              :show-generation-time-sort
            />
          </template>
        </MediaAssetSettingsButton>
      </template>
    </SidebarTopArea>

    <AssetPresentationFilterControls
      v-if="presentationProviders.length > 0"
      class="px-2 pb-2 2xl:px-4"
      :providers="presentationProviders"
      :filters="presentationFilters"
      :provider-states="presentationProviderStateRecord"
      @update-filter="updatePresentationFilter"
      @retry="(providerId) => emit('retry:presentation-provider', providerId)"
    />

    <div
      v-if="filterChips.length"
      class="flex flex-wrap items-center gap-1.5 px-2 pb-2 2xl:px-4"
    >
      <span
        v-for="chip in filterChips"
        :key="chip.key"
        class="inline-flex items-center gap-1 rounded-md bg-secondary-background py-1 pr-1 pl-2 text-xs whitespace-nowrap"
      >
        <span>{{ chip.label }}</span>
        <Button
          variant="textonly"
          size="icon"
          class="size-4 rounded-sm p-0"
          :aria-label="
            $t('sideToolbar.mediaAssets.removeFilter', {
              label: chip.label
            })
          "
          @click="removeFilter(chip)"
        >
          <i class="icon-[lucide--x] size-3" />
        </Button>
      </span>
      <Button
        variant="textonly"
        class="h-6 px-1.5 text-xs text-muted-foreground"
        @click="clearFilters"
      >
        {{ $t('sideToolbar.mediaAssets.clearFilters') }}
      </Button>
    </div>

    <div
      v-if="bottomDivider"
      class="border-t border-dashed border-comfy-input"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import SidebarTopArea from '@/components/sidebar/tabs/SidebarTopArea.vue'
import Button from '@/components/ui/button/Button.vue'
import SearchInput from '@/components/ui/search-input/SearchInput.vue'
import {
  dateFilterOptions,
  mediaTypeFilterOptions
} from '@/platform/assets/mediaAssetFilterOptions'
import type { MediaAssetDateFilter } from '@/platform/assets/mediaAssetFilterOptions'
import AssetPresentationFilterControls from '@/platform/assets/presentation/AssetPresentationFilterControls.vue'
import {
  getPresentationFilterKey,
  isFilterControlActive
} from '@/platform/assets/presentation/assetPresentationRegistry'
import type {
  AssetPresentationProvider,
  FilterControl,
  FilterState,
  FilterValue,
  ProviderPresentationState
} from '@/platform/assets/presentation/assetPresentationRegistry'
import { isCloud } from '@/platform/distribution/types'

import MediaAssetFilterButton from './MediaAssetFilterButton.vue'
import MediaAssetFilterMenu from './MediaAssetFilterMenu.vue'
import MediaAssetSettingsButton from './MediaAssetSettingsButton.vue'
import MediaAssetSettingsMenu from './MediaAssetSettingsMenu.vue'
import type { SortBy } from './MediaAssetSettingsMenu.vue'
import type { MediaAssetViewMode } from './mediaAssetViewOptions'

type PresentationProviderStateInput =
  | {
      readonly providerId: string
      readonly status: Exclude<
        ProviderPresentationState['status'],
        'error' | 'disconnected'
      >
    }
  | {
      readonly providerId: string
      readonly status: 'error'
      readonly safeMessageKey: string
    }
  | {
      readonly providerId: string
      readonly status: 'disconnected'
      readonly safeMessageKey: string
    }

interface FilterChip {
  readonly key: string
  readonly label: string
  readonly presentationKey?: string
}

const {
  showGenerationTimeSort = false,
  bottomDivider = false,
  presentationProviders = [],
  presentationFilters = {},
  presentationProviderStates = []
} = defineProps<{
  showGenerationTimeSort?: boolean
  bottomDivider?: boolean
  presentationProviders?: readonly AssetPresentationProvider[]
  presentationFilters?: FilterState
  presentationProviderStates?: readonly PresentationProviderStateInput[]
}>()

const emit = defineEmits<{
  'update:presentation-filter': [
    payload: { readonly key: string; readonly value: FilterValue }
  ]
  'reset:presentation-filter': [key: string]
  'clear:presentation-filters': []
  'retry:presentation-provider': [providerId: string]
}>()

const searchQuery = defineModel<string>('searchQuery', { required: true })
const sortBy = defineModel<SortBy>('sortBy', { required: true })
const viewMode = defineModel<MediaAssetViewMode>('viewMode', { required: true })
const dateFilter = defineModel<MediaAssetDateFilter>('dateFilter', {
  required: true
})
const mediaTypeFilters = defineModel<string[]>('mediaTypeFilters', {
  required: true
})

const { t } = useI18n()

function labelFor(options: { value: string; label: string }[], value: string) {
  return t(options.find((option) => option.value === value)?.label ?? value)
}

const presentationProviderStateRecord = computed(() => {
  const states: Record<
    string,
    | {
        readonly status: Exclude<
          ProviderPresentationState['status'],
          'error' | 'disconnected'
        >
      }
    | { readonly status: 'error'; readonly safeMessageKey: string }
    | { readonly status: 'disconnected'; readonly safeMessageKey: string }
  > = {}
  for (const state of presentationProviderStates) {
    if (state.status === 'error') {
      states[state.providerId] = {
        status: state.status,
        safeMessageKey:
          state.safeMessageKey || 'assetPresentation.providerError'
      }
      continue
    }
    // Disconnected keeps its own branch so it never collapses into `error`.
    if (state.status === 'disconnected') {
      states[state.providerId] = {
        status: state.status,
        safeMessageKey:
          state.safeMessageKey || 'assetPresentation.providerDisconnected'
      }
      continue
    }
    states[state.providerId] = { status: state.status }
  }
  return states
})

function controlValue(providerId: string, control: FilterControl): FilterValue {
  const key = getPresentationFilterKey(providerId, control.id)
  return key in presentationFilters
    ? presentationFilters[key]
    : control.defaultValue
}

function presentationFilterChips(): FilterChip[] {
  const chips: FilterChip[] = []
  for (const provider of presentationProviders) {
    for (const control of provider.controls) {
      const value = controlValue(provider.id, control)
      if (!isFilterControlActive(control, value)) continue
      const presentationKey = getPresentationFilterKey(provider.id, control.id)
      if (control.kind === 'multi-select' && Array.isArray(value)) {
        if (value.length === 0) {
          chips.push({
            key: presentationKey,
            label: t(control.labelKey),
            presentationKey
          })
          continue
        }
        for (const selected of value) {
          const option = control.options.find(
            (candidate) => candidate.value === selected
          )
          if (!option) continue
          chips.push({
            key: `${presentationKey}:${selected}`,
            label: t(option.labelKey),
            presentationKey
          })
        }
      } else if (control.kind === 'single-select') {
        const option =
          typeof value === 'string'
            ? control.options.find((candidate) => candidate.value === value)
            : undefined
        chips.push({
          key: presentationKey,
          label:
            value === null
              ? t('assetPresentation.filters.any')
              : t(option?.labelKey ?? control.labelKey),
          presentationKey
        })
      } else if (control.kind === 'toggle') {
        chips.push({
          key: presentationKey,
          label: t(control.labelKey),
          presentationKey
        })
      }
    }
  }
  return chips
}

const filterChips = computed(() => {
  const chips: FilterChip[] = mediaTypeFilters.value.map((value) => ({
    key: `media:${value}`,
    label: labelFor(mediaTypeFilterOptions, value)
  }))

  if (dateFilter.value) {
    chips.push({
      key: 'date',
      label: labelFor(dateFilterOptions, dateFilter.value)
    })
  }

  return [...chips, ...presentationFilterChips()]
})

const hasActiveCoreFilters = computed(
  () => mediaTypeFilters.value.length > 0 || dateFilter.value !== ''
)

function removeFilter(chip: FilterChip) {
  if (chip.presentationKey) {
    emit('reset:presentation-filter', chip.presentationKey)
    return
  }
  if (chip.key === 'date') {
    dateFilter.value = ''
    return
  }

  const mediaType = chip.key.slice('media:'.length)
  mediaTypeFilters.value = mediaTypeFilters.value.filter(
    (value) => value !== mediaType
  )
}

function updatePresentationFilter(
  providerId: string,
  controlId: string,
  value: FilterValue
) {
  emit('update:presentation-filter', {
    key: getPresentationFilterKey(providerId, controlId),
    value
  })
}

function clearFilters() {
  dateFilter.value = ''
  mediaTypeFilters.value = []
  emit('clear:presentation-filters')
}
</script>
