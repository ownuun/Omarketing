# Core file allowlist and no-touch contract

## Approved local selection persistence CR

Approved exact write set is root docs/plans/local-selection-persistence.md §§5–6, not a folder wildcard. Adds src/extensions/core/omarketing/{selectionApi.ts,selectionApi.test.ts,localSelectionApi.generated.ts}, .hermes/phase0/tools/{generate-local-selection-api.ts,generate-local-selection-api.test.ts}, browser_tests/tests/omarketing/local-selection-persistence.spec.ts. Provider may orchestrate authenticated association/GET/verify/PUT/revalidate/readback. Generic useAssetPresentation may add generation/tuple ambiguity fail-closed and metadata invalidation only; Vue hosts read-only. Four-purpose ceiling and no-touch stores/mappers remain. New generator has exactly one backend schemas/v1/local-selection-api.schema.json input and one localSelectionApi.generated.ts output. Separate 1→1 receipt, parity/idempotence and current-byte evidence at root Test/tower-observation/local-selection-persistence/; legacy 2→2 generator unchanged. No scripts/dependency/lockfile changes.

## Approved real-owner browser evidence CR (2026-09-06)

The only additional frontend product-tree path for this milestone is `browser_tests/tests/omarketing/real-owner-selection.spec.ts`. It may exercise the actual self-contained login, existing Assets provider selection/reselection, logout/login and restart restoration against an explicitly isolated HTTPS real gateway plus native-History test adapter. It must not intercept auth, association, selection, History or output routes, inject browser tokens, add UI/cosmetic source changes, start default Vite, or contact 8188/8288/5174. Test-only synthetic credentials are supplied out of tree and are not evidence of real provisioning. A missing native Comfy listener or designated rights-verified production sample is recorded BLOCKED, never replaced with fixture success.

## Approved internal local TEST flow CR (2026-09-09)

The exact frontend write set for the local simulated TEST flow is limited to
the paths below. It adds an explicit existing-Assets-provider action, generated
closed wire parsing, read-only local TEST projections, and isolated browser
proof only. It must not add a dashboard, panel, route, view, sidebar, store,
run-state machine, editor, copy generation, retry/resend/resume behavior, or
generic-host change.

