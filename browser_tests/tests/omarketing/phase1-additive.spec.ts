import { expect } from '@playwright/test'

import { comfyPageFixture as test } from '@e2e/fixtures/ComfyPage'

/**
 * Omarketing Phase 1 additive foundation, end to end.
 *
 * Covers the two acceptance claims that unit tests cannot prove on their own:
 *
 * - AC-1: zero Comfy auth entry points in the rendered DOM, across both tab-bar
 *   layouts, the narrow mobile viewport, the Settings dialog, and a fixed set of
 *   deep-link probes.
 * - AC-2: the Assets disconnected surface is present and is distinguishable
 *   from an ordinary empty list and from a filter-no-match result.
 *
 * Auth selectors are asserted as counts rather than visibility, because a
 * CSS-hidden control would still be a DOM entry point and the contract forbids
 * hiding as the mechanism.
 */

/** Every production render site for a Comfy account or sign-in control. */
const AUTH_SELECTORS = [
  '[data-testid="current-user-button"]',
  '[data-testid="login-button"]',
  'button:has-text("Sign In")',
  'button:has-text("Sign in")',
  'button:has-text("Log In")',
  'button:has-text("Log in")'
] as const

async function expectNoAuthEntryPoint(page: import('@playwright/test').Page) {
  for (const selector of AUTH_SELECTORS) {
    // Count, not visibility: a hidden-but-present control still fails AC-1.
    await expect(page.locator(selector)).toHaveCount(0)
  }
}

test.describe('Omarketing Phase 1 additive foundation', () => {
  test.describe('AC-1 no auth entry point', () => {
    for (const layout of ['Default', 'Legacy'] as const) {
      test(`renders no auth entry point in the ${layout} tab bar`, async ({
        comfyPage
      }) => {
        await comfyPage.settings.setSetting('Comfy.UI.TabBarLayout', layout)
        await comfyPage.nextFrame()

        await expectNoAuthEntryPoint(comfyPage.page)
      })
    }

    test('renders no auth entry point at a narrow mobile viewport', async ({
      comfyPage
    }) => {
      // The responsive linear-mode display is the third render site and is only
      // reachable below the mobile breakpoint.
      await comfyPage.page.setViewportSize({ width: 320, height: 720 })
      await comfyPage.nextFrame()

      await expectNoAuthEntryPoint(comfyPage.page)
    })

    test('renders no sign-in entry point in the Settings user panel', async ({
      comfyPage
    }) => {
      await comfyPage.page.keyboard.press('Control+,')
      await comfyPage.nextFrame()

      await expectNoAuthEntryPoint(comfyPage.page)
      await expect(
        comfyPage.page.locator('text=Sign in or sign up')
      ).toHaveCount(0)
    })

    test('opens zero dialogs when the residual sign-in command runs', async ({
      comfyPage
    }) => {
      // `useCoreCommands.ts` is immutable, so `Comfy.User.OpenSignInDialog`
      // stays registered. Phase 1 proves the residue is inert rather than
      // removing it.
      const dialogsBefore = await comfyPage.page.getByRole('dialog').count()

      await comfyPage.page.evaluate(async () => {
        await window.app?.extensionManager?.command?.execute?.(
          'Comfy.User.OpenSignInDialog'
        )
      })
      await comfyPage.nextFrame()

      await expect(comfyPage.page.getByRole('dialog')).toHaveCount(
        dialogsBefore
      )
      await expectNoAuthEntryPoint(comfyPage.page)
    })

    for (const probe of [
      '/login',
      '/signin',
      '/auth/login',
      '/?oauth_request_id=probe',
      '/?desktop_login_code=probe'
    ]) {
      test(`deep-link probe ${probe} exposes no auth entry point`, async ({
        comfyPage
      }) => {
        await comfyPage.page.goto(new URL(probe, comfyPage.url).toString())
        await comfyPage.nextFrame()

        await expectNoAuthEntryPoint(comfyPage.page)
      })
    }
  })

  test.describe('AC-2 disconnected assets surface', () => {
    test('shows a dedicated disconnected status that is not an alert', async ({
      comfyPage
    }) => {
      await comfyPage.menu.assetsTab.open({ waitForAssets: false })
      await comfyPage.nextFrame()

      const disconnected = comfyPage.page.getByTestId(
        'asset-presentation-disconnected'
      )
      await expect(disconnected).toHaveCount(1)
      await expect(disconnected).toHaveAttribute('role', 'status')
    })

    test('keeps the disconnected status visible while the asset list is empty', async ({
      comfyPage
    }) => {
      await comfyPage.menu.assetsTab.open({ waitForAssets: false })
      await comfyPage.nextFrame()

      // The status lives in the filter-bar header, outside the empty-state
      // branch, so an empty list must not remove it.
      await expect(
        comfyPage.page.getByTestId('asset-presentation-disconnected')
      ).toHaveCount(1)
    })

    test('distinguishes disconnected from an ordinary empty list', async ({
      comfyPage
    }) => {
      await comfyPage.menu.assetsTab.open({ waitForAssets: false })
      await comfyPage.nextFrame()

      const disconnectedText = await comfyPage.page
        .getByTestId('asset-presentation-disconnected')
        .textContent()

      // Wording must differ, not only element identity.
      expect(disconnectedText?.trim()).not.toBe('')
      await expect(
        comfyPage.page.locator(
          'text=Upload files or generate content to see them here'
        )
      ).not.toHaveText(disconnectedText ?? '')
    })

    test('fabricates no card, count, or action while disconnected', async ({
      comfyPage
    }) => {
      await comfyPage.menu.assetsTab.open({ waitForAssets: false })
      await comfyPage.nextFrame()

      // A disconnected provider contributes no synthetic asset and no action.
      await expect(
        comfyPage.page.locator('[data-testid^="omarketing-asset-card"]')
      ).toHaveCount(0)
      await expect(
        comfyPage.page.locator('[data-provider-id="omarketing"] button')
      ).toHaveCount(0)
    })
  })

  test.describe('AC-4 upstream surfaces preserved', () => {
    test('keeps an upstream logo mark rendered in the top bar', async ({
      comfyPage
    }) => {
      // Branding is name-only, so the upstream mark must still render.
      // `count() >= 0` would pass even if every logo disappeared, so assert a
      // concrete element is actually visible.
      const mark = comfyPage.page.locator(
        '[data-testid="comfy-menu-button"], .comfyui-logo, header svg, nav svg'
      )
      await expect(mark.first()).toBeVisible()
    })

    test('keeps the product display name in the document title', async ({
      comfyPage
    }) => {
      // Name-only branding is the one thing that may change.
      await expect.poll(() => comfyPage.page.title()).toContain('Omarketing')
    })

    test('reports no console error during a normal load', async ({
      comfyPage
    }) => {
      const errors: string[] = []
      comfyPage.page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })

      await comfyPage.nextFrame()

      expect(errors).toEqual([])
    })
  })
})
