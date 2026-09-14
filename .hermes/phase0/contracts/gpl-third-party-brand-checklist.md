# GPL, third-party, branding, and release checklist

Status: Phase 0 release gate; no product implementation

This is an engineering and release-control checklist, not legal advice or a claim of legal certainty. License compatibility, trademark risk, source-offer method, and any jurisdiction-specific installation-information obligation must be reviewed by a qualified reviewer before conveyance.

## How to use this checklist

Every distributed frontend artifact and every distributed `comfyui-omarketing` package version receives one completed copy of this checklist in its release receipt. Each item must name an owner, evidence URL or artifact digest, reviewer, and review date. An unchecked item labeled **BLOCKER** prevents publication, image promotion, customer delivery, or making object code available for download.

A private development build is not marked release-ready. Network operation without transfer of a copy may be treated differently under the license, but the release owner must document the actual delivery model rather than assuming an exception.

## Fixed baseline facts

| Item                                  | Recorded Phase 0 value                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Frontend base                         | ComfyUI Frontend `f8db605df6c7a3fb1a936f17806e42ea2d76fe05`                                                              |
| Backend compatibility pin             | ComfyUI `b08e6cf35fac50d3ca8470dffb3f9a1fbb7187d2`                                                                       |
| Frontend baseline package             | `@comfyorg/comfyui-frontend` version `1.53.1`                                                                            |
| Frontend baseline license declaration | `GPL-3.0-only`                                                                                                           |
| Baseline toolchain declarations       | Node `>=25 <26`, pnpm `>=11.3`, `packageManager` `pnpm@11.13.1`                                                          |
| In-process bridge decision            | Separate `comfyui-omarketing` repository, `GPL-3.0-only`, installed at `<ComfyUI>/custom_nodes/comfyui-omarketing/`      |
| Modification record date              | Set to the UTC calendar date of each released modified version; do not reuse the Phase 0 document date as a release date |

The current baseline `package.json` describes itself as the “Official front-end implementation of ComfyUI” and points its name, homepage, and repository to Comfy organizations. Those values are upstream facts in the unmodified baseline, not acceptable Omarketing release metadata.

## A. Release identity and modification record

- [ ] **BLOCKER** The release receipt identifies the Omarketing frontend version, immutable source tag, source commit, build artifact digest, build date, and publisher.
- [ ] **BLOCKER** A prominent modified-version notice states that Omarketing modified ComfyUI Frontend, gives the relevant release modification date in `YYYY-MM-DD` UTC form, and names base commit `f8db605df6c7a3fb1a936f17806e42ea2d76fe05`.
- [ ] **BLOCKER** The same notice, or a directly adjacent release manifest, names backend compatibility commit `b08e6cf35fac50d3ca8470dffb3f9a1fbb7187d2` without implying that the backend was modified when it was not.
- [ ] **BLOCKER** README, About, and the source archive contain consistent modification date, frontend base commit, current source tag, and current source URL.
- [ ] **BLOCKER** Changed files and generated artifacts are traceable to the release commit; the release does not claim unmodified upstream status.
- [ ] Any later upstream rebase records both previous and new base commits, the merge/rebase method, relevant conflicts, and a new relevant modification date.
- [ ] The release notes distinguish Omarketing changes from upstream changes and do not attribute Omarketing defects or support obligations to Comfy Org.

Required notice content, with release values filled in rather than placeholders:

```text
Omarketing is a modified distribution of ComfyUI Frontend.
Modified by the Omarketing project on YYYY-MM-DD.
Based on ComfyUI Frontend commit f8db605df6c7a3fb1a936f17806e42ea2d76fe05.
Licensed under GNU GPL version 3 only; see LICENSE. No warranty is provided.
Original project: https://github.com/Comfy-Org/ComfyUI_frontend
Corresponding Source for this build: <exact immutable source URL>
```

## B. GPLv3 source and build/install information

