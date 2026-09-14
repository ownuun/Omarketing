<template>
  <Teleport to="body">
    <div
      v-if="galleryVisible"
      ref="dialogRef"
      role="dialog"
      aria-modal="true"
      :aria-label="$t('g.gallery')"
      tabindex="-1"
      class="fixed inset-0 z-9999 flex items-center justify-center bg-black/90 outline-none"
      data-mask
      @mousedown="onMaskMouseDown"
      @mouseup="onMaskMouseUp"
      @keydown.stop="handleKeyDown"
    >
      <!-- Close Button -->
      <Button
        data-lightbox-close
        variant="secondary"
        size="icon-lg"
        class="absolute top-4 right-4 z-10 rounded-full"
        :aria-label="$t('g.close')"
        @click="close"
      >
        <i class="icon-[lucide--x] size-5" />
      </Button>

      <!-- Previous Button -->
      <Button
        v-if="hasMultiple"
        variant="secondary"
        size="icon-lg"
        class="fixed top-1/2 left-4 z-10 -translate-y-1/2 rounded-full"
        :aria-label="$t('g.previous')"
        @click="navigateImage(-1)"
      >
        <i class="icon-[lucide--chevron-left] size-6" />
      </Button>

      <!-- Content: the existing media preview stays primary; registered
           provider details scroll independently beside it. -->
      <div
        class="flex max-h-full max-w-full flex-col items-center justify-center gap-4 p-16 lg:flex-row lg:items-center lg:gap-6"
      >
        <div
          class="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
        >
          <template v-if="activeItem">
            <ComfyImage
              v-if="activeItem.isImage"
              :key="activeItem.url"
              :src="activeItem.url"
              :contain="false"
              :alt="activeItem.filename"
              class="size-auto max-h-[90vh] max-w-[90vw] object-contain"
            />
            <ResultVideo v-else-if="activeItem.isVideo" :result="activeItem" />
            <ResultAudio v-else-if="activeItem.isAudio" :result="activeItem" />
            <ResultText v-else-if="activeItem.isText" :result="activeItem" />
          </template>
        </div>
        <aside
          v-if="hasPresentation"
          data-presentation-interactive
          class="max-h-[40vh] w-full shrink-0 overflow-y-auto overscroll-contain rounded-lg p-1 lg:max-h-[80vh] lg:w-80"
        >
          <AssetPresentationDetails
            :details="presentationDetailEntries"
            :action-states="presentationActionExecutions"
            @execute="onPresentationActionExecute"
            @retry="onPresentationProviderRetry"
          />
        </aside>
      </div>

      <!-- Next Button -->
      <Button
        v-if="hasMultiple"
        variant="secondary"
        size="icon-lg"
        class="fixed top-1/2 right-4 z-10 -translate-y-1/2 rounded-full"
        :aria-label="$t('g.next')"
        @click="navigateImage(1)"
      >
        <i class="icon-[lucide--chevron-right] size-6" />
      </Button>
    </div>
  </Teleport>
</template>

<script lang="ts">
import type { PresentationActionView } from '@/platform/assets/presentation/AssetPresentationDetails.vue'
import type {
  AssetDetailSection,
  MetadataState
} from '@/platform/assets/presentation/assetPresentationRegistry'

/**
 * Flattened read-only presentation view of one provider for the active
 * gallery item. The sidebar host computes these; MediaLightbox owns the
 * prop contract so hosts import these types instead of redeclaring them.
 */
interface PresentationDetailView {
  readonly providerId: string
  /** Stable registry order; ascending across providers. */
  readonly order: number
  readonly status: MetadataState['status']
  readonly sections: readonly AssetDetailSection[]
  /** Localized safe error shown when `status` is `'error'`. */
  readonly safeMessageKey?: string
  /** Localized provider name; falls back to the generic details heading. */
  readonly labelKey?: string
}

