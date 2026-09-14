import { expect, test as base } from '@playwright/test'
import { z } from 'zod'

import { ComfyPage } from '@e2e/fixtures/ComfyPage'
import { installCustomNodeBlankStartup } from '@e2e/fixtures/utils/customNodeSuite'

/** Synthetic authority only. No selection/History write interception or mocks.
 * Run with a dedicated config without the repository globalSetup/globalTeardown.
 * TLS termination must be explicitly prepared; production GET policy is HTTPS.
 */
const markerSchema = z.object({
  marker: z.literal('omarketing-local-selection-synthetic-qa-v1'),
  instance: z.string(),
  authentication: z.literal('SYNTHETIC TEST ONLY — NOT USER AUTH'),
  frontend_origin: z.string(),
  project_key: z.string().uuid(),
  workflow_locator: z.string(),
  run_key: z.string().uuid(),
  candidates: z
    .array(
      z.object({
        candidate_id: z.string(),
        reference_id: z.string(),
        filename: z.string()
      })
    )
    .length(3)
})

type Marker = z.infer<typeof markerSchema>

function isolatedOrigin(value: string | undefined): string {
  if (!value) throw new Error('OMARKETING_QA_BASE_URL is required; no fallback')
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    ['8188', '8288', '5174'].includes(url.port) ||
    url.origin !== value
  ) {
    throw new Error('Explicit isolated HTTPS loopback frontend origin required')
  }
  return value
}

const test = base.extend<{ comfyPage: ComfyPage; fixture: Marker }>({
  // Gate before navigation, settings writes, or the normal ComfyPage setup.
  fixture: async ({ request }, use) => {
    const origin = isolatedOrigin(process.env.OMARKETING_QA_BASE_URL)
    const instance = process.env.OMARKETING_QA_INSTANCE
    if (!instance) throw new Error('OMARKETING_QA_INSTANCE is required')
    if (process.env.PLAYWRIGHT_TEST_URL !== origin) {
      throw new Error('PLAYWRIGHT_TEST_URL must explicitly equal QA baseURL')
    }
    const response = await request.get(
      `${origin}/api/qa/local-selection-marker`,
      { maxRedirects: 0 }
    )
    expect(response.status()).toBe(200)
    const fixture = markerSchema.parse(await response.json())
    expect(fixture.instance).toBe(instance)
    expect(fixture.frontend_origin).toBe(origin)
    await use(fixture)
  },
  comfyPage: async ({ page, request, fixture }, use) => {
    const origin = fixture.frontend_origin
    await page.context().setExtraHTTPHeaders({
      'X-Omarketing-QA-Instance': fixture.instance
    })
    // Never contact external providers, telemetry, or any other local server.
    // This is a network DENY rule, not a fake selection response.
    await page.context().route('**/*', async (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        await route.abort('blockedbyclient')
      } else {
        await route.continue()
      }
    })
    await page.context().routeWebSocket(/.*/, async (socket) => {
      const url = new URL(socket.url())
      if (url.protocol === 'wss:' && url.host === new URL(origin).host) {
        socket.connectToServer()
      } else {
        await socket.close()
      }
    })
    await installCustomNodeBlankStartup(page)
    const comfyPage = new ComfyPage(page, request)
    // Avoid the upstream multi-user fixture and its settings/user writes.
    await comfyPage.goto()
    await comfyPage.waitForAppReady()
    await use(comfyPage)
  }
})

test.use({ ignoreHTTPSErrors: true, serviceWorkers: 'block' })