| Exact file                                                    | Allowed diff                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extensions/core/omarketing/assetsPresentation.ts`        | Add provider-only confirmed-selection TEST readback, one explicit local simulated TEST action, fixed read-only fixture copy, and immutable current/history projection. It must use the generated TEST contract and preserve existing selection semantics and the unregistered fixture suffix.                             |
| `src/extensions/core/omarketing/assetsPresentation.test.ts`   | Add behavioral coverage for the provider-only TEST action, readback, status/history, selection/TEST exclusion, and no retry/resend behavior.                                                                                                                                                                              |
| `src/extensions/core/omarketing/testHandoffApi.ts`            | Add same-origin relative GET/create-or-read POST transport that imports generated request/projection/error schemas and types only from `./testHandoffApi.generated`.                                                                                                                                                      |
| `src/extensions/core/omarketing/testHandoffApi.test.ts`       | Add closed transport/parser/error-classification tests without real network access.                                                                                                                                                                                                                                       |
| `src/extensions/core/omarketing/testHandoffApi.generated.ts`  | Add the sole generated TEST wire parser/type output. It is produced only by the exact TEST generator below and must retain its provenance header.                                                                                                                                                                         |
| `.hermes/phase0/tools/generate-test-handoff-api.ts`           | Add a deterministic, fail-closed TEST-only generator. Its sole input is `../comfyui-omarketing/schemas/v1/test-handoff-api.schema.json`; its sole output is `src/extensions/core/omarketing/testHandoffApi.generated.ts`. It must not read, write, import, or alter the local-selection or legacy generators and outputs. |
| `.hermes/phase0/tools/generate-test-handoff-api.test.ts`      | Add deterministic regeneration and frontend-Zod/backend-wire parity tests for the exact TEST schema/vector set.                                                                                                                                                                                                           |
| `src/locales/en/main.json`                                    | Add only the approved `omarketing.assets.testHandoff` local simulated TEST labels, status, and safe-error leaves.                                                                                                                                                                                                         |
| `src/locales/ko/main.json`                                    | Add only the Korean equivalents of the approved `omarketing.assets.testHandoff` leaves.                                                                                                                                                                                                                                   |
| `browser_tests/tests/omarketing/real-owner-selection.spec.ts` | Extend the existing isolated loopback real-owner browser proof with explicit TEST action, fixed read-only copy, accepted/failed_hold/unknown readback, reselection history separation, reload/relogin recovery, and process/network no-effect assertions.                                                                 |

The backend schema is the sole TEST wire source of truth. Generation/parity
evidence is written only to
`../Test/tower-observation/omarketing-internal-test-flow-discovery/implementation-evidence/<RUN_ID>/test-handoff-schema-generation.json`.
Every other frontend path remains denied.

Status: Phase 0 contract; no product implementation is contained in this file.

All paths are relative to `Omarketing/`. This list freezes the maximum frontend-core diff for the additive architecture. A path absent from the allowlist is denied until a separately reviewed contract revision adds that exact path. Convenience, refactoring, formatting, generated churn, or a nearby test failure does not expand the list.

## Modification ceiling

The product-core ceiling has exactly four purposes:

1. one built-in extension bootstrap import;
2. static Omarketing branding and required license/source notices;
3. one generic Assets presentation registry hosted by the existing Assets UI;
4. minimal non-render and fail-closed treatment of the supported Phase 1 auth surface.

It does not authorize executable frontend nodes, a replacement store, persistence interception, prompt/Queue changes, LiteGraph changes, an Omarketing route/view/sidebar, or a custom run state machine. Executable nodes and external adapters belong to the backend `comfyui-omarketing` custom-node package.

Purpose 4 was added by contract revision CR-1 and is bounded by these premises.

- It authorizes only non-render of reachable Comfy sign-in and API-key entry points, plus fail-closed behavior of the sign-in dialog entry functions, in the five exact source paths listed below. It does not authorize implementing gateway, session, or access control. Hiding an entry point is not access control, and Phase 1 ships no access control.
- The supported Phase 1 deployment does not start the ComfyUI server in multi-user mode. `/user-select` and `src/views/UserSelectView.vue` are the local ComfyUI multi-user selection surface, not a Comfy Org sign-in surface, and they are therefore outside this auth diff scope. `src/router.ts` and `src/views/UserSelectView.vue` remain immutable. Absent or false no-multi-user deployment evidence fails the supported Phase 1 deployment; it must never be worked around in code.
- `src/composables/useCoreCommands.ts` remains immutable, so the `Comfy.User.OpenSignInDialog` command registration survives in the command registry. This residue is a recorded Phase 1 known limitation deferred to the v1 release gate, not an authorization to edit that file. Its runtime effect must be zero opened dialogs because of the fail-closed dialog service.
- `src/views/LinearView.vue` is excluded because it is a host that renders `MobileDisplay` and holds no auth control of its own.

This release line builds Omarketing only. A stock ComfyUI Frontend build is
obtained from the recorded upstream source, not from a runtime branding flag
or second conditional path in this branch. The built-in Omarketing import and
static branding are therefore unconditional; `DISTRIBUTION` remains the
existing `desktop | localhost | cloud` contract.

## Existing files allowed to change

### Bootstrap: one import only

| Exact file                     | Allowed diff                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extensions/core/index.ts` | Exactly one side-effect import of `./omarketing`. No condition, distribution branch, startup reordering, or edits to another built-in import. |

`src/extensions/core/index.ts` currently owns built-in imports and cloud/nightly branches. The Omarketing import must be unconditional for the localhost distribution and must not edit `src/platform/distribution/types.ts` to create a new distribution mode.

### Static branding and notices

