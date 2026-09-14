import { describe, expect, it, vi } from 'vitest'

import type {
  AssetPresentationContext,
  AssetPresentationProvider,
  AssetPresentationTarget,
  MetadataState,
  PresentationAction
} from '@/platform/assets/presentation/assetPresentationRegistry'

import {
  OMARKETING_DEMO_ASSET_ID,
  OMARKETING_FIXTURE_LOCALE_KEYS,
  createOmarketingAssetsPresentationProvider,
  createOmarketingFixtureAssetsPresentationProvider
} from './assetsPresentation'

function target(
  assetId: string,
  tab: 'input' | 'output' = 'output'
): AssetPresentationTarget {
  return {
    assetId,
    asset: { id: assetId } as AssetPresentationTarget['asset'],
    tab,
    outputLocatorCandidate: null
  }
}

const context = {
  environment: 'localhost',
  workflowLocator: null,
  projectKey: null,
  runKey: null,
  signal: new AbortController().signal
} as AssetPresentationContext

async function metadataFor(
  provider: AssetPresentationProvider,
  asset = target(OMARKETING_DEMO_ASSET_ID)
): Promise<MetadataState> {
  const [entry] = await provider.loadMetadataBatch({
    targets: [asset],
    context
  })
  return entry!.state
}

function action(
  provider: AssetPresentationProvider,
  id: string
): PresentationAction {
  return provider.actions.find((candidate) => candidate.id === id)!
}

function actionContext(
  asset: AssetPresentationTarget,
  metadata: MetadataState
) {
  return { target: asset, metadata, context }
}

function readyDetail(metadata: MetadataState) {
  expect(metadata.status).toBe('ready')
  return (metadata as Extract<MetadataState, { status: 'ready' }>).detail
}

import { createSelectionApi } from './selectionApi'
import type { SelectionApi } from './selectionApi'
import type { TestHandoffApi } from './testHandoffApi'

function batchAssets(count: number): AssetPresentationTarget[] {
  return Array.from({ length: count }, (_, i) => ({
    ...target(`asset-${i}`),
    outputLocatorCandidate: {
      job_id: `job-${i}`,
      node_id: '42',
      directory_type: 'output',
      subfolder: '',
      filename: `${i}.txt`,
      media_type: 'text',
      asset_id: null
    }
  }))
}

