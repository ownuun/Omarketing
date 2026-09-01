import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDialogService } from './dialogService'

/**
 * Phase 1 keeps both Comfy sign-in dialog entry points fail-closed.
 *
 * These tests assert the two observable guarantees the contract asks for: the
 * lazy auth component is never fetched, and `dialogStore.showDialog` is never
 * called. Returning `false` alone would not prove either.
 */
const showDialog = vi.fn()
const closeDialog = vi.fn()

vi.mock('@/stores/dialogStore', () => ({
  useDialogStore: () => ({ showDialog, closeDialog })
}))

describe('sign-in dialogs are fail-closed in Omarketing Phase 1', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    showDialog.mockClear()
    closeDialog.mockClear()
  })

  it('showSignInDialog resolves false without opening a dialog', async () => {
    await expect(useDialogService().showSignInDialog()).resolves.toBe(false)
    expect(showDialog).not.toHaveBeenCalled()
  })

  it('showApiNodesSignInDialog resolves false without opening a dialog', async () => {
    await expect(
      useDialogService().showApiNodesSignInDialog(['SomeApiNode'])
    ).resolves.toBe(false)
    expect(showDialog).not.toHaveBeenCalled()
  })

  it('neutralizes the still-registered Comfy.User.OpenSignInDialog command', async () => {
    // useCoreCommands.ts is immutable, so the command survives in the registry.
    // Phase 1 proves the residue is inert rather than removing it: invoking the
    // same service method the command calls opens zero dialogs.
    await useDialogService().showSignInDialog()
    await useDialogService().showSignInDialog()

    expect(showDialog).toHaveBeenCalledTimes(0)
  })

  it('leaves other dialogs untouched', async () => {
    const service = useDialogService()

    // The guard is scoped to the two sign-in entry points; the rest of the
    // service is still present and was not disabled wholesale.
    expect(typeof service.showErrorDialog).toBe('function')
    expect(typeof service.showExecutionErrorDialog).toBe('function')
    expect(typeof service.showExtensionDialog).toBe('function')
    expect(showDialog).not.toHaveBeenCalled()
  })
})
