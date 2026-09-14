# Omarketing Phase 0 localhost UI 클릭 인벤토리

## 판정

- 기준 상태: ComfyUI Frontend `f8db605df6c7a3fb1a936f17806e42ea2d76fe05`
- 감사 시각: `2026-08-27T02:24:24+09:00`
- Frontend: 이미 실행 중이던 `http://127.0.0.1:5190/`
- Backend: 이미 실행 중이던 `http://127.0.0.1:8188/`
- Browser: headless Chromium, `1440 × 1000`, device scale factor `1`
- UI locale: 한국어
- 초기 title: `*Unsaved Workflow - ComfyUI`
- 결과: **현재 UI 기준선과 Phase 1 삽입 지점 확인 완료. 제품 구현 전 Gate 0 증거로 사용 가능.**

이번 감사에서 서버를 시작하거나 재시작하지 않았고 prompt를 제출하지 않았다. 모달·탭·메뉴를 열고 닫는 일시적 UI 상태 외에는 Workflow, Queue, History, Assets 또는 설정을 변경하지 않았다.

추가로 분리된 browser tab 하나에서 `/api/jobs/**`와 `/api/view` 응답만
in-memory fixture로 intercept했다. 이 tab은 backend History/output을 쓰지
않았으며 screenshot `13`–`15`는 기존 Assets host 동작만 증명한다.

## 클릭 인벤토리

