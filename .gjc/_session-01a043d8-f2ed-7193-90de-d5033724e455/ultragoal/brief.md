Omarketing Phase 1 additive frontend foundation을 승인된 계획대로 W0부터 W7까지 구현한다.

task-id: `omarketing-phase1-foundation-ultragoal-v1`
repo: `/Users/ownuun/Documents/1. 개인문서/marketing/Omarketing`
baseline: `f8db605df6c7a3fb1a936f17806e42ea2d76fe05`, GPL-3.0-only

권위 문서 (해시 검증 완료):
- spec `.gjc/_session-01a043d8-f2ed-7193-90de-d5033724e455/specs/deep-interview-omarketing-phase1-additive-frontend-foundation.md` sha256 `1eebf16a8c4c3491a6d190feb72eb256f78861efcc85ba5271b4cf8d93410135`
- plan `.gjc/_session-01a043d8-f2ed-7193-90de-d5033724e455/plans/ralplan/01a043d8-f2ed-7193-90de-d5033724e455/pending-approval.md` sha256 `2b8bcbc1742d4de287b166b1fb8c1a023e76d24183e7a61c96dd8b01dd899ee0`

EVIDENCE_ROOT: `/Users/ownuun/Documents/1. 개인문서/marketing/Test/omarketing-phase1-foundation/omarketing-phase1-foundation-ultragoal-v1/`

승인 범위: 로컬 계약 편집(정확히 두 문서), 제품 구현, 테스트, 빌드, 실제 로컬 브라우저 QA.
승인 밖 (절대 금지): commit, push, release, deploy, server restart, credential/account/payment, 유료 호출, 외부 업로드/게시, production write, 삭제, 되돌릴 수 없는 외부 작업. git origin이 upstream `Comfy-Org/ComfyUI_frontend`이므로 push 특히 금지.

전역 불변 제약:
- CR-1이 여는 source/tool exact path는 정확히 6개. 일곱 번째 경로, wildcard, directory grant 금지.
- no-touch 유지: `src/composables/useCoreCommands.ts`, `src/router.ts`, `src/views/UserSelectView.vue`, `src/views/LinearView.vue`, `src/scripts/app.ts`, `src/scripts/api.ts`, `src/scripts/ui.ts`, `src/stores/**`, `src/lib/litegraph/**`, `src/platform/workflow/**`, `src/types/comfy.ts`, `src/types/litegraph-augmentation.d.ts`, `src/platform/distribution/types.ts`.
- 타 lane 산출물 절대 미접촉: `vite.electron.config.mts`, `.hermes/phase1/**`, `.hermes/phase0/contracts/odesign-integration-v1.md`, `.hermes/phase0/contracts/external-job-lifecycle.md`, `.hermes/plans/**`. revert/stash 금지.
- gateway/session/접근통제, backend/provider 연동, selection manifest 실제 쓰기, 두 번째 Run/Queue/History 권위, 가짜 asset/backend 상태, production adapter 구현 금지.
- upstream logo/icon 자산 보존. branding은 이름만.
- generator는 지원 JSON Schema 의미를 보존하고 미지원 의미에 실패하며 정확히 두 출력을 원자적으로 발행하고 2회차 실행이 동일 출력이어야 한다. generated normative type 손복사 금지.
- 기존 dirty 파일이 계획 밖 편집 허가가 아니다.
- W1이 `src/extensions/core/omarketing/index.ts`, `src/locales/en/main.json`, `src/locales/ko/main.json`의 유일 writer다. 상위 lane은 typed contribution만 전달한다.

@goal: W0 scope freeze와 모순 감사 영속화
현재 트리 inventory를 baseline 기준으로 freeze하고 fail-closed 모순 감사 결과를 EVIDENCE_ROOT에 남긴다. 감사는 spec/plan 해시, `auth-gateway.md:46-52`, allowlist `:5`/`:86-87`/`:140-146`/`:158`, `phase0-result.md:204-212` GO 목록, 6개 exact path 실측 위치, G1 근거 anchor, Todo 4 신규 계약 2건의 Phase 1 영향, baseline HEAD, zod/tsx/pnpm/license를 모두 대조해야 한다. 산출물은 `w0-scope-inventory.f8db605df6c7a3fb1a936f17806e42ea2d76fe05.json`과 감사 판정 기록이다. 판정이 no-material-contradiction일 때만 다음 goal로 진행한다.

