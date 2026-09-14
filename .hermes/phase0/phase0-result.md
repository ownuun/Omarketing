# Omarketing Phase 0 Gate 결과

- 기준 계획: `../plans/omarketing-full-replacement-plan.md`
- 계획 SHA-256: `61674e12529092827e752c5dd8c0a609371db8ba8fecc3537cc57495e758d08d`
- Frontend baseline: `f8db605df6c7a3fb1a936f17806e42ea2d76fe05`
- Backend compatibility pin: `b08e6cf35fac50d3ca8470dffb3f9a1fbb7187d2`
- 판정: **Phase 0 PASS — Phase 1 제한 범위 착수 GO**
- 별도 판정: **backend integration·production·release는 아직 NO-GO**

Phase 0에서 제품 source는 수정하지 않았다. 기존 dirty 파일
`vite.electron.config.mts`를 되돌리거나 덮어쓰지 않았고, 서버를
시작·재시작하거나 prompt 제출, migration, commit, push, deploy를 하지
않았다.

## 확정 아키텍처

**최소 B + 나머지 A**를 채택한다.

- A: backend `/object_info` custom node, 공식 template, 프로젝트 경로,
  reference N fan-out, 기존 Queue/History/Assets output, 외부 adapter.
- 최소 B: built-in extension bootstrap import 1개, 정적 Omarketing branding,
  기존 Assets 내부의 generic presentation registry host.
- C 금지: Workflow/Queue/History/Assets store, prompt/API, LiteGraph, Run,
  cache/cancel semantics를 대체하거나 fork-specific state machine으로
  재작성하지 않는다.

## 제품 결정 확정표

| 항목 | Phase 0 결정 |
|---|---|
| 배포 build | 이 release line은 Omarketing-only. stock build는 upstream source에서 얻고 runtime brand flag를 만들지 않음 |
| Frontend extension | remote-only가 아니라 `src/extensions/core/index.ts`의 built-in import 1개 |
| 실행 node | frontend-only node 금지; 별도 backend package가 `/object_info`에 등록 |
| Fan-out entry | 전역 Run 자동 감지 금지; `레퍼런스 선택` node의 `선택 항목 실행`만 활성화 |
| Project | 기존 `workflows/<top-level-project>/<workflow>.json` tree를 표시 source로 사용 |
| Project identity | folder명과 분리된 backend-issued immutable lowercase UUID `project_key` |
| 빈 project | 독자 empty-folder CRUD 없음; 공식 template copy 또는 첫 Workflow 저장 흐름에서 명시적 초기화 |
| Copy/rename/import | 같은 top-level folder는 key 유지; 다른 top-level/import는 explicit blank rebind |
| 후보 결과 | reference마다 Queue job 1개, 그 job 안에 candidate branch 5개 |
| branch 실패 | job failed; 이미 저장된 파일은 보존하지만 기존 Assets 노출은 보장하지 않음 |
| 최종 선택 | 파일 복사 없음; run별 `selection.json`의 unique `reference_id` entry만 원자적으로 갱신 |
| Assets card | Omarketing badge/body/context menu 변경 없음; filter와 lightbox detail/action만 확장 |
| History 삭제 | 파일/manifest가 남아도 기존 Assets 재발견을 보장하지 않음; 영구 index 금지 |
| Auth | single-owner same-origin gateway session; Comfy cloud token/query 흐름과 분리 |
| Web/Electron data | production Electron은 web과 같은 canonical gateway HTTPS origin을 로드; direct Comfy/file renderer/별도 store 금지 |
| 범위 경계 | Omarketing → internal backend → Hermes/automation/media까지만; OWrite·SNS 발행 연동 제외 |
| 외부 cancel | adapter가 idempotent remote cancel·poll reconciliation·late artifact quarantine 담당 |
| GPL | frontend fork와 in-process bridge는 `GPL-3.0-only`; independent HTTP service 경계는 별도 사실·license review 필요 |

## 산출물

### Core·frontend 계약

- `contracts/core-file-allowlist.md`
- `contracts/project-key-and-fanout.md`
- `contracts/assets-presentation-registry.md`
- `contracts/selection-manifest-and-output-validation.md`

### Backend·security·release 계약

- `contracts/backend-package-and-templates.md`
- `contracts/auth-gateway.md`
- `contracts/external-job-lifecycle.md`
- `contracts/gpl-third-party-brand-checklist.md`

### Schema·fixture

- `schemas/output-locator.v1.schema.json`
- `schemas/selection-manifest.v1.schema.json`
- `fixtures/selection-manifest.valid.json`
- `fixtures/selection-manifest.stale.json`
- `fixtures/output-locator-validation.cases.json`
- `fixtures/fanout-session.cases.json`
- `fixtures/auth-gateway.cases.json`
- `fixtures/external-job-lifecycle.cases.json`

