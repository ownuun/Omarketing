<template>
  <div
    class="flex w-full flex-col gap-4"
    data-component-id="asset-presentation-filter-controls"
  >
    <div
      v-for="view in providerViews"
      :key="view.providerId"
      :data-provider-id="view.providerId"
      class="flex w-full flex-col gap-3"
    >
      <p
        v-if="view.isLoading"
        role="status"
        class="text-sm text-muted-foreground"
      >
        {{ t('assetPresentation.loading') }}
      </p>

      <!--
        Backend-not-connected is its own status region, never an error and never
        an empty list. It stays mounted while the asset list is empty so an
        operator can tell an intentional disconnected state apart from a
        provider that never registered or a render failure.
      -->
      <p
        v-if="view.disconnectedKey !== null"
        role="status"
        data-testid="asset-presentation-disconnected"
        :data-disconnected-provider-id="view.providerId"
        class="text-sm text-muted-foreground"
      >
        {{ t(view.disconnectedKey) }}
      </p>

      <div
        v-if="view.errorKey !== null"
        role="alert"
        class="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-secondary-background p-2"
      >
        <i
          class="icon-[lucide--circle-alert] size-4 shrink-0 text-destructive-background"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 text-sm text-destructive-background">
          {{ t(view.errorKey) }}
        </span>
        <Button
          variant="secondary"
          size="sm"
          @click="emit('retry', view.providerId)"
        >
          {{ t('assetPresentation.retry') }}
        </Button>
      </div>

      <div
        v-if="view.controls.length > 0"
        class="flex flex-wrap items-start gap-x-6 gap-y-3"
      >
        <div
          v-for="control in view.controls"
          :key="control.id"
          class="flex min-w-40 flex-col gap-1"
        >
          <template v-if="control.kind === 'single-select'">
            <label
              :for="fieldId(view.providerId, control.id)"
              class="text-sm text-base-foreground"
            >
              {{ t(control.labelKey) }}
            </label>
            <select
              :id="fieldId(view.providerId, control.id)"
              class="focus-visible:ring-ring h-8 w-full rounded-md border border-border-default bg-base-background px-2 text-sm text-base-foreground focus-visible:ring-1 focus-visible:outline-none"
              :aria-busy="view.isLoading || undefined"
              :value="singleSelectValue(view.providerId, control)"
              @change="onSingleSelectChange(view.providerId, control, $event)"
            >
              <option v-if="control.defaultValue === null" value="">
                {{ t('assetPresentation.filters.any') }}
              </option>
              <option
                v-for="option in control.options"
                :key="option.value"
                :value="option.value"
              >
                {{ t(option.labelKey) }}
              </option>
            </select>
          </template>

          <fieldset
            v-else-if="control.kind === 'multi-select'"
            class="m-0 flex min-w-0 flex-col gap-1 border-0 p-0"
            :aria-busy="view.isLoading || undefined"
          >
            <legend class="text-sm text-base-foreground">
              {{ t(control.labelKey) }}
            </legend>
            <label
              v-for="option in control.options"
              :key="option.value"
              class="flex cursor-pointer items-center gap-2 text-sm text-base-foreground"
            >
              <input
                type="checkbox"
                class="focus-visible:ring-ring size-4 focus-visible:ring-1 focus-visible:outline-none"
                :checked="
                  multiSelectValue(view.providerId, control).includes(
                    option.value
                  )
                "
                @change="
                  onMultiSelectChange(
                    view.providerId,
                    control,
                    option.value,
                    $event
                  )
                "
              />
              {{ t(option.labelKey) }}
            </label>
          </fieldset>

          <template v-else>
            <label
              :for="fieldId(view.providerId, control.id)"
              class="text-sm text-base-foreground"
            >
              {{ t(control.labelKey) }}
            </label>
            <input
              :id="fieldId(view.providerId, control.id)"
              type="checkbox"
              role="switch"
              class="focus-visible:ring-ring size-4 cursor-pointer focus-visible:ring-1 focus-visible:outline-none"
              :aria-busy="view.isLoading || undefined"
              :checked="toggleValue(view.providerId, control)"
              @change="onToggleChange(view.providerId, control, $event)"
            />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '@/components/ui/button/Button.vue'
