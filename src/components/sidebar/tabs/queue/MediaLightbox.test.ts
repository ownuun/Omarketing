import { fireEvent, render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import type { ResultItemImpl } from '@/stores/queueStore'
import type { SerializedNodeId } from '@/types/nodeId'

import MediaLightbox from './MediaLightbox.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      g: {
        close: 'Close',
        gallery: 'Gallery',
        previous: 'Previous',
        next: 'Next'
      },
      assetPresentation: {
        details: {
          heading: 'Details',
          jobHeading: 'Marketing job',
          campaignLabel: 'Campaign',
          referenceLabel: 'Reference'
        },
        actions: {
          select: 'Add to selection',
          selectDescription: 'Add this asset to the selection',
          exclude: 'Exclude from selection',
          excludeDescription: 'Exclude this asset from the selection'
        },
        providerError: 'Provider details failed to load.',
        retry: 'Retry'
      }
    }
  }
})

interface PresentationDetailFieldFixture {
  readonly id: string
  readonly labelKey: string
  readonly value: string
  readonly href: string | null
}

interface PresentationDetailSectionFixture {
  readonly id: string
  readonly headingKey: string
  readonly fields: readonly PresentationDetailFieldFixture[]
}

interface PresentationDetailViewFixture {
  readonly providerId: string
  readonly order: number
  readonly status: 'idle' | 'loading' | 'ready' | 'not-applicable' | 'error'
  readonly sections: readonly PresentationDetailSectionFixture[]
  readonly safeMessageKey?: string
}

interface PresentationActionStateFixture {
  readonly assetId: string
  readonly providerId: string
  readonly actionId: string
  readonly labelKey: string
  readonly accessibleDescriptionKey: string
  readonly intent: 'neutral' | 'confirm' | 'exclude'
  readonly enabled: boolean
  readonly pending: boolean
  readonly disabledReasonKey?: string
  readonly errorMessageKey?: string
}

function readyDetailView(): PresentationDetailViewFixture {
  return {
    providerId: 'org.demo.assets.v1',
    order: 10,
    status: 'ready',
    sections: [
      {
        id: 'job',
        headingKey: 'assetPresentation.details.jobHeading',
        fields: [
          {
            id: 'campaign',
            labelKey: 'assetPresentation.details.campaignLabel',
            value: 'summer-drop',
            href: null
          },
          {
            id: 'reference',
            labelKey: 'assetPresentation.details.referenceLabel',
            value: 'job-42',
            href: 'https://example.com/jobs/job-42'
          }
        ]
      }
    ]
  }
}

function errorDetailView(): PresentationDetailViewFixture {
  return {
    providerId: 'org.demo.assets.v1',
    order: 10,
    status: 'error',
    sections: [],
    safeMessageKey: 'assetPresentation.providerError'
  }
}

function excludeActionState(): PresentationActionStateFixture {
  return {
    assetId: 'asset-1',
    providerId: 'org.demo.assets.v1',
    actionId: 'exclude',
    labelKey: 'assetPresentation.actions.exclude',
    accessibleDescriptionKey: 'assetPresentation.actions.excludeDescription',
    intent: 'exclude',
    enabled: true,
    pending: false
  }
}

type MockResultItem = Partial<ResultItemImpl> & {
  filename: string
  subfolder: string
  type: string
  nodeId: SerializedNodeId
  mediaType: string
  id?: string
  url?: string
  isImage?: boolean
  isVideo?: boolean
  isAudio?: boolean
}