@goal: CR-1 계약 개정 두 문서와 신규 Architect·Critic 검토
제품 소스/테스트를 쓰기 전에 정확히 두 계약 문서만 개정한다. `.hermes/phase0/contracts/core-file-allowlist.md`에 source/tool exact path 6개(`src/components/TopMenuSection.vue`, `src/components/topbar/WorkflowTabs.vue`, `src/components/dialog/content/setting/UserPanel.vue`, `src/services/dialogService.ts`, `src/renderer/extensions/linearMode/MobileDisplay.vue`, `.hermes/phase0/tools/generate-contracts.ts`)와 각 허용 diff 상한을 추가하고, 기존 verification-only test 2개(`TopMenuSection.test.ts`, `WorkflowTabs.test.ts`)와 신규 focused test 4개(`UserPanel.test.ts`, `dialogService.test.ts`, `MobileDisplay.test.ts`, `.hermes/phase0/tools/generate-contracts.test.ts`)를 각각 올바른 절에 등록한다. "auth-presence 단언만 대응 동작에 맞게 반전하거나 은퇴할 수 있고 그 외 upstream 단언은 기존 규칙대로 불변이다"라는 예외 문구를 반드시 넣는다. `.hermes/phase0/phase0-result.md`의 Phase 1 GO 목록에 supported Phase 1 auth surface의 최소 미렌더/fail-closed 항목을 추가하고 이것이 CR-1이 승인한 범위 확장임을 명시한다. `/user-select` no-multi-user 배포 전제와 command registry 잔여의 알려진 한계 지위도 기록한다. 두 문서 개정 후 신규 Architect와 Critic 검토를 받아 receipt를 남긴다. 검토 통과 전에는 제품 소스를 쓰지 않는다.

@goal: W6.2 SchemaGenerator와 두 generated 계약 출력
`.hermes/phase0/tools/generate-contracts.ts`를 작성해 `.hermes/phase0/schemas/output-locator.v1.schema.json`과 `selection-manifest.v1.schema.json` 정확히 두 입력에서 `src/platform/assets/presentation/outputLocatorV1.generated.ts`와 `src/extensions/core/omarketing/selectionManifestV1.generated.ts` 정확히 두 출력을 함께 발행한다. 기존 `zod`와 `tsx`만 쓰고 package.json script/dependency/lockfile을 바꾸지 않는다. 지원 keyword map을 고정하고 미지원 validation/applicator/reference keyword를 만나면 path를 포함한 error로 publish 전에 실패한다. 두 schema 각각에 positive/negative parity vector를 두고 supported constraint class마다 최소 positive 1 negative 1을 만족한다. 두 출력을 memory에서 render하고 validation을 마친 뒤에만 함께 publish하며 하나라도 실패하면 기존 파일을 보존하고 receipt를 발행하지 않는다. 헤더에 source schema path, 실제 SHA-256, generator version, DO NOT EDIT를 기록한다. `.hermes/phase0/tools/generate-contracts.test.ts`를 `pnpm exec tsx --test`로 돌린다. 2회차 실행에서 변경 출력 0을 확인하고 `ac-5-generator-digest.receipt.json`을 EVIDENCE_ROOT에 남긴다.

@goal: W3.1 generic Assets presentation registry와 host 결속
generated type 위에서 `src/platform/assets/presentation/`의 registry/composable/두 Vue 컴포넌트와 기존 Assets host(`MediaAssetFilterBar.vue`, `useMediaAssetFiltering.ts`, `AssetsSidebarTab.vue`, `MediaLightbox.vue`)를 연결한다. host는 generic presentation 모듈만 import하며 `src/extensions/core/omarketing/**`를 직접 import하거나 Omarketing 여부로 분기하지 않는다. G1 요구를 구조적으로 지원한다 — `MediaAssetFilterBar`가 `#header`에 있어 empty 분기 밖이라는 사실을 이용해 `role="status"` 고유 status 표면을 host 스코프에 두고, 일반 0건(`sideToolbar.noFilesFoundMessage`)과 필터 무결과(`showPresentationNoMatch`)와 요소·문구 양쪽에서 구별되게 한다. locale 문자열은 직접 쓰지 않고 typed locale contribution manifest로 W1에 넘긴다. 대응 focused test를 갱신한다.

