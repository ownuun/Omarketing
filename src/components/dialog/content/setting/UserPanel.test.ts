import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The Settings panel is a separate auth entry point from the two top bars and
 * the mobile display, so AC-1's "zero settings sign-in entry" needs its own
 * evidence.
 *
 * `UserPanel.vue` pulls in the full settings dialog stack, so this suite asserts
 * the guard on the single-file component source, which is the property the
 * contract constrains: the logged-out sign-in description, button, and handler
 * are suppressed together by a declared flag, and the logged-in branch is left
 * alone.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(HERE, 'UserPanel.vue'), 'utf8')

describe('UserPanel renders no Settings sign-in entry point in Phase 1', () => {
  it('declares the suppression flag locally', () => {
    expect(source).toContain('const OMARKETING_AUTH_ENTRY_SUPPRESSED = true')
  })

  it('gates the whole logged-out login section, not just the button', () => {
    // Suppressing only the button would leave an orphaned "sign in" prompt.
    expect(source).toMatch(
      /v-else-if="!OMARKETING_AUTH_ENTRY_SUPPRESSED"[\s\S]{0,200}auth\.login\.title/
    )
  })

  it('keeps the sign-in handler and its call site together', () => {
    // The handler stays in source so a later gateway can re-enable the section,
    // but its only call site sits inside the suppressed branch.
    expect(source).toContain('handleSignIn')
    const suppressedBranch = source.slice(
      source.indexOf('v-else-if="!OMARKETING_AUTH_ENTRY_SUPPRESSED"')
    )
    expect(suppressedBranch).toContain('@click="handleSignIn"')
  })

  it('does not touch the logged-in branch', () => {
    // Only the logged-out entry point is in scope; account display for an
    // already-authenticated session is upstream behavior.
    expect(source).toContain('auth.login.signInOrSignUp')
    expect(source).not.toMatch(/isLoggedIn\s*=\s*true/)
  })

  it('uses no prohibited suppression technique', () => {
    expect(source).not.toMatch(/display:\s*none/)
    expect(source).not.toContain('MutationObserver')
  })
})
