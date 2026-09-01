/**
 * Omarketing built-in extension bootstrap.
 *
 * This module is the single writer of Omarketing's runtime registrations. Upper
 * lanes export typed contributions; this file validates them and registers them
 * exactly once. `src/extensions/core/index.ts` imports it for side effects only.
 *
 * Phase 1 registers one Assets presentation provider and nothing else. It adds
 * no route, view, sidebar, command, store, or run authority.
 *
 * Contract: `.hermes/phase0/contracts/core-file-allowlist.md`, "Bootstrap: one
 * import only" and "Allowed additive frontend extension files".
 */
import { assetPresentationRegistry } from '@/platform/assets/presentation/assetPresentationRegistry'
import type { AssetPresentationRegistration } from '@/platform/assets/presentation/assetPresentationRegistry'
import { app } from '@/scripts/app'

import {
  OMARKETING_PRESENTATION_LOCALE_KEYS,
  OMARKETING_PROVIDER_ID,
  createOmarketingAssetsPresentationProvider
} from './assetsPresentation'
import {
  OMARKETING_ABOUT_BADGE_LABEL,
  isAboutBadgeLabelSafe
} from './authSession'

/** Live registrations, so a repeat bootstrap can be detected and HMR can clean up. */
let registrations: AssetPresentationRegistration[] = []

/**
 * Registers every Omarketing contribution exactly once.
 *
 * Returns the registrations it created. A second call without an intervening
 * teardown is a no-op that returns the existing registrations, so a duplicate
 * bootstrap can never double-register a provider.
 */
export function registerOmarketingExtension(): readonly AssetPresentationRegistration[] {
  if (registrations.length > 0) return registrations

  registrations = [
    assetPresentationRegistry.register(
      createOmarketingAssetsPresentationProvider()
    )
  ]
  // Registered once, alongside the provider, so a repeat bootstrap cannot
  // produce a duplicate badge.
  registerOmarketingAboutBadge()
  return registrations
}

/**
 * Unregisters everything this module registered.
 *
 * Idempotent, and used by the HMR dispose hook so a hot reload does not leave a
 * stale provider behind.
 */
export function unregisterOmarketingExtension(): void {
  for (const registration of registrations) registration.unregister()
  registrations = []
}

/** Extension name used for the single `registerExtension` call. */
export const OMARKETING_EXTENSION_NAME = 'Comfy.Omarketing'

/**
 * Registers the static About badge through the existing extension API.
 *
 * This adds no route, view, or sidebar, and does not touch `AboutPanel.vue` or
 * its store. The label is validated first: Phase 1 ships no access control, so
 * a label implying otherwise fails closed and is not displayed.
 */
export function registerOmarketingAboutBadge(): boolean {
  if (!isAboutBadgeLabelSafe(OMARKETING_ABOUT_BADGE_LABEL)) return false

  app.registerExtension({
    name: OMARKETING_EXTENSION_NAME,
    aboutPageBadges: [
      {
        label: OMARKETING_ABOUT_BADGE_LABEL,
        url: 'https://github.com/ownuun/Omarketing',
        icon: 'pi pi-info-circle'
      }
    ]
  })
  return true
}

/** Locale keys this extension requires. The catalogs are the source of truth. */
export const OMARKETING_LOCALE_KEYS = OMARKETING_PRESENTATION_LOCALE_KEYS

export { OMARKETING_PROVIDER_ID }

registerOmarketingExtension()

if (import.meta.hot) {
  import.meta.hot.dispose(unregisterOmarketingExtension)
}
