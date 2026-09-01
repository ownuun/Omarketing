import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'

import type {
  AssetDetailSection,
  MetadataState
} from './assetPresentationRegistry'
import AssetPresentationDetails from './AssetPresentationDetails.vue'

// A tiny dictionary so no assertion bypasses i18n with raw product strings.
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      assetPresentation: {
        loading: 'Loading presentation details',
        retry: 'Retry'
      },
      testP: {
        provider: 'Omarketing',
        providerBroken: 'Broken provider',
        section: 'Selection details',
        status: 'Status',
        checksum: 'Checksum',
        httpsReport: 'HTTPS report',
        httpReport: 'HTTP report',
        unsafeScript: 'Script link',
        unsafeData: 'Data link',
        finalize: 'Finalize selection',
        finalizeDescription: 'Submits the verified output locator',
        exclude: 'Exclude asset',
        excludeDescription: 'Excludes the asset from selection',
        disabledReason: 'Requires a verified output locator',
        providerError: 'Metadata unavailable',
        retry: 'Retry'
      }
    }
  }
})

/**
 * Host-computed view of one registered action: availability and disabled
 * reasons are derived by the host, never from execution state.
 */
interface PresentationActionView {
  readonly id: string
  readonly labelKey: string
  readonly accessibleDescriptionKey: string
  readonly intent: 'neutral' | 'confirm' | 'exclude'
  readonly disabledReasonKey: string | null
}

interface ProviderDetailEntry {
  readonly providerId: string
  readonly labelKey: string
  readonly state: MetadataState
  readonly actions: readonly PresentationActionView[]
}

type ActionExecutionState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'succeeded'; readonly safeMessageKey: string }
  | { readonly status: 'unchanged'; readonly safeMessageKey: string }
  | { readonly status: 'error'; readonly safeMessageKey: string }

const detailSections: readonly AssetDetailSection[] = [
  {
    id: 'summary',
    headingKey: 'testP.section',
    fields: [
      { id: 'status', labelKey: 'testP.status', value: 'acquired', href: null },
      {
        id: 'checksum',
        labelKey: 'testP.checksum',
        value: 'abc123',
        href: null
      },
      {
        id: 'httpsReport',
        labelKey: 'testP.httpsReport',
        value: 'https://example.com/report',
        href: 'https://example.com/report'
      },
      {
        id: 'httpReport',
        labelKey: 'testP.httpReport',
        value: 'http://example.com/report',
        href: 'http://example.com/report'
      },
      {
        id: 'scriptLink',
        labelKey: 'testP.unsafeScript',
        value: 'javascript:alert(1)',
        href: 'javascript:alert(1)'
      },
      {
        id: 'dataLink',
        labelKey: 'testP.unsafeData',
        value: 'data:text/html,hi',
        href: 'data:text/html,hi'
      }
    ]
  }
]

function readyState(
  sections: readonly AssetDetailSection[] = detailSections
): MetadataState {
  return {
    status: 'ready',
    detail: {
      sections,
      providerRevision: 'rev-1',
      // outputLocatorV1.generated.ts is intentionally absent in this phase,
      // so verified locators stay null.
      verifiedOutputLocator: null,
      actionContext: []
    }
  }
}

function finalizeAction(
  disabledReasonKey: string | null = null
): PresentationActionView {
  return {
    id: 'finalizeSelection',
    labelKey: 'testP.finalize',
    accessibleDescriptionKey: 'testP.finalizeDescription',
    intent: 'confirm',
    disabledReasonKey
  }
}

function excludeAction(): PresentationActionView {
  return {
    id: 'excludeAsset',
    labelKey: 'testP.exclude',
    accessibleDescriptionKey: 'testP.excludeDescription',
    intent: 'exclude',
    disabledReasonKey: null
  }
}

function detailEntry(
  overrides: Partial<ProviderDetailEntry> = {}
): ProviderDetailEntry {
  return {
    providerId: 'test.provider',
    labelKey: 'testP.provider',
    state: readyState(),
    actions: [],
    ...overrides
  }
}

interface RenderOptions {
  details?: readonly ProviderDetailEntry[]
  actionStates?: Readonly<
    Record<string, Readonly<Record<string, ActionExecutionState>>>
  >
  onExecute?: (providerId: string, actionId: string) => void
  onRetry?: (providerId: string) => void
}

