# RALPLAN Architect Review — Stage 1, Pass 1

## Verdict

- Architectural Status: BLOCK
- Decision: REQUEST CHANGES

## Findings

### A1 — Executable frontend node conflicts with the governing allowlist

- Target: planner step 5.
- Evidence: `.hermes/phase0/contracts/core-file-allowlist.md` does not authorize executable frontend nodes; `backend-package-and-templates.md` assigns executable node behavior to the backend package. The current extension contracts cite the allowlist.
- Required correction: remove the frontend custom Workflow node from this fixture-only plan unless a separately approved contract/file-placement change explicitly admits it. Do not treat the extension as an executable-node owner.

### A2 — The fixture-to-Assets-detail carrier is not defined

- Target: planner step 3 and browser/integration acceptance criteria.
- Evidence: the generic registry annotates existing authoritative `AssetItem` targets. Fixture-only UI creates no History-backed output asset and must not synthesize one.
- Required correction: define a contract-compliant carrier using an existing real Assets target, or narrow this slice to the existing disconnected Assets presentation until a backend output route exists. The plan must not invent virtual assets, an Asset index, or a local run authority.

### A3 — Dirty locale file needs an additive-only protocol

- Target: planner i18n step.
- Evidence: `src/locales/en/main.json` is unowned dirty work.
- Required correction: preserve unrelated hunks, append only new owned keys after a current-file read, and never revert/format unrelated changes.

## Approved Boundaries

Keep the fixture-only/no-network/no-persistence/no-provider boundary, detail-not-card rule, explicit fixture marker, existing unfiltered job-history panel link, and sensitive-data exclusion.

## Routing

Planner revision is required before further review. The revision must reconcile the source-contract conflict and target carrier without guessing.
