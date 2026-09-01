import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `app.registerExtension` reaches the extension service, which needs a live
// Pinia store. The badge contract under test is what gets registered, not how
// the store persists it.
const { registerExtension } = vi.hoisted(() => ({
  registerExtension: vi.fn()
}))
vi.mock('@/scripts/app', () => ({ app: { registerExtension } }))

import { assetPresentationRegistry } from '@/platform/assets/presentation/assetPresentationRegistry'

import {
  OMARKETING_ABOUT_BADGE_LABEL,
  PROHIBITED_ABOUT_BADGE_TERMS,
  isAboutBadgeLabelSafe
} from './authSession'
import {
  OMARKETING_EXTENSION_NAME,
  OMARKETING_LOCALE_KEYS,
  OMARKETING_PROVIDER_ID,
  registerOmarketingAboutBadge,
  registerOmarketingExtension,
  unregisterOmarketingExtension
} from './index'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..')
const readJson = (rel: string) =>
  JSON.parse(readFileSync(resolve(REPO_ROOT, rel), 'utf8')) as Record<
    string,
    unknown
  >

function flatten(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix]
  return Object.entries(node).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key)
  )
}

function lookup(catalog: Record<string, unknown>, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      catalog
    )
}

describe('Omarketing bootstrap registration', () => {
  beforeEach(() => {
    // The module registered once on import; start each test from a known state.
    unregisterOmarketingExtension()
  })

  it('registers the provider exactly once', () => {
    registerOmarketingExtension()

    const matching = assetPresentationRegistry
      .snapshot()
      .filter((provider) => provider.id === OMARKETING_PROVIDER_ID)
    expect(matching).toHaveLength(1)
  })

  it('does not double-register on a repeated bootstrap', () => {
    const first = registerOmarketingExtension()
    const second = registerOmarketingExtension()

    expect(second).toBe(first)
    expect(
      assetPresentationRegistry
        .snapshot()
        .filter((provider) => provider.id === OMARKETING_PROVIDER_ID)
    ).toHaveLength(1)
  })

  it('removes its registration on teardown, and teardown is idempotent', () => {
    registerOmarketingExtension()
    unregisterOmarketingExtension()

    expect(
      assetPresentationRegistry
        .snapshot()
        .filter((provider) => provider.id === OMARKETING_PROVIDER_ID)
    ).toHaveLength(0)

    expect(() => unregisterOmarketingExtension()).not.toThrow()
  })

  it('wires teardown into the HMR dispose hook', async () => {
    // The stale-provider risk on hot reload is that the replacement module body
    // registers while the previous one never tore down. A faithful end-to-end
    // reload cannot be simulated here: `vi.resetModules()` also resets the
    // registry module, so a re-imported `index.ts` would register into a
    // different singleton than this file holds, which is not what Vite does
    // (it invalidates only the changed module). What is testable, and what the
    // simulated-reload test below cannot show, is that teardown is actually
    // wired to the dispose hook rather than merely exported.
    const source = readFileSync(resolve(HERE, 'index.ts'), 'utf8')

    expect(source).toMatch(
      /import\.meta\.hot[\s\S]{0,80}dispose\(unregisterOmarketingExtension\)/
    )
  })

  it('leaves no stale provider across a simulated hot reload', () => {
    registerOmarketingExtension()
    // An HMR dispose runs teardown before the new module body registers again.
    unregisterOmarketingExtension()
    registerOmarketingExtension()

    expect(
      assetPresentationRegistry
        .snapshot()
        .filter((provider) => provider.id === OMARKETING_PROVIDER_ID)
    ).toHaveLength(1)
  })

  it('registers nothing beyond the one Assets presentation provider', () => {
    const before = assetPresentationRegistry.snapshot().length
    unregisterOmarketingExtension()
    const without = assetPresentationRegistry.snapshot().length
    registerOmarketingExtension()
    const after = assetPresentationRegistry.snapshot().length

    expect(before - without).toBeLessThanOrEqual(1)
    expect(after - without).toBe(1)
  })
})

