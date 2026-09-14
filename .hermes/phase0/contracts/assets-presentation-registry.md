# Assets presentation registry contract

## Approved local selection persistence CR

Public API projection is not generic full OutputLocatorV1 or legacy SelectionManifestV1. verifiedOutputLocator remains null. requiresOutputLocator:false bypasses only full-locator presence, never bound association/current revision/authenticated verify or PUT revalidation. Generic host must reject assetId/tuple ambiguity, ignore obsolete generations and refresh provider metadata after actions. Provider must not derive authority from UI ID or active workflow.

Status: Phase 0 contract; no product implementation is contained in this file.

## Purpose and boundary

The registry is a generic presentation extension point inside the existing Assets browser. It permits a localhost extension to contribute filter controls and predicates, asynchronous read-only detail metadata, and explicit detail actions. It does not create an Omarketing Assets store, index, route, sidebar, card type, or run state machine.

The existing `AssetItem[]` supplied by the existing Assets providers remains authoritative for membership and pagination. Existing card selection remains transient UI selection. History-backed output discovery, upload, preview, download, delete, stack, lightbox navigation, and pagination retain their current semantics.

Normative source anchors:

- `src/components/sidebar/tabs/AssetsSidebarTab.vue`: `baseAssets`, `displayAssets`, `visibleAssets`, `galleryItems`, `showLoadingState`, `showEmptyState`, `handleZoomClick`, and the existing `MediaLightbox` mount.
- `src/platform/assets/composables/useMediaAssetFiltering.ts`: `useMediaAssetFiltering`, `searchFiltered`, and `filteredAssets`.
- `src/platform/assets/components/MediaAssetFilterBar.vue`: filter controls, chips, `removeFilter`, and `clearFilters`.
- `src/components/sidebar/tabs/queue/MediaLightbox.vue`: `activeItem`, modal focus restoration, keyboard navigation, and media renderers.
- `src/platform/assets/schemas/assetSchema.ts`: `AssetItem` and `AssetId`.
- `.hermes/phase0/schemas/output-locator.v1.schema.json`: the normative structured output locator used by a mutating selection action.
- `.hermes/phase0/schemas/selection-manifest.v1.schema.json`: the normative persisted selection record.

## Exact host files

The generic hook may modify only these existing Assets presentation hosts:

| File                                                        | Sole permitted responsibility                                                                                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/platform/assets/components/MediaAssetFilterBar.vue`    | Render registered localhost controls, their chips, clear/remove affordances, and provider loading/error status independently of the existing cloud-only filter menu.                            |
| `src/platform/assets/composables/useMediaAssetFiltering.ts` | Combine registered synchronous tri-state predicates with the existing search/media/date filtering and sorting.                                                                                  |
| `src/components/sidebar/tabs/AssetsSidebarTab.vue`          | Subscribe to registry snapshots, own ephemeral presentation state, request deduplicated metadata batches for the visible/active window, and pass the active asset presentation to the lightbox. |
| `src/components/sidebar/tabs/queue/MediaLightbox.vue`       | Render generic read-only detail sections and registered actions beside the existing preview while preserving modal and media behavior.                                                          |

The generic implementation files are fixed as:

- `src/platform/assets/presentation/assetPresentationRegistry.ts`
- `src/platform/assets/presentation/useAssetPresentation.ts`
- `src/platform/assets/presentation/AssetPresentationFilterControls.vue`
- `src/platform/assets/presentation/AssetPresentationDetails.vue`

`src/platform/assets/components/MediaAssetSelectionBar.vue` is not a host. Omarketing authority-changing actions are detail actions, not bulk actions. `src/platform/assets/components/MediaAssetCard.vue`, including its body, footer, selection affordance, and context menu, is never modified.

## Non-product TypeScript contract sketch

The following sketch defines the required shape. It is documentation, not compilable product source. The generated `OutputLocatorV1` type must be derived from the normative JSON Schema rather than duplicated by hand in product code.

```ts
import type { AssetItem } from '@/platform/assets/schemas/assetSchema'
import type { OutputLocatorV1 } from './outputLocatorV1.generated'

type PresentationEnvironment = 'localhost' | 'desktop' | 'cloud'
type AssetTab = 'input' | 'output'
type FilterScalar = string | number | boolean | null
type FilterValue = FilterScalar | readonly string[]
type FilterState = Readonly<Record<string, FilterValue>>
type PredicateDecision = 'match' | 'no-match' | 'pending'

interface OutputLocatorCandidate {
  readonly job_id: string
  readonly node_id: string
  readonly directory_type: 'output'
  readonly subfolder: string
  readonly filename: string
  readonly media_type: string
  readonly asset_id: string | null
}

