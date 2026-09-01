/**
 * Generic Assets presentation registry.
 *
 * An extension registers read-only presentation contributions (filter
 * controls, detail metadata batch loaders, and detail actions) that the
 * existing Assets browser renders generically. The registry owns only
 * registration, ordering, and notification; it never owns Assets data,
 * selection, or per-provider request state.
 *
 * Types follow the Phase 0 presentation contract. The generated
 * `OutputLocatorV1` type is intentionally imported from
 * './outputLocatorV1.generated'; hand-duplicating it is forbidden.
 */
import type { AssetItem } from '@/platform/assets/schemas/assetSchema'
import { reportError } from '@/platform/telemetry/reportError'
import type { OutputLocatorV1 } from './outputLocatorV1.generated'

export type PresentationEnvironment = 'localhost' | 'desktop' | 'cloud'
export type AssetTab = 'input' | 'output'
type FilterScalar = string | number | boolean | null
export type FilterValue = FilterScalar | readonly string[]
export type FilterState = Readonly<Record<string, FilterValue>>
export type PredicateDecision = 'match' | 'no-match' | 'pending'

export interface OutputLocatorCandidate {
  readonly job_id: string
  readonly node_id: string
  readonly directory_type: 'output'
  readonly subfolder: string
  readonly filename: string
  readonly media_type: string
  readonly asset_id: string | null
}

export type MetadataState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly detail: AssetDetail }
  | { readonly status: 'not-applicable' }
  | { readonly status: 'error'; readonly safeMessageKey: string }

/**
 * Presentation status of one provider as shown by a host status region.
 * A provider error is isolated: it never disables another provider.
 */
export type ProviderPresentationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready' }
  | { readonly status: 'error'; readonly safeMessageKey: string }
  /**
   * The provider is registered and healthy but its backing service is not
   * connected, so it has no metadata to contribute yet.
   *
   * This is deliberately distinct from `error` and from an empty asset list. A
   * host must render it as its own status region so an operator can tell an
   * intentional not-connected state apart from a provider that failed to
   * register, a bootstrap failure, or a render failure. A provider in this
   * state contributes no synthetic assets, counts, or actions.
   */
  | { readonly status: 'disconnected'; readonly safeMessageKey: string }

export interface AssetPresentationTarget {
  /** Display correlation only; never a persisted selection authority. */
  readonly assetId: string
  readonly asset: Readonly<AssetItem>
  readonly tab: AssetTab
  readonly outputLocatorCandidate: OutputLocatorCandidate | null
}

export interface AssetPresentationContext {
  readonly environment: PresentationEnvironment
  readonly workflowLocator: string | null
  readonly projectKey: string | null
  readonly runKey: string | null
  readonly signal: AbortSignal
}

interface FilterOption {
  readonly value: string
  readonly labelKey: string
}

export type FilterControl =
  | {
      readonly kind: 'single-select'
      readonly id: string
      readonly labelKey: string
      readonly defaultValue: string | null
      readonly options: readonly FilterOption[]
    }
  | {
      readonly kind: 'multi-select'
      readonly id: string
      readonly labelKey: string
      readonly defaultValue: readonly string[]
      readonly options: readonly FilterOption[]
    }
  | {
      readonly kind: 'toggle'
      readonly id: string
      readonly labelKey: string
      readonly defaultValue: boolean
    }

interface AssetDetailField {
  readonly id: string
  readonly labelKey: string
  readonly value: string
  readonly href: string | null
}

export interface AssetDetailSection {
  readonly id: string
  readonly headingKey: string
  readonly fields: readonly AssetDetailField[]
}

type ActionContextValue = string | number | boolean | null

interface AssetActionContextEntry {
  readonly id: string
  readonly value: ActionContextValue
}

export interface AssetDetail {
  readonly sections: readonly AssetDetailSection[]
  readonly providerRevision: string
  readonly verifiedOutputLocator: OutputLocatorV1 | null
  /**
   * Schema-validated, non-secret provider values needed by a registered
   * action. The backend still derives ownership and revalidates every value.
   */
  readonly actionContext: readonly AssetActionContextEntry[]
}