describe('MediaLightbox', () => {
  const mockComfyImage = {
    name: 'ComfyImage',
    template: '<div class="mock-comfy-image" data-testid="comfy-image"></div>',
    props: ['src', 'contain', 'alt']
  }

  const mockResultVideo = {
    name: 'ResultVideo',
    template:
      '<div class="mock-result-video" data-testid="result-video"></div>',
    props: ['result']
  }

  const mockResultAudio = {
    name: 'ResultAudio',
    template:
      '<div class="mock-result-audio" data-testid="result-audio"></div>',
    props: ['result']
  }

  const mockGalleryItems: MockResultItem[] = [
    {
      filename: 'image1.jpg',
      subfolder: 'outputs',
      type: 'output',
      nodeId: '123',
      mediaType: 'images',
      isImage: true,
      isVideo: false,
      isAudio: false,
      url: 'image1.jpg',
      id: '1'
    },
    {
      filename: 'image2.jpg',
      subfolder: 'outputs',
      type: 'output',
      nodeId: '456',
      mediaType: 'images',
      isImage: true,
      isVideo: false,
      isAudio: false,
      url: 'image2.jpg',
      id: '2'
    },
    {
      filename: 'image3.jpg',
      subfolder: 'outputs',
      type: 'output',
      nodeId: '789',
      mediaType: 'images',
      isImage: true,
      isVideo: false,
      isAudio: false,
      url: 'image3.jpg',
      id: '3'
    }
  ]

  const renderGallery = (props = {}) => {
    const onUpdateActiveIndex = vi.fn()
    const user = userEvent.setup()
    const { rerender, container } = render(MediaLightbox, {
      global: {
        plugins: [i18n],
        components: {
          ComfyImage: mockComfyImage,
          ResultVideo: mockResultVideo,
          ResultAudio: mockResultAudio
        },
        stubs: {
          teleport: true
        }
      },
      props: {
        allGalleryItems: mockGalleryItems as ResultItemImpl[],
        activeIndex: 0,
        'onUpdate:activeIndex': onUpdateActiveIndex,
        ...props
      },
      container: document.body.appendChild(document.createElement('div'))
    })
    return { user, onUpdateActiveIndex, rerender, container }
  }

  it('renders overlay with role="dialog" and aria-modal', async () => {
    renderGallery()
    await nextTick()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('focuses the close control and traps Tab focus inside the dialog', async () => {
    const { user } = renderGallery()
    await nextTick()

    const closeButton = screen.getByLabelText('Close')
    const nextButton = screen.getByLabelText('Next')
    expect(closeButton).toHaveFocus()

    await user.tab({ shift: true })
    expect(nextButton).toHaveFocus()

    await user.tab()
    expect(closeButton).toHaveFocus()
  })

  it('shows navigation buttons when multiple items', async () => {
    renderGallery()
    await nextTick()

    expect(screen.getByLabelText('Previous')).toBeInTheDocument()
    expect(screen.getByLabelText('Next')).toBeInTheDocument()
  })

  it('hides navigation buttons for single item', async () => {
    renderGallery({
      allGalleryItems: [mockGalleryItems[0]] as ResultItemImpl[]
    })
    await nextTick()

    expect(screen.queryByLabelText('Previous')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Next')).not.toBeInTheDocument()
  })

  it('shows gallery when activeIndex changes from -1', async () => {
    const { rerender, container } = renderGallery({ activeIndex: -1 })

    /* eslint-disable testing-library/no-container, testing-library/no-node-access */
    expect(container.querySelector('[data-mask]')).not.toBeInTheDocument()
    /* eslint-enable testing-library/no-container, testing-library/no-node-access */

    await rerender({
      allGalleryItems: mockGalleryItems as ResultItemImpl[],
      activeIndex: 0
    })
    await nextTick()

    /* eslint-disable testing-library/no-container, testing-library/no-node-access */
    expect(container.querySelector('[data-mask]')).toBeInTheDocument()
    /* eslint-enable testing-library/no-container, testing-library/no-node-access */
  })

  it('emits update:activeIndex with -1 when close button clicked', async () => {
    const { user, onUpdateActiveIndex } = renderGallery()
    await nextTick()

    await user.click(screen.getByLabelText('Close'))
    await nextTick()

    expect(onUpdateActiveIndex).toHaveBeenCalledWith(-1)
  })

  /* eslint-disable testing-library/prefer-user-event -- keyDown on dialog element for navigation, not text input */
  describe('keyboard navigation', () => {
    it('navigates to next item on ArrowRight', async () => {
      const { onUpdateActiveIndex } = renderGallery({ activeIndex: 0 })
      await nextTick()

      await fireEvent.keyDown(screen.getByRole('dialog'), {
        key: 'ArrowRight'
      })
      await nextTick()

      expect(onUpdateActiveIndex).toHaveBeenCalledWith(1)
    })

    it('navigates to previous item on ArrowLeft', async () => {
      const { onUpdateActiveIndex } = renderGallery({ activeIndex: 1 })
      await nextTick()

      await fireEvent.keyDown(screen.getByRole('dialog'), {
        key: 'ArrowLeft'
      })
      await nextTick()

      expect(onUpdateActiveIndex).toHaveBeenCalledWith(0)
    })

    it('wraps to last item on ArrowLeft from first', async () => {
      const { onUpdateActiveIndex } = renderGallery({ activeIndex: 0 })
      await nextTick()

      await fireEvent.keyDown(screen.getByRole('dialog'), {
        key: 'ArrowLeft'
      })
      await nextTick()

      expect(onUpdateActiveIndex).toHaveBeenCalledWith(2)
    })

    it('closes gallery on Escape', async () => {
      const { onUpdateActiveIndex } = renderGallery({ activeIndex: 0 })
      await nextTick()

      await fireEvent.keyDown(screen.getByRole('dialog'), {
        key: 'Escape'
      })
      await nextTick()

      expect(onUpdateActiveIndex).toHaveBeenCalledWith(-1)
    })
  })
  /* eslint-enable testing-library/prefer-user-event */

  /* eslint-disable testing-library/prefer-user-event -- keyDown dispatches target specific interactive elements */
  describe('MediaLightbox registered presentation details and actions', () => {
    it('renders generic details beside the existing media renderer', async () => {
      renderGallery({ presentationDetails: [readyDetailView()] })
      await nextTick()

      // The registered detail region never replaces the media renderer.
      expect(
        screen.getByRole('img', { name: 'image1.jpg' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Marketing job' })
      ).toBeVisible()
      expect(screen.getByText('summer-drop')).toBeVisible()
      expect(screen.getByRole('link', { name: 'job-42' })).toBeVisible()
    })

    it('ignores arrow navigation from interactive origins but keeps dialog-level navigation', async () => {
      const { onUpdateActiveIndex } = renderGallery({
        presentationDetails: [readyDetailView()]
      })
      await nextTick()

      const dialog = screen.getByRole('dialog')

      // Existing dialog buttons never hijack gallery navigation.
      await fireEvent.keyDown(screen.getByLabelText('Next'), {
        key: 'ArrowRight'
      })
      await fireEvent.keyDown(screen.getByLabelText('Close'), {
        key: 'ArrowLeft'
      })
      // Links contributed by provider details keep their arrow keys.
      await fireEvent.keyDown(screen.getByRole('link', { name: 'job-42' }), {
        key: 'ArrowRight'
      })

      for (const tag of ['input', 'select', 'textarea']) {
        const interactive = document.createElement(tag)
        dialog.appendChild(interactive)
        await fireEvent.keyDown(interactive, { key: 'ArrowLeft' })
        interactive.remove()
      }
      const providerRegion = document.createElement('div')
      providerRegion.setAttribute('data-presentation-interactive', '')
      const regionChild = document.createElement('span')
      providerRegion.appendChild(regionChild)
      dialog.appendChild(providerRegion)
      await fireEvent.keyDown(regionChild, { key: 'ArrowRight' })

      expect(onUpdateActiveIndex).not.toHaveBeenCalled()

      // Dialog-level arrows still navigate.
      await fireEvent.keyDown(dialog, { key: 'ArrowRight' })
      expect(onUpdateActiveIndex).toHaveBeenCalledWith(1)
    })

    it('restores focus to the precise invoking element after navigation then close', async () => {
      const invoker = document.createElement('button')
      invoker.setAttribute('aria-label', 'Open asset preview')
      document.body.appendChild(invoker)
      invoker.focus()

      const { user, rerender } = renderGallery({ activeIndex: 0 })
      await nextTick()

      // Navigate to a neighbour, then close from the navigated item.
      await user.click(screen.getByLabelText('Next'))
      await rerender({ activeIndex: 1 })
      await nextTick()

      await user.click(screen.getByLabelText('Close'))
      await nextTick()

      expect(invoker).toHaveFocus()
      invoker.remove()
    })

    it('disables only the pending provider action while close and navigation remain enabled', async () => {
      renderGallery({
        presentationActionStates: [
          {
            assetId: 'asset-1',
            providerId: 'org.demo.assets.v1',
            actionId: 'select',
            labelKey: 'assetPresentation.actions.select',
            accessibleDescriptionKey:
              'assetPresentation.actions.selectDescription',
            intent: 'confirm',
            enabled: true,
            pending: true
          },
          excludeActionState()
        ]
      })
      await nextTick()

      expect(
        screen.getByRole('button', { name: 'Add to selection' })
      ).toBeDisabled()
      expect(
        screen.getByRole('button', { name: 'Exclude from selection' })
      ).toBeEnabled()
      expect(screen.getByLabelText('Close')).toBeEnabled()
      expect(screen.getByLabelText('Previous')).toBeEnabled()
      expect(screen.getByLabelText('Next')).toBeEnabled()
    })

    it('emits execute:presentation-action with the provider and action ids', async () => {
      const onExecutePresentationAction = vi.fn()
      const { user } = renderGallery({
        presentationActionStates: [excludeActionState()],
        'onExecute:presentation-action': onExecutePresentationAction
      })
      await nextTick()

      await user.click(
        screen.getByRole('button', { name: 'Exclude from selection' })
      )

      expect(onExecutePresentationAction).toHaveBeenCalledWith({
        assetId: 'asset-1',
        providerId: 'org.demo.assets.v1',
        actionId: 'exclude'
      })
    })

    it('offers an accessible retry for a failed provider detail view', async () => {
      const onRetryPresentationProvider = vi.fn()
      const { user } = renderGallery({
        presentationDetails: [errorDetailView()],
        'onRetry:presentation-provider': onRetryPresentationProvider
      })
      await nextTick()

      expect(screen.getByRole('alert')).toBeVisible()

      await user.click(screen.getByRole('button', { name: 'Retry' }))

      expect(onRetryPresentationProvider).toHaveBeenCalledWith(
        'org.demo.assets.v1'
      )
    })
  })
  /* eslint-enable testing-library/prefer-user-event */
})
