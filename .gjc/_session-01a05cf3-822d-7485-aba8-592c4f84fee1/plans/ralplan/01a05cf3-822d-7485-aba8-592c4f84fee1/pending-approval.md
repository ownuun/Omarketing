# RALPLAN Revision 2: Omarketing ComfyUI Marketing Flow UI v1

## Reconciled Scope

The first visible UI entry is **not** a custom frontend Workflow node. The governing allowlist does not authorize frontend-owned executable nodes. This fixture-only slice starts in the existing Assets detail panel for one prepared, existing output asset in the demo/test environment.

The user-confirmed flow is:

`prepared existing demo asset → preview/copy/QA required → one candidate Pass → simulated selection and Auto handoff → simulated read-back → existing unfiltered job-history panel`

No frontend executable node, backend node, prompt, output file, virtual asset, Asset index, endpoint, persistence write, provider call, or publish is included.

## Contract Alignment

- `core-file-allowlist.md` remains authoritative: the frontend extension cannot own executable node logic. Actual custom nodes remain deferred to the backend package and a separately approved file-placement/contract review.
- The existing generic Assets presentation registry remains the only extension boundary. It decorates an existing `AssetItem`; it does not create any asset.
- The prepared demo carrier is an existing output `AssetItem` supplied by the development/browser fixture harness. A typed Omarketing fixture has one opaque `demoAssetId`; the provider applies only when `target.tab === 'output' && target.assetId === demoAssetId`.
- If no exact match exists, Omarketing contributes no detail content or actions. It must not match first/any output asset, infer from filename, synthesize an ID, or alter the list.

## Exact State Types

Use separate discriminated fixture objects, not one flattened state union:

- `DesignResultFixture`: `fixtureKind: 'design-result'`, `schemaVersion`, `fixture: true`, opaque `demoAssetId`, preview, copy, `qaRequired: true`, safe display hash.
- `CandidateFixture`: `fixtureKind: 'candidate'`, opaque candidate ID, preview, copy, `disposition: 'unreviewed' | 'passed' | 'deleted'`.
- `SelectionHandoffFixture`: `fixtureKind: 'selection-handoff'`, opaque selected candidate ID, fixture manifest/hash display value, `fixture: true`.
- `AutoReadbackFixture`: `fixtureKind: 'auto-readback'`, `state: 'selected' | 'handed_to_auto' | 'processing' | 'completed' | 'failed'`, safe message, `fixture: true`.

A pure transition accepts only the exact demo carrier and candidate state. Pass is enabled for exactly one candidate; it creates ephemeral fixture selection/handoff/read-back state only. Delete never persists or deletes a real asset.

## Implementation Steps

1. Re-read the current `src/extensions/core/omarketing/` files, Assets registry/detail host APIs, local `AGENTS.md` files, and `git diff` immediately before mutation. Record a touched-file inventory; do not read or alter unrelated dirty work.
2. Add only file placements permitted by the allowlist or first obtain the required file-placement review. Prefer extending existing Omarketing modules/tests over new files where feasible.
3. Add typed, deterministic demo carrier and fixture/transition logic. It uses the exact prepared existing output asset ID only and has no network, persistence, prompt, store, or synthetic asset effect.
4. Evolve the existing Omarketing Assets presentation provider to expose a detail section and actions only for that exact output target. Keep nonmatching targets `match`/not-applicable and preserve upstream lists/cards.
5. Render preview, copy, QA required, candidate comparison, Pass/Delete, one-Pass invariant, visible fixture marker, and simulated read-back in the existing Assets detail extension only.
6. Wire Queue/History controls to the established `job-history` panel toggle only; leave filters unchanged and create no job/prompt reference.
7. Add i18n keys only after re-reading dirty `src/locales/en/main.json`; append owned keys without formatting, moving, reverting, or absorbing any unrelated hunk. Mirror locale work only if current project convention requires it.
8. Add focused tests only in allowlisted/reviewed locations. Browser tests use the prepared existing output asset fixture; no test creates a virtual Omarketing asset or asserts live Queue/History state.

## Verification

- Unit: exact-demo-ID recognition; nonmatching output/input targets remain untouched; each discriminated fixture validation; Pass/Delete transitions; one-Pass invariant; all read-back states; redaction/safe serialization.
- Component: detail rendering only on exact carrier; visible fixture marker in every state; actions unavailable on any nonmatching target; existing asset cards/list unaffected; panel toggle is invoked with no filter mutation.
- Integration: provider bootstrap remains idempotent; no `fetch`, WebSocket, prompt submission, `selection.json` access, synthetic asset creation, or store write is invoked.
- Browser: load the prepared existing output asset fixture; open its Assets detail; Pass exactly one candidate; observe simulated flow; open existing job-history panel and verify its current filter is preserved.
- Gates after implementation: affected Vitest suites, focused browser test, typecheck, lint, format check, i18n key audit. Report unrelated baseline failures without suppressing them.

## Pre-Mortem

1. **Demo UI appears on a real unrelated asset.** Signal: provider applies to an asset whose ID is not the fixture ID. Mitigation: exact-ID predicate plus negative tests.
2. **Fixture UI implies authoritative selection or live job state.** Signal: missing fixture marker or generated job ID. Mitigation: typed `fixture: true`, safe text, and no-network/no-persistence spies.
3. **Dirty locale work is overwritten.** Signal: broad JSON reformat or changed unrelated keys. Mitigation: re-read-before-edit and append-only owned-hunk protocol.

## ADR

- **Decision:** replace the prohibited frontend custom-node entry with an existing prepared output asset as the sole fixture carrier in Assets detail.
- **Drivers:** governing allowlist, existing Assets authority, fixture-only constraints, and user confirmation.
- **Alternatives:** frontend executable node (rejected by contract); wait for real backend output/persistence (deferred by user); virtual asset (rejected because it creates a second Asset authority).
- **Consequences:** the demo requires a prepared existing output asset; normal non-demo assets receive no Omarketing UI. Real node/ingest/persistence is separately planned later.

## Intent Reconciliation

- User confirmed: no frontend node; first entry is Assets detail.
- User confirmed: fixture flow appears only on one prepared existing demo output asset.
- Retained: all selection/handoff/read-back values are simulated, non-authoritative fixture data; real persistence and publishing remain deferred.
