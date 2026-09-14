# Deep Interview Spec: Omarketing ComfyUI Marketing Flow UI v1

## Metadata
- Interview ID: 93ad4bcb-90bf-4376-bb41-71c59176475b
- Task ID: omarketing-comfy-marketing-flow-ui-v1
- Rounds: 8
- Final Ambiguity Score: 2%
- Type: brownfield
- Threshold: 5%
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED
- Auto-Answered Rounds: none
- Architect Failures: 1 (native trace summary was unavailable)
- Lateral Reviews: 5
- Lateral Panel Failures: 0
- Refined Rounds: 1, 5
- Closure Overrides: 1, resolved in round 8
- Restated Goal: 기존 ComfyUI 안에서, 사용자는 예시 디자인 결과의 미리보기와 문구를 확인하고 한 후보를 통과시키며, 이 통과는 예시 최종 선택과 예시 Auto 발행 대기열 진입을 표시하고, 예시 읽기 결과와 기존 작업 기록 화면으로의 링크를 확인한다.

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|---|---:|---:|---:|
| Goal Clarity | 0.98 | 0.35 | 0.343 |
| Constraint Clarity | 0.98 | 0.25 | 0.245 |
| Success Criteria | 0.98 | 0.25 | 0.245 |
| Context Clarity | 0.98 | 0.15 | 0.147 |
| **Total Clarity** | | | **0.980** |
| **Ambiguity** | | | **0.020** |

## Topology
| Component | Status | Description | Coverage |
|---|---|---|---|
| Marketing workflow entry | active | Custom marketing Workflow node is the first visible entry. | Shows fixture preview, copy, and `QA required`; preserves normal Run and Comfy core. |
| Assets QA and selection | active | Existing Assets detail panel hosts QA and selection. | User chooses one candidate only; Pass records a simulated final-selection/handoff state. No card-body/menu mutation. |
| Auto handoff and read-back | active | Fixture-only Auto handoff/read-back presentation. | Clearly labeled simulated states: selected, handed to Auto, processing, completed, failed. |
| Queue/History lifecycle links | active | Links preserve Comfy lifecycle authority. | Both links open the existing unfiltered job-history panel; no new view, state machine, filters, cards, or status authority. |

## Goal
Build the first fixture-only Omarketing vertical UI slice in existing ComfyUI surfaces: design result received → mandatory human QA → one-candidate Pass/selection → simulated Auto handoff → simulated read-back, while preserving ComfyUI’s normal Run, Queue, History, and Assets authority.

## Exact Surfaces and Actions
1. **Workflow node:** add one custom marketing Workflow node as the entry. It presents a typed fixture design result with preview, copy, and `QA required`; it does not change normal Run, Shift+Run, Auto Queue, batch behavior, or prompt submission.
2. **Assets detail:** add the review UI only inside the existing Assets detail panel. The user compares fixture candidates and chooses `Pass` or `Delete`. Only one candidate may be passed for a reference.
3. **Pass action:** Pass immediately records an **ephemeral, visibly simulated** final-selection/handoff fixture and shows it entering the simulated publishing queue. It does not call an endpoint, write `selection.json`, mutate an asset, persist a manifest, publish, or create an execution.
4. **Read-back:** display visibly simulated `selected`, `handed to Auto`, `processing`, `completed`, and `failed` states. These are not live provider or Comfy lifecycle truth.
5. **Lifecycle links:** Queue and History links open the existing job-history panel with its current filter unchanged.

## Fixture Contract
Use typed, versioned, read-only fixtures. The fixture boundary contains only opaque, inert values:
- `schemaVersion`, `fixtureKind`, `fixtureState`
- design result: opaque `resultId`, preview reference, copy, checksum/hash display value, `qaRequired`
- candidate: opaque `candidateId`, preview reference, copy, QA disposition (`unreviewed | passed | deleted`)
- simulated selection/handoff: opaque selected candidate ID, fixture manifest/hash value, `selectedAt`, `fixture: true`
- simulated Auto read-back: `selected | handed_to_auto | processing | completed | failed`, safe display message, `fixture: true`
- Queue/History reference: optional opaque label only; it must not manufacture a prompt/job ID or claim a live job exists.

Fixtures must be deterministic for tests and explicitly labeled as examples. They must not contain credentials, cookies, tokens, internal URLs, filesystem paths, provider error bodies, reusable signed URLs, raw provider payloads, or user secrets.

## Constraints
- Reuse existing Workflows, Templates, Nodes, Assets, Queue, and History surfaces. No dashboard, sidebar, route, alternate run model, or frontend run-state machine.
- Keep Comfy core Queue/History/Assets authority and normal Run behavior unchanged.
- Design owns visual creation. Omarketing owns fixture request/status/hash/manifest/selection-handoff presentation and copy. Auto owns real account, publish, and read-back work, which is deferred.
- No endpoint, token, provider call, paid action, publish, deployment, production behavior, or actual persistence in this UI slice.
- Do not touch the unowned dirty worktree.
- Use the existing generic Assets presentation boundary; do not make asset cards or their `…` menu authoritative for QA/selection.

## Non-Goals
- Real design ingest, production fixtures sourced from a provider, or real publishing.
- Backend selection route, actual `selection.json` write, locator revalidation, conflict handling, or manifest persistence.
- New sidebar/dashboard, custom Queue/History pages, alternate job cards, custom filters, or altered Queue/History behavior.
- Visual-quality variants, Shorts, advanced automation, auth, credentials, endpoints, payments, deployment, or release work.