- [ ] **BLOCKER** The complete `LICENSE` text remains present and unmodified in the source and distributed package.
- [ ] **BLOCKER** Existing copyright, attribution, license, and absence-of-warranty notices remain intact unless a documented legal review authorizes a change.
- [ ] **BLOCKER** The complete preferred form for modifying the conveyed frontend is available under `GPL-3.0-only`, including Omarketing changes, workspace packages, configuration, interface definitions, generated-source inputs, and scripts needed to generate the object code.
- [ ] **BLOCKER** Object-code access has clear adjacent directions to equivalent no-additional-charge access to the exact Corresponding Source for that artifact. A branch tip or moving `main` URL is insufficient.
- [ ] **BLOCKER** The source URL resolves without private credentials unavailable to recipients, identifies an immutable tag/commit or archive digest, and remains available for the required delivery period selected by the release/legal review.
- [ ] **BLOCKER** The exact lockfiles used by the build are included: pnpm workspace lockfile and any Python or npm lockfile actually used. A regenerated or newer lockfile is not evidence for an older artifact.
- [ ] **BLOCKER** Build information records OS/container base digest, architecture, Node version, pnpm version, environment flags/distribution, commands, patches, generated inputs, and output digest.
- [ ] **BLOCKER** Install/run information tells a recipient how to install dependencies, build the same frontend, install it against the pinned backend, start it, and replace the distributed object code with a modified build.
- [ ] **BLOCKER** Required scripts are source-controlled and contain no publisher-only secret, undeclared private package, expired signed URL, or undocumented manual build step.
- [ ] Catalog/template assembly records the upstream template bundle version and digest, exact `comfyui-omarketing` tag and digest, merge command, and resulting aggregate catalog digest.
- [ ] Generated assets can be regenerated from included preferred-form inputs or are identified with their own source and license.
- [ ] If a User Product or locked installation is conveyed, counsel/release review determines whether GPLv3 Installation Information is required and records the provided methods, procedures, and authorization information. **BLOCKER** until that determination is recorded for the actual delivery model.
- [ ] Source availability is checked from a clean, unauthenticated recipient-equivalent environment before release.

The source/build receipt must be artifact-specific. “Built from this repository,” a generic homepage, or a source archive that omits lockfiles, workspace packages, template inputs, or build/install scripts does not satisfy this gate.

## C. Notices, no warranty, and user-visible legal access

- [ ] **BLOCKER** README retains the GPLv3 notice, original ComfyUI Frontend attribution/link, modification notice/date, Omarketing source link, and no-warranty statement.
- [ ] **BLOCKER** About has a prominent “Licenses and source” entry accessible without authentication after the application loads.
- [ ] About identifies Omarketing as modified, links the exact build’s Corresponding Source, links the full GPL text, links third-party notices, credits the original project, and states the absence of warranty without weakening existing notices.
- [ ] The distributed artifact includes `LICENSE`, completed third-party notices, source/build receipt, and any required source offer adjacent to or inside the artifact.
- [ ] CLI/container documentation also exposes license, source, and no-warranty information for users who do not reach the GUI About surface.
- [ ] Privacy, support, paid-service, or EULA text does not add restrictions on copying, modifying, reverse engineering, or redistribution of the GPL-covered work.
- [ ] Contractual warranty or support terms, if any, clearly identify their provider and do not remove the upstream or GPL no-warranty notice.

## D. In-process bridge and shared contracts

- [ ] **BLOCKER** The `comfyui-omarketing` repository has its own complete GPLv3 license text and declares `GPL-3.0-only` in `pyproject.toml`, package metadata, README, and release artifacts.
- [ ] **BLOCKER** Every dependency imported or bundled by the in-process bridge has a recorded license compatible with the selected package license, as assessed by the license reviewer.
- [ ] **BLOCKER** No proprietary service SDK, code-generated client with incompatible terms, model, font, binary, or data fixture is imported or bundled into the ComfyUI process without a documented compatible grant.
- [ ] The bridge's source tag, commit, lockfile, build/install steps, SBOM, and artifact digest appear in the same release receipt as the matching frontend.
- [ ] The install instructions use `<ComfyUI>/custom_nodes/comfyui-omarketing/` and disclose the exact supported backend commit.
- [ ] Files intentionally shared across the HTTP boundary are independently authored and carry an explicit per-file SPDX identifier. The default is `Apache-2.0 OR GPL-3.0-only` for separable JSON Schema/OpenAPI contract files; absence of the explicit header means the repository's `GPL-3.0-only` default applies.
- [ ] **BLOCKER** Dual-licensed contract files have provenance showing that all contributors authorized both offered licenses; copied GPL-only code is not relabeled.
- [ ] Frontend JavaScript shipped by the bridge is inventoried as distributed source, has preferred-form source available, and does not create an alternate run state machine.

Selecting `GPL-3.0-only` for the bridge is the project policy for the in-process component. It does not by itself answer every combination or dependency question; the dependency and boundary reviews remain required.

## E. Independent-service boundary