/** Flattened state of one registered action for the active gallery item. */
interface PresentationActionState {
  readonly assetId: string
  readonly providerId: string
  readonly actionId: string
  readonly labelKey: string
  readonly accessibleDescriptionKey: string
  readonly intent: PresentationActionView['intent']
  readonly enabled: boolean
  readonly pending: boolean
  readonly disabledReasonKey?: string
  readonly errorMessageKey?: string
  readonly resultStatus?: 'succeeded' | 'unchanged'
  readonly safeMessageKey?: string
}
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import ComfyImage from '@/components/common/ComfyImage.vue'
import Button from '@/components/ui/button/Button.vue'
import AssetPresentationDetails from '@/platform/assets/presentation/AssetPresentationDetails.vue'
import type {
  ActionExecutionState,
  ProviderDetailEntry
} from '@/platform/assets/presentation/AssetPresentationDetails.vue'
import type { ResultItemImpl } from '@/stores/queueStore'

import ResultAudio from './ResultAudio.vue'
import ResultText from './ResultText.vue'
import ResultVideo from './ResultVideo.vue'

/** Generic heading for providers the host passes no label for. */
const PROVIDER_LABEL_KEY = 'assetPresentation.details.heading'
const PROVIDER_ERROR_KEY = 'assetPresentation.providerError'
const ACTION_UNAVAILABLE_KEY = 'assetPresentation.actions.unavailable'

const emit = defineEmits<{
  (e: 'update:activeIndex', value: number): void
  (
    e: 'execute:presentation-action',
    payload: { assetId: string; providerId: string; actionId: string }
  ): void
  (e: 'retry:presentation-provider', providerId: string): void
}>()

const props = withDefaults(
  defineProps<{
    allGalleryItems: ResultItemImpl[]
    activeIndex: number
    presentationDetails?: readonly PresentationDetailView[]
    presentationActionStates?: readonly PresentationActionState[]
  }>(),
  {
    presentationDetails: () => [],
    presentationActionStates: () => []
  }
)

const galleryVisible = ref(false)
const dialogRef = ref<HTMLElement>()
let previouslyFocusedElement: HTMLElement | null = null
const hasMultiple = computed(() => props.allGalleryItems.length > 1)
const activeItem = computed(() => props.allGalleryItems[props.activeIndex])

watch(
  () => props.activeIndex,
  (index) => {
    // Capture the precise invoking element only on the closed→open
    // transition; navigating between items never overwrites it.
    const opening = index !== -1 && !galleryVisible.value
    galleryVisible.value = index !== -1
    if (opening) {
      previouslyFocusedElement = document.activeElement as HTMLElement | null
      void nextTick(() =>
        dialogRef.value
          ?.querySelector<HTMLElement>('[data-lightbox-close]')
          ?.focus()
      )
    } else if (index === -1) {
      restoreInvokingFocus()
    }
  },
  { immediate: true }
)

function close() {
  galleryVisible.value = false
  emit('update:activeIndex', -1)
  restoreInvokingFocus()
}

function restoreInvokingFocus() {
  const invokingElement = previouslyFocusedElement
  previouslyFocusedElement = null
  void nextTick(() => {
    if (invokingElement?.isConnected) invokingElement.focus()
  })
}

function navigateImage(direction: number) {
  const newIndex =
    (props.activeIndex + direction + props.allGalleryItems.length) %
    props.allGalleryItems.length
  emit('update:activeIndex', newIndex)
}

let maskMouseDownTarget: EventTarget | null = null

function onMaskMouseDown(event: MouseEvent) {
  maskMouseDownTarget = event.target
}

function onMaskMouseUp(event: MouseEvent) {
  if (
    maskMouseDownTarget === event.target &&
    (event.target as HTMLElement)?.hasAttribute('data-mask')
  ) {
    close()
  }
}

/**
 * Elements whose arrow keys belong to them: native interactive tags plus the
 * provider detail region marked `data-presentation-interactive`.
 */
const INTERACTIVE_KEY_ORIGIN_SELECTOR =
  'input, select, textarea, a, button, [data-presentation-interactive]'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

function isInteractiveKeyOrigin(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(INTERACTIVE_KEY_ORIGIN_SELECTOR) !== null
  )
}