@goal: W3.2·W4.1·W5·W2 병렬 기여 lane
네 lane을 각자 파일 소유권 안에서 진행하고 공유 3파일(`omarketing/index.ts`, en/ko locale)에는 쓰지 않는다. W3.2는 `src/extensions/core/omarketing/assetsPresentation.ts`와 test로 disconnected provider를 만든다 — 필터바 상태 칩 1개와 상세 섹션 1개만 등록하고 action은 0개이며 가짜 metadata나 합성 card를 만들지 않는다. W4.1은 `authSession.ts`와 test로 auth 계약 parsing과 fail-closed를 확정하고 About 배지 등록 descriptor를 준비한다 — 배지 문구는 Phase 1 접근통제 부재를 오도하지 않아야 한다. W5는 `referenceFanout.ts`와 `projectContext.ts`와 test로 fan-out 기반을 확정한다 — 위젯 전용 액션과 확인 화면까지만이고 서버 발급 snapshot_lease/fanout_request_id/run_key가 없으면 inactive로 끝나며 취소 시 완전 비활성화하고 재시도 진입점을 만들지 않는다. W2는 이미 변경된 6개 branding surface를 검증만 하고 통제 origin URL이 필요한 5개 지점은 원문을 유지한다. 각 lane은 registration descriptor와 locale key/value manifest를 W1에 넘긴다.

@goal: W4.2 auth reachability 차단 다섯 소스
CR-1이 연 다섯 auth source만 최소 변경한다. `TopMenuSection.vue:64-68` legacy layout의 두 auth 버튼 미렌더, `WorkflowTabs.vue:98-99` integrated layout의 두 auth 버튼 미렌더, `MobileDisplay.vue:195` responsive linear mobile의 CurrentUserButton 미렌더, `UserPanel.vue:85-95` 설정 sign-in 진입점 미렌더, `dialogService.ts:206-262`의 `showApiNodesSignInDialog`와 `showSignInDialog`가 lazy component를 load하거나 `dialogStore.showDialog`를 호출하지 않고 false를 반환. CSS 숨김, DOM mutation/observer, 가짜 isLoggedIn, command monkey-patch, 로직 이전, 다섯 소스 밖 write는 전부 실패다. auth component와 source를 삭제하지 않고 나중 gateway attachment를 막지 않는다. 기존 test 2개는 auth-presence 단언만 반전하거나 은퇴시키고 그 외 upstream 단언은 건드리지 않는다. 신규 focused test 3개를 만든다. `useCoreCommands.ts`는 건드리지 않고 실행 dialog 0만 검증한다.

@goal: W1 sole-writer 부트스트랩 통합
상위 lane의 typed contribution을 검증하고 통합한다. `contributionId`와 locale key의 uniqueness, en/ko pair completeness, registration count를 확인한 뒤 `src/extensions/core/omarketing/index.ts`와 `src/locales/en/main.json`과 `src/locales/ko/main.json`을 한 번에 통합한다. `src/extensions/core/index.ts`에 `./omarketing` 부수효과 import를 정확히 1개 추가하며 조건 분기, distribution 분기, 시작 순서 변경, 다른 built-in import 편집은 하지 않는다. duplicate registration과 locale key collision과 HMR cleanup을 focused test로 고정한다.

@goal: W7 closeout 전체 검증과 실제 브라우저 QA
focused → component/integration → 전체 typecheck → lint/format check → target E2E → 사람 육안 QA → receipt 순서로 닫는다. E2E는 `browser_tests/tests/omarketing/phase1-additive.spec.ts`에서 `Comfy.UI.TabBarLayout` 두 값과 narrow mobile viewport와 Settings/dialog와 고정 deep-link 탐침(protected direct entry, preserved query `oauth_request_id`/`desktop_login_code`, direct login paths)을 named case로 검증한다. 실제 브라우저 QA는 320과 1920 viewport 양쪽에서 AC-1/AC-2/AC-4 경로를 돌고 disconnected와 provider-error와 normal-empty와 filter-no-results를 서로 구별해 확인하며 합성 card/action 0과 upstream logo 보존과 console/network 오류 부재와 빠른 연속 조작을 점검하고 스크린샷을 남긴다. no-multi-user 배포 증거를 확보한다. Omarketing 노드가 없으므로 fan-out 실제 제출은 Phase 2로 남기고 절대 조작하지 않는다. `ac-13-core-allowlist-10-check.receipt.json`을 고정 schema와 순서로 남기고 10행 전부 PASS여야 한다. 전체 AC-1~AC-13을 증거와 함께 대조한다.
