import { describe, expect, it } from 'vitest'

import {
  createPersistedProjectContextNode,
  evaluateProjectContextExecutionEvidence,
  isCanonicalProjectKey,
  isProjectContextRevision
} from './projectContext'

const PROJECT_KEY = '123e4567-e89b-42d3-a456-426614174000'

describe('project context identity', () => {
  it('accepts a backend-issued canonical lowercase RFC 4122 UUID', () => {
    expect(isCanonicalProjectKey(PROJECT_KEY)).toBe(true)
  })

  it.each([
    null,
    '',
    'Campaign Folder',
    '123E4567-E89B-42D3-A456-426614174000',
    '00000000-0000-0000-0000-000000000000',
    '123e4567-e89b-42d3-c456-426614174000',
    '123e4567e89b42d3a456426614174000'
  ])('rejects a noncanonical or folder-derived key: %s', (value) => {
    expect(isCanonicalProjectKey(value)).toBe(false)
  })

  it('persists only the immutable project key', () => {
    const persisted = createPersistedProjectContextNode(PROJECT_KEY)

    expect(persisted).toEqual({ project_key: PROJECT_KEY })
    expect(Object.keys(persisted ?? {})).toEqual(['project_key'])
  })

  it('does not create persisted state from an invalid key', () => {
    expect(createPersistedProjectContextNode('Campaign Folder')).toBeNull()
  })

  it.each([0, 1, Number.MAX_SAFE_INTEGER])(
    'accepts a nonnegative safe integer revision: %s',
    (revision) => {
      expect(isProjectContextRevision(revision)).toBe(true)
    }
  )

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null])(
    'rejects an invalid revision: %s',
    (revision) => {
      expect(isProjectContextRevision(revision)).toBe(false)
    }
  )
})

describe('project context execution evidence', () => {
  it('returns candidate evidence for backend owner and folder validation', () => {
    expect(
      evaluateProjectContextExecutionEvidence({
        projectKey: PROJECT_KEY,
        workflowLocator: 'workflows/Campaign/main.json',
        workflowPersisted: true
      })
    ).toEqual({
      status: 'ready_for_server_validation',
      project_key: PROJECT_KEY,
      workflow_locator: 'workflows/Campaign/main.json'
    })
  })

  it('treats an embedded key in an unpersisted import as unbound', () => {
    expect(
      evaluateProjectContextExecutionEvidence({
        projectKey: PROJECT_KEY,
        workflowLocator: 'workflows/Campaign/imported.json',
        workflowPersisted: false
      })
    ).toEqual({
      status: 'unbound',
      reason: 'workflow_not_persisted'
    })
  })

  it.each([null, '', '   '])(
    'does not guess a workflow locator from %s',
    (workflowLocator) => {
      expect(
        evaluateProjectContextExecutionEvidence({
          projectKey: PROJECT_KEY,
          workflowLocator,
          workflowPersisted: true
        })
      ).toEqual({
        status: 'unbound',
        reason: 'workflow_not_persisted'
      })
    }
  )

  it('keeps the workflow folder locator separate from project identity', () => {
    const first = evaluateProjectContextExecutionEvidence({
      projectKey: PROJECT_KEY,
      workflowLocator: 'workflows/Folder A/main.json',
      workflowPersisted: true
    })
    const second = evaluateProjectContextExecutionEvidence({
      projectKey: PROJECT_KEY,
      workflowLocator: 'workflows/Folder B/main.json',
      workflowPersisted: true
    })

    expect(first).toMatchObject({ project_key: PROJECT_KEY })
    expect(second).toMatchObject({ project_key: PROJECT_KEY })
    expect(first).not.toHaveProperty('top_level_folder')
    expect(second).not.toHaveProperty('top_level_folder')
  })

  it('fails closed for a malformed project key', () => {
    expect(
      evaluateProjectContextExecutionEvidence({
        projectKey: 'Campaign Folder',
        workflowLocator: 'workflows/Campaign/main.json',
        workflowPersisted: true
      })
    ).toEqual({
      status: 'unbound',
      reason: 'invalid_project_key'
    })
  })
})
