import type { Page } from '@playwright/test'
import { z } from 'zod'

import {
  ComfyPage,
  comfyExpect as expect,
  comfyPageFixture as test
} from '@e2e/fixtures/ComfyPage'
import { installCustomNodeBlankStartup } from '@e2e/fixtures/utils/customNodeSuite'

const markerSchema = z.object({
  marker: z.literal('omarketing-real-owner-native-history-adapter-v1'),
  authentication: z.literal('ARGON2 SESSION — ISOLATED TEST CREDENTIAL'),
  project_key: z.string().uuid(),
  run_key: z.string().uuid(),
  test_handoff_ack_mode: z.enum(['none', 'accepted', 'failed_hold']),
  candidates: z
    .array(
      z.object({
        candidate_id: z.string(),
        reference_id: z.string(),
        filename: z.string()
      })
    )
    .min(2)
})
const diskSchema = z.object({
  revision: z.number().int().nonnegative(),
  selections: z.record(
    z.string(),
    z.object({ filename: z.string(), state: z.literal('selected') })
  )
})

function isolatedOrigin(value: string | undefined): string {
  if (!value) throw new Error('OMARKETING_QA_BASE_URL is required')
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    ['8188', '8288', '5174'].includes(url.port) ||
    url.origin !== value
  ) {
    throw new Error('explicit isolated HTTPS loopback origin required')
  }
  return value
}

async function login(page: Page, password: string) {
  await page.goto('/auth/login')
  await expect(
    page.getByRole('heading', { name: 'Omarketing access' })
  ).toBeVisible()
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/')
}

test.use({ ignoreHTTPSErrors: true, serviceWorkers: 'block', trace: 'on' })

test('actual owner login selects and reselects a native-History-backed still after logout', async ({
  page,
  request
}) => {
  test.setTimeout(90_000)
  const origin = isolatedOrigin(process.env.OMARKETING_QA_BASE_URL)
  const password = process.env.OMARKETING_QA_PASSWORD
  if (!password) throw new Error('isolated synthetic QA password is required')
  if (process.env.PLAYWRIGHT_TEST_URL !== origin) {
    throw new Error(
      'PLAYWRIGHT_TEST_URL must equal the isolated gateway origin'
    )
  }

  await page.context().route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      await route.abort('blockedbyclient')
    } else {
      await route.continue()
    }
  })
  await page.context().routeWebSocket(/.*/, async (socket) => {
    if (new URL(socket.url()).origin === origin.replace('https:', 'wss:')) {
      socket.connectToServer()
    } else {
      await socket.close()
    }
  })
  await installCustomNodeBlankStartup(page)
  await login(page, password)
  const markerResponse = await page.request.get(
    '/api/qa/real-owner-selection-marker'
  )
  expect(markerResponse.status()).toBe(200)
  const marker = markerSchema.parse(await markerResponse.json())
  const sharedReference = marker.candidates.find(
    (candidate) =>
      marker.candidates.filter(
        (other) => other.reference_id === candidate.reference_id
      ).length >= 2
  )?.reference_id
  expect(sharedReference).toBeTruthy()
  const sameReference = marker.candidates.filter(
    (candidate) => candidate.reference_id === sharedReference
  )
  expect(sameReference).toHaveLength(2)

  const comfyPage = new ComfyPage(page, request)
  await comfyPage.waitForAppReady()
  const details = page.locator(
    '[data-component-id="asset-presentation-details"] [data-provider-id="com.omarketing.assets.v1"]'
  )
  const savedState = details
    .getByRole('term')
    .filter({ hasText: /^Saved and checked on server$/ })
  const expectedTestState = {
    none: 'Request verified; acknowledgement unconfirmed. Do not resend.',
    accepted: 'Local simulated TEST accepted; not published',
    failed_hold:
      'Local simulated TEST held after failure; original request preserved'
  }[marker.test_handoff_ack_mode]

  async function inspect(filename: string) {
    if (await comfyPage.mediaLightbox.root.isVisible()) {
      await comfyPage.mediaLightbox.closeButton.click()
    }
    await comfyPage.menu.assetsTab.open()
    await comfyPage.menu.assetsTab.waitForAssets(marker.candidates.length)
    const card = comfyPage.menu.assetsTab.assetCards.filter({
      has: page.getByRole('img', { name: filename, exact: true })
    })
    await expect(card).toHaveCount(1)
    const inspectItem =
      comfyPage.menu.assetsTab.contextMenuItem('Inspect asset')
    for (let attempt = 0; attempt < 3; attempt++) {
      await card.hover()
      await card.getByRole('button', { name: 'More options' }).click()
      if (await inspectItem.isVisible()) break
    }
    await expect(inspectItem).toBeVisible()
    await inspectItem.click()
    await expect(comfyPage.mediaLightbox.root).toBeVisible()
  }

  await inspect(sameReference[0].filename)
  await details
    .getByRole('button', { name: 'Select final', exact: true })
    .click()
  await expect(savedState).toBeVisible()
  await expect(
    details
      .getByRole('term')
      .filter({ hasText: /^Fixed fixture copy \(read-only\)$/ })
  ).toBeVisible()
  await expect(
    details.getByText('synthetic approved fixture copy', { exact: true })
  ).toBeVisible()
  await details
    .getByRole('button', { name: 'Create local simulated TEST', exact: true })
    .click()
  await expect(
    details.getByRole('term').filter({ hasText: expectedTestState })
  ).toHaveCount(2)
  await inspect(sameReference[1].filename)
  await details
    .getByRole('button', { name: 'Change to this candidate', exact: true })
    .click()
  await expect(savedState).toBeVisible()
  await expect(
    details
      .getByRole('term')
      .filter({ hasText: /^No TEST request for the current selection$/ })
  ).toBeVisible()

  const logout = await page.evaluate(async () => {
    const response = await fetch('/auth/logout', { method: 'POST' })
    return response.status
  })
  expect(logout).toBe(200)
  expect(
    (await page.request.get('/api/qa/real-owner-selection-marker')).status()
  ).toBe(401)
  await login(page, password)
  await comfyPage.waitForAppReady()
  await inspect(sameReference[1].filename)
  await expect(savedState).toBeVisible()
  await expect(
    details.getByRole('heading', {
      name: 'Previous selection TEST history',
      exact: true
    })
  ).toBeVisible()
  const disk = diskSchema.parse(
    await (await page.request.get('/api/qa/real-owner-selection-disk')).json()
  )
  expect(disk.revision).toBe(2)
  expect(disk.selections[sharedReference!]).toEqual({
    filename: sameReference[1].filename,
    state: 'selected'
  })
})
