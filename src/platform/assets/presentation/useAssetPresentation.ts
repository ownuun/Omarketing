import {
  computed,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch
} from 'vue'
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'

import { reportError } from '@/platform/telemetry/reportError'
import type { AssetItem } from '@/platform/assets/schemas/assetSchema'

import {
  getPresentationActionKey,
  getPresentationFilterKey,
  isFilterControlActive
} from './assetPresentationRegistry'
import type {
  AssetDetail,
  AssetPresentationContext,
  AssetPresentationProvider,
  AssetPresentationRegistry,
  AssetPresentationTarget,
  AssetTab,
  FilterState,
  FilterValue,
  MetadataBatchEntry,
  MetadataState,
  OutputLocatorCandidate,
  PredicateDecision,
  PresentationActionContext,
  PresentationActionResult,
  PresentationEnvironment,
  ProviderPresentationState
} from './assetPresentationRegistry'

/**
 * Presentation batch ceiling per contract: one provider batch contains at most
 * 100 targets; larger windows split into bounded sequential batches.
 */
const MAX_BATCH_SIZE = 100

/** Locator primitive guards mirroring `output-locator.v1.schema.json`. */
const SUBFOLDER_PATTERN =
  /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\\)[^/]+(?:\/[^/]+)*$/
const FILENAME_PATTERN = /^(?!\.{1,2}$)[^/\\]+$/
const MEDIA_TYPE_PATTERN = /^[a-z][a-z0-9_-]*$/

const MAX_JOB_ID_LENGTH = 256
const MAX_NODE_ID_LENGTH = 128
const MAX_SUBFOLDER_LENGTH = 1024
const MAX_FILENAME_LENGTH = 255
const MAX_MEDIA_TYPE_LENGTH = 64

/** Localized safe-message keys; user messages carry no path or raw body. */
const PROVIDER_BATCH_ERROR_KEY = 'assetPresentation.provider.error'
const PROVIDER_ENTRY_ERROR_KEY = 'assetPresentation.provider.error'
const ACTION_UNAVAILABLE_KEY = 'assetPresentation.actions.unavailable'
const ACTION_LOCATOR_REQUIRED_KEY = 'assetPresentation.actions.locatorRequired'
const ACTION_FAILED_KEY = 'assetPresentation.actions.failed'

interface ActionMessageError extends Error {
  readonly safeMessageKey: string
}

function actionError(safeMessageKey: string): ActionMessageError {
  const error = new Error(safeMessageKey) as ActionMessageError
  Object.defineProperty(error, 'safeMessageKey', {
    value: safeMessageKey,
    enumerable: true
  })
  return error
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

function hasNoControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
      return false
    }
  }
  return true
}

/**
 * Returns a detached, recursively frozen copy so providers can never mutate a
 * store-owned `AssetItem`, its arrays, or nested metadata.
 */
function cloneFrozen<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneFrozen)) as unknown as T
  }
  if (value instanceof Date) {
    return Object.freeze(new Date(value.getTime())) as T
  }
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>()
    for (const [key, entry] of value) {
      copy.set(cloneFrozen(key), cloneFrozen(entry))
    }
    return Object.freeze(copy) as unknown as T
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>()
    for (const entry of value) copy.add(cloneFrozen(entry))
    return Object.freeze(copy) as unknown as T
  }
  if (typeof value === 'object' && value !== null) {
    const copy = Object.create(Object.getPrototypeOf(value)) as Record<
      string,
      unknown
    >
    for (const key of Object.keys(value)) {
      copy[key] = cloneFrozen(
        (value as unknown as Record<string, unknown>)[key]
      )
    }
    return Object.freeze(copy) as unknown as T
  }
  return value
}

function safePrimitive(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_JOB_ID_LENGTH &&
    hasNoControlCharacters(value)
    ? value
    : null
}

function safeNodeId(value: unknown): string | null {
  let nodeId: string | null = null
  if (typeof value === 'number' && Number.isFinite(value)) {
    nodeId = String(value)
  } else if (typeof value === 'string') {
    nodeId = value
  }
  if (
    nodeId === null ||
    nodeId.length === 0 ||
    nodeId.length > MAX_NODE_ID_LENGTH ||
    !hasNoControlCharacters(nodeId)
  ) {
    return null
  }
  return nodeId
}

function safeSubfolder(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SUBFOLDER_LENGTH &&
    hasNoControlCharacters(value) &&
    SUBFOLDER_PATTERN.test(value)
    ? value
    : null
}

function safeFilename(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_FILENAME_LENGTH &&
    hasNoControlCharacters(value) &&
    FILENAME_PATTERN.test(value)
    ? value
    : null
}

/**
 * Derives the media token from an existing MIME/media primitive on the asset.
 * The host never sniffs bytes or invents a category the asset does not carry.
 */
function deriveMediaType(asset: AssetItem): string | null {
  if (typeof asset.mime_type === 'string' && asset.mime_type.length > 0) {
    const primary = asset.mime_type.trim().toLowerCase().split('/')[0]
    if (
      primary.length > 0 &&
      primary.length <= MAX_MEDIA_TYPE_LENGTH &&
      MEDIA_TYPE_PATTERN.test(primary)
    ) {
      return primary
    }
  }
  if (isPlainObject(asset.user_metadata)) {
    for (const candidate of [
      asset.user_metadata.mediaType,
      asset.user_metadata.format
    ]) {
      if (typeof candidate !== 'string') continue
      const mediaType = candidate.trim().toLowerCase()
      if (
        mediaType.length > 0 &&
        mediaType.length <= MAX_MEDIA_TYPE_LENGTH &&
        MEDIA_TYPE_PATTERN.test(mediaType)
      ) {
        return mediaType
      }
    }
  }
  return null
}

/**
 * Derives a display-correlation locator candidate purely from validated
 * output primitives already present on the asset. Missing or invalid
 * primitives yield `null`; nothing is synthesized — in particular the
 * backend-issued `asset_id` stays `null`. The candidate is a verification
 * request primitive, never selection authority.
 */