- [ ] **BLOCKER** Hermes, automation, and media production are separate deployable processes with separate repositories, release artifacts, dependency graphs, and lifecycle controls.
- [ ] **BLOCKER** The bridge communicates with them only through documented authenticated HTTP(S) contracts and opaque artifact handles; it does not import their modules, dynamically load their code, link their libraries, or mount their source tree.
- [ ] External services cannot read or write Comfy input/output/custom-node directories directly. Artifacts cross the boundary through access-controlled handles and checksum verification.
- [ ] Service credentials remain in backend secret configuration. They are absent from the frontend bundle, workflows, prompts, output metadata, browser storage, URLs, logs exposed to users, fixtures, and source archives.
- [ ] Each service is independently startable and replaceable by another conforming HTTP implementation; failure does not load service code into ComfyUI.
- [ ] Request/response schemas, authentication, idempotency, timeout, cancellation, artifact expiry, and terminal reconciliation are documented at the boundary.
- [ ] Deployment manifests do not combine a service and bridge into one Python/Node process or create hidden shared-library coupling.
- [ ] **BLOCKER** A release reviewer documents the actual technical relationship, bundled materials, contracts, and distribution model for each service. “It uses HTTP” is not accepted as a legal conclusion or automatic license exception.
- [ ] Service-specific licenses and commercial terms are reviewed independently and are not represented as GPL-covered merely because they communicate with the bridge.

## F. Third-party notice and SBOM audit

- [ ] **BLOCKER** `THIRD_PARTY_NOTICES.md` is generated from the exact resolved release graph and then human-reviewed. A one-line placeholder or a list of package names alone fails the gate.
- [ ] **BLOCKER** An SPDX or CycloneDX SBOM is generated for the frontend, workspace packages, bridge, bridge web assets, container/base image, templates, fonts, icons, images, and bundled command-line/runtime tools.
- [ ] Production, optional, transitive, vendored, generated, and dynamically downloaded release dependencies are covered. Development-only entries are labeled rather than silently discarded when they generate shipped bytes.
- [ ] Every SBOM component has name, version/commit, supplier or source URL, resolved digest, concluded license, evidence source, modification status, and relationship to the released artifact.
- [ ] **BLOCKER** `NOASSERTION`, unknown, custom, source-available, non-commercial, no-derivatives, field-of-use, or missing-license entries receive a documented disposition before release.
- [ ] **BLOCKER** License obligations are mapped per component: notice text, attribution, license copy, modification marking, source/source-offer, relinking or installation material, patent notice, and trademark restrictions where applicable.
- [ ] Copyright and attribution texts required by dependencies are reproduced without normalization that changes meaning.
- [ ] Bundled fonts, logos, screenshots, preview media, workflow fixtures, model references, and marketing copy resources have provenance and distribution rights separate from code dependency assumptions.
- [ ] Template JSON contains no copied secret, private endpoint, unredistributable model, third-party media, or unapproved trademark/logo asset.
- [ ] Package-manager audit output is kept as security evidence but is not substituted for a license/SBOM audit.
- [ ] Automated notice output is diffed against the previous release; added, removed, and license-changed components receive reviewer sign-off.
- [ ] **BLOCKER** Any dependency assessed as incompatible with the distributed component's license is removed or replaced; an exception requires written qualified review and a technically accurate release plan.
- [ ] The SBOM, notices, and license texts are included with the object artifact and exact Corresponding Source.

## G. Omarketing non-confusion review

The released product must identify Omarketing first while preserving clear upstream credit. Attribution does not authorize implying sponsorship, affiliation, endorsement, or official status.

| Surface                            | Required Omarketing state                                                                                                                                                                                                                                | Prohibited/release blocker                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| README heading/lead                | “Omarketing”; state that it is a modified ComfyUI Frontend distribution; link upstream                                                                                                                                                                   | “Official ComfyUI,” “official front-end,” upstream wordmark as product identity, or omitted modification statement                              |
| `package.json` name                | Omarketing-controlled package name, selected as `@omarketing/comfyui-frontend` if that namespace is verifiably controlled; otherwise release blocks until a truthful controlled name is assigned                                                         | `@comfyorg/comfyui-frontend` or any namespace not controlled by the publisher                                                                   |
| `package.json` description         | “Omarketing front end, a modified ComfyUI Frontend distribution for marketing workflows”                                                                                                                                                                 | “Official front-end implementation of ComfyUI”                                                                                                  |
| `package.json` homepage/repository | Actual Omarketing-controlled homepage and independent origin URL; upstream link remains in README/About                                                                                                                                                  | `https://comfy.org`, `Comfy-Org/ComfyUI_frontend`, placeholder, dead link, or an origin the publisher does not control                          |
| Browser title                      | `Omarketing` (page context may follow after a separator)                                                                                                                                                                                                 | `ComfyUI` alone or “Official ComfyUI”                                                                                                           |
| Splash/loading screen              | Omarketing name/logo and accessible name; small upstream credit may be separate                                                                                                                                                                          | Comfy wordmark/logo as primary identity; `aria-label` that announces ComfyUI as the product                                                     |
| Favicon                            | Omarketing-owned icon                                                                                                                                                                                                                                    | Upstream Comfy favicon or confusingly similar recolor                                                                                           |
| PWA manifest                       | Omarketing `name`, `short_name`, description, start URL/scope, theme, and Omarketing-owned icons                                                                                                                                                         | ComfyUI names/icons or stale upstream screenshots implying official origin                                                                      |
| About                              | Omarketing product/version first; “modified from ComfyUI Frontend”; upstream link; modification date/base commit; source/license/no-warranty links                                                                                                       | affiliation/endorsement claim, hidden upstream attribution, or source link to a moving branch                                                   |
| Help/release metadata              | Existing Comfy docs/community/support/releases are explicitly labeled upstream; the existing source/GitHub item points to the controlled Omarketing origin; Omarketing issues/support/update destinations are added only when controlled and operational | unlabeled upstream destinations, routing an Omarketing issue to upstream maintainers, or calling upstream changes Omarketing support guarantees |
| Template gallery                   | Omarketing category/tag/logo only on the five curated official Omarketing sources                                                                                                                                                                        | “official ComfyUI” badge, Omarketing badge on user copies/templates, or replacement of existing upstream/user entries                           |