| Exact file                                            | Allowed diff                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                                          | Static title, splash/logo markup, favicon reference, and static accessible branding text only.                                                                                                                                                       |
| `manifest.json`                                       | Name, short name, description, and icon URLs only.                                                                                                                                                                                                   |
| `src/config.ts`                                       | Static `app_title` product name only; version behavior is unchanged.                                                                                                                                                                                 |
| `src/composables/useBrowserTabTitle.ts`               | Replace static ComfyUI title/suffix constants with Omarketing branding; execution/workflow/unsaved logic is unchanged.                                                                                                                               |
| `src/composables/useExternalLink.ts`                  | Static Omarketing source/issues URLs and preserved upstream URLs only; URL-building, locale, cloud, telemetry, and open behavior are unchanged. No value changes until the publisher proves control of its destination.                              |
| `src/components/sidebar/ComfyMenuButton.vue`          | Logo import/render and its accessible product name only; menu, telemetry, commands, settings, and interaction behavior are unchanged.                                                                                                                |
| `src/components/helpcenter/HelpCenterMenuContent.vue` | Relabel preserved Comfy docs/community/releases/support as upstream and route the existing GitHub/source item to the controlled Omarketing origin. No release fetching, command, telemetry, layout, visibility, updater, or menu interaction change. |
| `package.json`                                        | Package name/description/homepage/repository/license metadata only; no scripts, dependencies, engines, workspaces, overrides, or package-manager changes.                                                                                            |
| `README.md`                                           | Product identity, upstream attribution/source link, modified-source instructions, and local startup documentation only.                                                                                                                              |
| `THIRD_PARTY_NOTICES.md`                              | Upstream ComfyUI and added third-party attribution/license notices only.                                                                                                                                                                             |
| `public/assets/favicon.ico`                           | Static replacement asset.                                                                                                                                                                                                                            |

These new static files are also allowed, with no alternate names or locations:

- `public/assets/omarketing/logo.svg`
- `public/assets/omarketing/icon-192.png`
- `public/assets/omarketing/icon-512.png`
- `src/components/icons/OmarketingLogo.vue`

`src/components/icons/ComfyLogo.vue` is not modified; upstream identity remains available to upstream-owned surfaces that still use it.

The required About modification/source/license entries are registered through
the existing `aboutPageBadges` extension API from
`src/extensions/core/omarketing/index.ts`. `AboutPanel.vue` and its stores are
not modified.

### Generic Assets presentation hook

| Exact existing file                                         | Allowed diff                                                                                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/platform/assets/components/MediaAssetFilterBar.vue`    | Generic registered control/chip/status host.                                                                                                                                       |
| `src/platform/assets/composables/useMediaAssetFiltering.ts` | Generic registered predicate composition after existing search/media/date filtering.                                                                                               |
| `src/components/sidebar/tabs/AssetsSidebarTab.vue`          | Registry subscription, ephemeral orchestration, bounded metadata batching, and active-detail props.                                                                                |
| `src/components/sidebar/tabs/queue/MediaLightbox.vue`       | Generic read-only details/actions region and the accessibility changes necessary for interactive detail content.                                                                   |
| `src/locales/en/main.json`                                  | English labels/status/errors for the generic presentation hook/Omarketing provider plus static Omarketing-vs-upstream/help/external-connection wording. No unrelated copy rewrite. |
| `src/locales/ko/main.json`                                  | Korean labels/status/errors for the generic presentation hook/Omarketing provider plus static Omarketing-vs-upstream/help/external-connection wording. No unrelated copy rewrite.  |

These new generic files are allowed, with their responsibilities fixed by `assets-presentation-registry.md`:

- `src/platform/assets/presentation/assetPresentationRegistry.ts`
- `src/platform/assets/presentation/useAssetPresentation.ts`
- `src/platform/assets/presentation/AssetPresentationFilterControls.vue`
- `src/platform/assets/presentation/AssetPresentationDetails.vue`
- `src/platform/assets/presentation/outputLocatorV1.generated.ts`

The generic registry cannot import an Omarketing module. Dependency direction is Omarketing provider to generic registry only.

### Supported Phase 1 auth surface (CR-1)

These five exact existing paths are the complete set opened by CR-1 for purpose 4. A sixth path below covers the contract generator. No seventh path, wildcard, or directory grant exists.

| Exact file                                             | Allowed diff                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/TopMenuSection.vue`                    | Non-render of the legacy-layout `CurrentUserButton` and `LoginButton` auth entry points only. Menu, telemetry, commands, settings, routing, and every other interaction stay unchanged.                                        |
| `src/components/topbar/WorkflowTabs.vue`               | Non-render of the integrated-tab-bar `CurrentUserButton` and `LoginButton` auth entry points only. Tab behavior, layout computation, and every other interaction stay unchanged.                                               |
| `src/renderer/extensions/linearMode/MobileDisplay.vue` | Non-render of the responsive linear-mobile `CurrentUserButton` only. Surrounding mobile UI, menus, and workflow controls stay unchanged.                                                                                       |
| `src/components/dialog/content/setting/UserPanel.vue`  | Non-render of the logged-out Settings sign-in description, button, and handler entry point only. Every other settings behavior stays unchanged.                                                                                |
| `src/services/dialogService.ts`                        | Fail-closed behavior of `showSignInDialog` and `showApiNodesSignInDialog` only: they must not load a lazy auth component, must not call `dialogStore.showDialog`, and must return `false`. Every other dialog stays unchanged. |