describe('default local selection provider', () => {
  it('maps Comfy collection media names to canonical selection media types', async () => {
    let mediaType: string | undefined
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        if (!String(url).endsWith('candidate-associations:resolve'))
          throw new Error('unexpected request')
        const body = JSON.parse(String(init?.body)) as {
          targets: { correlation_id: string; media_type: string }[]
        }
        mediaType = body.targets[0]?.media_type
        return new Response(
          JSON.stringify({
            schema_version: 1,
            results: [{ correlation_id: 't0', status: 'not-applicable' }]
          }),
          { status: 200 }
        )
      }
    )
    const asset: AssetPresentationTarget = {
      ...target('image-asset'),
      outputLocatorCandidate: {
        job_id: 'job',
        node_id: '1',
        directory_type: 'output',
        subfolder: 'safe',
        filename: 'image.png',
        media_type: 'images',
        asset_id: null
      }
    }
    const provider = createOmarketingAssetsPresentationProvider(
      createSelectionApi(fetcher)
    )

    await provider.loadMetadataBatch({ targets: [asset], context })

    expect(mediaType).toBe('image')
  })

  it('maps 100 bound results across chunks and deduplicates the same-run manifest read', async () => {
    const binding = {
      project_key: '11111111-1111-4111-8111-111111111111',
      workflow_locator: 'workflows/Brand/main.json',
      run_key: '22222222-2222-4222-8222-222222222222',
      reference_id: 'ref',
      candidate_id: 'candidate'
    }
    let reads = 0
    const sizes: number[] = []
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith('candidate-associations:resolve')) {
          const body = JSON.parse(String(init?.body)) as {
            targets: {
              correlation_id: string
              job_id: string
              filename: string
            }[]
          }
          sizes.push(body.targets.length)
          return new Response(
            JSON.stringify({
              schema_version: 1,
              results: body.targets
                .map((t) => ({
                  correlation_id: t.correlation_id,
                  status: 'bound',
                  binding: { ...binding, candidate_id: t.job_id },
                  output: {
                    job_id: t.job_id,
                    node_id: '42',
                    filename: t.filename,
                    media_type: 'text',
                    sha256: 'a'.repeat(64),
                    size_bytes: 1,
                    mime_type: 'text/plain'
                  }
                }))
                .reverse()
            }),
            { status: 200 }
          )
        }
        reads++
        return new Response(
          JSON.stringify({
            schema_version: 1,
            project_key: binding.project_key,
            workflow_locator: binding.workflow_locator,
            run_key: binding.run_key,
            revision: 0,
            selections: []
          }),
          { status: 200 }
        )
      }
    )
    const provider = createOmarketingAssetsPresentationProvider(
      createSelectionApi(fetcher)
    )
    const entries = await provider.loadMetadataBatch({
      targets: batchAssets(100),
      context
    })
    expect(sizes).toEqual([64, 36])
    expect(reads).toBe(1)
    expect(entries).toHaveLength(100)
    entries.forEach((entry, i) => {
      expect(entry.assetId).toBe(`asset-${i}`)
      expect(
        readyDetail(entry.state).sections[0].fields.find(
          (f) => f.id === 'candidate'
        )?.value
      ).toBe(`job-${i}`)
    })
  })
  it.for([401, 403, 503, 'correlation'] as const)(
    'fails closed when the second API chunk returns %s',
    async (failure) => {
      const assets = batchAssets(100)
      const sizes: number[] = []
      const fetcher = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as {
            targets: { correlation_id: string }[]
          }
          sizes.push(body.targets.length)
          if (sizes.length === 2 && typeof failure === 'number')
            return new Response('{}', { status: failure })
          return new Response(
            JSON.stringify({
              schema_version: 1,
              results: body.targets.map((t) => ({
                correlation_id: sizes.length === 2 ? 't0' : t.correlation_id,
                status: 'not-applicable'
              }))
            }),
            { status: 200 }
          )
        }
      )
      const provider = createOmarketingAssetsPresentationProvider(
        createSelectionApi(fetcher)
      )
      const entries = await provider.loadMetadataBatch({
        targets: assets,
        context
      })
      expect(sizes).toEqual([64, 36])
      expect(entries).toEqual(
        assets.map((asset) => ({
          assetId: asset.assetId,
          state: {
            status: 'error',
            safeMessageKey: `omarketing.assets.selection.${failure === 401 || failure === 403 ? 'authRequired' : 'unavailable'}`
          }
        }))
      )
    }
  )
  it.for([0, 1, 2])(
    'aborts a 100-target load at chunk %s without later requests',
    async (abortAt) => {
      const controller = new AbortController()
      let calls = 0
      const fetcher = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit) => {
          expect(init?.signal).toBe(controller.signal)
          const body = JSON.parse(String(init?.body)) as {
            targets: { correlation_id: string }[]
          }
          if (++calls === abortAt) controller.abort()
          return new Response(
            JSON.stringify({
              schema_version: 1,
              results: body.targets.map((t) => ({
                correlation_id: t.correlation_id,
                status: 'not-applicable'
              }))
            }),
            { status: 200 }
          )
        }
      )
      if (abortAt === 0) controller.abort()
      const provider = createOmarketingAssetsPresentationProvider(
        createSelectionApi(fetcher)
      )
      await expect(
        provider.loadMetadataBatch({
          targets: batchAssets(100),
          context: { ...context, signal: controller.signal }
        })
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(calls).toBe(abortAt)
    }
  )
  it('does not issue an empty association batch', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const provider = createOmarketingAssetsPresentationProvider(
      createSelectionApi(fetcher)
    )
    expect(await provider.loadMetadataBatch({ targets: [], context })).toEqual(
      []
    )
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.for([64, 65, 100])(
    'chunks %s targets through the real API parser with identity correlation',
    async (count) => {
      const assets = batchAssets(count)
      const batches: number[] = []
      const correlations: string[] = []
      const fetcher = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as {
            targets: { correlation_id: string; filename: string }[]
          }
          batches.push(body.targets.length)
          correlations.push(...body.targets.map((t) => t.correlation_id))
          return new Response(
            JSON.stringify({
              schema_version: 1,
              results: body.targets
                .map((t) => ({
                  correlation_id: t.correlation_id,
                  status:
                    Number.parseInt(t.filename) % 2
                      ? 'unavailable'
                      : 'not-applicable'
                }))
                .reverse()
            }),
            { status: 200 }
          )
        }
      )
      const provider = createOmarketingAssetsPresentationProvider(
        createSelectionApi(fetcher)
      )
      const entries = await provider.loadMetadataBatch({
        targets: assets,
        context
      })
      expect(batches).toEqual(count <= 64 ? [count] : [64, count - 64])
      expect(new Set(correlations).size).toBe(count)
      expect(entries).toEqual(
        assets.map((asset, i) => ({
          assetId: asset.assetId,
          state:
            i % 2
              ? {
                  status: 'error',
                  safeMessageKey: 'omarketing.assets.selection.unavailable'
                }
              : { status: 'not-applicable' }
        }))
      )
    }
  )
  it('association → GET → explicit select → GET; new provider restores server state', async () => {
    const binding = {
      project_key: '11111111-1111-4111-8111-111111111111',
      workflow_locator: 'workflows/Brand/main.json',
      run_key: '22222222-2222-4222-8222-222222222222',
      reference_id: 'ref',
      candidate_id: 'candidate'
    }
    const output = {
      job_id: 'job',
      node_id: '42',
      filename: 'x.txt',
      media_type: 'text',
      sha256: 'a'.repeat(64),
      size_bytes: 1,
      mime_type: 'text/plain'
    }
    const asset = {
      ...target('not-a-server-id'),
      outputLocatorCandidate: {
        job_id: 'job',
        node_id: '42',
        directory_type: 'output' as const,
        subfolder: 'private',
        filename: 'x.txt',
        media_type: 'text',
        asset_id: null
      }
    }
    let revision = 0
    const methods: string[] = []
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        methods.push(init!.method!)
        const path = String(url)
        const response = path.endsWith('candidate-associations:resolve')
          ? {
              schema_version: 1,
              results: [
                { correlation_id: 't0', status: 'bound', binding, output }
              ]
            }
          : path.endsWith('output-locators:verify')
            ? {
                schema_version: 1,
                revision,
                reference_id: 'ref',
                candidate_id: 'candidate',
                output
              }
            : init!.method === 'PUT'
              ? {
                  schema_version: 1,
                  revision: ++revision,
                  reference_id: 'ref',
                  candidate_id: 'candidate',
                  output
                }
              : path.endsWith(':revalidate')
                ? { schema_version: 1, revision }
                : {
                    schema_version: 1,
                    project_key: binding.project_key,
                    workflow_locator: binding.workflow_locator,
                    run_key: binding.run_key,
                    revision,
                    selections: revision
                      ? [
                          {
                            reference_id: 'ref',
                            candidate_id: 'candidate',
                            state: 'selected',
                            availability: 'bound',
                            selected_at: 'stamp',
                            updated_at: 'stamp',
                            output
                          }
                        ]
                      : []
                  }
        return new Response(JSON.stringify(response), { status: 200 })
      }
    )
    const provider = createOmarketingAssetsPresentationProvider(
      createSelectionApi(fetcher)
    )
    const before = await metadataFor(provider, asset)
    expect(
      action(provider, 'select-final').isAvailable(actionContext(asset, before))
    ).toBe(true)
    expect(
      (
        await action(provider, 'select-final').execute(
          actionContext(asset, before)
        )
      ).status
    ).toBe('succeeded')
    expect(methods).toEqual(['POST', 'GET', 'POST', 'PUT', 'GET'])
    const restoredProvider = createOmarketingAssetsPresentationProvider(
      createSelectionApi(fetcher)
    )
    const restored = await metadataFor(restoredProvider, asset)
    expect(
      readyDetail(restored).sections[0].fields.some(
        (f) => f.labelKey === 'omarketing.assets.selection.confirmed'
      )
    ).toBe(true)
    expect(
      action(restoredProvider, 'select-final').isAvailable(
        actionContext(asset, restored)
      )
    ).toBe(false)
    expect(methods.slice(-4)).toEqual(['POST', 'GET', 'POST', 'GET'])
  })
  it('never registers fixture Pass/Delete/Auto; requests no missing output locator', async () => {
    const provider = createOmarketingAssetsPresentationProvider()
    expect(provider.actions.map((a) => a.id)).toEqual([
      'select-final',
      'reselect-final',
      'refresh-selection',
      'omarketing-local-test-handoff'
    ])
    expect(await metadataFor(provider, target('ordinary-output'))).toEqual({
      status: 'not-applicable'
    })
  })

  it('creates a local TEST only from a confirmed selection and reads back its simulated result', async () => {
    const binding = {
      project_key: '11111111-1111-4111-8111-111111111111',
      workflow_locator: 'workflows/Brand/main.json',
      run_key: '22222222-2222-4222-8222-222222222222',
      reference_id: 'ref',
      candidate_id: 'candidate'
    }
    const output = {
      job_id: 'job',
      node_id: '42',
      filename: 'image.png',
      media_type: 'image',
      sha256: 'a'.repeat(64),
      size_bytes: 1,
      mime_type: 'image/png'
    }
    const selection: SelectionApi = {
      associate: async () => ({
        schema_version: 1,
        results: [{ correlation_id: 't0', status: 'bound', binding, output }]
      }),
      read: async () => ({
        schema_version: 1,
        project_key: binding.project_key,
        workflow_locator: binding.workflow_locator,
        run_key: binding.run_key,
        revision: 1,
        selections: [
          {
            reference_id: binding.reference_id,
            selected_at: 'stamp',
            updated_at: 'stamp',
            state: 'selected',
            availability: 'bound',
            candidate_id: binding.candidate_id,
            output
          }
        ]
      }),
      revalidate: async () => ({ schema_version: 1, revision: 1 }),
      select: async () => ({
        status: 'confirmed',
        manifest: await selection.read(binding, context.signal)
      })
    }
    const projection = {
      schema_version: 1 as const,
      mode: 'local_test' as const,
      simulated: true as const,
      scope: {
        project_key: binding.project_key,
        workflow_locator: binding.workflow_locator,
        run_key: binding.run_key,
        reference_id: binding.reference_id
      },
      fixture_copy: {
        title: '',
        body: 'synthetic approved fixture copy',
        cta: null
      },
      current: {
        manifest_revision: 1,
        selection_state: 'selected' as const,
        candidate_id: binding.candidate_id,
        activation_correlation_id: null,
        outcome: 'empty' as const
      },
      history: [],
      publication_job_id: null
    }
    const accepted = {
      ...projection,
      current: {
        ...projection.current,
        activation_correlation_id: '3a000000-0000-4000-8000-000000000003',
        outcome: 'accepted' as const
      }
    }
    let created = false
    const testApi: TestHandoffApi = {
      read: vi.fn(async () => (created ? accepted : projection)),
      create: vi.fn(async () => {
        created = true
        return accepted
      })
    }
    const asset: AssetPresentationTarget = {
      ...target('test-handoff-output'),
      outputLocatorCandidate: {
        job_id: 'job',
        node_id: '42',
        directory_type: 'output' as const,
        subfolder: 'safe',
        filename: 'image.png',
        media_type: 'image',
        asset_id: null
      }
    }
    const provider = createOmarketingAssetsPresentationProvider(
      selection,
      testApi
    )
    const metadata = await metadataFor(provider, asset)
    const create = action(provider, 'omarketing-local-test-handoff')

    expect(create.isAvailable(actionContext(asset, metadata))).toBe(true)
    await expect(
      create.execute(actionContext(asset, metadata))
    ).resolves.toEqual({
      status: 'succeeded',
      safeMessageKey: 'omarketing.assets.testHandoff.accepted'
    })
    expect(testApi.create).toHaveBeenCalledWith(
      binding,
      1,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      context.signal
    )
    expect(testApi.read).toHaveBeenCalledTimes(2)
    expect(
      readyDetail(metadata).sections.some(
        (section) => section.id === 'local-test-fixture-copy'
      )
    ).toBe(true)
  })
})