function renderDetails({
  details = [detailEntry()],
  actionStates = {},
  onExecute,
  onRetry
}: RenderOptions = {}) {
  const user = userEvent.setup()
  const view = render(AssetPresentationDetails, {
    props: {
      details,
      actionStates,
      ...(onExecute ? { onExecute } : {}),
      ...(onRetry ? { onRetry } : {})
    },
    global: { plugins: [i18n] }
  })
  return { user, ...view }
}

describe('AssetPresentationDetails', () => {
  it('renders ready detail sections and fields as read-only text', () => {
    renderDetails()

    expect(
      screen.getByRole('heading', { name: 'Selection details' })
    ).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('acquired')).toBeInTheDocument()
    expect(screen.getByText('Checksum')).toBeInTheDocument()
    expect(screen.getByText('abc123')).toBeInTheDocument()
  })

  it('renders only http and https fields as external links with hardened attributes', () => {
    renderDetails()

    const httpsLink = screen.getByRole('link', {
      name: 'https://example.com/report'
    })
    expect(httpsLink).toHaveAttribute('href', 'https://example.com/report')
    expect(httpsLink).toHaveAttribute('target', '_blank')
    expect(httpsLink.getAttribute('rel')).toContain('noopener')
    expect(httpsLink.getAttribute('rel')).toContain('noreferrer')

    const httpLink = screen.getByRole('link', {
      name: 'http://example.com/report'
    })
    expect(httpLink).toHaveAttribute('target', '_blank')
    expect(httpLink.getAttribute('rel')).toContain('noopener')
    expect(httpLink.getAttribute('rel')).toContain('noreferrer')

    // Unsafe schemes never become links; the value stays visible as text.
    expect(
      screen.queryByRole('link', { name: 'javascript:alert(1)' })
    ).toBeNull()
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'data:text/html,hi' })).toBeNull()
    expect(screen.getByText('data:text/html,hi')).toBeInTheDocument()
  })

  it('keeps another provider detail visible when one provider fails', async () => {
    const onRetry = vi.fn()
    const { user } = renderDetails({
      details: [
        {
          providerId: 'broken.provider',
          labelKey: 'testP.providerBroken',
          state: { status: 'error', safeMessageKey: 'testP.providerError' },
          actions: []
        },
        detailEntry()
      ],
      onRetry
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Metadata unavailable')
    // The healthy provider detail stays rendered beside the failure.
    expect(screen.getByText('acquired')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledWith('broken.provider')
  })

  it('announces loading politely without hiding other providers', () => {
    renderDetails({
      details: [
        {
          providerId: 'loading.provider',
          labelKey: 'testP.providerBroken',
          state: { status: 'loading' },
          actions: []
        },
        detailEntry()
      ]
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Broken provider' })
    ).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('acquired')).toBeInTheDocument()
  })

  it('omits not-applicable provider details and actions', () => {
    renderDetails({
      details: [
        detailEntry({
          state: { status: 'not-applicable' },
          actions: [excludeAction()]
        })
      ]
    })

    expect(screen.queryByRole('heading', { name: 'Omarketing' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Exclude asset/ })).toBeNull()
  })

  it('disables unavailable actions and exposes the localized reason', async () => {
    const onExecute = vi.fn()
    const { user } = renderDetails({
      details: [
        detailEntry({
          actions: [finalizeAction('testP.disabledReason'), excludeAction()]
        })
      ],
      onExecute
    })

    const finalize = screen.getByRole('button', { name: /Finalize selection/ })
    expect(finalize).toBeDisabled()
    expect(
      screen.getByText('Requires a verified output locator')
    ).toBeInTheDocument()

    const exclude = screen.getByRole('button', { name: /Exclude asset/ })
    expect(exclude).toBeEnabled()

    await user.click(exclude)

    expect(onExecute).toHaveBeenCalledWith('test.provider', 'excludeAsset')
    expect(onExecute).not.toHaveBeenCalledWith(
      'test.provider',
      'finalizeSelection'
    )
  })

  it('marks only the running action as busy', () => {
    renderDetails({
      details: [detailEntry({ actions: [finalizeAction(), excludeAction()] })],
      actionStates: {
        'test.provider': { finalizeSelection: { status: 'running' } }
      }
    })

    const finalize = screen.getByRole('button', { name: /Finalize selection/ })
    expect(finalize).toBeDisabled()
    expect(finalize).toHaveAttribute('aria-busy', 'true')

    const exclude = screen.getByRole('button', { name: /Exclude asset/ })
    expect(exclude).toBeEnabled()
    expect(exclude).not.toHaveAttribute('aria-busy', 'true')
  })
})