test('persists selection through reload, replaces A with B, preserves C, and rejects missing output', async ({
  comfyPage,
  fixture
}) => {
  test.setTimeout(90_000)
  const page = comfyPage.page
  const prefix = `/api/omarketing/v1/projects/${fixture.project_key}/runs/${fixture.run_key}`
  const details = page.locator(
    '[data-component-id="asset-presentation-details"] [data-provider-id="com.omarketing.assets.v1"]'
  )
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/selections/')) {
      writes.push(request.url())
    }
  })

  async function browserJson(path: string, data?: unknown) {
    // Browser fetch supplies genuine Origin/Sec-Fetch-Site; no spoofed headers.
    return page.evaluate(
      async ({ path, data }) => {
        const response = await fetch(
          path,
          data === undefined
            ? {}
            : {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              }
        )
        if (!response.ok)
          throw new Error(`QA endpoint failed: ${response.status}`)
        return response.json()
      },
      { path, data }
    )
  }

  async function inspect(candidate: string) {
    if (await comfyPage.mediaLightbox.root.isVisible()) {
      await comfyPage.mediaLightbox.closeButton.click()
    }
    await comfyPage.menu.assetsTab.open()
    await comfyPage.menu.assetsTab.waitForAssets(3)
    const record = fixture.candidates.find((r) => r.candidate_id === candidate)
    if (!record) throw new Error('Unknown synthetic candidate')
    const card = comfyPage.menu.assetsTab.assetCards.filter({
      has: page.getByRole('img', { name: record.filename, exact: true })
    })
    await expect(card).toHaveCount(1)
    await card.hover()
    await card.getByRole('button', { name: 'More options' }).click()
    await comfyPage.menu.assetsTab.contextMenuItem('Inspect asset').click()
    await expect(comfyPage.mediaLightbox.root).toBeVisible()
    await expect(details.getByText(candidate, { exact: true })).toBeVisible()
  }

  async function choose(label: string) {
    const verified = page.waitForResponse(
      (r) =>
        r.url().endsWith('/output-locators:verify') &&
        r.request().method() === 'POST'
    )
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes(`${prefix}/selections/`) &&
        r.request().method() === 'PUT'
    )
    await details.getByRole('button', { name: label, exact: true }).click()
    expect((await verified).status()).toBe(200)
    expect((await saved).status()).toBe(200)
    await expect(
      details.getByText('Saved and checked on server', { exact: true })
    ).toBeVisible()
  }

  const initial = await browserJson('/api/qa/local-selection-disk')
  expect(initial).toEqual({ revision: 0, selections: {} })
  await inspect('candidate-a')
  await choose('Select final')
  await inspect('candidate-c')
  await choose('Select final')
  const withC = await browserJson('/api/qa/local-selection-disk')
  expect(withC.revision).toBe(2)

  await page.reload()
  await comfyPage.waitForAppReady()
  await inspect('candidate-a')
  await expect(
    details.getByText('Saved and checked on server', { exact: true })
  ).toBeVisible()
  await inspect('candidate-b')
  await choose('Change to this candidate')
  const replaced = await browserJson('/api/qa/local-selection-disk')
  expect(replaced.revision).toBe(3)
  expect(replaced.selections['reference-ab']).toEqual({
    state: 'selected',
    filename: 'SYNTHETIC-QA-candidate-b.png'
  })
  expect(replaced.selections['reference-c']).toEqual(
    withC.selections['reference-c']
  )
  await test.info().attach('B-selected-C-preserved', {
    body: await page.screenshot(),
    contentType: 'image/png'
  })
  expect(writes).toHaveLength(3)

  await page.reload()
  await comfyPage.waitForAppReady()
  await inspect('candidate-b')
  await expect(
    details.getByText('Saved and checked on server', { exact: true })
  ).toBeVisible()
  await inspect('candidate-a')
  // Remove only the fixed disposable A bytes AFTER successful association.
  // The next production verify must fail; selection writes are not mocked.
  await browserJson('/api/qa/local-selection-fixture', {
    candidate_id: 'candidate-a',
    present: false
  })
  try {
    const failed = page.waitForResponse((r) =>
      r.url().endsWith('/output-locators:verify')
    )
    await details
      .getByRole('button', { name: 'Change to this candidate', exact: true })
      .click()
    expect((await failed).status()).toBe(410)
    await expect(
      details.getByText(
        'Result needs confirmation. Check selection again; do not retry blindly.',
        { exact: true }
      )
    ).toBeVisible()
    await test.info().attach('real-missing-output-no-false-confirmation', {
      body: await page.screenshot(),
      contentType: 'image/png'
    })
    await expect(
      details.getByText('Saved and checked on server', { exact: true })
    ).toHaveCount(0)
    expect(await browserJson('/api/qa/local-selection-disk')).toEqual(replaced)
    expect(writes).toHaveLength(3)
  } finally {
    await browserJson('/api/qa/local-selection-fixture', {
      candidate_id: 'candidate-a',
      present: true
    })
  }
  // Recover through real metadata reads, then exercise explicit provider retry.
  await inspect('candidate-a')
  const refresh = details.getByRole('button', {
    name: 'Check selection again',
    exact: true
  })
  await expect(refresh).toBeEnabled()
  await refresh.click()
  await expect(details.getByText('candidate-a', { exact: true })).toBeVisible()
  await expect(
    details.getByRole('button', {
      name: 'Change to this candidate',
      exact: true
    })
  ).toBeEnabled()
  expect(writes).toHaveLength(3)
  expect(await browserJson('/api/qa/local-selection-disk')).toEqual(replaced)
  await inspect('candidate-b')
  await expect(
    details.getByText('Saved and checked on server', {
      exact: true
    })
  ).toBeVisible()
  await test.info().attach('settled-B-after-error-recovery-and-reopen', {
    body: await page.screenshot(),
    contentType: 'image/png'
  })
})