export function deriveOutputLocatorCandidate(
  asset: AssetItem,
  tab: AssetTab
): OutputLocatorCandidate | null {
  if (tab !== 'output') return null
  const userMetadata = asset.user_metadata
  if (!isPlainObject(userMetadata)) return null

  const jobId = safePrimitive(userMetadata.jobId)
  const nodeId = safeNodeId(userMetadata.nodeId)
  const subfolder = safeSubfolder(userMetadata.subfolder)
  const filename = safeFilename(asset.name)
  const mediaType = deriveMediaType(asset)
  if (!jobId || !nodeId || !subfolder || !filename || !mediaType) return null

  return Object.freeze({
    job_id: jobId,
    node_id: nodeId,
    directory_type: 'output',
    subfolder,
    filename,
    media_type: mediaType,
    asset_id: null
  })
}

/**
 * Creates the host-side presentation target: display correlation only, with a
 * detached recursively frozen `AssetItem` view and a candidate derived without
 * synthesis. Never a persisted selection authority.
 */
export function createAssetPresentationTarget(
  asset: AssetItem,
  tab: AssetTab
): AssetPresentationTarget {
  return Object.freeze({
    assetId: asset.id,
    asset: cloneFrozen(asset),
    tab,
    outputLocatorCandidate: deriveOutputLocatorCandidate(asset, tab)
  })
}

