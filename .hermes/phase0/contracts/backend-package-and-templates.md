# Backend package and official-template contract

## Approved local selection persistence CR

Exact root plan §5.2 write ownership approved, including selection_history.py/selection_host.py adapters, gateway selection_host.py, local-selection-api.schema.json and named tests. Backend intentionally non-Git: external current-byte evidence substitutes offline inventory only, not release lineage. All-or-none atomic selection-only mount, no listener/producer fabrication. Store/crypto/Auto remain read-only.

## Approved actual-owner and bounded still-output package CR (2026-09-06)

The backend package now explicitly includes `services*` and declares tested `aiohttp>=3.10,<4`; no design runtime receives an install. Authorized exact additions are `services/auth_gateway/{http_host,login_document,operator_host,design_result_host}.py`, `tools/{owner_selection_host,owner_auth}.py`, `comfyui_omarketing/services/design_result_admission.py`, `storage/design_result_receipts.py`, `nodes/design_result_output.py`, `schemas/v1/design-result-admission.schema.json`, and the named owner/design-result tests in the approved real-owner plan §3. The package import remains non-listening and DB-free. Backend remains intentionally non-Git; current-byte hashes/evidence do not imply release lineage. Provider/Auto/publication activation, generic run/asset registries and existing design runtimes remain excluded.

Status: Phase 0 architecture contract; no product implementation

## Revision record (2026-08-31)

W1 resolves the backend storage and process ownership boundary. This revision
is contract evidence only; it does not claim implementation or production
readiness. The separate `comfyui-omarketing` repository contains the
in-process Comfy bridge, one auth-gateway process, and a loopback/private-only
provider-adapter service. The gateway owns auth SQLite only; the provider
adapter owns external HTTP and atomic lifecycle files. Existing project JSON
and output-local `selection.json` remain their authorities.

## Decisions

| Topic                | Decision                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend baseline     | Pin ComfyUI backend commit `b08e6cf35fac50d3ca8470dffb3f9a1fbb7187d2`. This is the Phase 0 compatibility and CI baseline.                                                                                                                                                                                                                                           |
| Executable extension | Maintain a separate repository named `comfyui-omarketing`; install its checkout at `<ComfyUI>/custom_nodes/comfyui-omarketing/`. Do not put executable Python nodes in the frontend repository.                                                                                                                                                                     |
| In-process license   | License the bridge loaded by the ComfyUI process as `GPL-3.0-only`. Files deliberately dual-licensed for cross-process contracts must carry their own SPDX identifier and remain separable.                                                                                                                                                                         |
| Runtime surfaces     | The separate `comfyui-omarketing` repository contains the in-process Comfy bridge, `services/auth_gateway/**` (one gateway process), and `services/provider_adapter/**` (one loopback/private-only adapter service). The Comfy process calls only the adapter boundary; the adapter alone resolves reusable service secrets and calls Odesign/provider endpoints.   |
| Templates            | The backend package is the source of truth for the five official workflow JSON files, preview media, and catalog metadata. The Omarketing frontend release appends that metadata to the existing static template catalog without replacing upstream categories. Workflow and preview bytes are served from the package's nested `example_workflows/official/` path. |
| Existing behavior    | Existing core templates, first-run/default templates, and `/workflow_templates` user/custom-node templates remain available and in their current order and semantics.                                                                                                                                                                                               |

This contract does not authorize a backend upgrade. A revision of the backend pin is deliberate only when a change record identifies the old and new commits, explains the reason, records relevant upstream API changes, and reruns all compatibility gates listed below. A floating branch, tag, or `latest` image is not a revision record.

## Compatibility baseline

The package and its CI matrix must use the full backend commit, not an abbreviated hash:

```text
COMFYUI_BACKEND_COMMIT=b08e6cf35fac50d3ca8470dffb3f9a1fbb7187d2
```

The receipt for every package release records:

- backend repository URL and exact commit;
- Python version and lockfile digest;
- `comfyui-omarketing` source tag and commit;
- frontend source tag and commit used for the matching catalog overlay;
- schema bundle version and digest;
- the `/object_info` snapshot digest;
- the route/cancel/storage fixture set digest.

A proposed pin change is blocked until the same receipt exists for the new commit and differences in custom-node loading, route registration, `/object_info`, prompt execution, progress, interruption, History outputs, `/view`, and template serving are reviewed. Existing Queue/History, cache, failure, cancel, Workflow, Assets, and LiteGraph semantics are not adaptation points.

