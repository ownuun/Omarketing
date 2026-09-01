/**
 * Omarketing's Assets presentation provider for Phase 1.
 *
 * Phase 1 has no Omarketing backend, so this provider deliberately contributes
 * a single status chip and a single detail section that both say the backend is
 * not connected. It registers zero actions and fabricates zero metadata,
 * counts, or cards.
 *
 * The point of rendering anything at all is that "intentionally disconnected"
 * must be distinguishable from "the provider never registered", "bootstrap
 * failed", or "the surface failed to render". A surface that shows nothing
 * proves nothing.
 *
 * Contract: `.hermes/phase0/contracts/assets-presentation-registry.md` and the
 * Supported Phase 1 auth surface / Contract generator sections of
 * `.hermes/phase0/contracts/core-file-allowlist.md`.
 *
 * Dependency direction is Omarketing provider -> generic registry only. This
 * module is never imported by an Assets host.
 */
import type {
  AssetPresentationProvider,
  AssetPresentationTarget,
  FilterControl,
  MetadataBatchEntry,
  MetadataBatchRequest,
  PredicateDecision,
  PresentationAction,
  ProviderPresentationState
} from '@/platform/assets/presentation/assetPresentationRegistry'

/** Stable provider id. Also the namespace for its filter state keys. */
export const OMARKETING_PROVIDER_ID = 'com.omarketing.assets.v1'

/** Locale keys this module contributes. W1 is the sole writer of the catalogs. */
export const OMARKETING_PRESENTATION_LOCALE_KEYS = {
  statusChipLabel: 'omarketing.assets.statusChip.label',
  statusChipDisconnected: 'omarketing.assets.statusChip.disconnected',
  disconnectedMessage: 'omarketing.assets.disconnected.message',
  detailHeading: 'omarketing.assets.detail.heading',
  detailStatusLabel: 'omarketing.assets.detail.statusLabel',
  detailStatusDisconnected: 'omarketing.assets.detail.statusDisconnected'
} as const

/**
 * The single filter control: a read-only status chip.
 *
 * It is a `single-select` with exactly one option so the host renders a chip
 * without inventing a second Omarketing filter dimension. Its default is the
 * disconnected value, and Phase 1 never offers another value.
 */
const omarketingStatusChip: FilterControl = Object.freeze({
  kind: 'single-select',
  id: 'backend-status',
  labelKey: OMARKETING_PRESENTATION_LOCALE_KEYS.statusChipLabel,
  defaultValue: 'disconnected',
  options: Object.freeze([
    Object.freeze({
      value: 'disconnected',
      labelKey: OMARKETING_PRESENTATION_LOCALE_KEYS.statusChipDisconnected
    })
  ])
}) as FilterControl

/** Phase 1 registers no action. A disconnected provider has nothing to act on. */
const omarketingActions: readonly PresentationAction[] = Object.freeze([])

/**
 * The provider's presentation state while no backend is connected.
 *
 * `disconnected` is not `error`: nothing failed. Hosts render it as a status
 * region rather than an alert, and offer no retry.
 */
export const omarketingDisconnectedState: ProviderPresentationState =
  Object.freeze({
    status: 'disconnected',
    safeMessageKey: OMARKETING_PRESENTATION_LOCALE_KEYS.disconnectedMessage
  })

/**
 * Creates the Phase 1 provider.
 *
 * Every method is total and side-effect free. `loadMetadataBatch` resolves
 * `not-applicable` for every target rather than inventing a `ready` detail,
 * because a fabricated detail would make a disconnected backend look connected.
 */
export function createOmarketingAssetsPresentationProvider(): AssetPresentationProvider {
  return {
    id: OMARKETING_PROVIDER_ID,
    order: 100,
    // Phase 1 is the single-owner localhost product only.
    environments: Object.freeze(['localhost'] as const),
    controls: Object.freeze([omarketingStatusChip]),
    actions: omarketingActions,

    /**
     * Phase 1 has no backend, so the provider is permanently disconnected.
     *
     * Declared as a standing state rather than derived from a batch outcome: a
     * batch that returns `not-applicable` for every target is indistinguishable
     * from an ordinary empty result, which is exactly the ambiguity AC-2
     * forbids.
     */
    getStandingState(): ProviderPresentationState {
      return omarketingDisconnectedState
    },

    /**
     * Output assets are the only surface Omarketing annotates. Input assets are
     * upstream-owned and untouched.
     */
    appliesTo(target: AssetPresentationTarget): boolean {
      return target.tab === 'output'
    },

    /**
     * Never filters anything out while disconnected.
     *
     * Returning `match` unconditionally keeps the host's asset list exactly as
     * upstream produced it, so the disconnected provider cannot hide a real
     * local output or manufacture an empty state.
     */
    predicate(): PredicateDecision {
      return 'match'
    },

    /**
     * Resolves `not-applicable` for every requested target.
     *
     * `not-applicable` is the honest answer: there is no backend to ask, and no
     * Omarketing metadata exists for any output yet. It is deliberately not
     * `error` (nothing failed) and deliberately not `ready` with empty fields
     * (that would be fabricated metadata).
     */
    async loadMetadataBatch(
      request: MetadataBatchRequest
    ): Promise<readonly MetadataBatchEntry[]> {
      return request.targets.map((target) => ({
        assetId: target.assetId,
        state: { status: 'not-applicable' as const }
      }))
    }
  }
}