| #   | 표면                      | 동작                                       | 실제 관찰                                                                                                                         | Phase 0 결론                                                                                                                  | 증거                                             |
| --- | ------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | 기본 workspace            | localhost 진입                             | 기존 10-node Workflow, 실행 버튼, Queue badge, 왼쪽 navigation, 오른쪽 속성 패널과 minimap 표시. 누락 모델로 검증 오류 2개가 존재 | Canvas·Node·실행 표면은 현행 그대로 유지                                                                                      | `screenshots/01-workspace-initial.png`           |
| 2   | Comfy 주 메뉴             | 좌상단 Comfy menu 클릭                     | 새로 만들기, 파일, 편집, 보기, 테마, Nodes 2.0, 템플릿 탐색, 설정, 확장 프로그램 관리, 도움말 표시                                | 제품 메뉴를 교체하지 않고 Omarketing command만 추가해야 함                                                                    | `screenshots/02-main-menu.png`                   |
| 3   | Assets                    | `data-testid=assets-tab-button` 클릭       | localhost Assets에는 검색, 보기 설정, `생성됨`, `가져옴`만 표시. completed History output이 없어 empty state 표시                 | Omarketing filter/action은 범용 presentation host로 추가하며 기존 두 tab과 empty state를 보존                                 | `screenshots/03-assets-localhost.png`            |
| 4   | Node Library              | `data-testid=node-library-tab-button` 클릭 | 필수/모든 노드/즐겨찾기, Comfy node category, custom extension category를 같은 tree에서 표시                                      | backend `/object_info` custom node가 이 기존 library에 추가되므로 독자 library 불필요                                         | `screenshots/04-node-library.png`                |
| 5   | Workflows                 | `data-testid=workflows-tab-button` 클릭    | 북마크/찾아보기와 empty state 표시. 현재 backend user storage에는 workflow folder 항목이 없음                                     | 기존 Workflow tree가 source of truth. 빈 프로젝트 folder, move/drop은 현 상태에서 증명되지 않음                               | `screenshots/05-workflows.png`                   |
| 6   | Templates                 | `.templates-tab-button` 클릭               | 기존 full gallery, search, category, model/task/runtime filter, tags와 rich thumbnail/logo 표시                                   | Omarketing 공식 템플릿도 이 gallery source에 병합해야 함. custom example_workflows만으로는 같은 metadata 수준을 보장하지 않음 | `screenshots/06-templates-gallery.png`           |
| 7   | Settings                  | `aria-label='설정 (Ctrl + ,)'` 클릭        | User/Comfy/LiteGraph/Appearance/3D/Mask Editor/Keybinding/Extension/Info/Server config 등 기존 category 표시                      | Omarketing 설정이 필요하면 extension-owned section으로 추가하고 기존 설정 schema/store는 교체하지 않음                        | `screenshots/07-settings.png`                    |
| 8   | Queue/History             | `data-testid=queue-overlay-toggle` 클릭    | 모두/완료됨/실패 filter와 기존 failed History item 표시                                                                           | prompt N개는 기존 Queue/History item N개로 남아야 하며 run-group store를 만들지 않음                                          | `screenshots/08-queue-history-overlay.png`       |
| 9   | Run mode                  | `data-testid=queue-mode-menu-trigger` 클릭 | `실행`, `실행 (변경 시)`, `실행 (즉시)` 표시                                                                                      | 일반 실행 계열은 fan-out session이 없을 때 모두 no-op hook이어야 함                                                           | `screenshots/09-run-mode-menu.png`               |
| 10  | Help Center               | `data-testid=help-center-button` 클릭      | 피드백, 도움말/지원, 문서, Discord, Github, 관리자 확장, 최근 릴리스 표시                                                         | 브랜딩 시 Comfy 전용 support/release 표면의 유지·교체 여부를 비혼동 체크리스트로 검증                                         | `screenshots/10-help-center.png`                 |
| 11  | Node context menu         | node 우클릭                                | Pin, clone, extension, rename/copy/duplicate, bypass, subgraph, node info, shape/color, remove 표시                               | Omarketing node는 기존 node context semantics를 그대로 사용                                                                   | `screenshots/11-node-context-menu.png`           |
| 12  | Canvas context menu       | 실제 blank canvas hit target 우클릭        | 노드 추가, 그룹 추가, 붙여넣기, 선택된 부분을 템플릿으로 저장, 노드 템플릿 표시                                                   | 기존 Canvas와 Node Template 흐름 유지. 전용 Canvas mode 불필요                                                                | `screenshots/12-canvas-context-menu.png`         |
| 13  | Assets five-output parent | fixture completed job 표시                 | parent card가 output count `5`와 기존 download/context/output-stack action을 표시                                                 | reference job 하나의 후보 5개를 기존 output stack으로 표현 가능                                                               | `screenshots/13-assets-five-output-fixture.png`  |
| 14  | Assets output stack       | output count click                         | parent preview를 제외한 나머지 output 4개가 같은 job folder에 표시                                                                | 후보마다 Queue job을 만들지 않고 job 내부 branch 5개 유지                                                                     | `screenshots/14-assets-output-stack-fixture.png` |
| 15  | MediaLightbox             | fixture image card double-click            | 기존 `갤러리` modal과 닫기/이전/다음 control 표시                                                                                 | preview를 교체하지 않고 generic detail/action 영역만 추가                                                                     | `screenshots/15-assets-lightbox-fixture.png`     |

전체 파일 hash와 byte size는 `evidence-manifest.json`에 기록했다.

## Assets 세부 검증

### 실제 UI로 확인된 사실

- localhost Assets의 생성 output은 completed History 기반이다.
- 현재 runtime에는 표시 가능한 completed media asset이 없었다.
- empty state가 그대로 보존되는 것은 확인했다.
- isolated request fixture로 기존 five-output parent, output stack folder,
  MediaLightbox를 실제 frontend에서 클릭했다.
- fixture parent가 첫 output을 대표하고 folder가 나머지 4개를 표시해
  총 5개 후보가 같은 job에 남는 동작을 확인했다.
- MediaLightbox는 기존 `갤러리` dialog, close, previous, next를 유지했다.
- 같은 fixture에서 기존 transient selection bar의 `선택된 에셋: 1개`,
  download, delete도 표시됐다. 이 bar는 `selection.json` 권위 action이
  아니며 core allowlist에서 수정하지 않는다.
- fixture는 frontend host 증거일 뿐 실제 `/prompt`, History persistence,
  output bytes, OutputLocator 검증 또는 Omarketing provider 증거가 아니다.

### 코드로 교차 검증한 한계