## Repository and package tree

The following tree is normative. Additional files require an ownership assignment and may not blur the boundaries below.

```text
comfyui-omarketing/
├── LICENSE
├── README.md
├── CHANGELOG.md
├── THIRD_PARTY_NOTICES.md
├── pyproject.toml
├── uv.lock
├── __init__.py                       # Comfy custom-node loader entrypoint
├── package-lock.json                 # release inventory only if web assets need npm
├── SBOM.spdx.json
├── LICENSES/
│   └── Apache-2.0.txt                # only for explicitly dual-licensed contracts
├── comfyui_omarketing/
│   ├── __init__.py                   # package exports used by the root loader shim
│   ├── config.py                     # validated non-secret settings and secret handles
│   ├── errors.py                     # safe error mapping/redaction
│   ├── nodes/
│   │   ├── context.py                # project context and strategy inputs
│   │   ├── research.py               # search, ranking, selection, acquisition
│   │   ├── analysis.py               # decomposition and brief nodes
│   │   ├── production.py             # Hermes/media request nodes
│   │   ├── qa.py                     # technical/similarity/marketing QA nodes
│   │   └── utility.py                # schema gate/branch/fan-out/merge utilities
│   ├── routes/
│   │   ├── project_context.py        # owner-scoped context actions
│   │   ├── selection.py              # server-validated selection action
│   │   ├── connections.py            # connection health/re-auth status, no credentials
│   │   └── receipts.py               # safe external-job and cancellation receipts
│   ├── storage/
│   │   ├── project_context.py        # owner/project-key records
│   │   ├── selection_manifest.py     # temp-write, fsync, atomic replace, revision check
│   │   ├── output_locator.py         # root containment and file revalidation
│   │   ├── dispatch_journal.py       # backend-owned atomic lifecycle journal
│   │   ├── quarantine.py              # private metadata/bytes quarantine
│   │   └── paths.py                   # configured lifecycle path containment
│   ├── services/
│   │   ├── prompt_admission.py        # immutable context/selection/fan-out pins
│   │   └── comfy_bridge.py            # Comfy-only bridge to private adapter
│   └── web/
│       ├── index.js                  # optional custom-node widget glue only
│       └── widgets/                  # actions around normal Comfy executions
├── services/
│   ├── auth_gateway/
│   │   ├── app.py                     # same-origin session/proxy process
│   │   ├── auth.py                    # owner context and session enforcement
│   │   ├── routes.py                  # browser-facing protected routes only
│   │   ├── storage/database.py       # sole gateway SQLite accessor
│   │   ├── migrations/**             # gateway-only SQLite migrations
│   │   └── maintenance/**            # stopped-gateway backup/restore/CLI
│   └── provider_adapter/
│       ├── service.py                 # loopback/private-only adapter boundary
│       ├── external_jobs.py           # bounded Odesign/provider lifecycle
│       ├── http.py                    # external HTTP, timeouts and TLS
│       ├── polling.py                 # authoritative polling
│       ├── artifacts.py               # streaming and checksum read-back
│       └── reconciliation.py          # startup crash/orphan convergence
├── deploy/
│   └── runbooks/**                    # deployment and rollback runbooks
├── schemas/
│   ├── v1/                            # versioned JSON Schema and examples
│   ├── openapi/                       # HTTP boundary contracts
│   └── registry.py                    # exact supported schema versions
├── example_workflows/
│   └── official/
│       ├── catalog.json              # official metadata source of truth
│       ├── omarketing-reference-shorts.json
│       ├── omarketing-reference-shorts.webp
│       ├── omarketing-reference-carousel.json
│       ├── omarketing-reference-carousel.webp
│       ├── omarketing-reference-meta-ad.json
│       ├── omarketing-reference-meta-ad.webp
│       ├── omarketing-reference-google-search.json
│       ├── omarketing-reference-google-search.webp
│       ├── omarketing-reference-google-display-pmax.json
│       ├── omarketing-reference-google-display-pmax.webp
│       └── media/
│           └── omarketing-logo.svg
├── tests/
│   ├── fixtures/
│   │   ├── schemas/
│   │   ├── adapters/
│   │   ├── output_locators/
│   │   ├── cancellation/
│   │   └── templates/
│   ├── contract/
│   └── integration/
└── tools/
    ├── validate_catalog.py
    ├── export_catalog_overlay.py
    ├── export_frontend_contracts.py
    ├── generate_sbom.py
    └── release_receipt.py
```