import { getPresentationFilterKey } from './assetPresentationRegistry'
import type {
  AssetPresentationProvider,
  FilterControl,
  FilterState,
  FilterValue,
  ProviderPresentationState
} from './assetPresentationRegistry'

/**
 * Structural input accepted for one provider's presentation state. The
 * registry's `ProviderPresentationState` union is assignable to this shape.
 * Error and disconnected states always carry a localized safe message key.
 */
type ProviderPresentationStateInput =
  | {
      readonly status: Exclude<
        ProviderPresentationState['status'],
        'error' | 'disconnected'
      >
    }
  | { readonly status: 'error'; readonly safeMessageKey: string }
  | { readonly status: 'disconnected'; readonly safeMessageKey: string }

/** Generic derived descriptor for one provider's filter surface. */
interface ProviderControlsView {
  readonly providerId: string
  readonly controls: readonly FilterControl[]
  readonly isLoading: boolean
  readonly errorKey: string | null
  readonly disconnectedKey: string | null
}

const {
  providers,
  filters = {},
  providerStates = {}
} = defineProps<{
  providers: readonly AssetPresentationProvider[]
  filters?: FilterState
  providerStates?: Readonly<
    Record<string, ProviderPresentationStateInput | undefined>
  >
}>()

const emit = defineEmits<{
  'update-filter': [providerId: string, controlId: string, value: FilterValue]
  retry: [providerId: string]
}>()

const { t } = useI18n()
const uid = useId()

function fieldId(providerId: string, controlId: string): string {
  return `${uid}-${providerId}-${controlId}`.replace(/[^a-zA-Z0-9_-]/g, '-')
}

const providerViews = computed<readonly ProviderControlsView[]>(() =>
  providers.map((provider) => {
    const state = providerStates[provider.id]
    return {
      providerId: provider.id,
      controls: provider.controls,
      isLoading: state?.status === 'loading',
      errorKey:
        state?.status === 'error'
          ? state.safeMessageKey || 'assetPresentation.providerError'
          : null,
      disconnectedKey:
        state?.status === 'disconnected'
          ? state.safeMessageKey || 'assetPresentation.providerDisconnected'
          : null
    }
  })
)

/** Absent override keys resolve to the descriptor's declared default. */
function overrideValue(
  providerId: string,
  control: FilterControl
): FilterValue | undefined {
  return filters[getPresentationFilterKey(providerId, control.id)]
}

function singleSelectValue(providerId: string, control: FilterControl): string {
  if (control.kind !== 'single-select') return ''
  const override = overrideValue(providerId, control)
  if (override === undefined) return control.defaultValue ?? ''
  if (override === null) return ''
  if (typeof override === 'string') return override
  return control.defaultValue ?? ''
}

function multiSelectValue(
  providerId: string,
  control: FilterControl
): readonly string[] {
  if (control.kind !== 'multi-select') return []
  const override = overrideValue(providerId, control)
  if (override === undefined) return control.defaultValue
  return Array.isArray(override) ? override : control.defaultValue
}

function toggleValue(providerId: string, control: FilterControl): boolean {
  if (control.kind !== 'toggle') return false
  const override = overrideValue(providerId, control)
  if (override === undefined) return control.defaultValue
  return typeof override === 'boolean' ? override : control.defaultValue
}

function onSingleSelectChange(
  providerId: string,
  control: FilterControl,
  event: Event
): void {
  if (control.kind !== 'single-select') return
  emit(
    'update-filter',
    providerId,
    control.id,
    (event.target as HTMLSelectElement).value || null
  )
}

function onMultiSelectChange(
  providerId: string,
  control: FilterControl,
  optionValue: string,
  event: Event
): void {
  if (control.kind !== 'multi-select') return
  const checked = (event.target as HTMLInputElement).checked
  const current = multiSelectValue(providerId, control)
  const next = checked
    ? current.includes(optionValue)
      ? current
      : [...current, optionValue]
    : current.filter((value) => value !== optionValue)
  emit('update-filter', providerId, control.id, next)
}

function onToggleChange(
  providerId: string,
  control: FilterControl,
  event: Event
): void {
  if (control.kind !== 'toggle') return
  emit(
    'update-filter',
    providerId,
    control.id,
    (event.target as HTMLInputElement).checked
  )
}
</script>