describe('Omarketing fixture Assets presentation provider (Revision 2)', () => {
  it('applies only to the exact prepared output asset', () => {
    const provider = createOmarketingFixtureAssetsPresentationProvider()

    expect(provider.appliesTo(target(OMARKETING_DEMO_ASSET_ID))).toBe(true)
    expect(provider.appliesTo(target(OMARKETING_DEMO_ASSET_ID, 'input'))).toBe(
      false
    )
    expect(provider.appliesTo(target('another-output'))).toBe(false)
  })

  it('returns no fixture metadata or available actions for unmatched targets', async () => {
    const provider = createOmarketingFixtureAssetsPresentationProvider()
    const unmatchedOutput = target('another-output')
    const unmatchedInput = target(OMARKETING_DEMO_ASSET_ID, 'input')

    const entries = await provider.loadMetadataBatch({
      targets: [unmatchedOutput, unmatchedInput],
      context
    })

    expect(entries).toEqual([
      { assetId: 'another-output', state: { status: 'not-applicable' } },
      {
        assetId: OMARKETING_DEMO_ASSET_ID,
        state: { status: 'not-applicable' }
      }
    ])
    for (const unavailableTarget of [unmatchedOutput, unmatchedInput]) {
      for (const candidate of provider.actions) {
        expect(
          candidate.isAvailable(
            actionContext(unavailableTarget, { status: 'not-applicable' })
          )
        ).toBe(false)
      }
    }
  })

  it('reads back the required fixture candidates and fixture marker', async () => {
    const provider = createOmarketingFixtureAssetsPresentationProvider()
    const detail = readyDetail(await metadataFor(provider))
    const candidates = detail.sections.find(
      (section) => section.id === 'fixture-candidates'
    )

    expect(detail.providerRevision).toBe('omarketing-fixture-r2')
    expect(
      detail.sections
        .find((section) => section.id === 'fixture-state')
        ?.fields.find((field) => field.id === 'fixture-marker')?.value
    ).toBe('Fixture-only demo')
    expect(candidates?.fields.map((field) => [field.id, field.value])).toEqual([
      ['preview', 'unreviewed'],
      ['copy', 'unreviewed'],
      ['qa', 'unreviewed']
    ])
    expect(detail.actionContext).toContainEqual({
      id: 'fixture-marker',
      value: true
    })
    expect(detail.actionContext).toContainEqual({
      id: 'selected-candidate',
      value: 'preview'
    })
  })

  it('passes exactly one selected candidate and reads its ephemeral handoff back', async () => {
    const provider = createOmarketingFixtureAssetsPresentationProvider()
    const fixtureTarget = target(OMARKETING_DEMO_ASSET_ID)
    const pass = action(provider, 'pass-candidate')
    const before = await metadataFor(provider, fixtureTarget)

    expect(pass.isAvailable(actionContext(fixtureTarget, before))).toBe(true)
    await expect(
      pass.execute(actionContext(fixtureTarget, before))
    ).resolves.toEqual({
      status: 'succeeded',
      safeMessageKey: OMARKETING_FIXTURE_LOCALE_KEYS.passSucceeded
    })

    const afterMetadata = await metadataFor(provider, fixtureTarget)
    const after = readyDetail(afterMetadata)
    expect(
      after.sections
        .find((section) => section.id === 'fixture-candidates')
        ?.fields.map((field) => [field.id, field.value])
    ).toEqual([
      ['preview', 'passed'],
      ['copy', 'unreviewed'],
      ['qa', 'unreviewed']
    ])
    expect(after.actionContext).toContainEqual({
      id: 'selected-candidate',
      value: null
    })
    expect(after.actionContext).toContainEqual({
      id: 'fixture-handoff',
      value: 'preview:passed:awaiting_auto_registration'
    })
    expect(pass.isAvailable(actionContext(fixtureTarget, afterMetadata))).toBe(
      false
    )
    await expect(
      pass.execute(actionContext(fixtureTarget, afterMetadata))
    ).resolves.toEqual({
      status: 'unchanged',
      safeMessageKey: OMARKETING_FIXTURE_LOCALE_KEYS.passUnchanged
    })
  })

  it('deletes only provider-local fixture state and hands selection to the next candidate', async () => {
    const provider = createOmarketingFixtureAssetsPresentationProvider()
    const fixtureTarget = target(OMARKETING_DEMO_ASSET_ID)
    const remove = action(provider, 'delete-candidate')
    const before = await metadataFor(provider, fixtureTarget)

    expect(remove.isAvailable(actionContext(fixtureTarget, before))).toBe(true)
    await expect(
      remove.execute(actionContext(fixtureTarget, before))
    ).resolves.toEqual({
      status: 'succeeded',
      safeMessageKey: OMARKETING_FIXTURE_LOCALE_KEYS.deleteSucceeded
    })

    const after = readyDetail(await metadataFor(provider, fixtureTarget))
    expect(
      after.sections
        .find((section) => section.id === 'fixture-candidates')
        ?.fields.map((field) => [field.id, field.value])
    ).toEqual([
      ['preview', 'deleted'],
      ['copy', 'unreviewed'],
      ['qa', 'unreviewed']
    ])
    expect(after.actionContext).toContainEqual({
      id: 'selected-candidate',
      value: 'copy'
    })
    expect(after.actionContext).toContainEqual({
      id: 'fixture-handoff',
      value: 'preview:deleted->copy'
    })
  })

  it('does not call network or browser persistence while changing fixture state', async () => {
    const provider = createOmarketingFixtureAssetsPresentationProvider()
    const fixtureTarget = target(OMARKETING_DEMO_ASSET_ID)
    const fetch = vi.fn()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    vi.stubGlobal('fetch', fetch)

    try {
      const metadata = await metadataFor(provider, fixtureTarget)
      await action(provider, 'pass-candidate').execute(
        actionContext(fixtureTarget, metadata)
      )

      expect(fetch).not.toHaveBeenCalled()
      expect(setItem).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
      setItem.mockRestore()
    }
  })
})