The checked-in source ownership is exact: `services/auth_gateway/**` owns the
single gateway process, with `storage/database.py`, `migrations/**`, and
`maintenance/**` beneath that service owning gateway persistence/maintenance;
`services/provider_adapter/**` owns the private adapter; `comfyui_omarketing/storage/
{dispatch_journal.py,quarantine.py,paths.py}` owns lifecycle files; and
`deploy/runbooks/**` owns deployment runbooks. Runtime database, WAL, backup,
and user-data paths are never source files in this tree.

### W1 deployment ownership tree

The following runtime topology is separate from the checked-in source tree.
It maps directly to the source-owned surfaces above; it is not an additional
repository or an implementation/production receipt.

```text
runtime deployment (all paths below are outside source control)
├── comfyui process
│   └── <ComfyUI>/custom_nodes/comfyui-omarketing/
│       └── in-process bridge → loopback/private adapter
├── omarketing-auth-gateway process (exactly one)
│   ├── configured auth SQLite path + WAL files
│   └── configured backup directory
├── provider-adapter process (loopback/private-only)
│   └── <COMFY_USER_DIRECTORY>/omarketing/v1/external-lifecycle/
│       ├── journals/<scope_id>/
│       ├── locks/<scope_id>.lock
│       ├── leases/reconciler.lease
│       ├── receipts/<scope_id>.json
│       └── quarantine/{records,bytes,incident-holds}/<scope_id>/
└── deployment runbooks
    └── sourced from comfyui-omarketing/deploy/runbooks/
```

Runtime DB, WAL, backups, and `<COMFY_USER_DIRECTORY>/omarketing/v1/` are
deployment configuration and MUST NOT appear as checked-in files. The auth
gateway is the sole runtime accessor for auth SQLite; only its stopped-gateway migration,
maintenance, and backup/restore tools may open that database under an exclusive
maintenance fence. The custom node, Comfy bridge, provider adapter journal,
and reconciliation service MUST have zero auth-DB path or driver access.
External lifecycle records cannot be rolled back by an auth database restore.
Existing project JSON and output-local `selection.json` remain authoritative;
neither moves to SQLite or the external journal.

`example_workflows/official/` is deliberately nested. At the pinned backend, `/workflow_templates` discovers only JSON files immediately inside `example_workflows/`; keeping official JSON one level deeper prevents a second, metadata-poor Extensions listing. The backend static workflow-template route still serves nested files. If a later backend changes either behavior, the backend pin revision gate must resolve the change before release.

The root `__init__.py` is mandatory because the pinned Comfy loader executes
`<custom-node-directory>/__init__.py`. It imports the package's node mappings
and display names, registers only the contracted routes, and declares
`WEB_DIRECTORY = "./comfyui_omarketing/web"`. The internal package
`comfyui_omarketing/__init__.py` alone is not a valid Comfy entrypoint for the
contracted hyphenated checkout path.

The import root and repository folder name are fixed. Renaming either is a breaking release because the template catalog's `moduleName` and served workflow URL depend on the loaded custom-node module identity.

`export_frontend_contracts.py` consumes the exact release schemas for
OutputLocator and SelectionManifest and emits the two allowlisted frontend
`*.generated.ts` files. The emitted code uses the frontend's existing `zod`
runtime, exports types through `z.infer`, and embeds source/generator digests.
Release CI regenerates into a temporary directory and byte-compares the
checked-in frontend files; it never edits them during application startup.

## Boundary ownership