describe('About badge (AC-12)', () => {
  beforeEach(() => {
    registerExtension.mockClear()
    unregisterOmarketingExtension()
  })

  it('registers the badge exactly once through the existing extension API', () => {
    registerOmarketingExtension()
    registerOmarketingExtension()

    expect(registerExtension).toHaveBeenCalledTimes(1)
    const [payload] = registerExtension.mock.calls[0] ?? []
    expect(payload?.name).toBe(OMARKETING_EXTENSION_NAME)
    expect(payload?.aboutPageBadges).toHaveLength(1)
    expect(payload?.aboutPageBadges?.[0]?.url).toBe(
      'https://github.com/ownuun/Omarketing'
    )
  })

  it('does not claim the build is authenticated, protected, or secure', () => {
    // Phase 1 hides the sign-in controls but ships no gateway, session, or
    // access control. A badge implying otherwise is a security misstatement.
    const lower = OMARKETING_ABOUT_BADGE_LABEL.toLowerCase()
    for (const term of PROHIBITED_ABOUT_BADGE_TERMS) {
      expect(lower).not.toContain(term)
    }
  })

  it('states both true facts: no external account and no access control', () => {
    const lower = OMARKETING_ABOUT_BADGE_LABEL.toLowerCase()
    expect(lower).toContain('no external account')
    expect(lower).toContain('no access control')
  })

  it('fails closed on an unsafe label instead of displaying it', () => {
    expect(isAboutBadgeLabelSafe(OMARKETING_ABOUT_BADGE_LABEL)).toBe(true)
    for (const term of PROHIBITED_ABOUT_BADGE_TERMS) {
      expect(isAboutBadgeLabelSafe(`Omarketing ${term}`)).toBe(false)
    }
  })

  it('reports success only when it actually registered', () => {
    // The direct entry point returns whether the badge was published, so a
    // rejected label can never be mistaken for a successful registration.
    expect(registerOmarketingAboutBadge()).toBe(true)
    expect(registerExtension).toHaveBeenCalledTimes(1)
  })

  it('registers no route, view, sidebar, or command', () => {
    registerOmarketingExtension()

    const [payload] = registerExtension.mock.calls[0] ?? []
    for (const key of ['commands', 'keybindings', 'menuCommands', 'settings']) {
      expect(payload?.[key]).toBeUndefined()
    }
    expect(Object.keys(payload ?? {}).sort()).toEqual([
      'aboutPageBadges',
      'name'
    ])
  })
})

describe('Omarketing locale contribution', () => {
  const en = readJson('src/locales/en/main.json')
  const ko = readJson('src/locales/ko/main.json')

  it('resolves every declared key in both catalogs', () => {
    for (const dotted of Object.values(OMARKETING_LOCALE_KEYS)) {
      expect(lookup(en, dotted), `${dotted} missing from en`).toBeTypeOf(
        'string'
      )
      expect(lookup(ko, dotted), `${dotted} missing from ko`).toBeTypeOf(
        'string'
      )
    }
  })

  it('keeps the generic disconnected key present in both catalogs', () => {
    // Contributed by the generic presentation host, not by the provider.
    for (const catalog of [en, ko]) {
      expect(
        lookup(catalog, 'assetPresentation.providerDisconnected')
      ).toBeTypeOf('string')
    }
  })

  it('has no duplicate key path inside the omarketing namespace', () => {
    const paths = flatten(en.omarketing, 'omarketing')
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('pairs every omarketing key across en and ko', () => {
    const enPaths = new Set(flatten(en.omarketing, 'omarketing'))
    const koPaths = new Set(flatten(ko.omarketing, 'omarketing'))
    expect([...enPaths].sort()).toEqual([...koPaths].sort())
  })

  it('uses distinct text for disconnected and for an ordinary empty list', () => {
    // AC-2 requires the disconnected surface to be distinguishable from a
    // normal zero-asset state in wording, not only in element identity.
    const disconnected = lookup(
      en,
      OMARKETING_LOCALE_KEYS.disconnectedMessage
    ) as string
    const emptyList = lookup(en, 'sideToolbar.noFilesFoundMessage') as string
    const filterNoMatch = lookup(
      en,
      'sideToolbar.mediaAssets.filterNoMatches'
    ) as string

    expect(disconnected).not.toBe(emptyList)
    expect(disconnected).not.toBe(filterNoMatch)
    expect(emptyList).not.toBe(filterNoMatch)
  })
})