### UI 증거

- `ui/current-ui-click-inventory.md`
- `ui/evidence-manifest.json`
- `ui/screenshots/01-workspace-initial.png` … `15-assets-lightbox-fixture.png`

Screenshot `01`–`12`는 실행 중 localhost의 실제 상태다. `13`–`15`는
backend를 변경하지 않고 `/api/jobs/**`, `/api/view`만 intercept한 명시적
in-memory fixture이며, 기존 five-output card/stack/MediaLightbox host만
증명한다.

## Frontend core 수정 ceiling

정확한 전체 목록과 no-touch tree는 `contracts/core-file-allowlist.md`가
권위다. Phase 1에서 허용하는 기존 product file 책임은 다음뿐이다.

1. `src/extensions/core/index.ts`: `./omarketing` side-effect import 1개.
2. 정적 identity/notices:
   - `index.html`
   - `manifest.json`
   - `src/config.ts`
   - `src/composables/useBrowserTabTitle.ts`
   - `src/composables/useExternalLink.ts`
   - `src/components/sidebar/ComfyMenuButton.vue`
   - `src/components/helpcenter/HelpCenterMenuContent.vue`
   - `package.json` metadata only
   - `README.md`, `THIRD_PARTY_NOTICES.md`
   - `public/assets/favicon.ico`
3. generic Assets presentation host:
   - `src/platform/assets/components/MediaAssetFilterBar.vue`
   - `src/platform/assets/composables/useMediaAssetFiltering.ts`
   - `src/components/sidebar/tabs/AssetsSidebarTab.vue`
   - `src/components/sidebar/tabs/queue/MediaLightbox.vue`
   - `src/locales/en/main.json`, `src/locales/ko/main.json`

새 Omarketing/generic files는 allowlist 문서의 고정 경로만 사용한다.
`MediaAssetCard.vue`, `MediaAssetSelectionBar.vue`, 모든 Assets store/schema,
Workflow management, `src/scripts/app.ts`, `src/scripts/api.ts`, Queue/execution,
`src/lib/litegraph/**`, distribution types는 수정 금지다.

## Backend package·template 위치

별도 repository/package 이름은 `comfyui-omarketing`이며 설치 위치는
다음으로 고정한다.

```text
<ComfyUI>/custom_nodes/comfyui-omarketing/
```

Pinned backend loader가 checkout root `__init__.py`를 실행하므로 root loader
shim이 필수다. 실행 node·routes·storage·services·schemas·adapters는 Python package
`comfyui_omarketing/` 아래에서 분리한다. Frontend repository에 executable
Python node를 넣지 않는다.

공식 template source는 package의
`example_workflows/official/` 아래 five workflow JSON·preview·catalog이다.
Nested 위치는 `/workflow_templates`의 metadata-poor 자동 목록 중복을 피하면서
pinned backend static route로 파일을 제공한다. Release assembly가 기존
`/templates/index*.json`과 `index_logo.json`에 Omarketing category/logo만
append하며 기존 core/user/custom template를 제거·재정렬하지 않는다.

## 검증 receipt

### Schema

Validator: `check-jsonschema 0.38.0`

```text
uvx check-jsonschema --check-metaschema \
  .hermes/phase0/schemas/output-locator.v1.schema.json \
  .hermes/phase0/schemas/selection-manifest.v1.schema.json
=> ok -- validation done
```

```text
uvx check-jsonschema --schemafile \
  .hermes/phase0/schemas/selection-manifest.v1.schema.json \
  .hermes/phase0/fixtures/selection-manifest.valid.json \
  .hermes/phase0/fixtures/selection-manifest.stale.json
=> ok -- validation done
```

Synthetic Asset ID만 넣은 locator는 required primitive가 없어 schema에서
거부됨을 별도로 확인했다.

### JSON·evidence·contract vectors

```text
PASS: 9 JSON files; 15 screenshots; fan-out, selection, auth, lifecycle,
locator invariants
PASS: 32 required contract anchors across 8 contracts
```

확인한 핵심 invariant:

- Run, Shift+Run, Auto Queue change/instant는 `fanout_active=false`에서 no-op.
- 전용 action만 `queuePrompt(number, N)`을 한 번 호출.
- 같은 action의 N prompt는 server-issued run key 하나를 공유하되,
  unique reference ID와 keyed reference subfolder로 output을 격리.
- 두 번째 제출 실패 fixture는 `1/3 queued`, B/C 미제출, accepted A 미취소,
  persistent widget 값 무변경, session 해제.
- backend가 A를 수락한 뒤 앞선 sibling `afterQueued`가 throw한 fixture는
  server reconciliation으로 A를 accepted 처리하고 retry에서 제외.