| Boundary                                                                                                               | Owner                        | Owns                                                                                                                                                                              | Must not own                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodes/`                                                                                                               | Omarketing backend team      | `/object_info` node definitions, payload validation, normal synchronous Comfy execution entrypoints                                                                               | Queue, History, cache, prompt submission, a waiting-for-human node state                                                                                  |
| `routes/`                                                                                                              | Omarketing backend team      | Minimal owner-scoped context, selection, connection, and receipt actions                                                                                                          | Workflow CRUD, Run API, Asset index, custom job state machine, raw provider errors                                                                        |
| `comfyui_omarketing/storage/`                                                                                          | Omarketing backend team      | Project context keyed by immutable `project_key`; atomic `selection.json`; locator revalidation; its child external lifecycle journal, receipts, quarantine, and path containment | Workflow files, Queue/History records, auth SQLite, permanent Asset database, trash/version/approval system                                               |
| `comfyui_omarketing/services/`                                                                                         | Omarketing backend team      | Prompt-admission revision pins and the in-process Comfy bridge calling only the private adapter boundary                                                                          | Direct Odesign/provider HTTP, service-secret resolution, auth SQLite access, Queue/History rewrite, cross-prompt execution resume, a second Run authority |
| `services/auth_gateway/`                                                                                               | Security/operations          | One same-origin browser session/proxy process and validated short-lived owner context                                                                                             | Node execution, provider/Odesign logic, external HTTP, lifecycle journal, auth data outside its configured SQLite                                         |
| `services/provider_adapter/`                                                                                           | Integration team             | Loopback/private-only adapter boundary, service-secret resolution, external HTTP, polling, artifact streaming, and bounded Odesign/provider lifecycle                             | Browser routes, Comfy Queue/History/Run/Asset authority, frontend state, auth SQLite                                                                      |
| `services/auth_gateway/storage/database.py`, `services/auth_gateway/migrations/`, `services/auth_gateway/maintenance/` | Security/operations          | Auth-only SQLite repository, gateway-only migrations, and stopped-gateway backup/restore/CLI tools                                                                                | Project/selection data, external lifecycle files, provider data, node logic                                                                               |
| `comfyui_omarketing/storage/{dispatch_journal.py,quarantine.py,paths.py}`                                              | Integration team             | Backend-owned atomic journal, versioned receipts, reconciliation file paths, quarantine metadata/bytes and incident holds                                                         | Auth SQLite, Workflow/Run/Asset authority, browser-visible data                                                                                           |
| `schemas/`                                                                                                             | Omarketing contract owners   | Versioned primitives, payloads, adapter/OpenAPI contracts, fixtures                                                                                                               | Provider-native naming leaking into nodes or frontend-only synthetic identifiers                                                                          |
| `web/`                                                                                                                 | Frontend integration team    | Optional node widgets and node help invoking normal Comfy executions or minimal package routes                                                                                    | Alternate queue runner, frontend run state machine, direct service calls, Assets store replacement                                                        |
| `example_workflows/official/`                                                                                          | Omarketing template curators | Five canonical workflows, metadata, logo, previews, digests                                                                                                                       | User templates, copies saved into projects, unreviewed community templates                                                                                |
| Frontend built-in extension                                                                                            | Omarketing frontend team     | One bootstrap import, node help/settings, generic Assets presentation use                                                                                                         | Executable nodes, external credentials, prompt/Queue/History semantics                                                                                    |
| Frontend template release assembly                                                                                     | Release engineering          | Additive generated catalog/logo overlay from the exact backend-package tag                                                                                                        | Runtime gallery interception, hand-edited generated files, removal or rewriting of upstream/user templates                                                |
| Auth gateway                                                                                                           | Security/operations          | Same-origin session enforcement and protected routing                                                                                                                             | Node execution logic or external provider implementation                                                                                                  |
| Hermes/automation/media services                                                                                       | Respective service teams     | Independent HTTP API and internal state                                                                                                                                           | Filesystem access to Comfy roots, imports from the bridge, browser-visible credentials                                                                    |

## In-process bridge rules

1. The root loader shim exposes node mappings, display names,
   `WEB_DIRECTORY`, and the contracted package routes imported from
   `comfyui_omarketing`. Neither root nor internal `__init__` may patch Comfy
   core functions or stores.
2. All executable marketing behavior is represented by custom nodes returned by `/object_info` and executed by the normal prompt path.
3. Human reference selection and final-output selection occur after one normal Comfy execution and before a later normal execution. No node may keep an execution open while awaiting human input or approval.
4. The bridge observes the existing Comfy interruption signal while awaiting the private adapter. It asks the adapter to perform an idempotent external cancel request and records the adapter's receipt; it does not contact Odesign/provider endpoints or redefine Comfy cancellation.
5. External progress, errors, and outputs map into existing Comfy progress/output/failure channels. A bridge-specific terminal state is prohibited.
6. Workflows and node widgets contain opaque `connection_id` values only. The
   Comfy process contains no reusable Odesign/provider credential. Tokens,
   cookies, provider error bodies, internal URLs, and reusable signed URLs never
   enter workflow JSON, prompt metadata, logs returned to the browser, or
   WebSocket query strings.
7. The selection route accepts a structured primitive output locator. It recomputes output-root containment, SHA-256, MIME, and size and writes the manifest with revision/`If-Match` conflict protection. It never treats a frontend-generated card ID as authority.
8. The bridge may write outputs below the existing Comfy output root and the contract-defined context/manifest records. It must not create an independent Asset index or assume a file remains discoverable after History is removed.

## Private adapter and external-service HTTP boundary

The browser never calls Odesign, providers, or the private adapter. The
in-process Comfy bridge calls only the loopback/private provider-adapter
boundary using a short-lived, integrity-protected server context containing
the authenticated owner, immutable project key, workflow locator, prompt/node
correlation, operation, deadline, and payload digest. The bridge MUST NOT
resolve reusable service secrets, construct external URLs, open provider
connections, or call Odesign/provider endpoints directly.

The auth gateway owns browser same-origin session/proxy enforcement and auth
SQLite only. It validates the session, signs/injects the short-lived owner
context, and never passes reusable credentials to the Comfy process. The
bridge forwards that context unchanged to the adapter. The gateway MUST NOT
own node execution, provider/Odesign logic, service secrets, external HTTP,
polling, artifact streaming, or lifecycle files.
`services/provider_adapter/**` alone resolves reusable service secrets and
performs bounded external HTTP, polling, artifact streaming, idempotent
cancel, and atomic lifecycle journal/reconciliation operations. The adapter
returns only versioned safe receipts to the bridge.

Every bridge-to-adapter request includes a schema version, request ID,
server-derived owner, immutable project key, workflow locator, prompt/node
correlation, idempotency key, timestamp, deadline, and payload digest. Every
adapter-to-provider request derives its service principal and credentials
from server configuration. No provider credential, reusable secret, signed
URL, provider response body, or private URL may reach the custom node,
workflow, prompt metadata, browser, logs, URLs, or output metadata.

Every accepted asynchronous adapter call returns an opaque external job
locator and versioned receipt. Terminal reconciliation requires a fresh
authenticated poll, artifact checksum read-back, and schema validation.
Production promotion is blocked for an adapter lacking bounded
connect/read/overall timeouts, idempotency, safe error mapping, artifact
expiry/refresh handling, terminal reconciliation, and an idempotent cancel
endpoint. HTTP separation is an architectural boundary, not implementation
or production evidence.

## Official-template delivery

### Canonical artifacts

`example_workflows/official/catalog.json`, the five workflow JSON files, preview WebP files, and the Omarketing SVG logo in the backend package repository are the only editable sources. Generated frontend catalog entries or copied static assets are never edited by hand.

The catalog has one category with:

```text
moduleName: comfyui-omarketing
title: Omarketing
category: Omarketing
type: nodeGraph
```

Each template entry has a stable ID of the form `official/<template-id>`, an explicit human title and description, `mediaType`, `mediaSubtype`, `tags`, `date`, `license`, and `logos: [{"provider":"Omarketing"}]`. Tags always include `omarketing`, `marketing`, and the applicable content/channel terms. The logo index receives an additive `Omarketing` key. Do not emit `requiresCustomNodes` at the pinned frontend baseline: its current local-gallery policy hides entries carrying that field. The Omarketing distribution instead installs the matching package as a release prerequisite and treats a missing node with the existing Comfy missing-node behavior. A later use of `requiresCustomNodes` requires a frontend-baseline revision proving local visibility.

The stable IDs are:

- `official/omarketing-reference-shorts`
- `official/omarketing-reference-carousel`
- `official/omarketing-reference-meta-ad`
- `official/omarketing-reference-google-search`
- `official/omarketing-reference-google-display-pmax`

### Release assembly

The frontend release consumes an exact `comfyui-omarketing` tag and digest. `export_catalog_overlay.py` validates the catalog and emits an overlay plus logo/static-media digests. Release assembly then:

1. starts with the pinned upstream template `index.json` and `index_logo.json` bytes;
2. verifies their expected version and digest;
3. removes only a category whose exact `moduleName` is `comfyui-omarketing` (update case);
4. appends the newly generated Omarketing category without reordering or rewriting any upstream category;
5. adds or updates only the exact `Omarketing` logo key, failing on a conflicting non-Omarketing value;
6. copies the Omarketing logo required by the existing logo URL path;
7. records source tag, catalog digest, workflow digests, and resulting aggregate-index digest in the release receipt.

At runtime the existing gallery reads the aggregate static index, so category, tags, title, description, and logo use the existing official-template presentation. Workflow JSON and preview media resolve through the pinned backend's nested custom-node template route for module `comfyui-omarketing`. The existing `/workflow_templates` response still supplies user and other custom-node templates. No existing item is filtered, renamed, promoted, or overwritten.

Release/deployment installs the generated aggregate `index.json`,
`index.<locale>.json` files when provided, `index_logo.json`, and copied logo
assets into the template bundle actually exposed by the pinned backend at
`/templates/**`. They are not written into the frontend source tree at
runtime. Deployment fails if the backend serves a different digest than the
release receipt.

This is the final delivery approach. Serving only the five files as ordinary top-level custom-node examples is rejected because the current custom-template map carries names but not the category/tag/logo metadata required for official presentation. Replacing the whole catalog, hard-coding cards in the gallery, or intercepting template selection is also rejected.

### Copy and update semantics

- Opening an official template loads an immutable source workflow. Saving creates a normal project workflow copy; the source is never modified.
- A saved copy records the template ID and template package version only as provenance. The package does not retain ownership of the copy.
- A template update creates a new package release and may update the immutable source for future copies. It never rewrites an existing project workflow or its `project_key`.
- Within the same project, duplicate/Save As retains the existing `project_key`. Copying into another top-level project or importing externally requires a newly initialized key under the separate project-context contract.
- User custom templates never receive the Omarketing official category, badge, tags, or logo. A workflow derived from an official template is not itself official.
- Removing the package makes the official source templates and custom nodes unavailable but does not delete saved workflow copies, Queue/History, outputs, or user templates.
- Template workflow JSON contains no credentials, owner IDs, environment URLs, provider secrets, or live external artifact handles.

## Gates and blockers

Phase 1 or template release remains blocked if any item below is false:

- backend CI and the release receipt use the exact pinned commit, or an approved pin-revision record is complete;
- the installed repository path and loaded module name are exactly the contracted values;
- `/object_info` shows the intended nodes without core monkey patches;
- routes are minimal, same-origin protected, owner-derived, and do not duplicate Workflow/Run/Asset APIs;
- the Comfy bridge makes only loopback/private adapter calls using an
  integrity-protected short-lived context; no bridge code can resolve service
  secrets, construct provider URLs, or contact Odesign/providers;
- the provider adapter alone owns service-secret resolution, external HTTP,
  polling, artifact streaming, and lifecycle journal/reconciliation; the auth
  gateway injects validated owner context and owns no node/provider logic;
- Odesign v1 has no reachable HMAC push/callback listener, route, setting, or
  toggle; enabling it requires a separately versioned contract, exact write-set
  review, and explicit scope approval;
- the auth gateway is the only runtime SQLite accessor, migrations/maintenance use the stopped-gateway fence, and custom nodes, adapters, journals, and reconciliation have no auth DB path or driver;
- the dispatch journal is durably and exclusively created before the first network byte, and the atomic-file lock/lease, crash-recovery, quarantine retention, and incident-hold gates pass;
- all six Odesign labels project through the closed informational receipt to the unchanged generic lifecycle and Comfy terminal semantics;
- `APPROVAL_REQUIRED_IN_ODDESIGN` is schema-valid, registry-bound as a
  non-retryable fixed-message failure, and cannot carry dynamic guidance,
  retryability, category, or remediation overrides;
- no second Run or Asset authority exists in SQLite, the external journal, receipts, quarantine, or frontend state;
- storage fixtures prove containment, checksum/MIME/size recomputation, atomic replacement, conflict detection, and stale detection;
- adapter fixtures prove timeout, redaction, idempotency, cancellation receipt, late-result handling, and terminal reconciliation;
- no credential appears in workflow, prompt, output metadata, browser storage, logs exposed to the browser, or query strings;
- no runtime SQLite database, WAL, backup, or user-data path is checked into
  the repository; deployment configuration maps those paths to the source
  ownership tree without introducing a second repository;
- the aggregate catalog retains every upstream category and every custom/user template and contains exactly five Omarketing official entries;
- every template ID resolves to matching workflow and preview bytes, and all catalog/workflow/media digests match the package tag;
- opening and saving a template creates a normal editable copy and a package upgrade leaves that copy unchanged;
- ordinary Run, Shift+Run, Auto Queue, cache, failure, cancel, Queue/History, Assets, and LiteGraph behavior is unchanged;
- the package and release satisfy the separate GPL/third-party/brand checklist.