- `src/stores/assetsStore.ts`는 completed job만 Asset으로 변환한다.
- `src/platform/assets/utils/outputAssetUtil.ts`는 다중 output을 기존 stack detail에 펼친다.
- `src/components/sidebar/tabs/queue/MediaLightbox.vue`는 기존 image/video/audio/text viewer이다.
- History가 삭제된 output을 파일시스템에서 다시 검색해 Assets에 넣는 경로는 없다.

따라서 Omarketing Phase 1은 이 한계를 바꾸지 않는다. `selection.json`이 남아도 History 삭제 후 기존 Assets에서 결과를 재발견하지 못하며, 독자 Asset index를 만들지 않는다.

## Run·fan-out 검증 경계

현재 Omarketing extension과 fan-out widget은 아직 구현되지 않았으므로 fan-out 동작을 실제 UI에서 실행해 검증할 수 없다. 이번 Gate 0은 현행 Run 표면과 core queue contract를 확인한 것이다. 구현 후 다음 항목은 별도 focused UI/E2E Gate가 되어야 한다.

| Case                    | 구현 후 기대 결과                                                            | Phase 0 계약 판정 |
| ----------------------- | ---------------------------------------------------------------------------- | ----------------- |
| Run button              | `fanout_active=false`; reference cursor 변화 없음; 기존 prompt 1개           | MUST              |
| Shift+Run/Queue front   | `fanout_active=false`; reference cursor 변화 없음; 기존 front prompt 1개     | MUST              |
| Auto Queue/변경 시/즉시 | `fanout_active=false`; reference cursor 변화 없음                            | MUST              |
| 선택 항목 실행          | 이 action만 `fanout_active=true` 설정 후 `queuePrompt(number, N)` 한 번 호출 | MUST              |
| prompt k 제출 실패      | `k-1/N queued` 표시, 미제출 reference 기록, session 즉시 해제                | MUST              |
| 재실행                  | 새 request id와 새 cursor로 시작; 이전 session 재사용 금지                   | MUST              |

정확한 state protocol은 `../contracts/project-key-and-fanout.md`를 따른다.

## Console·network 기준선

새 탭을 다시 로드하고 console error를 수집했으며 다음 네 항목이 관찰되었다.

1. `GET /api/userdata/user.css` → `404`
2. `ComfyApp graph accessed before initialization` at Vite client line 528
3. `GET /api/userdata?dir=subgraphs&recurse=true&split=false&full_info=true` → `404`
4. `GET /api/userdata/comfy.templates.json` → `404`

세 개의 userdata 404는 optional user data가 없는 현재 backend 상태이며, graph-before-initialization console error는 Omarketing 변경 전 기준선 결함이다. Phase 1 검증에서는 새로운 console error가 추가되지 않는지를 비교해야 한다.

## 알려진 감사 제한

- 실제 backend completed media output은 없었다. Assets stack/lightbox는
  network-intercepted fixture로만 확인했으며 selection action은 아직
  구현되지 않았다.
- Workflow store가 비어 있어 folder context menu와 drag/move를 실제로 검증하지 못했다.
- missing model validation error 때문에 prompt를 제출하지 않았다.
- Omarketing code가 없으므로 fan-out no-op과 failure cleanup은 이번 단계에서 contract로만 확정했다.
- 첫 감사 탭에서 Template overlay를 닫은 뒤 PrimeVue BlockUI leave mask가 남는 headless-only 상태가 한 번 발생했다. 새 탭에서는 재현되지 않았고 증거 캡처에는 영향을 주지 않았다.

## Gate 0 체크

- [x] 현재 workspace·main menu
- [x] Assets localhost empty state
- [x] Node Library
- [x] Workflows
- [x] Templates gallery
- [x] Settings
- [x] Queue/History overlay
- [x] Run mode menu
- [x] Help Center
- [x] Node context menu
- [x] Canvas context menu
- [x] screenshot SHA-256 manifest
- [x] console/network baseline
- [x] existing Assets output stack·MediaLightbox·transient selection bar —
      nonpersistent fixture
- [ ] Omarketing detail·selection action과 실제 completed backend output —
      Phase 1 focused Gate
- [ ] Workflow folder context/drop — 실제 workflow folder가 필요한 Phase 1 focused Gate