These five files keep their upstream auth components and source. Deleting or rewriting auth capability, or blocking a later gateway attachment, is prohibited.

The following are prohibited implementations of this allowance and fail the gate: CSS hiding, DOM mutation or observers, a fabricated `isLoggedIn` or other synthetic auth state, monkey-patching a command, relocating auth logic into another allowlisted file, and any write outside these five files.

### Contract generator (CR-1)

| Exact file                                   | Allowed diff                                                                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.hermes/phase0/tools/generate-contracts.ts` | New non-build generator source. Reads exactly the two schemas below and emits exactly the two existing allowlisted `*.generated.ts` outputs. It produces no other output, adds no dependency, and changes no package script or lockfile. |

This tool is generator source, not a generated build artifact, and it is not part of the product runtime or bundle. Its inputs are exactly `.hermes/phase0/schemas/output-locator.v1.schema.json` and `.hermes/phase0/schemas/selection-manifest.v1.schema.json`. Its outputs are exactly `src/platform/assets/presentation/outputLocatorV1.generated.ts` and `src/extensions/core/omarketing/selectionManifestV1.generated.ts`.

The generator must classify every schema keyword through a fixed supported-keyword map before traversal, fail with the offending path when it meets an unsupported validation, applicator, or reference keyword, hold both rendered outputs in memory until both validate, and then publish both or neither. Digest equality alone is not sufficient: positive and negative parity vectors must cover each supported constraint class for both schemas. A second identical run must change zero outputs.

### Verification-only test files

These existing tests may change only to cover their corresponding allowlisted
host without weakening or deleting upstream assertions:

- `src/composables/useBrowserTabTitle.test.ts`
- `src/composables/useExternalLink.test.ts`
- `src/components/helpcenter/HelpCenterMenuContent.test.ts`
- `src/platform/assets/components/MediaAssetFilterBar.test.ts`
- `src/platform/assets/composables/useMediaAssetFiltering.test.ts`
- `src/components/sidebar/tabs/AssetsSidebarTab.test.ts`
- `src/components/sidebar/tabs/queue/MediaLightbox.test.ts`
- `src/components/TopMenuSection.test.ts`
- `src/components/topbar/WorkflowTabs.test.ts`
- `browser_tests/tests/browserTabTitle.spec.ts`
- `browser_tests/tests/legacyDoNotReplicate/legacyNodePositionMutation.spec.ts`

The two auth-host tests above carry one narrow CR-1 exception to the
no-weakening rule: **only auth-presence assertions may be inverted or retired
to match the new non-render or fail-closed behavior, and every other upstream
assertion remains unchanged under the existing rule.** Without this exception
the revision would contradict itself, because `TopMenuSection.test.ts` and
`WorkflowTabs.test.ts` currently assert that the auth entry points are
present. The exception never reaches queue, layout, accessibility, cleanup, or
any other assertion, and it does not authorize deleting a test file.
`src/composables/useCoreCommands.test.ts` is not added and must not change.

The two browser files above are a narrower exception: their only permitted
diff is replacing the product-display-name string `ComfyUI` with `Omarketing`
in the four existing browser-title expectations. Workflow-name, unsaved,
legacy-position-mutation, and cleanup semantics; polling; test structure and
names; tags; fixtures; and assertions are otherwise unchanged. Deletion,
skip/fixme, weakening, or any other edit is prohibited. The follow-up test lane
must still collect the existing three tests across these two files.

No other legacy/browser test file is allowed by this exception. In particular,
`browser_tests/tests/helpCenter.spec.ts` is not allowlisted because help/source
URL behavior is outside the name-only branding decision.

These new focused tests are allowed:

- `src/platform/assets/presentation/assetPresentationRegistry.test.ts`
- `src/platform/assets/presentation/useAssetPresentation.test.ts`
- `src/platform/assets/presentation/AssetPresentationFilterControls.test.ts`
- `src/platform/assets/presentation/AssetPresentationDetails.test.ts`
- `src/extensions/core/omarketing/index.test.ts`
- `src/extensions/core/omarketing/assetsPresentation.test.ts`
- `src/extensions/core/omarketing/projectContext.test.ts`
- `src/extensions/core/omarketing/referenceFanout.test.ts`
- `src/extensions/core/omarketing/authSession.test.ts`
- `src/components/dialog/content/setting/UserPanel.test.ts`
- `src/services/dialogService.test.ts`
- `src/renderer/extensions/linearMode/MobileDisplay.test.ts`
- `.hermes/phase0/tools/generate-contracts.test.ts`
- `browser_tests/tests/omarketing/phase1-additive.spec.ts`

The four new tests above were confirmed absent before CR-1 and are therefore
new files, not edits. `src/views/LinearView.test.ts` treats `MobileDisplay` as
a leaf stub, so it is not substitute evidence for mobile auth behavior and is
not allowlisted. `.hermes/phase0/tools/generate-contracts.test.ts` runs through
`pnpm exec tsx --test` because the repository Vitest include does not collect
`.hermes/**`; this must not become a package script, config, or dependency
change.

No snapshot-only assertion may replace behavioral, accessibility, cleanup, and
failure-isolation assertions required by the contracts.

## Allowed additive frontend extension files

The following are additive extension code, not permission to modify more core files:

- `src/extensions/core/omarketing/index.ts`
- `src/extensions/core/omarketing/assetsPresentation.ts`
- `src/extensions/core/omarketing/projectContext.ts`
- `src/extensions/core/omarketing/referenceFanout.ts`
- `src/extensions/core/omarketing/authSession.ts`
- `src/extensions/core/omarketing/selectionManifestV1.generated.ts`

The extension may register provider metadata, custom-node widget behavior, node help/settings/commands, and official template metadata through existing extension APIs. It may call the existing `ComfyApp.queuePrompt(number, batchCount)` API only as specified by `project-key-and-fanout.md`. It cannot monkey-patch that method or own executable node logic.

The two `*.generated.ts` files are emitted together from the exact backend
package JSON Schemas by the release generator. They contain runtime Zod
parsers using the repository's existing `zod` dependency plus inferred
readonly TypeScript types. Their header records source schema path, schema
SHA-256, generator version, and `DO NOT EDIT`. Hand-authored type/schema copies
or a dependency/lockfile change fail the gate.

A need for another additive file requires review of file placement but does not by itself authorize another existing core-file modification. A need for another existing core host is a hard allowlist failure and requires a contract revision before implementation.

## Exact no-touch boundaries

### Prompt, Queue, execution, cache, failure, and cancel

The following exact files and trees are immutable:

- `src/scripts/app.ts`
- `src/scripts/api.ts`
- `src/scripts/ui.ts`
- `src/composables/useCoreCommands.ts`
- `src/services/autoQueueService.ts`
- `src/stores/queueStore.ts`
- `src/stores/executionStore.ts`
- `src/platform/remote/comfyui/jobs/**`

CR-1 does not relax this list. `src/composables/useCoreCommands.ts` stays
immutable, so the `Comfy.User.OpenSignInDialog` command registration remains in
the command registry during Phase 1. That residue is a recorded Phase 1 known
limitation carried to the v1 release gate, where `auth-gateway.md` requires
command-level unreachability for the supported v1 flow. Phase 1 proves the
residue is inert instead of removing it: invoking the command must open zero
dialogs because `src/services/dialogService.ts` is fail-closed. Editing
`useCoreCommands.ts`, or moving its auth logic into an allowlisted file, fails
the gate.

This preserves `ComfyApp.queuePrompt`, `queueItems`, `processingQueue`, `graphToPrompt`, `beforeQueued`/`afterQueued` timing, `/prompt` submission, existing Queue front/back meaning, error handling, interrupt/cancel, progress, History, and cache behavior.

### Workflow persistence and user files

The following exact files/trees are immutable:

- `src/platform/workflow/**`
- `src/stores/userFileStore.ts`
- `src/stores/nodeDefStore.ts`

There is no Workflow-save interception, folder identity store, automatic move/rename rebind, custom draft path, or replacement template persistence. Existing Save, Save As, rename, duplicate, import, export, delete, tabs, drafts, and autosave remain intact.

### Assets data and existing card/selection behavior

Everything under `src/platform/assets/**` is immutable except the eight exact generic host/new files listed above. In particular, these existing surfaces are explicitly no-touch:

- `src/platform/assets/components/MediaAssetCard.vue`
- `src/platform/assets/components/MediaAssetSelectionBar.vue`
- `src/platform/assets/components/MediaAssetContextMenu.vue`
- `src/platform/assets/composables/media/**`
- `src/platform/assets/composables/useMediaAssetFilterStore.ts`
- `src/platform/assets/composables/useMediaAssetGalleryStore.ts`
- `src/platform/assets/composables/useAssetSelectionStore.ts`
- `src/platform/assets/composables/useAssetSelection.ts`
- `src/platform/assets/composables/useMediaAssetActions.ts`
- `src/platform/assets/composables/useOutputStacks.ts`
- `src/platform/assets/schemas/**`

The JSON schemas under `.hermes/phase0/schemas/` are contracts and fixtures, not permission to alter product Assets schemas. Existing History-backed indexing and pagination are not extended into a permanent filesystem index.

### Canvas, widget types, distribution, and global UI

The following exact files/trees are immutable:

- `src/lib/litegraph/**`
- `src/types/litegraph-augmentation.d.ts`
- `src/types/comfy.ts`
- `src/types/extensionTypes.ts`
- `src/platform/distribution/types.ts`
- `src/router.ts`
- `src/stores/**`, except no store file is currently allowlisted

The extension uses existing `IBaseWidget.beforeQueued`, `IBaseWidget.afterQueued`, `serializeValue`, `nodeCreated`, and `loadedGraphNode` contracts without changing their types. It does not add methods or fields to LiteGraph classes or global stores.

### Backend and operational boundaries

This frontend allowlist does not authorize:

- frontend implementations of executable Omarketing nodes or external adapters;
- a second backend API client that bypasses same-origin authenticated routes;
- migrations or edits to existing workflow/output data;
- generated build artifacts;
- Git configuration, remote, commit, tag, or push changes;
- server start/restart, deployment, or production calls.

Backend package files are governed by the separate Phase 0 package/security contracts.
The existing frontend `LICENSE` file is retained byte-for-byte and is not
allowlisted for modification.

## Diff accounting rules

- Renaming an allowlisted file counts as deleting the old path and creating an unapproved path; it fails.
- Moving logic from a denied file into an allowlisted file to bypass the boundary fails.
- A formatter-only diff outside an exact allowlisted file fails.
- Tests do not silently enlarge the core allowlist. Only the exact
  verification files above are approved; this Phase 0 contract itself creates
  no product tests.
- Generated lockfile changes fail because no dependency change is authorized.
- A generated contract file without matching source-schema digest/release
  receipt, or a hand edit to one, fails.
- Importing the Omarketing provider directly from an Assets host fails the generic-hook requirement.
- Static branding cannot change commands, telemetry, authentication, menus, routing, or feature flags. Branding scope and the CR-1 auth restriction are separate allowances and must not be conflated: a branding edit still may not touch authentication, and an auth edit still may not touch branding.
- The CR-1 auth allowance applies only to the designated auth entry behavior in the five exact auth source files. CSS hiding, DOM mutation or observers, fabricated login state, command monkey-patching, logic relocation, and any write outside those five files fail.
- The CR-1 generator allowance applies only to `.hermes/phase0/tools/generate-contracts.ts` producing exactly the two existing allowlisted generated outputs from exactly the two named schemas. An extra output, extra source path, package script, dependency, or lockfile change fails.
- Durable receipts and inventories are written outside the product repository under the run's `EVIDENCE_ROOT`. Adding a receipt or manifest path inside `Omarketing/` fails.
- The only permitted core-to-extension edge is the one import in `src/extensions/core/index.ts`.

## Durable evidence contract

An implementation run writes exactly these three durable artifacts, and only
under its `EVIDENCE_ROOT` outside the product repository. Creating any of them
inside `Omarketing/`, renaming one, or omitting one fails the gate.

| Artifact               | Exact filename                               | Minimum schema                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W0 scope inventory     | `w0-scope-inventory.<baseline-commit>.json`  | `baseline`, `captured_at`, `modified[]`, `untracked[]`, `phase1_candidate[]`, `preexisting_or_other_lane[]`. Paths sort lexically. It records path and classification only, never file contents.                                                                                                                                                                                                   |
| AC-5 generator digest  | `ac-5-generator-digest.receipt.json`         | `schema_version`, `generator{path,version}`, `inputs[2]{path,sha256}`, `outputs[2]{path,sha256}`, `supported_keyword_map_version`, `parity{schema_path,positive_passes,negative_rejections}`, `prepublish{validated_outputs:2,published_outputs:2}`, `second_run{changed_outputs:0}`, `package_mutations{scripts:0,dependencies:0,lockfiles:0}`, `reviewer`, `reviewed_at`. Arrays sort lexically. |
| AC-13 allowlist review | `ac-13-core-allowlist-10-check.receipt.json` | `schema_version`, `baseline`, `frozen_diff_id`, `checks[10]`, `reviewer`, `reviewed_at`. The fixed row schema and order are defined at the end of this document.                                                                                                                                                                                                                                   |

The AC-5 receipt is the generator's release receipt for the purpose of the
diff-accounting rule above: a generated contract file is accepted only when this
receipt exists and its recorded input digests match the source schemas it was
built from. `inputs` and `outputs` must each contain exactly two entries,
`second_run.changed_outputs` must be `0`, and every `package_mutations` counter
must be `0`.

## Verification table for the implementation gate

No test, build, lint, formatter, migration, server, commit, or push is run for this Phase 0 contract task. The caller validates all Phase 0 artifacts together. A later implementation diff must satisfy:

| Check                     | Pass                                                                                                                                   | Fail                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Path allowlist            | Every modified existing path appears verbatim in an allowed table, including the five CR-1 auth sources and the CR-1 generator source. | Any absent path, rename, generated file, or incidental formatting change.          |
| Bootstrap ceiling         | One import is added to `src/extensions/core/index.ts`; all existing imports/branches are byte-for-byte functionally unchanged.         | More than one bootstrap hook, conditional distribution edit, or startup reorder.   |
| Branding scope            | Only static identity/assets/notices and exact accessible logo text change.                                                             | Menu, telemetry, auth, routing, settings, command, or dependency behavior changes. |
| Generic dependency        | Assets hosts import generic presentation modules only; the Omarketing extension registers through the registry.                        | A host imports `src/extensions/core/omarketing/**` or branches on Omarketing.      |
| Assets integrity          | Existing provider/store/schema/card/context-menu/selection files have no diff.                                                         | An Omarketing store/index/card badge/context-menu/bulk authority action appears.   |
| Queue integrity           | No diff in prompt, API, Queue, execution, jobs, Run, Shift+Run, or Auto Queue files.                                                   | Fan-out changes a global Run path or patches `queuePrompt`.                        |
| Workflow integrity        | No diff in workflow management/persistence or user-file store.                                                                         | Save completion is intercepted or path/folder becomes a new identity model.        |
| LiteGraph integrity       | No diff under `src/lib/litegraph/**` or widget/extension type declarations.                                                            | Core class/type/callback semantics change.                                         |
| Dependency/lock integrity | No dependency or lockfile change.                                                                                                      | A package, script, override, or lock entry changes.                                |
| Operational integrity     | Review shows no migration/server/Git/deploy side effect.                                                                               | The implementation relies on any prohibited operational action.                    |

The ten checks above are unchanged in count and meaning. CR-1 adds no eleventh
check; it only widens the exact-path set that `Path allowlist` accepts and
splits branding scope from the auth restriction inside the existing rules.

The frozen implementation change set is reviewed against these ten rows and
recorded as `ac-13-core-allowlist-10-check.receipt.json` under the run's
`EVIDENCE_ROOT`, with one row per check carrying `check_id`, `status`,
`evidence_pointer`, `reviewer`, and `reviewed_at`. The fixed row order is
`path-allowlist`, `bootstrap-ceiling`, `branding-scope`, `generic-dependency`,
`assets-integrity`, `queue-integrity`, `workflow-integrity`,
`litegraph-integrity`, `dependency-lock-integrity`, `operational-integrity`.
A missing, duplicated, or extra row fails, and any single `FAIL` row fails the
gate while the receipt is still preserved as a factual record.
