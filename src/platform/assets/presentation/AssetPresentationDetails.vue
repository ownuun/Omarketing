<template>
  <div
    class="flex w-full flex-col gap-6"
    data-component-id="asset-presentation-details"
  >
    <section
      v-for="view in detailViews"
      :key="view.providerId"
      :data-provider-id="view.providerId"
      role="region"
      :aria-label="t(view.labelKey)"
      :aria-busy="view.isLoading || undefined"
      class="flex w-full min-w-0 flex-col gap-3"
    >
      <h3 class="text-sm font-semibold text-base-foreground">
        {{ t(view.labelKey) }}
      </h3>

      <p
        v-if="view.isLoading"
        role="status"
        class="text-sm text-muted-foreground"
      >
        {{ t('assetPresentation.loading') }}
      </p>

      <div
        v-else-if="view.errorKey !== null"
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

      <template v-else>
        <section
          v-for="section in view.sections"
          :key="section.id"
          class="flex w-full min-w-0 flex-col gap-2"
        >
          <h4 class="text-sm font-semibold text-base-foreground">
            {{ t(section.headingKey) }}
          </h4>
          <dl class="flex w-full min-w-0 flex-col gap-1">
            <div
              v-for="field in section.fields"
              :key="field.id"
              class="flex w-full min-w-0 flex-wrap gap-x-3 gap-y-0.5"
            >
              <dt class="w-40 shrink-0 text-sm text-muted-foreground">
                {{ t(field.labelKey) }}
              </dt>
              <dd class="min-w-0 flex-1 text-sm break-all text-base-foreground">
                <a
                  v-if="field.safeHref !== null"
                  :href="field.safeHref"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="focus-visible:ring-ring underline focus-visible:ring-1 focus-visible:outline-none"
                >
                  {{ field.value }}
                </a>
                <template v-else>{{ field.value }}</template>
              </dd>
            </div>
          </dl>
        </section>
      </template>

      <div
        v-if="view.actions.length > 0"
        class="flex flex-wrap items-start gap-x-4 gap-y-3"
      >
        <div
          v-for="action in view.actions"
          :key="action.id"
          class="flex min-w-0 flex-col gap-1"
        >
          <Button
            :variant="action.variant"
            size="sm"
            :disabled="action.isDisabled"
            :loading="action.isRunning"
            :aria-describedby="action.describedBy"
            @click="emit('execute', view.providerId, action.id)"
          >
            {{ t(action.labelKey) }}
          </Button>
          <span :id="action.descriptionId" class="sr-only">
            {{ t(action.descriptionKey) }}
          </span>
          <p
            v-if="action.disabledReasonKey !== null"
            :id="action.disabledReasonId ?? undefined"
            class="max-w-64 text-xs text-muted-foreground"
          >
            {{ t(action.disabledReasonKey) }}
          </p>
          <p
            v-if="action.messageKey !== null"
            :id="action.messageId ?? undefined"
            :role="action.isFailure ? 'alert' : undefined"
            class="max-w-64 text-xs"
            :class="
              action.isFailure
                ? 'text-destructive-background'
                : 'text-muted-foreground'
            "
          >
            {{ t(action.messageKey) }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import type { MetadataState } from './assetPresentationRegistry'

/**
 * Host-computed view of one registered action: availability and disabled
 * reasons are derived by the host, never from execution state.
 */
export interface PresentationActionView {
  readonly id: string
  readonly labelKey: string
  readonly accessibleDescriptionKey: string
  readonly intent: 'neutral' | 'confirm' | 'exclude'
  readonly disabledReasonKey: string | null
}

export interface ProviderDetailEntry {
  readonly providerId: string
  readonly labelKey: string
  readonly state: MetadataState
  readonly actions: readonly PresentationActionView[]
}

export type ActionExecutionState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'succeeded'; readonly safeMessageKey: string }
  | { readonly status: 'unchanged'; readonly safeMessageKey: string }
  | { readonly status: 'error'; readonly safeMessageKey: string }
</script>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '@/components/ui/button/Button.vue'

interface DetailFieldView {
  readonly id: string
  readonly labelKey: string
  readonly value: string
  readonly safeHref: string | null
}