- Queue front는 C/B/A 제출로 최종 A/B/C 상대 순서 보존.
- foreign/missing auth, Origin/WS rejection, logout/revoke socket closure.
- lost submit response는 같은 idempotency key로 job 1개 유지.
- interrupt-success race·restart orphan·terminal conflict는 publish 금지와
  quarantine으로 수렴.
- synthetic ID, traversal, symlink escape, checksum/MIME/size mismatch,
  failed job output은 selection authority가 되지 않음.

### UI

실행 중이던 `http://127.0.0.1:5190/`에서 main menu, Assets, Node Library,
Workflows, Templates, Settings, Queue/History, Run modes, Help, node/canvas
context menu를 클릭했다. fixture tab에서 existing five-output stack과 Gallery
lightbox도 확인했다. 관찰된 pre-existing console/network baseline 4건은 UI
inventory에 기록했다.

### Repository integrity

최종 Git 상태에서 tracked product diff는 작업 전부터 존재한
`vite.electron.config.mts` 한 파일뿐이며 Phase 0 결과는 `.hermes/phase0/`
아래 contract/schema/fixture/UI evidence에 한정한다.

## Phase 1 GO 범위

Phase 1은 다음 foundation만 착수 가능하다.

- allowlist enforcement test/receipt;
- built-in extension bootstrap skeleton;
- Omarketing static branding과 GPL/source/About metadata;
- generic Assets presentation registry와 host integration;
- Omarketing provider의 fixture-only registration;
- normal Run no-op/fan-out callback unit fixture wiring. 실제 외부 작업이나
  selection manifest 쓰기는 금지한다;
- supported Phase 1 auth surface의 최소 미렌더와 fail-closed 처리.

마지막 항목은 계약 개정 CR-1이 별도 검토로 승인한 범위 확장이며 원래 GO
목록에는 없었다. 승인 범위는 `contracts/core-file-allowlist.md`의 "Supported
Phase 1 auth surface (CR-1)" 절이 열거한 다섯 개 exact source path의 auth
진입점 미렌더와 sign-in dialog fail-closed로 한정한다. 다음은 이 확장에
포함되지 않는다.

- gateway, session, 접근통제 구현. 진입점을 숨기는 것은 접근통제가 아니며
  Phase 1은 접근통제를 제공하지 않는다.
- `/user-select`와 `src/views/UserSelectView.vue`. 이 화면은 Comfy Org
  sign-in이 아니라 로컬 ComfyUI 다중 사용자 선택이며, supported Phase 1
  배포가 서버를 다중 사용자 모드로 기동하지 않는다는 전제로 닫는다.
  `src/router.ts`와 해당 view는 immutable을 유지한다. no-multi-user 배포
  증거가 없거나 거짓이면 supported Phase 1 배포가 실패하며 코드로 우회하지
  않는다.
- `src/composables/useCoreCommands.ts`. immutable을 유지하므로
  `Comfy.User.OpenSignInDialog` 등록이 command registry에 남는다. 이는 v1
  release gate로 이관한 Phase 1 알려진 한계이며, Phase 1은 제거 대신
  fail-closed dialog service로 실행 결과가 dialog 0건임을 증명한다.

Controlled source URL/package namespace와 ownership이 확인된 logo asset이
없는 branding field는 placeholder로 채우지 않는다. 해당 field는 blocker가
해소될 때까지 원문을 유지하거나 Phase 1 미완료로 남겨야 한다.

Phase 1 구현 diff가 allowlist 밖 기존 file을 요구하면 즉시 중단하고 계약
revision review로 되돌아간다. 제품 core semantic을 우회해 allowlisted file에
옮기는 것도 실패다.

## 이후 Gate blocker

아래는 Phase 1 착수 blocker는 아니지만 각 해당 integration/release Gate를
막는다.

1. `comfyui-omarketing` repository와 package가 아직 생성·pin·설치되지 않았고
   `/object_info`·prompt snapshot·interrupt/progress fixture가 없다.
2. gateway implementation, durable session/rate-limit store, secret manager,
   canonical HTTPS origin, private Comfy bind가 선택되지 않았다.
3. Hermes/automation/media provider별 atomic idempotency lookup, idempotent cancel,
   authoritative status, artifact refresh/hash fixture가 없다. 하나라도 없으면
   해당 adapter는 production 승격 금지다.
4. 실제 completed backend media output, Omarketing metadata/selection action,
   Workflow folder context/drop은 focused UI/E2E 증거가 아직 없다.
5. independent Omarketing source origin/package namespace/logo ownership,
   Corresponding Source URL, SBOM/third-party notice와 qualified GPL/trademark
   review가 완료되지 않았다.
6. release artifact를 재현하는 exact source/build receipt와 actual delivery model
   기준 Installation Information 판단이 없다.

따라서 **Phase 1 source implementation 시작은 GO**지만, backend 연결·실제
선택 쓰기·production adapter·배포·release를 같은 GO로 해석하면 안 된다.
