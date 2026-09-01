const CANONICAL_RFC_4122_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

declare const projectKeyBrand: unique symbol
declare const projectContextRevisionBrand: unique symbol

export type ProjectKey = string & {
  readonly [projectKeyBrand]: 'ProjectKey'
}

export type ProjectContextRevision = number & {
  readonly [projectContextRevisionBrand]: 'ProjectContextRevision'
}

export interface PersistedProjectContextNode {
  readonly project_key: ProjectKey
}

export type ProjectContextExecutionEvidence =
  | {
      readonly status: 'ready_for_server_validation'
      readonly project_key: ProjectKey
      readonly workflow_locator: string
    }
  | {
      readonly status: 'unbound'
      readonly reason: 'invalid_project_key' | 'workflow_not_persisted'
    }

export interface ProjectContextExecutionEvidenceInput {
  readonly projectKey: unknown
  readonly workflowLocator: unknown
  readonly workflowPersisted: boolean
}

/**
 * Checks UUID syntax only. Backend issuance and owner/folder binding remain
 * authoritative and must still be validated server-side.
 */
export function isCanonicalRfc4122Uuid(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_RFC_4122_UUID.test(value)
}

export function isCanonicalProjectKey(value: unknown): value is ProjectKey {
  return isCanonicalRfc4122Uuid(value)
}

export function isProjectContextRevision(
  value: unknown
): value is ProjectContextRevision {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

export function createPersistedProjectContextNode(
  projectKey: unknown
): PersistedProjectContextNode | null {
  if (!isCanonicalProjectKey(projectKey)) return null

  return Object.freeze({ project_key: projectKey })
}

export function evaluateProjectContextExecutionEvidence({
  projectKey,
  workflowLocator,
  workflowPersisted
}: ProjectContextExecutionEvidenceInput): ProjectContextExecutionEvidence {
  if (
    !workflowPersisted ||
    typeof workflowLocator !== 'string' ||
    workflowLocator.trim().length === 0
  ) {
    return Object.freeze({
      status: 'unbound',
      reason: 'workflow_not_persisted'
    })
  }

  if (!isCanonicalProjectKey(projectKey)) {
    return Object.freeze({
      status: 'unbound',
      reason: 'invalid_project_key'
    })
  }

  return Object.freeze({
    status: 'ready_for_server_validation',
    project_key: projectKey,
    workflow_locator: workflowLocator
  })
}