Checklist:

- [ ] **BLOCKER** All rows in the matrix pass in source, built output, installable package, and runtime screenshots.
- [ ] **BLOCKER** The publisher controls the selected package namespace, homepage, repository, issue tracker, update URL, and signing identity.
- [ ] Existing Comfy trademarks/logos are used only as reviewed attribution or factual compatibility references, not primary branding.
- [ ] Search metadata, Open Graph cards, manifest screenshots, installer/container labels, artifact filenames, and browser accessibility names receive the same non-confusion review.
- [ ] Third-party templates and screenshots do not introduce an unreviewed “Official” label or upstream logo.
- [ ] Omarketing's own name and logo provenance/ownership are recorded; trademark clearance is separately reviewed.
- [ ] A qualified reviewer records any required nominative-use wording or trademark notice. No engineering checklist item is treated as a trademark-law conclusion.

## H. Independent origin and upstream readiness

No remote, repository, commit, or push is created by this Phase 0 contract. Release readiness requires later evidence for all items below.

- [ ] **BLOCKER** An independent Omarketing frontend repository exists and the team controls it; its canonical clone URL is recorded in README, package metadata, About, and the release receipt.
- [ ] **BLOCKER** Local/release Git configuration uses `origin` only for that independent repository and `upstream` only for `https://github.com/Comfy-Org/ComfyUI_frontend` (or its verified canonical successor).
- [ ] `git remote -v` evidence shows fetch/push targets, and no push URL targets the upstream project.
- [ ] The default branch protects release tags, requires review/checks, and prevents force-push; signing/provenance policy is recorded.
- [ ] The upstream base commit is reachable and its immutable identifier is preserved in the modification/release record.
- [ ] Upstream synchronization happens in an isolated branch. The merge receipt lists conflicts and confirms core changes stay within the approved ceiling: one built-in extension import, static branding, and the generic Assets presentation hook.
- [ ] The separate `comfyui-omarketing` origin is controlled and its release tag matches the frontend catalog receipt.
- [ ] Source archives do not include `.git` credentials, private remote URLs, developer machine paths, untracked secrets, or POC evidence.
- [ ] Repository and issue links are live and public/recipient-accessible before they are printed in an artifact.
- [ ] An upstream removal/rebase rehearsal proves Omarketing-owned modules and generated template overlays can be identified without rewriting upstream history.

## I. Final release blockers

The release manager must stop a release when any of the following is true, even if all functional tests pass:

1. A **BLOCKER** checkbox above is incomplete or has no evidence.
2. The modification date, frontend base commit, source tag, or artifact digest is missing or inconsistent across README, About, package, and receipt.
3. Exact Corresponding Source or build/install information cannot reproduce and replace the conveyed object code.
4. Existing copyright, attribution, GPL, or no-warranty notice is missing or weakened.
5. The in-process bridge or one of its bundled/imported dependencies lacks a reviewed GPL-compatible license disposition.
6. A supposedly independent service is imported, linked, bundled, co-process, or granted direct Comfy filesystem access without a new boundary and license review.
7. `THIRD_PARTY_NOTICES.md` is a placeholder, the SBOM is incomplete, a component is unknown/unapproved, or required notices/source are absent.
8. Any README/package/title/splash/favicon/PWA/About surface presents Omarketing as Comfy Org's official product or retains upstream primary branding.
9. The selected package namespace, homepage, repository, source URL, issue tracker, or signing identity is not controlled by the publisher.
10. Independent `origin` and verified `upstream` evidence is absent, or any release/push target could modify upstream.
11. The five-template overlay replaces, removes, relabels, or reorders existing core or user/custom templates.
12. Qualified review required by this checklist has not occurred for the actual artifact and delivery model.

Release approval records the final decision as `PASS` or `BLOCKED`, never “probably compliant.” A `PASS` means the documented engineering gates and assigned reviews were completed for that specific artifact; it is not a guarantee of legal outcome.