function handleKeyDown(event: KeyboardEvent) {
  // Nested UI (for example the provider detail region) may already have
  // consumed the key, notably Escape; that always wins over the lightbox.
  if (event.defaultPrevented) return
  if (event.key === 'Tab') {
    trapFocus(event)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  // Gallery navigation never hijacks keys from interactive elements.
  if (isInteractiveKeyOrigin(event.target)) return
  event.preventDefault()
  navigateImage(event.key === 'ArrowRight' ? 1 : -1)
}

/** Real Tab/Shift+Tab trap: focus wraps at the dialog edges. */
function trapFocus(event: KeyboardEvent) {
  const dialog = dialogRef.value
  if (!dialog) return
  const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  if (focusables.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  const outsideDialog =
    !(active instanceof Node) || !dialog.contains(active) || active === dialog
  if (event.shiftKey && (outsideDialog || active === first)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (outsideDialog || active === last)) {
    event.preventDefault()
    first.focus()
  }
}

function toMetadataState(view: PresentationDetailView): MetadataState {
  switch (view.status) {
    case 'ready':
      return {
        status: 'ready',
        detail: {
          sections: view.sections,
          // Provider revision, locator verification, and action context are
          // host concerns; the lightbox renders sections only.
          providerRevision: '',
          verifiedOutputLocator: null,
          actionContext: []
        }
      }
    case 'loading':
      return { status: 'loading' }
    case 'error':
      return {
        status: 'error',
        safeMessageKey: view.safeMessageKey ?? PROVIDER_ERROR_KEY
      }
    case 'not-applicable':
      return { status: 'not-applicable' }
    default:
      return { status: 'idle' }
  }
}

function toActionViewsFor(
  providerId: string
): readonly PresentationActionView[] {
  return props.presentationActionStates
    .filter((actionState) => actionState.providerId === providerId)
    .map((actionState) => ({
      id: actionState.actionId,
      labelKey: actionState.labelKey,
      accessibleDescriptionKey: actionState.accessibleDescriptionKey,
      intent: actionState.intent,
      disabledReasonKey: actionState.enabled
        ? (actionState.disabledReasonKey ?? null)
        : (actionState.disabledReasonKey ?? ACTION_UNAVAILABLE_KEY)
    }))
}

const presentationDetailEntries = computed<readonly ProviderDetailEntry[]>(
  () => {
    const entries: ProviderDetailEntry[] = []
    const seenProviders = new Set<string>()
    for (const view of [...props.presentationDetails].sort(
      (left, right) => left.order - right.order
    )) {
      if (seenProviders.has(view.providerId)) continue
      seenProviders.add(view.providerId)
      entries.push({
        providerId: view.providerId,
        labelKey: view.labelKey ?? PROVIDER_LABEL_KEY,
        state: toMetadataState(view),
        actions: toActionViewsFor(view.providerId)
      })
    }
    // A provider contributing only actions still gets an entry so its
    // actions render beside providers that also have details.
    for (const actionState of props.presentationActionStates) {
      if (seenProviders.has(actionState.providerId)) continue
      seenProviders.add(actionState.providerId)
      entries.push({
        providerId: actionState.providerId,
        labelKey: PROVIDER_LABEL_KEY,
        state: { status: 'idle' },
        actions: toActionViewsFor(actionState.providerId)
      })
    }
    return entries
  }
)

const presentationActionExecutions = computed<
  Readonly<Record<string, Readonly<Record<string, ActionExecutionState>>>>
>(() => {
  const executions: Record<string, Record<string, ActionExecutionState>> = {}
  for (const actionState of props.presentationActionStates) {
    const provider = (executions[actionState.providerId] ??= {})
    provider[actionState.actionId] = actionState.pending
      ? { status: 'running' }
      : actionState.errorMessageKey
        ? { status: 'error', safeMessageKey: actionState.errorMessageKey }
        : actionState.resultStatus && actionState.safeMessageKey
          ? {
              status: actionState.resultStatus,
              safeMessageKey: actionState.safeMessageKey
            }
          : { status: 'idle' }
  }
  return executions
})

const hasPresentation = computed(
  () => presentationDetailEntries.value.length > 0
)

function onPresentationActionExecute(providerId: string, actionId: string) {
  const action = props.presentationActionStates.find(
    (candidate) =>
      candidate.providerId === providerId && candidate.actionId === actionId
  )
  if (!action) return
  emit('execute:presentation-action', {
    assetId: action.assetId,
    providerId,
    actionId
  })
}

function onPresentationProviderRetry(providerId: string) {
  emit('retry:presentation-provider', providerId)
}
</script>