type MetadataState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly detail: AssetDetail }
  | { readonly status: 'not-applicable' }
  | { readonly status: 'error'; readonly safeMessageKey: string }

interface AssetPresentationTarget {
  /** Display correlation only; never a persisted selection authority. */
  readonly assetId: string
  readonly asset: Readonly<AssetItem>
  readonly tab: AssetTab
  readonly outputLocatorCandidate: OutputLocatorCandidate | null
}

interface AssetPresentationContext {
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

type FilterControl =
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

interface AssetDetailSection {
  readonly id: string
  readonly headingKey: string
  readonly fields: readonly AssetDetailField[]
}

type ActionContextValue = string | number | boolean | null

interface AssetActionContextEntry {
  readonly id: string
  readonly value: ActionContextValue
}

interface AssetDetail {
  readonly sections: readonly AssetDetailSection[]
  readonly providerRevision: string
  readonly verifiedOutputLocator: OutputLocatorV1 | null
  /**
   * Schema-validated, non-secret provider values needed by a registered
   * action. Omarketing uses `reference_id` and `expected_manifest_revision`.
   * The backend still derives ownership and revalidates every value.
   */
  readonly actionContext: readonly AssetActionContextEntry[]
}

interface MetadataBatchRequest {
  readonly targets: readonly AssetPresentationTarget[]
  readonly context: AssetPresentationContext
}

interface MetadataBatchEntry {
  readonly assetId: string
  readonly state: Exclude<
    MetadataState,
    { readonly status: 'idle' | 'loading' }
  >
}

type PresentationActionResult =
  | { readonly status: 'succeeded'; readonly safeMessageKey: string }
  | { readonly status: 'unchanged'; readonly safeMessageKey: string }

interface PresentationActionContext {
  readonly target: AssetPresentationTarget
  readonly metadata: MetadataState
  readonly context: AssetPresentationContext
}

interface PresentationAction {
  readonly id: string
  readonly labelKey: string
  readonly accessibleDescriptionKey: string
  readonly intent: 'neutral' | 'confirm' | 'exclude'
  readonly requiresOutputLocator: boolean
  isAvailable(input: PresentationActionContext): boolean
  execute(input: PresentationActionContext): Promise<PresentationActionResult>
}

interface AssetPresentationProvider {
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
}

interface AssetPresentationRegistration {
  readonly providerId: string
  unregister(): void
}

interface AssetPresentationRegistry {
  register(provider: AssetPresentationProvider): AssetPresentationRegistration
  snapshot(): readonly AssetPresentationProvider[]
  subscribe(listener: () => void): () => void
}
```

No registry function accepts or returns an untyped value. Provider-specific payloads are parsed at the provider boundary into the descriptors above. Raw network data starts as `unknown` and must be schema-validated before use.

## Omarketing provider

The Omarketing provider has ID `com.omarketing.assets.v1`, `environments: ['localhost']`, and contributes these controls:

- content type: short form, carousel/card news, advertisement;
- platform: YouTube Shorts, TikTok, Instagram Reels, Instagram Carousel, Meta Ads, Google Search Ads, Google Display/Performance Max, other connector;
- lifecycle status: candidate, selected, acquiring, acquired, analyzed, excluded, failed;
- rights/source status: verified, restricted, unknown, prohibited;
- project, pipeline, and run;
- relevance/score sort only where the provider has corresponding metadata.

The existing date, media-type, name, newest/oldest, and execution-time controls remain owned by existing code. The registry must not rename, shadow, or reimplement them.

The Omarketing provider uses same-origin authenticated backend routes. Its
metadata loader is read-only. It returns `reference_id` and
`expected_manifest_revision` only as validated `actionContext` entries; raw
provider payload is never exposed to a generic host. Its final-selection
action submits only an `OutputLocator v1`, those two action-context values,
and user intent. The server derives the owner from the session, resolves and
revalidates the reference/project/run binding, reopens the output, and
recomputes checksum, MIME type, and byte size before atomically changing
`selection.json`. Client `AssetItem.id`, `jobId`, preview URL, display
filename, a concatenated frontend ID, or an action-context value is never
sufficient selection authority. The server response is parsed against
`SelectionManifest v1` before the UI reports success.

## Registration and lifecycle

1. `src/extensions/core/index.ts` imports the built-in Omarketing frontend extension once. The extension registers its provider during extension setup.
2. Provider IDs and control/action IDs are globally unique. A duplicate registration throws and leaves the prior provider intact; it never replaces an existing provider silently.
3. Registry order is stable: ascending `order`, then lexical provider ID. A registry snapshot is immutable.
4. `register()` returns the only unregister handle. Unregister aborts in-flight requests, removes provider UI/state, and notifies subscribers. It does not mutate an Asset or clear core selection.
5. Hosts subscribe on mount and unsubscribe on unmount. HMR or extension teardown invokes `unregister()` before re-registration.
6. Ephemeral filter values and metadata cache belong to `useAssetPresentation`, not to Assets Pinia stores. They are cleared on owner/session change, backend base-URL change, provider unregister, or host unmount. A tab change may retain controls but must abort and discard results for the prior tab.
7. Every request captures a generation token and `AbortSignal`. Responses from an aborted or older generation are ignored even when the transport cannot cancel them.
8. Providers receive readonly `AssetItem` views. They must not attach metadata to `AssetItem`, write `user_metadata`, alter arrays owned by a store, or call upload/delete/download APIs from metadata loading.

## Batch lookup and cache rules

- `AssetsSidebarTab` deduplicates the current visible window, the active lightbox item, and at most the immediately adjacent lightbox items by `AssetItem.id` for display correlation. It sends one batch per provider and generation, never one request per card.
- A provider batch contains at most 100 targets. Larger windows are split into bounded batches without parallel request storms.
- An `outputLocatorCandidate` is derived only when existing output metadata contains the primitive job/node/directory/subfolder/filename/media fields needed to ask the server for verification. Missing or invalid fields yield `null`; the host does not synthesize them. The candidate is not selection authority.
- The metadata route resolves the candidate inside the output root and returns a complete `verifiedOutputLocator` containing server-recomputed SHA-256, MIME type, and byte size. Only that validated `OutputLocator v1` may reach a selection action.
- The provider returns exactly one terminal entry for each applicable requested target. Missing entries become provider errors for those targets, not fabricated `not-applicable` results.
- Every `actionContext` entry is parsed from a versioned provider response,
  uses a unique ID, contains only the declared scalar types, and contains no
  credential, path, URL, raw provider body, or display HTML. Duplicate or
  unknown required entries make that provider entry an error.
- Cache keys include provider ID, provider revision, owner/session generation, and the complete locator candidate or input asset identity. Cache entries are in memory only. Ready and not-applicable entries may be reused within that generation; errors are not permanently cached.
- An active-item request has priority over background visible-window batches. Changing active item aborts obsolete active detail work.
- Provider metadata is presentation data only. It cannot add an asset to the base collection or preserve an asset after History-backed discovery removes it.

## Predicate composition and user-visible states

The existing search/media/date predicates run first. Registered predicates run only on that resulting set. Existing sorting remains last; a registered relevance/score comparator is active only while its corresponding registered control is active and ready.

| State                                                                                                     | Required behavior                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core Assets are loading and there are no base assets                                                      | Preserve the existing Assets skeleton. Do not replace it with provider UI.                                                                                                |
| Core Assets have items; provider metadata is loading                                                      | Keep `pending` items visible (fail open), mark provider controls/details `aria-busy`, and show a localized non-blocking loading status. Do not flash a false empty state. |
| Provider predicate returns `match`                                                                        | Keep the asset.                                                                                                                                                           |
| Provider predicate returns `no-match`                                                                     | Exclude the asset only for that provider's active filters.                                                                                                                |
| Provider predicate returns `pending`                                                                      | Keep the asset until that target reaches a terminal metadata state, then recompute.                                                                                       |
| Provider reports `not-applicable` while none of its controls are active                                   | Keep the asset; omit its detail section/actions.                                                                                                                          |
| Provider reports `not-applicable` while one of its controls is active                                     | Treat it as `no-match`; an Omarketing filter must not relabel an unrelated asset.                                                                                         |
| A provider batch/predicate fails                                                                          | Fail open for that provider, isolate the error, retain core assets and other providers, and offer retry.                                                                  |
| Base loading has ended, all relevant provider lookups settled successfully, and filters yield zero assets | Show a filter-specific no-match state with clear-provider and clear-all-filter actions. Do not use the unfiltered “no files” claim.                                       |
| Base loading has ended and the unfiltered base set is empty                                               | Preserve the existing imported/generated empty state.                                                                                                                     |

`clearFilters` clears existing and registered filter state. Removing one registered chip resets only its fully-qualified `providerId/controlId`. Registry state keys are namespaced; a provider cannot clear another provider's values.

## Detail and action behavior

- Opening a card continues through `handleZoomClick` and the existing lightbox. The registry adds a generic detail region; it does not replace `ComfyImage`, `ResultVideo`, `ResultAudio`, or `ResultText`.
- Metadata sections are read-only text/links. URLs are allowlisted and rendered with safe external-link behavior. Raw HTML is not accepted.
- Loading is per provider/section. One failed provider shows its own safe error and retry; the preview and other sections remain usable.
- Action availability is recomputed from the active target and validated metadata. Actions requiring an output locator are disabled unless ready metadata contains a non-stale `verifiedOutputLocator`.
- An action runs at most once concurrently for an active target. While pending, only that action is disabled. Navigation and close remain available.
- No optimistic authority change is shown. “Selected”, “excluded”, revision, checksum, MIME, and size update only from a validated server response. A failed action leaves the last confirmed detail visible and reports a safe retryable error.
- Navigating or closing aborts the action request when safe. A server reply may still commit; a later detail reload reconciles from the server rather than rolling back speculatively.
- Existing bulk selection and `MediaAssetSelectionBar` never write `ReferenceSelection` or `selection.json`.

## Accessibility and responsive behavior

- Every control has a localized visible label or associated accessible name; chips expose localized remove names and clear actions are buttons.
- Control grouping uses a labelled group/fieldset equivalent. Keyboard order follows stable registry order and does not trap focus in the filter bar.
- Provider loading status uses `role="status"`/polite live announcements; action failures use an appropriate alert. Repeated batch progress is coalesced so screen readers are not spammed.
- The lightbox remains `role="dialog"`, `aria-modal="true"`, has a focus trap, focuses a stable heading or close control on open, and restores the precise invoking card/control on close.
- Arrow-key gallery navigation is ignored when the event originates in an input, select, textarea, link, button, or provider interactive region. Escape closes nested provider UI first, then the lightbox.
- Detail headings are ordered, action progress is exposed with `aria-busy`, and disabled reasons are available to assistive technology.
- At narrow widths the preview remains primary; details scroll independently within the existing viewport, actions remain reachable without horizontal scrolling, and current breakpoint/overflow rules are preserved.
- Color, focus, error, selected, prohibited-rights, and stale states are not communicated by color alone.

## Failure isolation

Each provider boundary catches and reports registration, applicability, predicate, batch parsing, detail rendering, and action failures independently. A provider failure cannot:

- change the base Assets list;
- clear existing search/date/media filters or selection;
- close the lightbox;
- disable upload, preview, navigation, download, or delete;
- suppress another provider;
- persist unvalidated data;
- turn an error into a no-match result.

Registry/host programming errors use the repository telemetry wrapper, never a raw telemetry sink. User messages contain no path, credential, upstream body, or stack trace.

## Verification matrix for the implementation gate

No commands are executed by this Phase 0 contract task. The implementation must later produce evidence for every row.

| Case                 | Pass                                                                                                                               | Fail                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Localhost controls   | Omarketing controls render on localhost while existing cloud-only controls retain their behavior.                                  | Controls are gated by `isCloud`, or distribution types are changed.            |
| Base-store integrity | Store/provider arrays and `AssetItem` objects are unchanged before/after filtering and detail use.                                 | Registry mutates, replaces, or persists into an Assets store.                  |
| Batch behavior       | 100 visible targets cause bounded provider batches, not per-card requests; stale responses are discarded.                          | N visible cards cause N requests or stale detail appears after navigation.     |
| Loading              | Existing assets remain visible while extension metadata loads.                                                                     | Loading produces a false “no files/no matches” flash.                          |
| No match             | A settled zero result is filter-specific and offers clear actions.                                                                 | Provider failure or pending work is presented as no matches.                   |
| Isolation            | One provider throws and core Assets plus another provider remain usable.                                                           | Preview/list/filter/action surface crashes or becomes disabled globally.       |
| Card regression      | `MediaAssetCard.vue` has no diff and existing check/context-menu behavior is unchanged.                                            | Card body, badge, footer, or menu is modified.                                 |
| Detail regression    | Image/video/audio/text preview, arrows, close, focus restore, and narrow layout still work.                                        | Provider detail replaces media rendering or breaks modal behavior.             |
| Selection authority  | Network request contains a structured locator; server response supplies recomputed hash/MIME/size and validated manifest revision. | A frontend asset/synthetic ID or client checksum is accepted as authority.     |
| Action failure       | Confirmed state remains, safe error/retry appears, and navigation works.                                                           | UI shows optimistic success or closes/locks the lightbox.                      |
| Cleanup              | Logout/backend change/unmount aborts requests and removes ephemeral cache/state.                                                   | Owner A metadata appears for owner B or after backend switch.                  |
| Accessibility        | Controls and actions are keyboard reachable; announcements, focus trap/restore, and interactive-key exclusions work.               | Unlabelled controls, focus loss, arrow hijacking, or color-only status occurs. |
