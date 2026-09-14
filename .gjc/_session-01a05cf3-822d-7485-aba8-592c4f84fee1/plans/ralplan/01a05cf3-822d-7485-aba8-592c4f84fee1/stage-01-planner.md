# RALPLAN: Omarketing ComfyUI Marketing Flow UI v1

## Scope

Implement the first **fixture-only** Omarketing UI vertical slice inside existing ComfyUI surfaces:

`fixture design result → preview/copy/QA required → one candidate Pass → simulated selection and Auto handoff → simulated read-back → existing job-history panel links`

This plan is additive. It makes no backend request, persistence write, prompt submission, provider call, publish, deployment, or Comfy core behavior change.

## Principles

1. Preserve ComfyUI as the sole authority for Run, Queue, History, Assets, prompt lifecycle, and persistent selection.
2. Make every fixture-derived status visibly simulated; never imply live Auto/Design state.
3. Put QA and selection controls in the existing Assets detail extension, never asset cards, a sidebar, or a new route.
4. Keep fixtures typed, deterministic, inert, and free of credentials, provider payloads, paths, or URLs.
5. Test observable user behavior and negative authority boundaries, not implementation details.

## Decision Drivers

1. Preserve existing ComfyUI interaction and lifecycle semantics.
2. Deliver an understandable end-to-end human QA/selection flow before real integrations.
3. Prevent a temporary frontend fixture from becoming a second Run, Asset, or selection authority.

## Options

### A. Add Omarketing fixture contributions through the existing generic Assets presentation registry and extension bootstrap — chosen

- Pros: aligns with `index.ts` and `assetsPresentation.ts`; minimal additive boundary; preserves hosts and core stores.
- Cons: requires learning the registry/detail extension pattern and careful no-action-to-fixture evolution.

### B. Build a dedicated Omarketing dashboard/sidebar and local workflow state

- Pros: visually simple to prototype.
- Cons: violates settled surface constraints and creates duplicate lifecycle authority.
- Invalidated by: deep-interview topology and backend package boundary.

### C. Add real package routes and `selection.json` persistence now

- Pros: truthful persisted handoff.
- Cons: expands into backend ownership, locator revalidation, conflict protection, auth, provider lifecycle, and production readiness.
- Invalidated by: fixture-only/no-endpoint/no-persistence scope.

## File Ownership and Steps

1. Read and honor `src/AGENTS.md`, `src/components/AGENTS.md` when applicable, and existing generic Assets presentation registry/detail host patterns before editing.
2. Under `src/extensions/core/omarketing/`, add typed fixture domain data and pure transition logic for design result, candidate disposition, simulated selection/handoff, and simulated Auto read-back. Use discriminated state; keep no network or persistence effect.
3. Evolve `assetsPresentation.ts` from the disconnected Phase 1 provider into a fixture-only provider contribution that applies only to Omarketing fixture targets. Add detail content/actions through the generic registry; do not mutate generic Assets host or asset cards.
4. Update `index.ts` only for the existing single bootstrap registration contract. Do not add routes, views, stores, commands, or alternate run authority.
5. Add a custom Omarketing Workflow node through established extension/node registration patterns only after mapping the local APIs. The node presents fixture result preview/copy/QA-required content and does not intercept normal Run/Shift+Run/Auto Queue.
6. Add Queue/History links that invoke the existing job-history panel toggle without changing current filters or constructing a job ID.
7. Add locale entries in `src/locales/en/main.json` and use composition/i18n conventions for all user-visible strings.
8. Add focused unit/component tests alongside touched Omarketing files; add a browser test only after checking `browser_tests/AGENTS.md` and the current Comfy fixture conventions.

## State Contract

- Fixture states: `qa_required`, `passed`, `deleted`, `selected`, `handed_to_auto`, `processing`, `completed`, `failed`.
- Every selection/handoff/read-back object has `fixture: true` and a safe visible marker.
- Pass is allowed for one candidate only. It creates only ephemeral fixture selection/handoff data.
- A queue/history link has no synthetic prompt/job ID; it only opens the existing panel.
- No fixture may contain tokens, cookies, internal URLs, filesystem paths, raw provider errors, signed URLs, reusable locators, or provider-native payload bodies.

## Acceptance Criteria

- A fixture marketing node shows preview, copy, and QA-required state.
- QA appears in existing Assets detail only.
- User can Pass/Delete candidates; exactly one Pass is allowed.
- Pass presents simulated selection and simulated publishing queue entry only.
- Read-back renders all five simulated states with explicit fixture labeling.
- Queue/History controls open existing unfiltered job-history UI.
- Existing normal Run, Shift+Run, Auto Queue, Queue/History filters, Asset cards/list, prompt submission, and stores remain unchanged.
- All strings are localized; controls are accessible; status is not color-only.
- Tests prove no network/persistence/prompt execution or fabricated authoritative job state.

## Verification Plan

- **Unit:** fixture validation; transition table; one-Pass invariant; Delete behavior; every read-back state; safe fixture serialization/redaction.
- **Component:** preview/copy/QA display; Pass/Delete interaction; fixture marker; single-Pass UI; existing panel-toggle invocation; no filter mutation.
- **Integration:** registry provider applies only to fixture targets and leaves non-Omarketing outputs unchanged; bootstrap remains idempotent.
- **Browser:** using existing Comfy fixtures, open detail, Pass one candidate, observe labeled fixture handoff/read-back, and open existing job-history panel without changing filters.
- **Observability:** development-only deterministic fixture state and test assertions; no logs of unsafe fixture fields.

## Pre-Mortem

1. **Fixture status looks live.** Signal: text lacks an example/fixture marker. Mitigation: typed `fixture: true` state plus component test for visible marker at every state.
2. **Scope leaks into a second lifecycle authority.** Signal: a new store, route, synthetic job ID, or filter update appears. Mitigation: review diff against no-goals; component test confirms only existing panel toggle is called.
3. **QA becomes card-level or multi-select authority.** Signal: changes to asset card body/menu or multiple Pass results. Mitigation: detail-only contribution and pure one-Pass invariant tests.

## Risks

- The current provider is intentionally disconnected/no-action; registry detail/action API mapping must be based on existing local patterns, not invented APIs.
- Current dirty worktree has unowned changes; touched-file inventory and `git diff` must exclude them.
- Phase-0 plans are contract guidance, not proof of a ready backend; real persistence/publishing stays deferred.

## ADR

- **Decision:** Implement an additive, typed, visibly fixture-only Omarketing UI through the existing extension and generic Assets presentation surfaces.
- **Drivers:** preserve Comfy authority, show an end-to-end human flow, avoid production integration scope.
- **Alternatives:** separate dashboard/state model; real backend persistence now.
- **Why chosen:** only this option satisfies the settled UI boundaries and fixture-only constraints.
- **Consequences:** no real publish/read-back occurs; later backend work must introduce the contracted, validated selection route rather than reuse fixture state.
- **Follow-ups:** after this slice is verified, separately plan real design ingest, selection persistence, Auto integration, and release gates.

## Intent Reconciliation

- No material open item: the deep-interview spec fixes all state labels, Pass semantics, fixture/non-authoritative boundary, and Queue/History behavior.
