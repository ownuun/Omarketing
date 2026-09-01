import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Responsive linear mobile is the third and last place the upstream frontend
 * renders a Comfy account control, after `TopMenuSection.vue` and
 * `WorkflowTabs.vue`. AC-1 claims zero DOM auth entry points across all three,
 * so this surface needs its own evidence.
 *
 * `MobileDisplay.vue` mounts a large linear-mode tree with heavy runtime
 * dependencies, and `LinearView.test.ts` only stubs it as a leaf, which is why
 * the contract records that file as non-substitute evidence. This suite instead
 * asserts the guard directly on the single-file component source, which is
 * exactly the property the contract constrains: the auth control is not
 * rendered, and it is suppressed by a declared flag rather than by CSS, DOM
 * mutation, or a fabricated login state.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(HERE, 'MobileDisplay.vue'), 'utf8')

describe('MobileDisplay renders no Comfy auth entry point in Phase 1', () => {
  it('declares the suppression flag locally', () => {
    // Local declaration, because a shared module would be a seventh allowlisted
    // path and core files may not import the Omarketing extension.
    expect(source).toContain('const OMARKETING_AUTH_ENTRY_SUPPRESSED = true')
  })

  it('gates the account control on the suppression flag', () => {
    const match = source.match(/<CurrentUserButton[\s\S]*?\/>/)
    expect(match).not.toBeNull()
    expect(match?.[0]).toContain('!OMARKETING_AUTH_ENTRY_SUPPRESSED')
  })

  it('renders exactly one account control site, still gated', () => {
    const occurrences = source.match(/<CurrentUserButton/g) ?? []
    expect(occurrences).toHaveLength(1)
  })

  it('keeps the upstream import so a later gateway can re-enable it', () => {
    // Deleting upstream auth capability is prohibited; only rendering stops.
    expect(source).toContain(
      "import CurrentUserButton from '@/components/topbar/CurrentUserButton.vue'"
    )
  })

  it('uses no prohibited suppression technique', () => {
    const authRegion = source.slice(
      Math.max(0, source.indexOf('<CurrentUserButton') - 400),
      source.indexOf('<CurrentUserButton') + 400
    )
    // CSS hiding, DOM mutation, and fabricated login state all fail the gate.
    expect(authRegion).not.toMatch(/display:\s*none/)
    expect(authRegion).not.toContain('MutationObserver')
    expect(source).not.toMatch(/isLoggedIn\s*=\s*true/)
  })
})