## File Ownership
- Existing extension bootstrap: `src/extensions/core/omarketing/index.ts` remains the one registration point.
- Assets provider/presentation: `src/extensions/core/omarketing/assetsPresentation.ts` evolves from disconnected/no-action state into the fixture-only presentation contribution.
- New Omarketing UI files, fixture types, and tests belong under `src/extensions/core/omarketing/` and use established project conventions.
- Generic Assets host, Comfy Queue/History stores, Run/prompt submission, and LiteGraph core are not owned by this slice and must not be changed.
- Any locale additions belong in `src/locales/en/main.json` under the project’s i18n conventions.

## Acceptance Criteria
- [ ] A user can open a marketing workflow node and see a fixture design result preview, copy, and a visible `QA required` state.
- [ ] The QA action is available only in existing Assets detail, not a new sidebar, card body, or card menu.
- [ ] A user can mark candidate fixtures Pass or Delete; at most one candidate can be passed for a reference.
- [ ] Passing a candidate visibly creates only simulated final-selection and simulated Auto-handoff state; no endpoint, persistence, prompt, or publish is attempted.
- [ ] Read-back shows every fixture state: selected, handed to Auto, processing, completed, and failed, with an explicit fixture/example marker.
- [ ] Queue and History links open the existing job-history panel without changing its filters.
- [ ] Normal Run, Shift+Run, Auto Queue, Queue/History filtering, Assets list/card behavior, and existing Comfy job authority remain unchanged.
- [ ] Fixture values are typed, deterministic, read-only, and contain no sensitive or provider-native data.
- [ ] UI strings use the project i18n path; status is not communicated by color alone; controls have accessible names and keyboard behavior follows existing host patterns.
- [ ] Focused unit/component tests cover pass/delete, single-pass exclusion, every read-back state, fixture marker visibility, no-action/no-network boundary, and Queue/History link behavior. Browser UI QA covers the same visible flow using existing Comfy fixtures.

## UI QA Checklist
- Preview, copy, and QA-required status are readable at the existing Assets detail breakpoint.
- Pass/Delete state is visible as text, not color only.
- A second Pass is unavailable or replaces the first only through an explicit user action; the resulting fixture state remains unambiguous.
- Simulated state has an obvious label at every handoff/read-back point.
- Queue/History links retain focus/keyboard behavior and do not alter panel filters.
- Failure state has a clear safe message and does not expose provider details.

## Audit
| Check | Result |
|---|---|
| Sufficiency | PASS after round 8: all four active components have goal, boundary, and testable behavior. |
| Relevance | PASS: scope maps to existing extension, Assets presentation, Queue/History, and backend boundary contracts. |
| Freshness | WATCH: Phase 1 source is a disconnected foundation; fixture UI is new work and must not be represented as existing capability. |
| Contradiction | RESOLVED: Pass is a simulated selection/handoff only; real selection persistence remains deferred. |
| Cross-Todo | PASS: no expansion into auth, provider lifecycle, real selection route, release, or deployment. |
| Sensitive leakage | PASS with fixture contract restriction: opaque inert references only; no secrets, URLs, paths, tokens, cookies, or provider bodies. |
| Redundancy | PASS: no second Queue/History, Run, Asset, or selection authority. |

## Technical Context
- `src/extensions/core/omarketing/index.ts` currently registers only one Assets presentation provider and a static About badge; it owns no route, view, sidebar, store, or run authority.
- `src/extensions/core/omarketing/assetsPresentation.ts` is intentionally disconnected and provides no actions or fabricated metadata. The slice replaces that no-action state only through typed fixtures and the generic presentation boundary.
- `.hermes/plans/omarketing-full-replacement-plan.md` requires additive extensions, Assets-detail actions, existing Queue/History authority, and no core Run changes.
- `.hermes/phase0/contracts/backend-package-and-templates.md` requires human selection between normal executions and prohibits a frontend/alternate Queue, History, Run, or Asset authority. Real selection persistence requires a backend-validated route and is deferred.

## Assumptions Exposed and Resolved
| Assumption | Resolution |
|---|---|
| Seeing a result is enough for QA. | No. The user must explicitly Pass or Delete. |
| Pass can ignore final selection. | No. Pass represents one explicit fixture selection, but no real persistence. |
| Auto statuses can look live. | No. Every handoff/read-back status is visibly simulated fixture data. |
| Queue/History needs a new marketing page. | No. Both links open the existing unfiltered job-history panel. |

## Ontology
| Entity | Type | Key fields | Relationship |
|---|---|---|---|
| Design result | external fixture | preview, copy, QA-required, opaque reference/hash | reviewed before selection |
| QA review | core domain | pass/delete, fixture marker | reviews result |
| Selection handoff | fixture state | selected candidate, fixture manifest/hash | follows Pass and precedes Auto fixture |
| Auto read-back receipt | external fixture | handoff/read-back status, safe message | reports fixture progression |
| Queue/History link | supporting view | opaque label, existing panel target | opens existing Comfy lifecycle surface |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|---|---:|---:|---:|---:|---:|
| 1 | 5 | 5 | 0 | 0 | N/A |
| 2-8 | 5 | 0 | 0 | 5 | 100% |

## Plan Result
This is a requirements-only PRD. It authorizes no implementation, source edits, endpoint calls, publishing, deployment, or production behavior.