function isTerminalState(state: unknown): state is MetadataState {
  if (!isPlainObject(state)) return false
  if (state.status === 'ready') {
    return isPlainObject(state.detail) && isValidDetail(state.detail)
  }
  if (state.status === 'not-applicable') return true
  return (
    state.status === 'error' &&
    typeof state.safeMessageKey === 'string' &&
    state.safeMessageKey.length > 0
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function hasUniqueStringIds(values: readonly unknown[]): boolean {
  const ids = new Set<string>()
  for (const value of values) {
    if (!isPlainObject(value) || !isNonEmptyString(value.id)) return false
    if (ids.has(value.id)) return false
    ids.add(value.id)
  }
  return true
}

function isValidDetail(detail: unknown): boolean {
  if (
    !isPlainObject(detail) ||
    !Array.isArray(detail.sections) ||
    !isNonEmptyString(detail.providerRevision) ||
    !Array.isArray(detail.actionContext) ||
    !hasUniqueStringIds(detail.sections) ||
    !hasUniqueStringIds(detail.actionContext) ||
    (detail.verifiedOutputLocator !== null &&
      !isPlainObject(detail.verifiedOutputLocator))
  ) {
    return false
  }

  for (const section of detail.sections) {
    if (
      !isPlainObject(section) ||
      !isNonEmptyString(section.headingKey) ||
      !Array.isArray(section.fields) ||
      !hasUniqueStringIds(section.fields)
    ) {
      return false
    }
    for (const field of section.fields) {
      if (
        !isPlainObject(field) ||
        !isNonEmptyString(field.labelKey) ||
        typeof field.value !== 'string' ||
        (field.href !== null && typeof field.href !== 'string')
      ) {
        return false
      }
    }
  }

  return detail.actionContext.every(
    (entry) =>
      isPlainObject(entry) &&
      (typeof entry.value === 'string' ||
        typeof entry.value === 'number' ||
        typeof entry.value === 'boolean' ||
        entry.value === null) &&
      (typeof entry.value !== 'number' || Number.isFinite(entry.value))
  )
}

function isActionResult(value: unknown): value is PresentationActionResult {
  return (
    isPlainObject(value) &&
    (value.status === 'succeeded' || value.status === 'unchanged') &&
    typeof value.safeMessageKey === 'string' &&
    value.safeMessageKey.length > 0
  )
}

export interface UseAssetPresentationOptions {
  readonly registry: AssetPresentationRegistry
  readonly targets: MaybeRefOrGetter<readonly AssetPresentationTarget[]>
  readonly activeTarget: MaybeRefOrGetter<AssetPresentationTarget | null>
  readonly adjacentTargets: MaybeRefOrGetter<readonly AssetPresentationTarget[]>
  readonly environment: MaybeRefOrGetter<PresentationEnvironment>
  readonly workflowLocator?: MaybeRefOrGetter<string | null>
  readonly projectKey?: MaybeRefOrGetter<string | null>
  readonly runKey?: MaybeRefOrGetter<string | null>
  readonly scopeKey: MaybeRefOrGetter<string | null>
}

type PresentationProviderStateView =
  | { readonly providerId: string; readonly status: 'idle' }
  | { readonly providerId: string; readonly status: 'loading' }
  | { readonly providerId: string; readonly status: 'ready' }
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

interface PresentationDetailViewModel {
  readonly providerId: string
  readonly order: number
  readonly status: MetadataState['status']
  readonly sections: AssetDetail['sections']
  readonly safeMessageKey?: string
}

interface PresentationActionViewModel {
  readonly assetId: string
  readonly providerId: string
  readonly actionId: string
  readonly labelKey: string
  readonly accessibleDescriptionKey: string
  readonly intent: 'neutral' | 'confirm' | 'exclude'
  readonly enabled: boolean
  readonly pending: boolean
  readonly disabledReasonKey?: string
  readonly errorMessageKey?: string
  readonly resultStatus?: 'succeeded' | 'unchanged'
  readonly safeMessageKey?: string
}

interface PresentationFilterBarProps {
  readonly presentationProviders: readonly AssetPresentationProvider[]
  readonly presentationFilters: FilterState
  readonly presentationProviderStates: readonly PresentationProviderStateView[]
}

interface PresentationLightboxProps {
  readonly presentationDetails: readonly PresentationDetailViewModel[]
  readonly presentationActionStates: readonly PresentationActionViewModel[]
}

export interface UseAssetPresentationReturn {
  readonly providers: Ref<readonly AssetPresentationProvider[]>
  readonly providerStates: Ref<
    Readonly<Record<string, ProviderPresentationState>>
  >
  readonly filters: Ref<Readonly<Record<string, FilterValue>>>
  readonly hasActiveFilters: Ref<boolean>
  readonly filterBarProps: ComputedRef<PresentationFilterBarProps>
  readonly lightboxProps: ComputedRef<PresentationLightboxProps>
  setFilter(providerId: string, controlId: string, value: FilterValue): void
  resetFilter(providerId: string, controlId: string): void
  clearProviderFilters(providerId: string): void
  clearAllFilters(): void
  clearFilters(): void
  matchesTarget(target: AssetPresentationTarget): boolean
  presentationDecision(target: AssetPresentationTarget): boolean
  metadataFor(providerId: string, assetId: string): MetadataState
  detailsFor(providerId: string, assetId: string): AssetDetail | null
  retryProvider(providerId: string): void
  requestMetadataWindow(): void
  executeAction(
    providerId: string,
    actionId: string
  ): Promise<PresentationActionResult>
  dispose(): void
}

interface MetadataCacheEntry {
  readonly identityKey: string
  readonly state: MetadataState
}

interface ActionUiState {
  readonly status: 'running' | 'succeeded' | 'unchanged' | 'error'
  readonly safeMessageKey?: string
}

/**
 * One provider load cycle: the generation token and abort signal guarding
 * every batch it issues. Responses from a replaced or aborted cycle are
 * ignored even when the transport cannot cancel them.
 */
interface ProviderCycle {
  readonly provider: AssetPresentationProvider
  readonly controller: AbortController
  readonly generation: number
}

function targetIdentityKey(target: AssetPresentationTarget): string {
  return JSON.stringify([
    target.assetId,
    target.tab,
    target.outputLocatorCandidate,
    target.asset.updated_at ?? null,
    target.asset.hash ?? null,
    target.asset.name,
    target.asset.preview_id ?? null,
    target.asset.mime_type ?? null,
    target.asset.size ?? null
  ])
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/**
 * Generic presentation state for the Assets browser: environment-filtered
 * registry snapshots, ephemeral namespaced filter overrides, batched metadata
 * loading, tri-state predicate composition, and isolated detail actions.
 * Base `AssetItem[]` membership, stores, and selection stay authoritative
 * elsewhere; this composable owns only ephemeral presentation state.
 */
export function useAssetPresentation(
  options: UseAssetPresentationOptions
): UseAssetPresentationReturn {
  const registry = options.registry

  const providers = shallowRef<readonly AssetPresentationProvider[]>([])
  const providerStates = ref<
    Readonly<Record<string, ProviderPresentationState>>
  >({})
  const filters = ref<Readonly<Record<string, FilterValue>>>({})
  const metadataVersion = ref(0)

  /** Terminal metadata cache: ready/not-applicable within scope; errors pruned. */
  const metadataCache = new Map<string, Map<string, MetadataCacheEntry>>()
  const loadingTargets = new Map<string, Map<string, AssetPresentationTarget>>()
  let cycles = new Map<string, ProviderCycle>()
  let providerViews = new Map<string, AssetPresentationTarget>()
  const inFlightActions = new Map<string, Promise<PresentationActionResult>>()
  const actionUiStates = ref<Readonly<Record<string, ActionUiState>>>({})
  const actionControllers = new Map<
    AbortController,
    { readonly providerId: string; readonly assetId: string }
  >()
  let generation = 0
  let disposed = false
  let previousProviderIds = new Set<string>()

  const hasActiveFilters = computed(() =>
    providers.value.some((provider) => providerHasActiveFilters(provider))
  )

  function normalizedFilterValue(
    providerId: string,
    controlId: string,
    value: FilterValue
  ): {
    readonly provider: AssetPresentationProvider
    readonly control: AssetPresentationProvider['controls'][number]
    readonly value: FilterValue
  } {
    const provider = providers.value.find(
      (candidate) => candidate.id === providerId
    )
    const control = provider?.controls.find(
      (candidate) => candidate.id === controlId
    )
    if (!provider || !control) {
      throw new Error('Unknown asset presentation filter control')
    }

    if (control.kind === 'single-select') {
      if (
        value !== null &&
        (typeof value !== 'string' ||
          !control.options.some((option) => option.value === value))
      ) {
        throw new Error('Invalid single-select presentation filter value')
      }
      return { provider, control, value }
    }
    if (control.kind === 'toggle') {
      if (typeof value !== 'boolean') {
        throw new Error('Invalid toggle presentation filter value')
      }
      return { provider, control, value }
    }
    if (!Array.isArray(value)) {
      throw new Error('Invalid multi-select presentation filter value')
    }
    const selected = new Set(value)
    if (
      selected.size !== value.length ||
      value.some(
        (entry) =>
          typeof entry !== 'string' ||
          !control.options.some((option) => option.value === entry)
      )
    ) {
      throw new Error('Invalid multi-select presentation filter value')
    }
    return {
      provider,
      control,
      value: control.options
        .filter((option) => selected.has(option.value))
        .map((option) => option.value)
    }
  }

  function providerHasActiveFilters(
    provider: AssetPresentationProvider
  ): boolean {
    const values = filters.value
    return provider.controls.some((control) => {
      const key = getPresentationFilterKey(provider.id, control.id)
      const value = key in values ? values[key] : control.defaultValue
      return isFilterControlActive(control, value)
    })
  }

  function effectiveFilterState(
    provider: AssetPresentationProvider
  ): FilterState {
    const values = filters.value
    const state: Record<string, FilterValue> = {}
    for (const control of provider.controls) {
      const key = getPresentationFilterKey(provider.id, control.id)
      state[key] = key in values ? values[key] : control.defaultValue
    }
    return state
  }

  function providerViewFor(
    target: AssetPresentationTarget
  ): AssetPresentationTarget {
    const cached = providerViews.get(target.assetId)
    if (cached && cached.tab === target.tab) return cached
    const view = createAssetPresentationTarget(target.asset, target.tab)
    providerViews.set(target.assetId, view)
    return view
  }

  function buildContext(signal: AbortSignal): AssetPresentationContext {
    return {
      environment: toValue(options.environment),
      workflowLocator: toValue(options.workflowLocator) ?? null,
      projectKey: toValue(options.projectKey) ?? null,
      runKey: toValue(options.runKey) ?? null,
      signal
    }
  }

  function computeProviders(): readonly AssetPresentationProvider[] {
    const environment = toValue(options.environment)
    return Object.freeze(
      registry
        .snapshot()
        .filter((provider) => provider.environments.includes(environment))
    )
  }

  /** Statuses a provider may declare as a standing state. */
  const STANDING_STATUSES = new Set([
    'idle',
    'loading',
    'ready',
    'error',
    'disconnected'
  ])

  /**
   * Validates a provider-declared standing state.
   *
   * A malformed value is rejected rather than coerced, because a silently
   * dropped standing state is indistinguishable from a healthy provider.
   */
  function parseStandingState(
    value: unknown
  ): ProviderPresentationState | null {
    if (value === null || value === undefined) return null
    if (!isPlainObject(value)) return null
    const status = value.status
    if (typeof status !== 'string' || !STANDING_STATUSES.has(status))
      return null
    if (status === 'error' || status === 'disconnected') {
      return typeof value.safeMessageKey === 'string' && value.safeMessageKey
        ? ({
            status,
            safeMessageKey: value.safeMessageKey
          } as ProviderPresentationState)
        : null
    }
    return { status } as ProviderPresentationState
  }

  /**
   * Reads a provider's self-declared standing state.
   *
   * A provider that throws or returns a malformed value is isolated into an
   * `error` state and reported, never silently treated as healthy: swallowing
   * the failure would make a broken provider look identical to one that simply
   * has no standing state.
   */
  function standingStateOf(
    providerId: string
  ): ProviderPresentationState | null {
    const provider = registry
      .snapshot()
      .find((candidate) => candidate.id === providerId)
    if (!provider?.getStandingState) return null

    let raw: unknown
    try {
      raw = provider.getStandingState()
    } catch (error) {
      reportError(error, {
        errorType: 'assets_presentation_standing_state_failure',
        tags: { provider_id: providerId }
      })
      return {
        status: 'error',
        safeMessageKey: PROVIDER_BATCH_ERROR_KEY
      }
    }
    if (raw === null || raw === undefined) return null

    const parsed = parseStandingState(raw)
    if (parsed) return parsed

    reportError(
      new Error(`provider "${providerId}" returned a malformed standing state`),
      {
        errorType: 'assets_presentation_standing_state_invalid',
        tags: { provider_id: providerId }
      }
    )
    return { status: 'error', safeMessageKey: PROVIDER_BATCH_ERROR_KEY }
  }

  /**
   * Records the derived per-cycle state.
   *
   * The standing state is deliberately not written here. Overwriting the cycle
   * state would destroy it, so a provider that later stops declaring a standing
   * state (for example once its backend connects) would be stuck reporting the
   * stale value. The standing state is applied as a read-time overlay instead.
   */
  function setProviderState(
    providerId: string,
    state: ProviderPresentationState
  ): void {
    providerStates.value = { ...providerStates.value, [providerId]: state }
  }

  function setActionUiState(key: string, state: ActionUiState | null): void {
    const next = { ...actionUiStates.value }
    if (state === null) {
      delete next[key]
    } else {
      next[key] = state
    }
    actionUiStates.value = next
  }

  function abortActions(): void {
    let invalidatedMetadata = false
    for (const [controller, target] of actionControllers) {
      controller.abort()
      invalidatedMetadata =
        metadataCache.get(target.providerId)?.delete(target.assetId) === true ||
        invalidatedMetadata
    }
    actionControllers.clear()
    if (invalidatedMetadata) metadataVersion.value += 1
  }

  function abortProviderActions(providerIds: ReadonlySet<string>): void {
    if (providerIds.size === 0) return
    let invalidatedMetadata = false
    for (const [controller, target] of actionControllers) {
      if (!providerIds.has(target.providerId)) continue
      controller.abort()
      actionControllers.delete(controller)
      invalidatedMetadata =
        metadataCache.get(target.providerId)?.delete(target.assetId) === true ||
        invalidatedMetadata
    }
    if (invalidatedMetadata) metadataVersion.value += 1
  }

  function dropProvider(providerId: string, clearFilters: boolean): void {
    const cycle = cycles.get(providerId)
    if (cycle) {
      cycles.delete(providerId)
      cycle.controller.abort()
    }
    metadataCache.delete(providerId)
    loadingTargets.delete(providerId)
    metadataVersion.value += 1
    const states = { ...providerStates.value }
    delete states[providerId]
    providerStates.value = states
    if (clearFilters) {
      const prefix = `${providerId}/`
      const next: Record<string, FilterValue> = {}
      for (const [key, value] of Object.entries(filters.value)) {
        if (!key.startsWith(prefix)) next[key] = value
      }
      filters.value = next
    }
  }

  /**
   * Recomputes the environment-filtered snapshot synchronously so unregister
   * handling (abort, state/filter removal) is immediate for callers.
   */
  function refreshProviders(): void {
    const next = computeProviders()
    const nextIds = new Set(next.map((provider) => provider.id))
    for (const providerId of previousProviderIds) {
      if (!nextIds.has(providerId)) dropProvider(providerId, true)
    }
    previousProviderIds = nextIds
    providers.value = next
  }

  function setCacheEntry(
    providerId: string,
    target: AssetPresentationTarget,
    state: MetadataState
  ): void {
    let entries = metadataCache.get(providerId)
    if (!entries) {
      entries = new Map()
      metadataCache.set(providerId, entries)
    }
    entries.set(target.assetId, {
      identityKey: targetIdentityKey(target),
      state: cloneFrozen(state)
    })
    metadataVersion.value += 1
  }

  function setCacheError(
    providerId: string,
    target: AssetPresentationTarget,
    safeMessageKey: string
  ): void {
    setCacheEntry(providerId, target, {
      status: 'error',
      safeMessageKey
    })
  }

  function cachedEntryFor(
    providerId: string,
    target: AssetPresentationTarget
  ): MetadataCacheEntry | null {
    const entry = metadataCache.get(providerId)?.get(target.assetId)
    if (!entry) return null
    // Ready/not-applicable reuse requires matching target identity within the
    // current scope; a changed asset identity never reuses stale metadata.
    return entry.identityKey === targetIdentityKey(target) ? entry : null
  }

  function discardMismatchedCacheEntry(
    providerId: string,
    target: AssetPresentationTarget
  ): void {
    const entries = metadataCache.get(providerId)
    const entry = entries?.get(target.assetId)
    if (!entry || entry.identityKey === targetIdentityKey(target)) return
    entries?.delete(target.assetId)
    metadataVersion.value += 1
  }

  function markLoading(
    providerId: string,
    targetsToLoad: readonly AssetPresentationTarget[]
  ): void {
    let loading = loadingTargets.get(providerId)
    if (!loading) {
      loading = new Map()
      loadingTargets.set(providerId, loading)
    }
    for (const target of targetsToLoad) loading.set(target.assetId, target)
    metadataVersion.value += 1
  }

  function clearLoading(providerId: string, assetIds: readonly string[]): void {
    const loading = loadingTargets.get(providerId)
    if (!loading) return
    for (const assetId of assetIds) loading.delete(assetId)
    metadataVersion.value += 1
  }

  function isCycleCurrent(cycle: ProviderCycle): boolean {
    return (
      !disposed &&
      cycle.generation === generation &&
      cycles.get(cycle.provider.id) === cycle
    )
  }

  function appliesToSafely(
    provider: AssetPresentationProvider,
    target: AssetPresentationTarget
  ): 'applies' | 'not-applicable' | 'error' {
    try {
      return provider.appliesTo(providerViewFor(target))
        ? 'applies'
        : 'not-applicable'
    } catch (error) {
      reportError(error, {
        errorType: 'assets_presentation_provider_applicability_failure',
        tags: { provider_id: provider.id }
      })
      return 'error'
    }
  }

  function applyBatchEntries(
    providerId: string,
    batchTargets: readonly AssetPresentationTarget[],
    entries: readonly MetadataBatchEntry[] | null
  ): boolean {
    const requestedIds = new Set(batchTargets.map((target) => target.assetId))
    const returned = new Map<string, Record<string, unknown>>()
    const duplicated = new Set<string>()
    let protocolError = !Array.isArray(entries)
    let malformed = protocolError
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (
          !isPlainObject(entry) ||
          typeof entry.assetId !== 'string' ||
          entry.assetId.length === 0 ||
          !requestedIds.has(entry.assetId)
        ) {
          protocolError = true
          malformed = true
          continue
        }
        if (returned.has(entry.assetId)) {
          duplicated.add(entry.assetId)
          protocolError = true
          malformed = true
        } else {
          returned.set(entry.assetId, entry)
        }
      }
    }

    let valid = !protocolError
    for (const target of batchTargets) {
      const entry = returned.get(target.assetId)
      const state =
        !protocolError &&
        !duplicated.has(target.assetId) &&
        entry &&
        isTerminalState(entry.state)
          ? entry.state
          : null
      if (state) {
        setCacheEntry(providerId, target, state)
        if (state.status === 'error') valid = false
      } else {
        // Exactly one terminal entry per applicable target: a missing,
        // duplicate, idle/loading, or malformed entry is a provider error for
        // that target, never a fabricated not-applicable result.
        setCacheError(providerId, target, PROVIDER_ENTRY_ERROR_KEY)
        valid = false
        malformed = true
      }
    }
    clearLoading(
      providerId,
      batchTargets.map((target) => target.assetId)
    )
    if (malformed) {
      reportError(new Error('Invalid asset presentation metadata batch'), {
        errorType: 'assets_presentation_provider_batch_parsing_failure',
        tags: { provider_id: providerId }
      })
    }
    return valid
  }

  function markRemainingLoadingAsErrors(providerId: string): void {
    const loading = loadingTargets.get(providerId)
    if (!loading) return
    for (const target of loading.values()) {
      setCacheError(providerId, target, PROVIDER_BATCH_ERROR_KEY)
    }
    loading.clear()
  }

  async function runProviderCycle(
    provider: AssetPresentationProvider,
    cycle: ProviderCycle,
    pending: readonly AssetPresentationTarget[],
    initiallyValid: boolean
  ): Promise<void> {
    try {
      let valid = initiallyValid
      for (const batchTargets of chunk(pending, MAX_BATCH_SIZE)) {
        const entries = await provider.loadMetadataBatch({
          targets: batchTargets.map((target) => providerViewFor(target)),
          context: buildContext(cycle.controller.signal)
        })
        if (!isCycleCurrent(cycle)) return
        valid = applyBatchEntries(provider.id, batchTargets, entries) && valid
      }
      if (!isCycleCurrent(cycle)) return
      setProviderState(
        provider.id,
        valid
          ? { status: 'ready' }
          : { status: 'error', safeMessageKey: PROVIDER_ENTRY_ERROR_KEY }
      )
    } catch (error) {
      if (!isCycleCurrent(cycle)) return
      reportError(error, {
        errorType: 'assets_presentation_provider_batch_failure',
        tags: { provider_id: provider.id }
      })
      setProviderState(provider.id, {
        status: 'error',
        safeMessageKey: PROVIDER_BATCH_ERROR_KEY
      })
      markRemainingLoadingAsErrors(provider.id)
    }
  }

  function startProviderCycle(
    provider: AssetPresentationProvider,
    window: readonly AssetPresentationTarget[]
  ): void {
    const cycle: ProviderCycle = {
      provider,
      controller: new AbortController(),
      generation
    }
    cycles.set(provider.id, cycle)
    setProviderState(provider.id, { status: 'loading' })

    const pending: AssetPresentationTarget[] = []
    let valid = true
    for (const target of window) {
      const applicability = appliesToSafely(provider, target)
      if (applicability === 'not-applicable') {
        setCacheEntry(provider.id, target, { status: 'not-applicable' })
        continue
      }
      if (applicability === 'error') {
        setCacheError(provider.id, target, PROVIDER_ENTRY_ERROR_KEY)
        valid = false
        continue
      }
      discardMismatchedCacheEntry(provider.id, target)
      const cached = cachedEntryFor(provider.id, target)
      // Ready and not-applicable entries are reusable within the scope;
      // errors are never permanently cached and are re-requested.
      if (
        cached &&
        (cached.state.status === 'ready' ||
          cached.state.status === 'not-applicable')
      ) {
        continue
      }
      pending.push(target)
    }
    markLoading(provider.id, pending)
    void runProviderCycle(provider, cycle, pending, valid)
  }

  function computeWindow(): AssetPresentationTarget[] {
    const seen = new Set<string>()
    const window: AssetPresentationTarget[] = []
    const active = toValue(options.activeTarget)
    if (active && !seen.has(active.assetId)) {
      seen.add(active.assetId)
      window.push(active)
    }
    for (const target of toValue(options.adjacentTargets)) {
      if (target && !seen.has(target.assetId)) {
        seen.add(target.assetId)
        window.push(target)
      }
    }
    for (const target of toValue(options.targets)) {
      if (target && !seen.has(target.assetId)) {
        seen.add(target.assetId)
        window.push(target)
      }
    }
    return window
  }

  /**
   * Invalidates every in-flight cycle and restarts provider loads. Terminal
   * ready/not-applicable cache entries survive within a scope; a full clear
   * drops filters, cache, and provider states (owner/session/backend switch).
   */
  function restartCycles(fullClear: boolean): void {
    if (disposed) return
    generation += 1
    for (const cycle of cycles.values()) cycle.controller.abort()
    cycles = new Map()
    providerViews = new Map()
    loadingTargets.clear()
    if (fullClear) {
      metadataCache.clear()
      providerStates.value = {}
    } else {
      for (const entries of metadataCache.values()) {
        for (const [assetId, entry] of entries) {
          if (entry.state.status === 'error') entries.delete(assetId)
        }
      }
    }
    metadataVersion.value += 1
    const window = computeWindow()
    for (const provider of providers.value) {
      startProviderCycle(provider, window)
    }
  }

  function resolveMetadataForTarget(
    providerId: string,
    target: AssetPresentationTarget
  ): MetadataState {
    void metadataVersion.value
    const cached = cachedEntryFor(providerId, target)
    if (cached) return cached.state
    if (loadingTargets.get(providerId)?.has(target.assetId)) {
      return { status: 'loading' }
    }
    return { status: 'idle' }
  }
  /**
   * Terminal cached state, in-flight loading state, or idle. Uncached assets
   * without an active request report idle rather than a fabricated result.
   */
  function metadataFor(providerId: string, assetId: string): MetadataState {
    void metadataVersion.value
    const entry = metadataCache.get(providerId)?.get(assetId)
    if (entry) return entry.state
    if (loadingTargets.get(providerId)?.has(assetId)) {
      return { status: 'loading' }
    }
    return { status: 'idle' }
  }

  function reloadProvider(providerId: string): void {
    if (disposed) return
    const provider = providers.value.find(
      (candidate) => candidate.id === providerId
    )
    dropProvider(providerId, false)
    if (!provider) return
    startProviderCycle(provider, computeWindow())
  }

  function executeActionGuarded(
    providerId: string,
    actionId: string
  ): Promise<PresentationActionResult> {
    return (async (): Promise<PresentationActionResult> => {
      const provider = providers.value.find(
        (candidate) => candidate.id === providerId
      )
      if (!provider) throw actionError(ACTION_UNAVAILABLE_KEY)

      const action = provider.actions.find(
        (candidate) => candidate.id === actionId
      )
      if (!action) throw actionError(ACTION_UNAVAILABLE_KEY)

      const activeTarget = toValue(options.activeTarget)
      if (!activeTarget) throw actionError(ACTION_UNAVAILABLE_KEY)
      const activeIdentity = targetIdentityKey(activeTarget)

      const metadata = resolveMetadataForTarget(providerId, activeTarget)
      if (metadata.status !== 'ready') {
        throw actionError(ACTION_UNAVAILABLE_KEY)
      }
      if (
        action.requiresOutputLocator &&
        !metadata.detail.verifiedOutputLocator
      ) {
        throw actionError(ACTION_LOCATOR_REQUIRED_KEY)
      }

      const controller = new AbortController()
      actionControllers.set(controller, {
        providerId,
        assetId: activeTarget.assetId
      })
      const input: PresentationActionContext = {
        target: providerViewFor(activeTarget),
        metadata,
        context: buildContext(controller.signal)
      }
      try {
        let available = false
        try {
          available = action.isAvailable(input)
        } catch (error) {
          reportError(error, {
            errorType: 'assets_presentation_action_availability_failure',
            tags: { provider_id: providerId, action_id: actionId }
          })
          throw actionError(ACTION_UNAVAILABLE_KEY)
        }
        if (!available) throw actionError(ACTION_UNAVAILABLE_KEY)

        try {
          const result = await action.execute(input)
          if (!isActionResult(result)) {
            throw new Error('Presentation action returned an invalid result')
          }
          const currentActiveTarget = toValue(options.activeTarget)
          if (
            controller.signal.aborted ||
            !currentActiveTarget ||
            targetIdentityKey(currentActiveTarget) !== activeIdentity
          ) {
            if (
              metadataCache.get(providerId)?.delete(activeTarget.assetId) ===
              true
            ) {
              metadataVersion.value += 1
            }
            throw actionError(ACTION_FAILED_KEY)
          }
          reloadProvider(providerId)
          return result
        } catch (error) {
          reportError(error, {
            errorType: 'assets_presentation_action_execution_failure',
            tags: { provider_id: providerId, action_id: actionId }
          })
          throw actionError(ACTION_FAILED_KEY)
        }
      } finally {
        actionControllers.delete(controller)
      }
    })()
  }

  function matchesPresentationTarget(target: AssetPresentationTarget): boolean {
    for (const provider of providers.value) {
      if (!providerHasActiveFilters(provider)) continue
      const applicability = appliesToSafely(provider, target)
      if (applicability === 'error') continue
      if (applicability === 'not-applicable') return false

      const metadata = resolveMetadataForTarget(provider.id, target)
      if (metadata.status === 'error') continue
      if (metadata.status === 'not-applicable') return false

      let decision: PredicateDecision
      try {
        decision = provider.predicate({
          target: providerViewFor(target),
          filters: effectiveFilterState(provider),
          metadata
        })
      } catch (error) {
        reportError(error, {
          errorType: 'assets_presentation_provider_predicate_failure',
          tags: { provider_id: provider.id }
        })
        continue
      }
      if (
        decision !== 'match' &&
        decision !== 'no-match' &&
        decision !== 'pending'
      ) {
        reportError(new Error('Invalid presentation predicate decision'), {
          errorType: 'assets_presentation_provider_predicate_failure',
          tags: { provider_id: provider.id }
        })
        continue
      }
      if (decision === 'no-match') return false
    }
    return true
  }

  const unsubscribeRegistry = registry.subscribe(() => {
    const previousIds = new Set(providers.value.map((provider) => provider.id))
    refreshProviders()
    const currentIds = new Set(providers.value.map((provider) => provider.id))
    const removedIds = new Set(
      [...previousIds].filter((providerId) => !currentIds.has(providerId))
    )
    abortProviderActions(removedIds)
    const window = computeWindow()
    for (const provider of providers.value) {
      if (!previousIds.has(provider.id)) startProviderCycle(provider, window)
    }
  })

  const scope = effectScope()
  scope.run(() => {
    watch(
      () => toValue(options.targets),
      () => restartCycles(false),
      { flush: 'sync' }
    )
    watch(
      () => toValue(options.activeTarget),
      () => {
        abortActions()
        restartCycles(false)
      },
      { flush: 'sync' }
    )
    watch(
      () => toValue(options.adjacentTargets),
      () => restartCycles(false),
      { flush: 'sync' }
    )
    watch(
      () => toValue(options.environment),
      () => {
        // Distribution switch: synchronous snapshot refresh plus a full
        // ephemeral reset, filters included, matching backend-switch rules.
        abortActions()
        refreshProviders()
        restartCycles(true)
      },
      { flush: 'sync' }
    )
    watch(
      () => toValue(options.scopeKey),
      () => {
        // Owner/session switch: clear ephemeral filter values and cache so no
        // state leaks across scopes, then reload under the new generation.
        abortActions()
        filters.value = {}
        restartCycles(true)
      },
      { flush: 'sync' }
    )
    watch(
      () => [
        toValue(options.workflowLocator) ?? null,
        toValue(options.projectKey) ?? null,
        toValue(options.runKey) ?? null
      ],
      () => {
        abortActions()
        restartCycles(true)
      },
      { flush: 'sync' }
    )
  })

  function actionExecutionKey(
    providerId: string,
    actionId: string,
    target: AssetPresentationTarget
  ): string {
    return `${getPresentationActionKey(providerId, actionId)}|${JSON.stringify([
      targetIdentityKey(target),
      toValue(options.environment),
      toValue(options.scopeKey),
      toValue(options.workflowLocator) ?? null,
      toValue(options.projectKey) ?? null,
      toValue(options.runKey) ?? null
    ])}`
  }

  function actionAvailability(
    provider: AssetPresentationProvider,
    actionId: string,
    target: AssetPresentationTarget,
    metadata: MetadataState
  ): { readonly enabled: boolean; readonly disabledReasonKey?: string } {
    const action = provider.actions.find(
      (candidate) => candidate.id === actionId
    )
    if (!action || metadata.status !== 'ready') {
      return {
        enabled: false,
        disabledReasonKey: ACTION_UNAVAILABLE_KEY
      }
    }
    if (
      action.requiresOutputLocator &&
      metadata.detail.verifiedOutputLocator === null
    ) {
      return {
        enabled: false,
        disabledReasonKey: ACTION_LOCATOR_REQUIRED_KEY
      }
    }
    try {
      const available = action.isAvailable({
        target: providerViewFor(target),
        metadata,
        context: buildContext(new AbortController().signal)
      })
      return available
        ? { enabled: true }
        : { enabled: false, disabledReasonKey: ACTION_UNAVAILABLE_KEY }
    } catch (error) {
      reportError(error, {
        errorType: 'assets_presentation_action_availability_failure',
        tags: { provider_id: provider.id, action_id: action.id }
      })
      return { enabled: false, disabledReasonKey: ACTION_UNAVAILABLE_KEY }
    }
  }

  /**
   * Builds the per-provider state views for the filter bar.
   *
   * Both reactive inputs are read once, up front, before any provider is
   * inspected. `getStandingState()` is a plain method, not a reactive source,
   * so this computed cannot observe a provider changing its mind on its own;
   * reading the reactive inputs only inside a branch would leave the computed
   * with no dependency at all and it would cache the first standing state
   * forever. Hoisting the reads also keeps them unconditional when the provider
   * list is empty.
   *
   * The contract this establishes is polling, not push: a standing state is
   * re-read whenever presentation state changes. A provider that needs its
   * change reflected immediately must also cause one of those changes.
   */
  function readProviderStateViews(): readonly PresentationProviderStateView[] {
    void metadataVersion.value
    const cycleStates = providerStates.value

    return providers.value.map((provider) => {
      const cycleState: ProviderPresentationState = cycleStates[
        provider.id
      ] ?? {
        status: 'idle' as const
      }
      // Resolved on read, not only when a load cycle runs. With an empty asset
      // list no cycle ever starts, so a provider that is standing-state
      // disconnected would otherwise be reported as idle and render nothing.
      const state: ProviderPresentationState =
        standingStateOf(provider.id) ?? cycleState

      // `error` and `disconnected` both carry a safe message key, but they stay
      // separate states: a host renders one as an alert and the other as a
      // status region so an intentional not-connected provider is never read as
      // a failure.
      return state.status === 'error' || state.status === 'disconnected'
        ? {
            providerId: provider.id,
            status: state.status,
            safeMessageKey: state.safeMessageKey
          }
        : { providerId: provider.id, status: state.status }
    })
  }

  const filterBarProps = computed<PresentationFilterBarProps>(() => ({
    presentationProviders: providers.value,
    presentationFilters: filters.value,
    presentationProviderStates: readProviderStateViews()
  }))

  const lightboxProps = computed<PresentationLightboxProps>(() => {
    const target = toValue(options.activeTarget)
    if (!target) {
      return { presentationDetails: [], presentationActionStates: [] }
    }

    const presentationDetails: PresentationDetailViewModel[] = []
    const presentationActionStates: PresentationActionViewModel[] = []
    for (const provider of providers.value) {
      const applicability = appliesToSafely(provider, target)
      if (applicability === 'not-applicable') continue
      const metadata =
        applicability === 'error'
          ? ({
              status: 'error',
              safeMessageKey: PROVIDER_ENTRY_ERROR_KEY
            } satisfies MetadataState)
          : resolveMetadataForTarget(provider.id, target)
      if (metadata.status === 'not-applicable') continue

      presentationDetails.push({
        providerId: provider.id,
        order: provider.order,
        status: metadata.status,
        sections: metadata.status === 'ready' ? metadata.detail.sections : [],
        ...(metadata.status === 'error'
          ? { safeMessageKey: metadata.safeMessageKey }
          : {})
      })

      for (const action of provider.actions) {
        const availability = actionAvailability(
          provider,
          action.id,
          target,
          metadata
        )
        const execution =
          actionUiStates.value[
            actionExecutionKey(provider.id, action.id, target)
          ]
        presentationActionStates.push({
          assetId: target.assetId,
          providerId: provider.id,
          actionId: action.id,
          labelKey: action.labelKey,
          accessibleDescriptionKey: action.accessibleDescriptionKey,
          intent: action.intent,
          enabled: availability.enabled,
          pending: execution?.status === 'running',
          ...(availability.disabledReasonKey
            ? { disabledReasonKey: availability.disabledReasonKey }
            : {}),
          ...(execution?.status === 'error' && execution.safeMessageKey
            ? { errorMessageKey: execution.safeMessageKey }
            : {}),
          ...(execution?.status === 'succeeded' ||
          execution?.status === 'unchanged'
            ? {
                resultStatus: execution.status,
                safeMessageKey: execution.safeMessageKey
              }
            : {})
        })
      }
    }
    return { presentationDetails, presentationActionStates }
  })

  refreshProviders()
  restartCycles(false)

  const presentation: UseAssetPresentationReturn = {
    providers,
    providerStates,
    filters,
    hasActiveFilters,
    filterBarProps,
    lightboxProps,
    setFilter(providerId, controlId, value) {
      const normalized = normalizedFilterValue(providerId, controlId, value)
      const key = getPresentationFilterKey(providerId, controlId)
      if (isFilterControlActive(normalized.control, normalized.value)) {
        filters.value = { ...filters.value, [key]: normalized.value }
      } else if (key in filters.value) {
        const next = { ...filters.value }
        delete next[key]
        filters.value = next
      }
    },
    resetFilter(providerId, controlId) {
      const key = getPresentationFilterKey(providerId, controlId)
      if (!(key in filters.value)) return
      const next = { ...filters.value }
      delete next[key]
      filters.value = next
    },
    clearProviderFilters(providerId) {
      const prefix = `${providerId}/`
      const next: Record<string, FilterValue> = {}
      let changed = false
      for (const [key, value] of Object.entries(filters.value)) {
        if (key.startsWith(prefix)) {
          changed = true
          continue
        }
        next[key] = value
      }
      if (changed) filters.value = next
    },
    clearAllFilters() {
      filters.value = {}
    },
    clearFilters() {
      filters.value = {}
    },
    matchesTarget: matchesPresentationTarget,
    presentationDecision: matchesPresentationTarget,
    metadataFor,
    detailsFor(providerId, assetId) {
      const state = metadataFor(providerId, assetId)
      return state.status === 'ready' ? state.detail : null
    },
    retryProvider: reloadProvider,
    requestMetadataWindow() {
      restartCycles(false)
    },
    executeAction(providerId, actionId) {
      const activeTarget = toValue(options.activeTarget)
      const key = activeTarget
        ? actionExecutionKey(providerId, actionId, activeTarget)
        : `${getPresentationActionKey(providerId, actionId)}/none`
      const canCommitUiState = () => {
        const currentTarget = toValue(options.activeTarget)
        return (
          !disposed &&
          currentTarget !== null &&
          providers.value.some((provider) => provider.id === providerId) &&
          actionExecutionKey(providerId, actionId, currentTarget) === key
        )
      }
      const inFlight = inFlightActions.get(key)
      if (inFlight) return inFlight
      setActionUiState(key, { status: 'running' })
      const run = executeActionGuarded(providerId, actionId)
      inFlightActions.set(key, run)
      void run
        .then(
          (result) => {
            if (!canCommitUiState()) return
            setActionUiState(key, {
              status: result.status,
              safeMessageKey: result.safeMessageKey
            })
          },
          (error: unknown) => {
            if (!canCommitUiState()) return
            const safeMessageKey =
              isPlainObject(error) && typeof error.safeMessageKey === 'string'
                ? error.safeMessageKey
                : ACTION_FAILED_KEY
            setActionUiState(key, {
              status: 'error',
              safeMessageKey
            })
          }
        )
        .finally(() => {
          if (inFlightActions.get(key) === run) inFlightActions.delete(key)
          if (!canCommitUiState()) setActionUiState(key, null)
        })
      return run
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const cycle of cycles.values()) cycle.controller.abort()
      cycles = new Map()
      abortActions()
      inFlightActions.clear()
      actionUiStates.value = {}
      metadataCache.clear()
      loadingTargets.clear()
      providerViews = new Map()
      providerStates.value = {}
      filters.value = {}
      scope.stop()
      unsubscribeRegistry()
    }
  }
  if (getCurrentScope()) onScopeDispose(presentation.dispose)
  return presentation
}