interface DetailSectionView {
  readonly id: string
  readonly headingKey: string
  readonly fields: readonly DetailFieldView[]
}

interface PresentationActionRenderView {
  readonly id: string
  readonly labelKey: string
  readonly descriptionKey: string
  readonly disabledReasonKey: string | null
  readonly variant: 'secondary' | 'destructive-textonly'
  readonly isDisabled: boolean
  readonly isRunning: boolean
  readonly messageKey: string | null
  readonly isFailure: boolean
  readonly descriptionId: string
  readonly disabledReasonId: string | null
  readonly messageId: string | null
  readonly describedBy: string
}

/** Generic derived descriptor for one provider's detail surface. */
interface ProviderDetailRenderView {
  readonly providerId: string
  readonly labelKey: string
  readonly isLoading: boolean
  readonly errorKey: string | null
  readonly sections: readonly DetailSectionView[]
  readonly actions: readonly PresentationActionRenderView[]
}

const IDLE_ACTION_STATE: ActionExecutionState = { status: 'idle' }

const EXTERNAL_HREF_PATTERN = /^https?:\/\//i

const { details, actionStates = {} } = defineProps<{
  details: readonly ProviderDetailEntry[]
  actionStates?: Readonly<
    Record<string, Readonly<Record<string, ActionExecutionState>>>
  >
}>()

const emit = defineEmits<{
  execute: [providerId: string, actionId: string]
  retry: [providerId: string]
}>()

const { t } = useI18n()
const uid = useId()

/** Only absolute http/https URLs may become links; anything else stays text. */
function toSafeExternalHref(href: string | null): string | null {
  return href !== null && EXTERNAL_HREF_PATTERN.test(href) ? href : null
}

function elementId(...parts: readonly string[]): string {
  return `${uid}-${parts.join('-')}`.replace(/[^a-zA-Z0-9_-]/g, '-')
}

const detailViews = computed<readonly ProviderDetailRenderView[]>(() =>
  details
    .filter((entry) => entry.state.status !== 'not-applicable')
    .map((entry) => {
      const state = entry.state
      return {
        providerId: entry.providerId,
        labelKey: entry.labelKey,
        isLoading: state.status === 'loading',
        errorKey: state.status === 'error' ? state.safeMessageKey : null,
        sections:
          state.status === 'ready'
            ? state.detail.sections.map((section) => ({
                id: section.id,
                headingKey: section.headingKey,
                fields: section.fields.map((field) => ({
                  id: field.id,
                  labelKey: field.labelKey,
                  value: field.value,
                  safeHref: toSafeExternalHref(field.href)
                }))
              }))
            : [],
        actions: entry.actions.map((action) => {
          const execution =
            actionStates[entry.providerId]?.[action.id] ?? IDLE_ACTION_STATE
          const isRunning = execution.status === 'running'
          const isUnavailable = action.disabledReasonKey !== null
          const messageKey =
            execution.status === 'succeeded' ||
            execution.status === 'unchanged' ||
            execution.status === 'error'
              ? execution.safeMessageKey
              : null
          const descriptionId = elementId(
            entry.providerId,
            action.id,
            'description'
          )
          const disabledReasonId = isUnavailable
            ? elementId(entry.providerId, action.id, 'reason')
            : null
          const messageId =
            messageKey !== null
              ? elementId(entry.providerId, action.id, 'message')
              : null
          return {
            id: action.id,
            labelKey: action.labelKey,
            descriptionKey: action.accessibleDescriptionKey,
            disabledReasonKey: action.disabledReasonKey,
            variant:
              action.intent === 'exclude'
                ? 'destructive-textonly'
                : 'secondary',
            // Only the running or explicitly unavailable action is disabled.
            isDisabled: isRunning || isUnavailable,
            isRunning,
            messageKey,
            isFailure: execution.status === 'error',
            descriptionId,
            disabledReasonId,
            messageId,
            describedBy: [descriptionId, disabledReasonId, messageId]
              .filter((id): id is string => id !== null)
              .join(' ')
          }
        })
      }
    })
)
</script>