export interface MetadataBatchRequest {
  readonly targets: readonly AssetPresentationTarget[]
  readonly context: AssetPresentationContext
}

export interface MetadataBatchEntry {
  readonly assetId: string
  readonly state: Exclude<
    MetadataState,
    { readonly status: 'idle' | 'loading' }
  >
}

export type PresentationActionResult =
  | { readonly status: 'succeeded'; readonly safeMessageKey: string }
  | { readonly status: 'unchanged'; readonly safeMessageKey: string }

export interface PresentationActionContext {
  readonly target: AssetPresentationTarget
  readonly metadata: MetadataState
  readonly context: AssetPresentationContext
}

export interface PresentationAction {
  readonly id: string
  readonly labelKey: string
  readonly accessibleDescriptionKey: string
  readonly intent: 'neutral' | 'confirm' | 'exclude'
  readonly requiresOutputLocator: boolean
  isAvailable(input: PresentationActionContext): boolean
  execute(input: PresentationActionContext): Promise<PresentationActionResult>
}

export interface AssetPresentationProvider {
  readonly id: string
  readonly order: number
  readonly environments: readonly PresentationEnvironment[]
  readonly controls: readonly FilterControl[]
  readonly actions: readonly PresentationAction[]
  appliesTo(target: AssetPresentationTarget): boolean
  predicate(input: {
    readonly target: AssetPresentationTarget
    readonly filters: FilterState
    readonly metadata: MetadataState
  }): PredicateDecision
  loadMetadataBatch(
    request: MetadataBatchRequest
  ): Promise<readonly MetadataBatchEntry[]>
  /**
   * Optional standing state the provider declares for itself.
   *
   * A per-cycle outcome (`loading`, `ready`, `error`) describes one batch. Some
   * conditions outlive a batch — most importantly `disconnected`, where the
   * provider is registered and healthy but its backing service is not
   * connected. When this returns a state, hosts render it instead of the
   * derived per-cycle state, so an intentional not-connected provider is never
   * displayed as merely idle or empty.
   *
   * Returning `null` (or omitting the method) leaves the derived state in
   * place. This stays generic: the registry learns a state, never a vendor.
   *
   * **This is polled, not pushed.** Hosts call it while recomputing
   * presentation state, so a change is reflected on the next presentation
   * change rather than immediately. A provider whose state is backed by a
   * reactive source (a `ref`, a store getter) is tracked normally and updates
   * as soon as that source changes. A provider that reads a plain, untracked
   * variable must additionally cause a presentation change for the new value to
   * appear; nothing observes the variable on its own. Implementations should be
   * cheap and side-effect free because they run on every recompute.
   */
  getStandingState?(): ProviderPresentationState | null
}

export interface AssetPresentationRegistration {
  readonly providerId: string
  unregister(): void
}

export interface AssetPresentationRegistry {
  register(provider: AssetPresentationProvider): AssetPresentationRegistration
  snapshot(): readonly AssetPresentationProvider[]
  subscribe(listener: () => void): () => void
}

/**
 * Fully-qualified state key for one registered control. Filter state keys are
 * namespaced per provider so no provider can clear another provider's values.
 */
export function getPresentationFilterKey(
  providerId: string,
  controlId: string
): string {
  return `${providerId}/${controlId}`
}

/** Fully-qualified key for one registered action. */
export function getPresentationActionKey(
  providerId: string,
  actionId: string
): string {
  return `${providerId}/${actionId}`
}

/**
 * Whether a control holds an active override. Filter state stores only
 * overrides; an absent key means the descriptor default, which is inactive.
 * A value whose shape does not match the control kind never equals the
 * default and therefore counts as active.
 */
export function isFilterControlActive(
  control: FilterControl,
  value: FilterValue
): boolean {
  switch (control.kind) {
    case 'single-select':
      return value !== control.defaultValue
    case 'multi-select':
      if (!Array.isArray(value)) return true
      return !isSameStringSet(value, control.defaultValue)
    case 'toggle':
      return value !== control.defaultValue
  }
}

function isSameStringSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((entry, index) => entry === sortedRight[index])
}

const PRESENTATION_ENVIRONMENTS: readonly PresentationEnvironment[] = [
  'localhost',
  'desktop',
  'cloud'
]
const FILTER_CONTROL_KINDS: readonly FilterControl['kind'][] = [
  'single-select',
  'multi-select',
  'toggle'
]
const ACTION_INTENTS: readonly PresentationAction['intent'][] = [
  'neutral',
  'confirm',
  'exclude'
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(message: string): never {
  throw new Error(`[assetPresentationRegistry] ${message}`)
}

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${field} must be a non-empty string`)
  }
  return value
}

/**
 * Registration ids join keys as `providerId/id`, so a `/` inside an id would
 * make two different registrations produce the same key.
 */
function parseNamespacedId(value: unknown, field: string): string {
  const id = parseNonEmptyString(value, field)
  if (id.includes('/')) {
    invalid(`${field} must not contain "/": ${JSON.stringify(id)}`)
  }
  return id
}

function isPresentationEnvironment(
  value: string
): value is PresentationEnvironment {
  return (PRESENTATION_ENVIRONMENTS as readonly string[]).includes(value)
}

function isActionIntent(value: string): value is PresentationAction['intent'] {
  return (ACTION_INTENTS as readonly string[]).includes(value)
}

function parseEnvironments(value: unknown): readonly PresentationEnvironment[] {
  if (!Array.isArray(value) || value.length === 0) {
    invalid('provider environments must be a non-empty array')
  }
  const environments: PresentationEnvironment[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || !isPresentationEnvironment(entry)) {
      invalid(
        `provider environments must contain only ${PRESENTATION_ENVIRONMENTS.join(' | ')}`
      )
    }
    if (environments.includes(entry)) {
      invalid('provider environments must not repeat a value')
    }
    environments.push(entry)
  }
  return Object.freeze(environments)
}

function parseOptions(value: unknown, field: string): readonly FilterOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`${field} options must be a non-empty array`)
  }
  const options: FilterOption[] = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      invalid(`${field} options must all be objects`)
    }
    const option: FilterOption = Object.freeze({
      value: parseNonEmptyString(entry.value, `${field} option value`),
      labelKey: parseNonEmptyString(entry.labelKey, `${field} option labelKey`)
    })
    if (options.some((existing) => existing.value === option.value)) {
      invalid(`${field} options must not repeat value "${option.value}"`)
    }
    options.push(option)
  }
  return Object.freeze(options)
}

/**
 * Validate one control and return a frozen deep copy. `occupiedControlIds`
 * starts from the registry-wide namespace, so a duplicate id — whether inside
 * this provider or already registered by any provider — throws here.
 */
function parseControl(
  input: unknown,
  occupiedContributionIds: Set<string>
): FilterControl {
  if (!isRecord(input)) {
    invalid('provider controls must all be objects')
  }
  const id = parseNamespacedId(input.id, 'control id')
  const field = `control "${id}"`
  if (occupiedContributionIds.has(id)) {
    invalid(
      `${field} is already registered; control and action ids are globally unique`
    )
  }
  occupiedContributionIds.add(id)

  const labelKey = parseNonEmptyString(input.labelKey, `${field} labelKey`)
  const kind = input.kind
  if (kind === 'single-select') {
    const options = parseOptions(input.options, field)
    const defaultValue = input.defaultValue
    if (
      defaultValue !== null &&
      (typeof defaultValue !== 'string' ||
        !options.some((option) => option.value === defaultValue))
    ) {
      invalid(
        `${field} defaultValue must be null or one of its declared option values`
      )
    }
    return Object.freeze<FilterControl>({
      kind,
      id,
      labelKey,
      defaultValue,
      options
    })
  }
  if (kind === 'multi-select') {
    const options = parseOptions(input.options, field)
    const defaultValue = input.defaultValue
    if (!Array.isArray(defaultValue)) {
      invalid(`${field} defaultValue must be an array of option values`)
    }
    const values: string[] = []
    for (const entry of defaultValue) {
      if (
        typeof entry !== 'string' ||
        !options.some((option) => option.value === entry)
      ) {
        invalid(
          `${field} defaultValue entries must all be declared option values`
        )
      }
      if (values.includes(entry)) {
        invalid(`${field} defaultValue must not repeat option values`)
      }
      values.push(entry)
    }
    return Object.freeze<FilterControl>({
      kind,
      id,
      labelKey,
      defaultValue: Object.freeze(values),
      options
    })
  }
  if (kind === 'toggle') {
    if (typeof input.defaultValue !== 'boolean') {
      invalid(`${field} defaultValue must be a boolean`)
    }
    return Object.freeze<FilterControl>({
      kind,
      id,
      labelKey,
      defaultValue: input.defaultValue
    })
  }
  invalid(`${field} kind must be one of ${FILTER_CONTROL_KINDS.join(' | ')}`)
}

function parseAction(
  input: unknown,
  occupiedContributionIds: Set<string>
): PresentationAction {
  if (!isRecord(input)) {
    invalid('provider actions must all be objects')
  }
  const id = parseNamespacedId(input.id, 'action id')
  const field = `action "${id}"`
  if (occupiedContributionIds.has(id)) {
    invalid(
      `${field} is already registered; control and action ids are globally unique`
    )
  }
  occupiedContributionIds.add(id)

  const intent = input.intent
  if (typeof intent !== 'string' || !isActionIntent(intent)) {
    invalid(`${field} intent must be one of ${ACTION_INTENTS.join(' | ')}`)
  }
  if (typeof input.requiresOutputLocator !== 'boolean') {
    invalid(`${field} requiresOutputLocator must be a boolean`)
  }
  if (typeof input.isAvailable !== 'function') {
    invalid(`${field} isAvailable must be a function`)
  }
  if (typeof input.execute !== 'function') {
    invalid(`${field} execute must be a function`)
  }
  return Object.freeze<PresentationAction>({
    id,
    labelKey: parseNonEmptyString(input.labelKey, `${field} labelKey`),
    accessibleDescriptionKey: parseNonEmptyString(
      input.accessibleDescriptionKey,
      `${field} accessibleDescriptionKey`
    ),
    intent,
    requiresOutputLocator: input.requiresOutputLocator,
    isAvailable: input.isAvailable as PresentationAction['isAvailable'],
    execute: input.execute as PresentationAction['execute']
  })
}

/**
 * Validate a whole provider, then return a frozen deep copy that stays
 * detached from caller-owned objects: later caller mutation never reaches a
 * snapshot, and the caller's own object is never frozen or mutated.
 * Descriptor data is copied; provider functions are shared by reference.
 * Throws before any registry state changes, so registration is atomic.
 */
function parseProvider(
  input: unknown,
  occupiedProviderIds: ReadonlySet<string>,
  occupiedContributionIds: ReadonlySet<string>
): AssetPresentationProvider {
  if (!isRecord(input)) {
    invalid('provider must be an object')
  }
  const id = parseNamespacedId(input.id, 'provider id')
  if (occupiedProviderIds.has(id)) {
    invalid(
      `provider "${id}" is already registered; registration never replaces an existing provider`
    )
  }
  if (typeof input.order !== 'number' || !Number.isFinite(input.order)) {
    invalid('provider order must be a finite number')
  }
  if (typeof input.appliesTo !== 'function') {
    invalid(`provider "${id}" appliesTo must be a function`)
  }
  if (typeof input.predicate !== 'function') {
    invalid(`provider "${id}" predicate must be a function`)
  }
  if (typeof input.loadMetadataBatch !== 'function') {
    invalid(`provider "${id}" loadMetadataBatch must be a function`)
  }
  if (!Array.isArray(input.controls)) {
    invalid(`provider "${id}" controls must be an array`)
  }
  if (!Array.isArray(input.actions)) {
    invalid(`provider "${id}" actions must be an array`)
  }

  const candidateContributionIds = new Set(occupiedContributionIds)
  const controls = Object.freeze(
    input.controls.map((control) =>
      parseControl(control, candidateContributionIds)
    )
  )
  const actions = Object.freeze(
    input.actions.map((action) => parseAction(action, candidateContributionIds))
  )

  // The optional standing-state hook is validated like every other member and
  // carried onto the frozen provider. Rebuilding the provider from a fixed
  // field list silently drops anything not listed here, which would leave a
  // disconnected provider indistinguishable from an idle one.
  if (
    input.getStandingState !== undefined &&
    typeof input.getStandingState !== 'function'
  ) {
    invalid(`provider "${id}" getStandingState must be a function`)
  }

  return Object.freeze<AssetPresentationProvider>({
    id,
    order: input.order,
    environments: parseEnvironments(input.environments),
    controls,
    actions,
    appliesTo: input.appliesTo as AssetPresentationProvider['appliesTo'],
    predicate: input.predicate as AssetPresentationProvider['predicate'],
    loadMetadataBatch:
      input.loadMetadataBatch as AssetPresentationProvider['loadMetadataBatch'],
    ...(input.getStandingState
      ? {
          getStandingState: input.getStandingState as NonNullable<
            AssetPresentationProvider['getStandingState']
          >
        }
      : {})
  })
}

export function createAssetPresentationRegistry(): AssetPresentationRegistry {
  const registrations = new Map<
    string,
    { token: number; provider: AssetPresentationProvider }
  >()
  const contributionIds = new Set<string>()
  const listeners = new Set<() => void>()
  let nextToken = 0

  // Synchronous fan-out over a copy, so a listener that unsubscribes (or
  // registers) during notification cannot corrupt this iteration.
  const notifyListeners = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch (error) {
        // One failing host listener is reported, not propagated: it must not
        // stop other hosts from observing the registry change.
        reportError(error, {
          errorType: 'asset_presentation_registry_listener_failure'
        })
      }
    }
  }

  const register = (
    provider: AssetPresentationProvider
  ): AssetPresentationRegistration => {
    let frozenProvider: AssetPresentationProvider
    try {
      frozenProvider = parseProvider(
        provider,
        new Set(registrations.keys()),
        contributionIds
      )
    } catch (error) {
      reportError(error, {
        errorType: 'asset_presentation_provider_registration_failure',
        tags: {
          provider_id:
            typeof provider?.id === 'string' ? provider.id : undefined
        },
        level: 'warning'
      })
      throw error
    }
    const token = nextToken + 1
    nextToken = token
    registrations.set(frozenProvider.id, { token, provider: frozenProvider })
    for (const control of frozenProvider.controls) {
      contributionIds.add(control.id)
    }
    for (const action of frozenProvider.actions) {
      contributionIds.add(action.id)
    }
    notifyListeners()
    return {
      providerId: frozenProvider.id,
      unregister: (): void => {
        // Token-scoped handle: a stale handle — already unregistered, or the
        // id was re-registered by a newer handle — is a silent no-op.
        const entry = registrations.get(frozenProvider.id)
        if (entry?.token !== token) return
        registrations.delete(frozenProvider.id)
        for (const control of frozenProvider.controls) {
          contributionIds.delete(control.id)
        }
        for (const action of frozenProvider.actions) {
          contributionIds.delete(action.id)
        }
        notifyListeners()
      }
    }
  }

  const snapshot = (): readonly AssetPresentationProvider[] =>
    Object.freeze(
      [...registrations.values()]
        .map((entry) => entry.provider)
        .sort(
          (left, right) =>
            left.order - right.order ||
            (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
        )
    )

  const subscribe = (listener: () => void): (() => void) => {
    if (typeof listener !== 'function') {
      invalid('subscribe requires a listener function')
    }
    listeners.add(listener)
    let subscribed = true
    return (): void => {
      if (!subscribed) return
      subscribed = false
      listeners.delete(listener)
    }
  }

  return Object.freeze({ register, snapshot, subscribe })
}

/** Default registry the built-in extensions register their providers into. */
export const assetPresentationRegistry: AssetPresentationRegistry =
  createAssetPresentationRegistry()
