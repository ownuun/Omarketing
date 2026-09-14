# Omarketing 추가 확장 계획

상태: Phase 0 PASS · Phase 1 foundation 제한 범위 GO · backend 통합/production adapter/배포/release NO-GO
기준 저장소: `/Users/ownuun/Documents/1. 개인문서/marketing/Omarketing`
기준 코드: ComfyUI Frontend `main` / `f8db605df6`
작성 원칙: ComfyUI의 기존 기능과 핵심 로직을 수정·교체하지 않는다. Omarketing은 기존 Workflows·Templates·Node Library·Assets·Queue/History 화면 안에 마케팅 노드, 공식 워크플로 템플릿, 필터·메타데이터, 외부 서비스 adapter를 최소 추가하는 확장 계층으로 구현한다.

### 최우선 불변 조건

- 기존 ComfyUI Workflow, Queue/History, Assets, 캔버스, 실행·캐시·실패·취소 로직을 그대로 사용한다.
- 기존 기능을 제거하거나 Omarketing 전용 상태 모델로 대체하지 않는다.
- Omarketing 기능은 독립 모듈·extension 등록·adapter로 추가한다. 핵심 파일 변경은 extension을 등록하기 위한 최소 hook에 한정한다.
- 외부 Hermes·자동화·영상사진 서비스의 복잡한 상태는 adapter 뒤에서 처리하고 ComfyUI 프론트에는 기존 prompt/job/output 의미로 매핑한다.
- 이 문서의 모든 항목은 `기존 그대로 사용 / UI 확장 / 노드 추가 / 템플릿 추가 / adapter 추가 / 후속` 중 하나여야 한다. 기존 기능 제거·대체 지시는 허용하지 않는다.

### 개발팀 Gate 0 판정

- 권장안은 `B`: 실행 기능은 공식 extension/backend custom node/기존 prompt-output 경로로 추가하고, core 변경은 built-in extension import 1곳, 정적 Omarketing 브랜딩, 기존 Assets의 범용 presentation hook으로 제한한다.
- `src/scripts/app.ts`의 prompt 제출, `src/scripts/api.ts`, Queue·execution·Assets store, Jobs API, Workflow persistence, LiteGraph 핵심 로직은 수정하지 않는다.
- Omarketing 실행 노드는 backend `/object_info`에 등록되는 custom node로 구현하고 Hermes·자동화·영상사진 호출은 해당 node의 adapter 뒤에 둔다.
- Omarketing 공식 템플릿은 기존 템플릿과 사용자 custom template을 유지한 채 기존 갤러리에 카테고리·tag·logo로 추가한다.
- 프로젝트는 기존 `workflows/<project>/<workflow>.json` 경로 표현을 사용하되 공통 설정은 Project Context node의 불변 `project_key`로 조회한다.
- 이미 Queue에 제출된 작업은 기존 ComfyUI prompt snapshot을 그대로 사용한다. 프로젝트 설정 변경은 이후 새로 제출하는 작업부터 반영한다.
- 독자 Project/Workflow/Run/Asset API·상태 머신·영구 Asset 인덱스·휴지통은 기존 ComfyUI 로직을 교체하므로 구현하지 않는다.

## 0. 구현 착수 조건

아래 6개는 전체 MVP 구현 착수 조건이다. Phase 1 foundation은 Gate 0B allowlist와 금지 범위 안에서만 선행할 수 있으며, 미완료 항목에 의존하는 backend·adapter·selection write를 시작하지 않는다.

- [x] Phase 0 범위의 현행 UI 클릭 인벤토리와 screenshot evidence가 완료됐다.
- [x] 모든 Omarketing 기능이 `기존 그대로 사용 / UI 확장 / 노드 추가 / 템플릿 추가 / adapter 추가` 중 하나로 분류됐고 core allowlist가 고정됐다.
- [ ] 모든 Omarketing 노드의 입력·설정·출력·상태·오류·실행 주체가 확정됐다.
- [ ] 자동화 팀과 영상·사진 팀의 API 요청·응답·이벤트 계약이 확정됐다.
- [x] 기본 템플릿 제공 방식과 실행 큐 fan-out/no-op 최소 동작 범위가 계약으로 확정됐다.
- [ ] GPL 고지, 원본 upstream 동기화 정책, Omarketing 독립 모듈 경계가 확정됐다.

현행 런타임 클릭 검증은 Gate 0에서 완료했다. 실제 localhost screenshot 01–12와 request-intercept fixture screenshot 13–15의 증거 범위를 구분하며, Phase 1 구현 후에는 같은 항목의 표시·비활성·오류 상태를 회귀 검사한다.

---

## 1. 제품 범위

### 1.1 최상위 구조

- 프로젝트: Workflow 사이드바의 최상위 폴더. 별도 프로젝트 화면이나 전환기는 두지 않는다.
- 워크플로: 프로젝트 폴더 안에 저장되는 개별 캔버스이자 실행 가능한 마케팅 파이프라인
- 레퍼런스
  - 숏폼: YouTube Shorts / TikTok / Instagram Reels
  - 카드뉴스: Instagram 캐러셀
  - 광고: Meta Ads(Facebook / Instagram / Threads), Google Search Ads, Google Display / Performance Max
- 결과물
  - 숏폼
  - 카드뉴스
  - 광고
- 실행: 기존 ComfyUI prompt snapshot으로 Queue에 제출된 job
- 검수: 결과 output checksum에 연결된 QA metadata
- 최종 선택: 서버가 재검증한 구조화 output locator를 `selection.json`에 기록하는 실행 후 Assets action

### 1.2 표준 흐름

`PROJECT_CONTEXT + 이번 콘텐츠 주제 → 자동 탐색 계획 → 자동 검색 → 후보 정리 → 레퍼런스 선택 → 원본 확보 → 요소 분해 → 메시지 치환 → 제작 요청 → 기술·유사도·마케팅 검수 → Assets에서 최종 선택 → 기존 다운로드`

### 1.3 명시적 비범위

- 사용자가 레퍼런스 파일을 직접 업로드하는 기본 흐름
- 사용자가 YouTube/TikTok/Meta URL을 직접 붙여넣는 기본 흐름
- Omarketing 내부에서 영상·사진 제작 도구를 직접 선택하는 기능
- YouTube 영상 광고 파이프라인 및 템플릿. YouTube는 일반 Shorts 레퍼런스와 결과물만 다룬다.
- OWrite 연동과 실제 SNS 발행
- MVP에서 자동 광고비 배분, 자동 성과 최적화, 무인 전략 변경
- 기존 Comfy Cloud·모델 다운로드·Custom Nodes Manager의 변경·제거 작업. 해당 기능은 기존 상태로 유지한다.

---

## 2. 공통 UI 확장 판정 규칙

모든 요구사항은 아래 6가지로만 판정한다.

| 판정             | 의미                                            | 구현 원칙                                     |
| ---------------- | ----------------------------------------------- | --------------------------------------------- |
| 기존 그대로 사용 | 기존 동작·API·용어를 유지                       | core 수정 없음                                |
| UI 확장          | 기존 화면 안에 Omarketing 필터·상세·액션만 추가 | 범용 extension hook 최소 사용                 |
| 노드 추가        | backend custom node와 기존 Node Library 등록    | `/object_info`·기존 prompt 실행 사용          |
| 템플릿 추가      | 기존 갤러리에 공식 Omarketing workflow 추가     | 기존 템플릿과 사용자 템플릿 유지              |
| adapter 추가     | 외부 팀·Hermes 호출을 backend node 뒤에 격리    | 프론트가 외부 credential·상태를 소유하지 않음 |
| 후속             | MVP 구현에서 제외                               | 기존 기능은 숨기거나 제거하지 않음            |

공통 상태는 모든 표면에서 다음을 빠짐없이 처리한다.

- 기본, hover, focus-visible, 선택, 다중 선택
- 비활성 및 비활성 사유 툴팁
- 로딩, 지연, 부분 완료, 빈 데이터, 필터 결과 0건
- 연결 끊김, 재연결 중, 인증 만료, 권한 부족
- 검증 실패, 실행 실패, 취소, 만료, 충돌
- 완료, 경고 포함 완료, 선택됨, 선택되지 않음
- 오래된 데이터: 기존 값을 유지하고 마지막 갱신 시간과 새로고침 표시
- 좁은 화면: 아이콘 축소, 패널 접기, 탭 overflow, 팝오버 충돌 방지
- 키보드: Tab, Shift+Tab, Enter, Space, Escape, 방향키, 명령 팔레트 대체 경로

---

## 3. 현행 UI 추가 확장 매트릭스

각 행은 `현재 기능 → 판정 → 추가 내용 → 클릭 결과 → 사용 계약 → 상태/예외` 순서다.

### 3.1 애플리케이션 셸·라우팅·시작 상태

| 현재                                | 판정             | 새 기능/라벨                                                    | 클릭/진입 결과            | API                  | 상태/예외             |
| ----------------------------------- | ---------------- | --------------------------------------------------------------- | ------------------------- | -------------------- | --------------------- |
| `/` Graph workspace                 | 기존 그대로 사용 | Omarketing workflow도 같은 workspace에서 열기                   | 기존 마지막 workflow 복구 | 기존 Workflow API    | 기존 복구·오류 동작   |
| Graph/App 모드                      | 기존 그대로 사용 | 추가 없음                                                       | 기존 동작 유지            | 기존 Workflow 동작   | 기존 상태 유지        |
| user-select                         | 기존 그대로 사용 | Omarketing owner identity는 backend 로그인 세션에서 파생        | 기존 UI 동작 유지         | Omarketing 인증 경계 | 인증 만료·재로그인    |
| Comfy Cloud 로그인·결제·크레딧 경로 | 기존 그대로 사용 | Omarketing 외부 연동 credential과 분리                          | 기존 동작 유지            | 기존 API             | 기존 상태 유지        |
| 공유 workflow 경로                  | 후속             | Omarketing 전용 공유 기능을 MVP에서 추가하지 않음               | 기존 동작 유지            | 기존 API             | 기존 상태 유지        |
| 전역 BlockUI                        | 유지             | 초기화 중                                                       | 전체 화면 초기화 표시     | bootstrap            | 단계별 실패 및 재시도 |
| WorkspaceAuthGate                   | 기존 그대로 사용 | Omarketing 서버 로그인은 reverse proxy/backend session으로 보호 | 기존 gate 수정 없음       | Omarketing session   | 인증 실패·만료        |

### 3.2 브랜딩·메타데이터

| 현재                                    | 판정                   | 새 값                                              | 클릭 결과                |
| --------------------------------------- | ---------------------- | -------------------------------------------------- | ------------------------ |
| ComfyUI 로고·favicon                    | 정적 branding          | Omarketing 로고·favicon                            | 기존 진입 동작 유지      |
| 문서 title                              | 정적 branding          | `Omarketing`                                       | 없음                     |
| package description/homepage/repository | 정적 branding+GPL 유지 | Omarketing 정보와 원본 attribution                 | About에서 양쪽 링크 표시 |
| Comfy 색상 토큰                         | 유지                   | 1차에는 색감 유지                                  | 테마 토글 유지           |
| About                                   | UI 확장                | Omarketing 수정 고지, 버전, 원본 ComfyUI 링크 추가 | 외부 링크 새 창          |
| Release/What's New                      | 기존 그대로 사용       | Omarketing 변경 내역은 별도 문서 링크로만 추가     | 기존 동작 유지           |

### 3.3 좌측 아이콘 레일

기존 아이콘 레일의 순서·탭·용어를 유지한다. Omarketing 전용 메뉴·레퍼런스 탭·결과물 탭·실행 기록 탭을 새로 만들지 않는다.

| 현재 탭       | 판정                             | 새 라벨                    | 클릭 결과                                                              | API                            |
| ------------- | -------------------------------- | -------------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| Workflows     | 기존 그대로+항목 추가            | 프로젝트/마케팅 워크플로   | 기존 폴더·즐겨찾기·최근 트리 안에 프로젝트 폴더와 마케팅 워크플로 저장 | 기존 Workflow API              |
| Node Library  | 기존 그대로+카테고리 추가        | Omarketing 마케팅 노드     | 기존 검색·즐겨찾기·drag 동작으로 추가                                  | extension node catalog         |
| Model Library | 기존 그대로                      | 기존 ComfyUI 모델          | 변경 없음                                                              | 기존 모델 API                  |
| Assets        | 기존 그대로+필터·메타데이터 추가 | 레퍼런스·후보·최종본       | 기존 카드·선택·미리보기 안에서 Omarketing asset 유형 필터 제공         | 기존 Assets + adapter metadata |
| Job History   | 기존 그대로                      | 기존 Queue/History         | Omarketing job도 동일한 카드·상태·취소·실패 동작 사용                  | 기존 Jobs API                  |
| Apps          | 기존 그대로                      | 기존 Apps                  | 변경 없음                                                              | 기존 API                       |
| Templates     | 기존 그대로+공식 카테고리 추가   | Omarketing 공식 파이프라인 | 기존 갤러리 안에 공식 템플릿 5개 추가                                  | template extension catalog     |
| Help Center   | 기존 그대로+링크 추가            | Omarketing 도움말          | 필요 시 Omarketing 문서 링크만 추가                                    | Docs                           |
| Console       | 기존 그대로                      | 실행 로그                  | Omarketing node 로그도 기존 출력 경로 사용                             | 기존 Logs                      |
| Shortcuts     | 기존 그대로                      | 기존 단축키                | 변경 없음                                                              | local settings                 |
| Settings      | 기존 그대로+항목 추가            | 기존 설정                  | Omarketing 연동 상태 항목만 extension setting으로 추가                 | 기존 Settings API/local        |

레일 옵션과 기존 기본값을 유지한다: 좌/우 위치, normal/small, floating/connected, overflow scroll.

### 3.4 햄버거/메인 메뉴

#### 파일

| 현재 옵션             | 새 옵션                | 판정             | 클릭 결과             |
| --------------------- | ---------------------- | ---------------- | --------------------- |
| New Blank Workflow    | New Blank Workflow     | 기존 그대로 사용 | 기존 빈 캔버스 생성   |
| Open Workflow         | Workflow 불러오기      | 기존 그대로 사용 | 기존 동작 유지        |
| Save                  | 저장                   | 유지             | 현재 draft 저장       |
| Save As               | 다른 이름으로 저장     | 유지             | 이름·폴더·충돌 확인   |
| Export                | Workflow 내보내기      | 기존 그대로 사용 | 기존 JSON export 유지 |
| Export API            | API 형식 내보내기      | 기존 그대로 사용 | 기존 동작 유지        |
| Load Default Workflow | 기본 Workflow 불러오기 | 기존 그대로 사용 | 기존 동작 유지        |

#### 편집

유지: Undo, Redo, Copy, Paste, Select All, Clear, 삭제.
`Refresh Node Definitions`, Clipspace, 모델 unload/cache를 포함한 기존 옵션은 그대로 유지한다.

#### 보기

유지: 확대/축소/화면 맞춤, 미니맵, 사이드바, 하단 패널, 포커스 모드, 테마, 전체화면과 기존 탭·라벨 전체. Omarketing 전용 전역 라벨 교체는 하지 않는다.

#### 도움말

- Omarketing 사용 가이드
- 문제 신고
- API/연동 문서
- 변경 사항
- 라이선스 및 원본 ComfyUI
- 시스템 상태
- 기존 Comfy 도움말 링크를 유지하고 Omarketing 문서 링크만 추가

### 3.5 상단 탭·파이프라인 액션

| 현재              | 새 기능            | 클릭 옵션                                                              |
| ----------------- | ------------------ | ---------------------------------------------------------------------- |
| Workflow tab      | Workflow tab       | 활성화, drag 순서 변경, overflow 이동, 닫기                            |
| dirty marker      | 미저장 표시        | 저장 후 제거                                                           |
| tab popover       | 기존 Workflow 메뉴 | 기존 옵션 유지                                                         |
| Blueprint publish | 기존 그대로 사용   | 사용자 custom template 동작 유지; Omarketing 공식 배지는 부여하지 않음 |
| App Builder       | 기존 그대로 사용   | 기존 동작 유지                                                         |

닫기 시 미저장 확인은 `저장 후 닫기 / 저장하지 않고 닫기 / 취소` 3개 선택지를 유지한다. 삭제·덮어쓰기·비우기는 각각 별도 확인 모달을 사용한다.

### 3.6 캔버스 기본 조작

다음은 그대로 유지한다.

- 빈 캔버스 drag 이동, wheel 확대/축소
- 선택 모드/손 모드
- 단일·Shift 다중 선택, box select, Escape 해제
- 노드 drag, resize, collapse/expand
- output→input 연결, 호환되지 않는 타입 연결 거부
- 링크 선택/삭제/재연결/reroute
- 그룹·프레임, 정렬·분배
- 미니맵, zoom in/out, fit, 1~1000% 직접 입력
- snap to grid, view restore, canvas background
- Undo/Redo와 변경 추적

변경 사항:

- 빈 캔버스 더블클릭·우클릭·부분 실행은 기존 동작을 유지한다.
- Omarketing custom node는 기존 노드 검색 결과와 Node Library의 Omarketing 카테고리에 추가한다.
- 기존 포트 타입과 연결 규칙을 제한하지 않는다. Omarketing node 사이에서만 자체 payload 타입 호환성을 추가 검증한다.
- 실행 상태·진행률·부분 실행은 기존 ComfyUI 표시와 실행 의미를 그대로 사용한다.

### 3.7 선택 툴박스·노드 우클릭

#### 공통 옵션

| 옵션              | 대상                | 동작                                                  |
| ----------------- | ------------------- | ----------------------------------------------------- |
| 이름 변경         | 노드/그룹           | 표시명만 변경, type 불변                              |
| 복사              | 선택                | 노드와 내부 링크 복사; 비밀 값 제외                   |
| 복제              | 선택                | 새 node_id 발급, 외부 링크 미연결                     |
| 삭제              | 선택                | 영향받는 downstream 경고 후 삭제                      |
| 고정/해제         | 노드                | drag 방지                                             |
| 비활성/활성       | 노드                | 기존 ComfyUI prompt 직렬화·실행 의미에 따라 제외/복귀 |
| 우회/우회 해제    | 호환 입력·출력 노드 | 입력을 출력으로 전달 가능한 경우에만                  |
| 이 브랜치 실행    | 결과 도달 경로      | 해당 output까지 부분 실행                             |
| 이 노드까지 실행  | 노드                | upstream 포함 실행                                    |
| 이 노드부터 실행  | 노드                | 검증 가능한 downstream 범위 실행                      |
| 새로고침          | 외부 데이터 노드    | 원격 상태 재조회                                      |
| 정보              | 노드                | 설명, 버전, owner team, 입출력 schema                 |
| 최소화/확장       | 노드                | 위젯 숨김/표시                                        |
| 모양/색상         | 노드/그룹           | 시각 속성만 변경                                      |
| 정렬              | 다중 선택           | 좌/중앙/우/상/중앙/하 정렬                            |
| 분배              | 다중 선택           | 수평/수직 균등 분배                                   |
| 프레임            | 다중 선택           | 설명 가능한 프레임 생성                               |
| 서브그래프로 변환 | 다중 선택           | 재사용 블록; 후속 단계                                |
| 그룹에 맞춤       | 그룹                | 포함 노드에 맞춰 resize                               |
| 로그 열기         | 실행된 노드         | 최신 node attempt 로그                                |
| 입력/출력 검사    | 노드                | 실제 payload schema 및 sample                         |

#### 이미지 전용 옵션

- Open Image, Open Mask Editor, Copy/Paste/Save Image, 3D Viewer와 기존 모델 위젯 옵션은 그대로 유지한다.
- Omarketing 결과물에는 기존 미리보기·복사·저장 동작을 사용하고, 상세 보기에 출처·권리·선택 metadata만 추가한다.
- 수동 Paste/Upload는 기존 ComfyUI 기능으로 남지만 Omarketing 공식 템플릿의 기본 레퍼런스 입력 경로로 사용하지 않는다.

### 3.8 노드 라이브러리·검색

유지할 상호작용:

- 카테고리 트리 접기/펼치기
- 검색, 검색어 지우기, 결과 keyboard 이동
- 즐겨찾기 추가/해제·순서 변경
- 클릭 추가, drag-to-canvas
- 이름·카테고리·설명·입출력 타입 표시
- deprecated/experimental 배지
- 결과 0건, 카탈로그 로딩, 카탈로그 오류/재시도

기존 Node Library 카테고리와 순서를 유지한다. Omarketing custom node만 `Omarketing` 하위에서 입력·전략·탐색·수집·분석·제작·검수·유틸리티로 구분한다.

검색 필터:

- 콘텐츠 유형: 전체/쇼츠/카드뉴스/광고물
- 실행 주체: Omarketing/자동화 팀/영상·사진 팀/사람
- 안정성: 안정/실험/폐기 예정
- 입출력 타입

### 3.9 프로젝트 폴더·워크플로 사이드바

현재 Workflow tree UX를 유지한다.

- 최상위 폴더 하나를 프로젝트 하나로 사용한다. 별도의 프로젝트 모델·홈·전환 UI는 만들지 않는다.
- 프로젝트 폴더 안에 숏폼·카드뉴스·광고 워크플로를 필요한 만큼 저장한다.
- 프로젝트 생성은 기존 Templates 갤러리에서 공식 Omarketing 템플릿을 선택하고 Workflows의 새 최상위 경로에 첫 workflow 복사본을 저장하는 방식이다. 저장 후 해당 workflow의 `프로젝트 설정` node에서 공통 설정을 연다.
- 일반 Workflow 저장 완료 hook을 가로채지 않는다. Omarketing 템플릿 복사 또는 `프로젝트 설정` node의 명시적 초기화 액션에서 UUID 기반 불변 `project_key`를 발급하고 Workflow JSON에는 key만 저장한다. 실제 context는 backend custom-node package의 owner-scoped 저장소에서 key로 조회한다. 폴더명은 표시·경로 값일 뿐 identity가 아니다.
- 프로젝트 공통 설정은 필수 정보가 비어 있어도 초안으로 저장할 수 있고 워크플로 편집도 허용한다. 실행할 때만 필수 정보의 누락 항목을 구체적으로 표시하고 실행을 차단한다.
- 그룹: 기존 Workflows의 즐겨찾기, 최근, 경로 기반 폴더를 그대로 사용한다. 프로젝트 생성은 공식 템플릿 복사와 첫 Workflow 저장을 함께 수행해 빈 폴더가 필요하지 않게 한다.
- 항목 클릭: 열기
- Workflow 항목의 기존 Save, Save As, rename, duplicate, favorite, export, delete 동작은 유지한다.
- Omarketing MVP는 프로젝트 폴더 자체의 rename, drag/move, archive, 빈 폴더 생성을 추가하지 않는다.
- 다른 프로젝트에서 같은 파이프라인이 필요하면 대상 프로젝트에 공식 템플릿을 새로 복사해 새 project key와 PROJECT_CONTEXT를 연결한다. 기존 Workflow 파일을 다른 프로젝트 경로로 이동해 context를 자동 재바인딩하는 기능은 만들지 않는다.
- 같은 프로젝트 안의 workflow duplicate·Save As는 동일 project key를 유지한다. 다른 최상위 폴더로 Save As하거나 외부 JSON을 가져오면 새 프로젝트 복사로 보고 새 project key를 발급하며 기존 PROJECT_CONTEXT를 자동 복사하지 않는다.
- 검색과 빈 상태도 기존 Workflows 동작을 유지한다.
- 충돌: 같은 이름이면 덮어쓰기/사본 만들기/취소

### 3.10 기존 Assets 안의 레퍼런스 보기

새 사이드바나 제품 탭을 만들지 않는다. 현행 Assets 브라우저에 Omarketing asset 유형 필터와 메타데이터만 추가한다. 기존 업로드·Assets 기능은 그대로 유지한다.

후보 표시는 기존 Assets 갤러리의 카드·선택·미디어 미리보기 동작을 재사용한다. MediaAssetCard 본문·하단·`…` 메뉴는 수정하지 않는다. 카드뉴스 페이지 전환, 출처·게시일·성과·원본 확보 상태, Omarketing 선택·제외 액션은 카드 클릭 후 기존 Assets 상세 보기 안에서만 제공한다. 워크플로 실행을 멈추는 커스텀 선택 노드는 만들지 않는다.

기존 Assets 카드 체크는 현재 화면의 임시 다중 선택일 뿐 ReferenceSelection의 권위 기록이 아니다. 레퍼런스 선택 node의 `선택 확정`에서만 현재 workflow용 ReferenceSelection을 저장하고, Queue 제출 시 해당 선택을 prompt snapshot에 고정한다. 최종 결과물 선택은 별도 `selection.json`에 기록한다.

기존 MediaAssetCard 본문에는 Omarketing 전용 `레퍼런스 / 후보 / 최종 선택` 배지를 추가하지 않는다. 유형과 선택 상태는 Omarketing Assets 필터와 상세 보기에서만 표시하고 카드의 기존 선택 표시를 재사용한다. 이로써 카드 core hook과 회귀 위험을 줄인다.

필터:

- 콘텐츠 유형: 숏폼/카드뉴스/광고
- 플랫폼: YouTube Shorts/TikTok/Instagram Reels/Instagram Carousel/Meta Ads(Facebook·Instagram·Threads)/Google Search Ads/Google Display·Performance Max/기타 자동화 커넥터
- 상태: 후보/선정/원본 확보 중/확보됨/분석됨/제외/실패
- 날짜: 전체/오늘/지난 7일/이번 달/올해
- 권리·출처 상태: 확인/제한/불명/사용 금지
- 프로젝트/파이프라인/run
- 정렬: 최신/오래된/이름/관련도/점수

카드 클릭:

- 우측 inspector에서 실제 원본 또는 proxy 재생
- source metadata, 수집시각, checksum, provenance
- 선택/제외 및 사유
- 분석 결과와 연결된 결과물 표시

카드 `…` 메뉴는 기존 옵션을 그대로 유지한다. 출처 열기, 분석, 파이프라인 선택·해제, 다시 확보, 제외 사유 같은 Omarketing 액션은 상세 보기의 extension action으로 제공한다.

### 3.11 기존 Assets 안의 결과물 보기

결과 파일은 기존 ComfyUI output 디렉터리 안에서 project key, workflow key, run key 단위의 subfolder로 정리한다. 기존 preview/download API와 History 기반 Assets 표시를 그대로 사용한다.

```text
output/
└─ omarketing/{project_key}/{workflow_key}/{run_key}/
   ├─ references/
   ├─ candidates/
   └─ selection.json
```

같은 콘텐츠 주제를 다시 실행해도 고유 run key와 기존 ComfyUI filename 규칙으로 덮어쓰지 않는다. output 파일은 서버에 남지만 Assets는 파일시스템 영구 인덱스가 아니라 기존 History의 completed job에서 구성된다. History를 지우거나 기존 표시 상한을 넘으면 파일이 남아 있어도 Assets 목록에서 사라질 수 있으며, MVP에서는 이 동작을 바꾸지 않는다.

독자 영구 Asset 인덱스, 프로젝트 휴지통·복구, 실행 폴더 삭제 관리자, 버전·승인 상태 머신은 만들지 않는다. 기존 Assets의 미리보기·다운로드·삭제와 최소 Omarketing 필터·선택 manifest만 사용한다.

### 3.12 실행 버튼·Queue·History

기존 Run 버튼의 라벨·드롭다운·Shift+Run·Auto Queue·Batch UI는 수정하지 않는다. 일반 Run은 기존 workflow prompt를 한 번 제출한다.

Omarketing 다중 레퍼런스 fan-out은 `레퍼런스 선택` custom node의 `선택 항목 실행` widget에서만 시작한다. 실행 전에 필수 PROJECT_CONTEXT, 연결 상태, 제작 가능한 미디어, 선택 수, 예상 비용·시간을 검증·표시한다. Omarketing 공식 제작 템플릿의 fan-out batch는 reference마다 1 job으로 고정하며 기존 Batch Count를 곱하지 않는다.

다중 레퍼런스 실행은 ComfyUI의 batch/list 내부 출력 하나로 묶지 않는다. 선택한 레퍼런스 N개 각각의 입력 스냅샷으로 독립 prompt/job N개를 Queue에 등록한다. Queue는 현행 ComfyUI처럼 FIFO 순차 실행하며 각 job을 대기·실행·완료·실패 상태로 따로 표시한다.

실행 진입점은 기존 전역 Run 버튼을 수정하거나 자동 감지하게 만들지 않는다. `레퍼런스 선택` custom node의 widget에 `선택 항목 실행` 액션을 추가하고, 이 액션만 내부 fan-out session을 연 뒤 기존 `queuePrompt(number, N)` batch loop와 `beforeQueued / afterQueued` widget hook을 사용한다. 각 iteration은 reference ID 하나를 prompt snapshot에 넣어 별도 prompt ID를 만든다. 일반 Run·Shift+Run·Auto Queue에서 hook은 완전한 no-op이어야 하며 기존 UI Batch Count를 fan-out N에 다시 곱하지 않는다.

fan-out session은 최소 `fanout_active, fanout_request_id, ordered_reference_ids, cursor, expected_count, accepted_count, queue_position`을 가진다. `afterQueued` 성공 후에만 cursor를 증가시키고 제출 실패 시 session을 즉시 해제하며 `M/N queued`와 미제출 reference를 표시한다. Queue front는 기존 앞쪽 삽입 의미에 맞게 입력 순서를 보정한다. reference마다 별도 `queuePrompt()`를 N회 호출하지 않는다.

각 레퍼런스 job 내부의 문구 후보 5개는 별도 Queue job 5개로 분리하지 않는다. 레퍼런스 1개당 job 1개가 같은 이미지·레이아웃에서 문구만 다른 독립 output branch 5개를 실행한다. 5개가 모두 성공해야 job이 완료되며, 하나라도 실패하면 job은 `failed`다. 성공해 파일로 저장된 output은 남을 수 있고 다시 Run할 때 ComfyUI cache가 재사용 가능한 부분을 재사용한다. 실패 job의 부분 output이 기존 History-backed Assets에 반드시 표시된다고 보장하지 않는다.

사용자는 Assets에서 같은 job의 후보 완성본 5개를 비교해 1개를 `최종 선택`으로 표시한다. 선택 시 후보 파일을 `final` 폴더로 복사하지 않고 `selection.json` sidecar manifest에 선택된 output의 기존 식별자와 선택 시각만 기록한다. 선택하지 않은 4개도 삭제하지 않고 해당 job의 결과로 보존한다. 후속 규격 변환과 다운로드에는 manifest가 가리키는 최종 선택본만 사용한다.

`selection.json`은 run/reference 단위 권위 sidecar다. Frontend의 대표 job ID나 `${jobId}-${nodeId}-${subfolder}-${filename}` 합성 ID는 역파싱 불가능할 수 있으므로 단독 권위 locator로 저장하지 않는다. backend extension이 아래 구조의 명시적 locator를 서버에서 재검증해 원자적으로 기록한다. History에서 원본 job이 사라지면 파일이 남아 있어도 기존 Assets UI에서 재발견을 보장하지 않는다.

```json
{
  "schema_version": 1,
  "revision": 1,
  "project_key": "uuid",
  "workflow_locator": "workflows/project/workflow.json",
  "run_key": "uuid",
  "selections": [
    {
      "reference_id": "opaque-id",
      "job_id": "prompt-uuid",
      "output": {
        "node_id": "42",
        "type": "output",
        "subfolder": "omarketing/.../candidates",
        "filename": "candidate-03.png",
        "media_type": "images",
        "asset_id": null
      },
      "sha256": "...",
      "size_bytes": 1234,
      "mime": "image/png",
      "selected_at": "...",
      "selected_by": "server-derived-owner"
    }
  ]
}
```

`asset_id`는 optional enrichment다. backend는 output root containment, checksum·size·MIME를 재검증하고 temp write → fsync → atomic replace로 저장한다. `revision` 또는 `If-Match`로 동시 갱신 충돌을 막고 파일 삭제·checksum 변경 시 stale로 판정한다.

여러 레퍼런스를 제작한 경우 각 레퍼런스별로 후보 5개 중 최종본 1개를 선택하며, 이렇게 확정된 레퍼런스별 최종본은 모두 보존한다. 다운로드할 때 이 최종본 목록에서 필요한 항목을 선택한다.

Queue/History의 기존 job 카드, 검색·필터·정렬·메뉴·상태·취소·Clear Queue·Interrupt All·History 삭제 동작을 그대로 사용한다. Omarketing 전용 그룹, run 카드, 기록 보관, 결과 패키지 메뉴를 추가하지 않는다. job 식별에 필요한 reference ID와 콘텐츠 주제는 prompt/widget metadata 및 기존 job detail에서 확인한다.

실패 처리도 현행 ComfyUI 동작을 따른다. 한 job이 실패하면 해당 job만 History에 `failed`로 기록하고 Queue의 다음 job을 계속 실행한다. 자동 재시도나 전체 묶음 롤백은 하지 않는다. 실패 카드 메뉴는 기존 제공 옵션만 사용한다. 사용자가 오류를 수정하고 다시 Run하면 새 job으로 Queue에 등록하며 이미 완료된 job과 결과물은 그대로 보존한다.

표시 상태는 프론트엔드의 현행 job 상태인 `pending / initialization / running / completed / failed`를 기준으로 사용한다. 취소는 대기·초기화·실행 중 job에서 제공하되 별도의 영구 상태 체계를 새로 만들지 않는다.

특정 다중 레퍼런스 그룹만 일괄 취소하는 기능은 추가하지 않는다. 사용자는 개별 job을 취소하거나 현행 ComfyUI의 전역 `Clear Queue`·`Interrupt All`을 사용한다. 취소나 Queue 정리는 이미 완료된 History와 결과물을 삭제하지 않는다.

### 3.13 설정

기존 Settings 카테고리·순서·검색·표시 조건을 유지한다. Omarketing extension setting이 필요한 경우에만 기존 extension setting 등록 방식으로 `Omarketing` 항목을 추가한다.

#### 유지할 현행 설정군

- 언어
- sidebar 위치/크기/style/unified width
- 탭 위치
- 테마·팔레트·animation 비활성
- canvas navigation, mouse click/wheel, zoom/auto-pan
- FPS, snap grid, minimap, selection toolbox
- node opacity, title 편집, collapse, shape/color
- link render, markers, snap, reroute
- tooltip와 spellcheck
- draft persist, autosave, close confirmation
- shortcut preset/custom bindings
- queue history size
- right panel 표시
- background image

#### Omarketing에서 추가로 설명할 설정군

- 기존 설정 이름과 의미는 바꾸지 않는다.
- Omarketing custom node의 연결 상태, experimental connector 표시, QA 결과 표시는 extension setting이 꼭 필요할 때만 별도 key로 추가한다.

#### 기존 설정 보존

model/cache, Model Library, API node, Comfy Cloud, image preview, custom node extension, server/Desktop, Mask/Layer/3D 설정을 삭제·숨김·이름 변경하지 않는다. Omarketing과 무관한 설정은 기존 기능으로 그대로 둔다.

#### 내부 hidden 설정

현행 core setting은 수정하지 않는다. Omarketing extension setting만 고유 namespace로 추가하고 기본값·migration·삭제 시 fallback을 테스트한다.

### 3.14 우측 Inspector

기존 Inspector 탭과 필드를 유지한다. Omarketing custom node의 widget·tooltip·node help 안에 입력, 연결 상태, safe error, 외부 job locator를 표시하며 독자 Inspector 탭은 만들지 않는다.

필드 공통 옵션:

- 값 편집/초기화
- 연결된 입력 열기
- 고급 필드 표시
- 비밀 값은 마스킹하고 연결 선택만 허용
- validation 즉시 표시
- 수정한 값은 기존 workflow 저장과 다음 prompt snapshot부터 반영한다.

### 3.15 모달·팝오버·토스트

기존 저장·이름 변경·복제·삭제·미저장·템플릿·오류·설정 모달을 그대로 사용한다. Omarketing은 `선택 항목 실행` 비용·시간 확인, Assets 상세 비교·최종 선택, 연결 테스트에 필요한 기존 화면 내부 dialog만 최소 추가한다. 독자 프로젝트·Run·승인·내보내기 모달은 만들지 않는다.

토스트 severity:

- info: 저장·새로고침 시작
- success: 저장·연동 테스트·최종 선택 완료
- warning: 부분 완료·stale·권리 불명·일부 항목 제외
- error: 사용자가 해결해야 할 실패
- progress: 외부 job 실행; 취소/상세 보기 액션

### 3.16 도움말·업데이트·데스크톱

- 기존 Comfy Help Center, Discord, Forum, Cloud 관련 표면을 유지한다.
- Omarketing 문서, 연동, 문제 신고, 시스템 상태, 라이선스 링크만 기존 Help/About에 추가한다.
- MVP는 웹/localhost 전용이므로 Electron 전용 Desktop 메뉴를 노출하지 않는다.
- 실제 Electron main/preload, IPC, 코드 서명·공증, 자동 업데이트, 백엔드 lifecycle과 Electron 전용 테스트는 후속 범위다.

### 3.17 접근성·반응형

- 모든 아이콘 버튼에 제품 용어 aria-label
- 캔버스 액션은 명령 팔레트와 키보드 대체 경로 제공
- 포트에 타입·필수 여부·연결 상태 텍스트 제공
- 색만으로 상태를 표시하지 않음
- 팝오버는 Escape로 닫히고 원래 trigger로 focus 복귀
- 모달 focus trap 및 파괴 작업의 명확한 버튼명
- 기존 반응형 동작을 유지하고 Omarketing Assets 상세 확장도 같은 breakpoint·overflow 규칙을 따른다.

---

## 4. Omarketing custom node payload 타입

아래 타입은 Omarketing backend custom node 사이에 전달되는 versioned JSON payload다. 별도 프론트 domain store, workflow schema, run 상태 머신 또는 권위 데이터베이스를 뜻하지 않는다. Queue에 제출될 때 기존 ComfyUI prompt snapshot 안에 필요한 값이 직렬화된다.

| 타입                  | 핵심 필드                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ProductFacts          | fact_id, claim, evidence, validity, prohibited_claims                                                             |
| StrategySpec          | objective, persona, message, channel/content plan                                                                 |
| ReferenceSearchPlan   | platform별 query_mode·locale, content_type, queries, request budget, page/time/cost limits, safety, rights policy |
| ReferenceCandidate    | source id, metadata snapshot, score, visual/access/acquisition/rights 상태, provenance, refreshable locator       |
| ReferenceSelection    | selected/rejected ids, reasons, selection version                                                                 |
| AssetCollection       | immutable asset refs, versions, checksums, mime, provenance                                                       |
| ProductionEligibility | file acquired, visual capability, rights, production handoff allowed, reasons                                     |
| DecompositionReport   | scenes/slides/layers/text/audio/motion/marketing roles                                                            |
| ReferencePattern      | hook, narrative, layout, pacing, visual/audio/copy rules                                                          |
| ProductionBrief       | actual reference asset refs, message mapping, preserve/change rules                                               |
| DeliverableSpec       | content type, channel, dimensions, duration/pages, locale, variants                                               |
| CreativeDeliverable   | asset versions, preview, producer job, lineage                                                                    |
| QAReport              | checks, scores, thresholds, failures, evidence frames                                                             |
| SelectionManifest     | selected output id, source job id, checksum, selected_at                                                          |

Omarketing node는 payload의 `schema_version`과 required field를 실행 전에 검증한다. 기존 ComfyUI 노드 타입·연결 규칙은 제한하지 않는다. `rights_verified`와 `production_handoff_allowed`가 모두 참이 아닌 reference는 제작 adapter가 실행을 거부한다.

자동화·미디어 팀의 기존 POC JSON은 그대로 권위 계약으로 사용하지 않는다. Omarketing 저장소에 팀별 versioned JSON Schema를 고정하고 naming, status, warning/error, pagination, checksum, rights, lineage, staleness 필드를 통일한다. 기존 snake_case 자동화 응답과 camelCase 미디어 응답은 backend adapter에서 변환하고 schema fixture test로 호환성을 검증한다.

---

## 5. MVP 노드 카탈로그

노드 실행 상태는 기존 ComfyUI의 prompt/job/node 상태를 사용한다. `thumbnail_only`, `rights_unverified`, `experimental`, `stale` 같은 Omarketing 상태는 payload·output metadata와 node widget 경고일 뿐 별도 실행 상태 머신이 아니다. 실행 중 사람 입력이나 승인을 기다리는 `awaiting_input / awaiting_approval` 노드는 만들지 않는다.

### 5.1 입력·전략

1. **프로젝트 설정**
   - 역할: 현재 프로젝트 폴더의 공통 설정을 읽는 참조 노드. 설정값을 워크플로마다 복사하지 않는다.
   - 입력: 없음. 현재 워크플로가 속한 최상위 프로젝트 폴더를 자동 인식한다.
   - 설정: 제품/서비스 설명, 타깃·페르소나, 핵심 메시지, 사용 가능한 근거, 금지된 주장, 선택 CTA, 기본 언어를 프로젝트 폴더마다 한 번 직접 입력한다. 실행 필수 항목은 `제품/서비스 설명, 타깃, 핵심 메시지, 사용 가능한 근거, 금지된 주장`이며 CTA는 워크플로별 선택 항목이다. 외부 프로젝트/Hermes 세션에서 자동 동기화하는 기능은 후속 옵션으로 둔다.
   - 출력: `PROJECT_CONTEXT` 단일 출력선
   - 클릭: 프로젝트 공통 설정 열기·수정
   - 변경 규칙: 프로젝트 공통 설정이 변경되면 같은 폴더의 모든 워크플로가 최신 값을 참조한다.
   - owner: 마케팅 관제탑. 값 저장은 Omarketing backend extension의 project-context 설정 저장소가 담당하고 workflow 경로가 아닌 불변 `project_key`로 조회한다. 별도 Project/Workflow API는 만들지 않는다.

2. **목표·페르소나·메시지 확정**
   - 입력: PROJECT_CONTEXT
   - 설정: 이번 실행의 콘텐츠 주제와 목표, KPI, persona, core message, CTA, locale, 금지 표현. 콘텐츠 주제는 프로젝트 공통값으로 저장하지 않고 콘텐츠 실행마다 새로 입력한다.
   - 출력: StrategySpec
   - 클릭: coverage 검증

3. **콘텐츠 계획**
   - 입력: StrategySpec
   - 설정: 숏폼/카드뉴스/광고, 세부 플랫폼·게재 위치, 규격, 변형 수
   - 출력: DeliverableSpec[]

### 5.2 자동 탐색·수집

4. **탐색 쿼리 생성**
   - 입력: StrategySpec, DeliverableSpec[]
   - 설정: 플랫폼, 기간, 검색 언어, 요청 budget, page/time/cost limit, 안전/권리 정책. 기본 검색 언어는 한국어와 영어이며 매 실행에서 두 언어 쿼리를 모두 생성한다.
   - query mode: YouTube Shorts·TikTok 일반 영상은 `public_keyword`, Google PASS 경로는 `advertiser_domain`, Meta·TikTok Creative Center의 미검증 경로는 `experimental_keyword`로 분리한다. 플랫폼마다 지원 입력이 다르므로 같은 자연어 쿼리 성공을 전 플랫폼에 가정하지 않는다.
   - 출력: ReferenceSearchPlan
   - 클릭: 실제 요청 preview

5. **자동 레퍼런스 검색**
   - 입력: ReferenceSearchPlan, Trigger
   - 설정: automation connection, timeout, partial policy
   - 출력: ReferenceCandidate[]
   - 목표 플랫폼: YouTube Shorts, TikTok 일반 영상, TikTok Creative Center, Instagram Reels·캐러셀, Meta Ad Library, Google Ads Transparency를 모두 제품 목표 범위에 유지한다. 현재 POC 실패를 이유로 플랫폼 자체를 제거하지 않는다.
   - 현재 검증 기준선: YouTube Shorts와 Google 광고주·도메인 검색은 PASS, TikTok 일반 영상은 fallback을 포함한 조건부 PASS, Instagram 직접 검색·TikTok Creative Center 타기팅·Meta 자연어 검색은 안정성 또는 적합도 미달이다. 이 상태를 성공으로 표시하거나 숨기지 않는다.
   - 응답 필수 항목: `platform_outcomes[]`에 `platform, capability_level(stable|conditional|experimental|unsupported), query_mode, direct_path_status, fallback_used, blocked_detected, login_required, relevance_result, evidence_refs, release_gate_passed`를 기록한다. locale 반복 성공과 주제 적합도 성공도 별도 값으로 기록한다.
   - 안정화 원칙: 미달 플랫폼은 별도 제품·별도 탭으로 만들지 않고 동일 검색 adapter 계약 아래에서 검색 방식, 적합도 검증, 허용된 fallback을 개선한다. 플랫폼별 구현 방식은 자동화 팀이 결정하며 비용·계정 연결·약관 위험이 생길 때만 사용자 승인을 받는다.
   - 출시 게이트: 각 플랫폼은 clean profile에서 한국어·영어 각 3회 반복 검증하고, 실행 성공 여부·소요시간·후보 적합도·중복 제거·시각 locator 재조회·로그인/CAPTCHA/차단 상태의 실제 증거를 남긴다. 미달 경로는 안정화와 재검증이 끝날 때까지 `experimental`로 표시하며 일반 성공 결과처럼 노출하지 않는다.
   - 실행 시점: 주기적 백그라운드 수집은 하지 않는다. 사용자가 이번 콘텐츠 주제를 입력하고 워크플로를 실행할 때 자동화팀의 새 리서치를 시작한다.
   - 누적: connector의 허용된 request budget, page/time/cost limit 안에서 점진 수집한다. 응답은 `limit_requested, limit_applied, has_more, continuation_token, truncation_reason`을 반환한다. 기존 검색 결과는 보존하고 `더 찾기`에서 continuation을 사용하되 무제한 수집·운영 SLA를 보장하지 않는다.
   - 중복 제거: MVP 보장 범위는 canonical URL, 플랫폼 콘텐츠 ID, metadata checksum이다. 원본 파일을 실제 확보한 경우에만 파일 checksum을 추가한다. perceptual hash·시각 유사도 재업로드 탐지는 threshold와 오탐 평가 POC를 통과할 때까지 `experimental`이다.
   - 클릭: 더 찾기, 연결 테스트, 외부 job 열기, 취소
   - owner: 자동화 팀

6. **후보 정리·랭킹**
   - 입력: candidates, StrategySpec
   - 설정: relevance/format/recency/utility weights, 중복 제거
   - 출력: connector가 적용한 실행 한도 안에서 확보한 유효 후보를 적합도순으로 점진 노출한다. 중복 후보와 시각 locator가 전혀 없는 `no_visual` 후보는 UI 결과에서 제외하되 rejection reason은 응답에 남긴다. 영상 원본이 없어도 썸네일이 있으면 비교 후보에 포함한다.
   - 상태 분리: `visual_state(video_available|image_available|thumbnail_only|embed_only|preview_available|no_visual)`, `access_status`, `acquisition_status`, `rights_status`, `production_eligibility`, `blocking_reasons`를 별도 필드로 둔다. 검색 성공은 원본 확보·권리 확인·제작 가능 성공을 뜻하지 않는다.
   - locator 계약: `refreshable, refresh_status, fallback_locator, last_verified_at, expires_at, failure_code`를 기록한다. locator 재조회 실패와 fallback 사용을 후보 검색 성공과 분리해 표시한다.
   - 표시: 과거 저장 후보와 이번 실행의 신규 후보를 합쳐 전체 적합도순으로 다시 정렬한다. 신규 후보에는 배지를 표시하고, 날짜/실행 필터로 이번 실행 결과만 따로 볼 수 있게 한다.

7. **레퍼런스 선택**
   - 입력: 적합도순 유효 후보 전체
   - 설정: 사람 선택 필수, 다중 선택 허용
   - 출력: ReferenceSelection
   - 클릭: 후보 비교, 여러 개 선택, 제외+사유, 선택 확정
   - fan-out 규칙: 선택한 레퍼런스마다 독립적인 원본 확보·분석·제작 작업과 결과물을 하나씩 생성한다. 여러 레퍼런스의 구조나 요소를 한 결과물에 혼합하지 않는다.
   - 실행 확인: 제품이 고정 개수 상한을 임의로 두지는 않지만 connector·Queue·비용·시간 제한으로 실제 허용 수가 결정된다. 실행 전에 `레퍼런스 N개 → 독립 제작 작업 N개`, 적용 한도와 예상 비용·시간을 표시하고 사용자 확인을 받는다.
   - owner: 마케팅 관제탑

8. **원본 확보**
   - 입력: ReferenceSelection
   - 설정: rendition, max size, transcode, rights constraints
   - 출력: AssetCollection
   - 클릭: 실제 원본/proxy 확인, provenance, 재시도
   - owner: 자동화 팀

9. **제작 handoff 판정**
   - 입력: ReferenceSelection, AssetCollection
   - 출력: ProductionEligibility
   - 판정: 표시 가능한 preview 보유, 실제 파일 확보, 권리 확인, 제작 전달 허용을 각각 독립적으로 기록한다.
   - 제한: `thumbnail_only / embed_only / preview_available`만으로 쇼츠 영상 제작을 허용하지 않는다. `rights_verified`와 `production_handoff_allowed`가 모두 참인 asset만 제작 adapter로 전달한다.
   - owner: 자동화 팀이 증거를 반환하고 Omarketing backend node가 정책을 검증한다.

현재 지원 등급은 `capability_tier=poc_fixture|production_conditional|production_ready`로 분리한다. 기존 미디어 POC는 `poc_fixture` 기술 경로만 PASS다. 권리 허용 실제 자산, production provider, 비용·재시도·부하·반복 품질을 검증하기 전에는 일반 production-ready 제작으로 표시하지 않는다.

각 제작 adapter는 `supported_envelope`에 해상도, codec, duration 또는 page/scene 범위, motion 복잡도, OCR 언어, font·copy bounding-box 한계를 반환한다. 범위를 벗어난 입력은 임의로 처리하지 않고 `unsupported` 또는 `manual_review_required`로 반환한다.

### 5.3 분석·치환

10. **레퍼런스 요소 분해**
    - 입력: 실제 AssetCollection
    - 설정: 콘텐츠 유형별 분석 깊이
    - 출력: DecompositionReport, ReferencePattern[]
    - 쇼츠: scene, shot, layer, time change, OCR/copy, audio, marketing role
    - 카드뉴스: page, layout, hierarchy, copy, visual asset, CTA
    - 광고물: layout, subject, offer, claim, proof, CTA, brand elements
    - owner: 영상·사진 팀

11. **메시지 치환·제작 브리프**
    - 입력: StrategySpec, ProductFacts, ReferencePattern, actual reference assets
    - 설정: preserve/change/prohibit, claim mapping, variant axis
    - 출력: ProductionBrief
    - 필수 규칙: 텍스트 설명만 전달 금지; 실제 원본 파일, 추출 프레임 또는 썸네일 handle과 해당 미디어 상태를 포함

### 5.4 제작

12. **쇼츠 제작 요청**
    - 입력: ProductionBrief, DeliverableSpec, reference assets
    - 제작 가능 조건: 실제 레퍼런스 영상 handle이 있는 경우에만 쇼츠 영상 제작을 허용한다. 훅, 장면 순서, 길이, 전환, 자막, 모션, 오디오 구조를 분석해 프로젝트 내용으로 재구성한다.
    - 썸네일-only 제한: 영상 없이 썸네일만 있는 후보도 검색 결과에는 표시하지만, 제목·썸네일 카피와 이미지 구성 참고에만 사용할 수 있다. 해당 후보로 쇼츠 영상 제작 job을 시작하지 않는다.
    - 설정: duration, aspect, captions, audio policy, variants, preview/final
    - 출력: CreativeDeliverable[]
    - owner: 영상·사진 팀

13. **카드뉴스 제작 요청**
    - 입력 동일
    - 페이지 규칙: 장수를 고정하지 않고 선택된 레퍼런스와 동일한 페이지 수를 사용한다. 페이지 순서와 각 페이지의 역할·레이아웃 구조를 유지하고, 문구와 시각 자산은 PROJECT_CONTEXT와 ProductionBrief에 맞게 교체한다.
    - 카피 규칙: 페이지별로 독립 생성하지 않는다. 레퍼런스의 전체 전개를 분석한 뒤 첫 장의 훅부터 마지막 장의 CTA까지 모든 페이지 문구를 하나의 구조화된 세트로 생성해 앞뒤 맥락을 유지한다.
    - 후보 규칙: 전체 카드뉴스 본문과 시각 결과물은 1세트만 제작한다. 첫 장은 동일한 이미지·레이아웃·폰트·위치를 유지하고 표지 문구만 5개로 합성해 후보를 만든다. 결과 갤러리에서 표지 하나를 선택하면 해당 표지와 본문 전체를 최종 카드뉴스 세트로 확정한다.
    - 설정: dimensions, copy density

14. **광고물 제작 요청**
    - 입력 동일
    - 후보 규칙: 레퍼런스 기반 이미지와 레이아웃은 1개만 제작한다. 동일한 이미지·레이아웃·폰트·위치를 유지하고 헤드라인·CTA 문구만 5개로 교체해 완성 광고물 후보를 만든다. 결과 갤러리에서 하나를 선택해 최종 광고물로 확정한다.
    - 규격 변환: 최종 광고물 하나를 확정한 뒤 워크플로에서 사용자가 선택한 광고 채널·게재 위치의 비율과 안전영역에 맞는 규격만 자동 출력한다. 모든 플랫폼 규격을 무조건 생성하지 않는다. 핵심 이미지와 문구는 유지하고, 잘림을 방지하기 위한 크기·위치 조정만 허용한다.
    - 설정: target placements/dimensions, copy density

15. **Google 검색광고 카피 요청**
    - 입력: ProductionBrief, PROJECT_CONTEXT, 선택된 Google Search 레퍼런스
    - 실행: 이미지 제작 없이 Google Search용 헤드라인·긴 헤드라인·설명·CTA 자산을 생성하고 글자 수와 근거·금지 주장 규칙을 검증한다.
    - 출력: Google Search ad copy asset set

제작 노드는 내부 도구/모델 선택 필드를 제공하지 않는다. Omarketing은 job request와 결과 handle만 관리한다.

추가 제작 노드:

- **제목·썸네일 문구 생성**
  - 입력: PROJECT_CONTEXT, StrategySpec, ReferencePattern, DeliverableSpec
  - 실행 엔진: Hermes Agent API. 개발 중에는 로컬 Hermes, 운영 시에는 서버의 상시 실행 Hermes Gateway를 사용한다. Hermes가 버전이 고정된 Omarketing 스킬/프롬프트를 로드하고 모델 호출, 결과 형식 검증, 로그, 실패·재시도를 담당한다.
  - 카피 리소스: `/Users/ownuun/Documents/1. 개인문서/marketing/카피라이팅/실전-플레이북.md`를 카피 생성 노드가 사용할 수 있는 중요 규칙 리소스로 등록한다. 파이프라인 템플릿과 카피 리소스는 별도 개념이다. 운영 서버가 노트북 파일 경로에 의존하지 않도록 승인된 버전을 Omarketing 저장소 또는 배포 아티팩트에 포함한다.
  - 모델 정책: 글쓰기 품질 기준으로 Claude를 우선 검토하고, 구독 Auth 사용이 더 안정적인 GPT/Codex를 대안으로 둔다. 최종 provider는 실제 Auth 연결 테스트 후 확정한다.
  - 설정: 사용할 스킬/프롬프트 버전, 후보 세트 수(기본 5개), 플랫폼 글자 수, 금지 표현, 톤
  - 출력: 서로 보완되며 같은 ID로 연결된 `제목 + 썸네일 문구` 후보 세트 5개와 생성 근거
  - 책임 경계: 제목, 썸네일 문구, 카드뉴스 카피, 광고 카피와 CTA 문구 후보는 Hermes가 생성·검증한다. 영상·사진 팀은 전달받은 확정 문구를 시각 결과물에 적용하며 임의로 다시 쓰거나 의미를 변경하지 않는다. 시각 제약 때문에 수정이 필요하면 원문을 바꾸지 않고 오류로 반환해 Hermes 카피 노드를 다시 실행한다.
  - 인증 경계: 프론트엔드와 노드는 토큰을 보관하지 않는다. 노드는 Omarketing 백엔드를 호출하고, 백엔드는 동일 서버의 private network에 있는 Hermes API와 통신한다. Hermes의 API 포트는 인터넷에 직접 공개하지 않는다. 운영 인증·skills·sessions는 영속 볼륨에 저장한다. Claude 구독 Auth 사용 여부는 사용자의 플랜과 Anthropic의 지원 정책을 확인한 뒤 확정하며, UI에는 연결 상태와 재인증 동작만 제공한다.
- **썸네일 제작 요청**
  - 입력: 제목·썸네일 문구 후보 세트 5개, PROJECT_CONTEXT, 실제 레퍼런스 이미지/영상 프레임 handle
  - 실행: 시스템이 완성된 쇼츠에서 선명도와 피사체 가시성을 기준으로 대표 프레임 1개를 자동 선택해 공통 썸네일 배경으로 사용한다. 대표 프레임 후보 선택 단계는 두지 않는다. 제목 후보에 따라 이미지 구성·레이아웃을 바꾸지 않고 동일한 대표 프레임, 텍스트 위치, 폰트, 크기를 유지한 채 썸네일 문구만 5개로 교체한다. 완성 이미지를 생성 모델로 5회 재생성하지 않고, 고정된 배경에 텍스트를 결정론적으로 합성해 후보 간 시각 드리프트를 방지한다. ComfyUI 실행 중 일시정지·승인 커스텀 노드를 사용하지 않는다.
  - 출력: 후보 세트 ID와 연결된 썸네일 CreativeDeliverable 5개. 대표 프레임에는 후보 점수, 선택 근거, confidence, safe-area/OCR 결과, manual review 필요 여부를 함께 기록한다.
  - 합성 제한: copy 길이·언어·font·bounding box 한계를 넘거나 overflow·저신뢰가 발생하면 문구나 layout을 임의 변경하지 않고 실패로 반환한다.
  - 선택: 실행 완료 후 결과 갤러리에서 썸네일 하나를 선택하면 연결된 제목·썸네일 문구 세트가 함께 확정된다.
  - owner: 영상·사진 팀
  - 필수 규칙: 텍스트 프롬프트만 보내지 않고 실제 레퍼런스 파일, 추출 프레임 또는 썸네일과 미디어 상태를 함께 전달

### 5.5 검수·선택·다운로드

16. **기술 검수**
    - 입력: deliverables, specs
    - 검사: mime, codec, dimensions, duration/pages, filesize, complete-decode/corruption, 오디오 존재·재생, A/V sync, 자막 timing, text safe area
    - 출력: QAReport
    - UI 경계: 기존 Assets 카드의 간단한 muted preview는 그대로 유지한다. 영상을 클릭하면 새 탭이 아닌 기존 Assets 상세보기 안에서 소리 재생, timeline 탐색, 자막 timing을 확인한다. complete-decode와 corruption 검사는 영상·사진팀 backend worker가 수행하고 상세보기에 결과만 표시한다.

17. **레퍼런스 유사도 검수**
    - 입력: deliverables, actual references, decomposition
    - 검사: 실제 레퍼런스 영상이 있는 쇼츠 결과에 대해 구조/레이아웃/페이싱/시각 요소/카피 역할을 검사한다. 단순 pixel copy가 아님
    - 출력: QAReport + evidence frames

18. **마케팅·컴플라이언스 검수**
    - 입력: deliverables, brief, facts
    - 검사: 메시지, CTA, claim evidence, 금지 표현, 브랜드/플랫폼 규정

19. **실행 후 최종 선택**
    - workflow node가 아니며 Queue 실행을 기다리게 하지 않는다.
    - 기존 Assets 상세 보기에서 후보 5개와 QA metadata를 비교하고 하나를 선택한다.
    - 선택 결과는 output 파일을 복사하지 않고 `selection.json`에 source job ID, node/subfolder/filename 구조화 locator, checksum, 선택 시각을 기록한다.
    - source output checksum이 바뀌면 선택·대표 프레임·썸네일·QA metadata를 stale로 표시하고 다시 선택하기 전 후속 규격 변환을 차단한다.
    - `technical_qa_passed`, 소유자의 `human_selection_confirmed`, `integration_verified`, `download_readback_verified`는 서로 다른 gate다. 기술 QA만 통과했다고 최종 선택·다운로드 준비 완료로 간주하지 않는다.

20. **선택본 다운로드**
    - 기존 Assets download를 사용한다. Omarketing 전용 영구 export 상태 머신이나 승인 패키지 API는 만들지 않는다.
    - 필요 시 선택된 파일과 `selection.json`, QA report를 함께 내려받는 작은 backend action만 추가하며 OWrite·SNS 발행은 연결하지 않는다.

### 5.6 흐름 제어·유틸리티

- Schema Validation Gate
- Rule Branch
- Fan Out
- Merge
- Note/Markdown Note
- Reroute
- Delay/Loop는 MVP 제외
- reusable subgraph는 안정화 후 추가

---

## 6. 기본 템플릿

기존 ComfyUI의 첫 실행 템플릿, 기본 템플릿, 사용자 custom template을 모두 유지한다.

기존 템플릿 브라우저의 검색, 카테고리, 카드형 미리보기, 필터 UX 안에 Omarketing 공식 카테고리·배지·템플릿을 추가한다. Omarketing 템플릿 하나는 노드, 연결선, 노트, 기본 설정이 함께 저장된 완성형 workflow 뼈대다.

초기 제공 템플릿:

- 레퍼런스 카피 쇼츠
- 레퍼런스 카피 카드뉴스
- 레퍼런스 카피 Meta 광고
- 레퍼런스 카피 Google 검색광고
- 레퍼런스 카피 Google 디스플레이/PMax

`레퍼런스 카피 Meta 광고`는 Facebook·Instagram·Threads를 별도 템플릿으로 나누지 않는다. 템플릿 내부에서 게재 위치를 선택하고, 선택된 위치에 필요한 규격만 출력한다.

사용 규칙:

- 현재 프로젝트 폴더에서 템플릿을 선택하면 해당 프로젝트에 독립적인 워크플로 복사본을 만든다.
- 복사본의 `프로젝트 설정` 노드가 현재 프로젝트의 PROJECT_CONTEXT를 참조한다.
- 사용자는 프로젝트에 맞게 노드, 연결, 설정, 노트를 자유롭게 수정할 수 있다.
- 원본 템플릿은 변경하지 않으며, 템플릿 업데이트가 기존 프로젝트 복사본을 자동 덮어쓰지 않는다.
- 기존 기능으로 사용자 custom template을 등록할 수 있다. 다만 Omarketing 공식 카테고리·배지·logo는 Omarketing 팀이 제작·검수해 배포한 5개 공식 템플릿에만 부여한다.
- 앞으로 다른 목적의 파이프라인 템플릿을 같은 갤러리에 계속 추가할 수 있다.

각 템플릿은 다음 공통 뼈대를 가진다.

`PROJECT_CONTEXT + 이번 콘텐츠 주제 → 전략 → 콘텐츠 계획 → 쿼리 → 자동 검색 → 후보 랭킹 → 레퍼런스 선택 → 원본 확보 → 요소 분해 → 제작 브리프 → 유형별 제작 → 3종 검수 → Assets에서 최종 선택`

기본 템플릿의 Omarketing custom node가 정상 등록됐지만 외부 connection만 없으면 해당 node validation에서 다음 해결 가능한 경고를 보여준다. 실제 missing node·missing model 오류는 기존 ComfyUI 의미와 표시를 그대로 유지한다.

- 자동화 팀 connection 미연결
- 영상·사진 팀 connection 미연결

---

## 7. 인증·backend extension·외부 adapter 계약

### 7.0 MVP 인증·확장 경계

- MVP는 소유자 1명이 로그인해 사용하는 개인 서비스다.
- 원격 서버이므로 localhost 무인증 신뢰 모델은 사용하지 않고 로그인 세션을 필수로 한다.
- 회원가입, 조직, 초대, 역할별 권한, 결제는 MVP에서 구현하지 않는다.
- 최초 owner 계정은 공개 회원가입이 아니라 서버 운영자가 배포 시 CLI 또는 환경 기반 bootstrap으로 1회 생성한다. 비밀번호 원문은 저장하지 않고 검증된 password hash만 서버 secret/session 경계에 저장한다.
- 로그인 성공 시 서버 session ID를 발급하고 session은 서버 측 영속 store에 저장한다. idle·absolute expiry, 재로그인 화면, logout, 전체 session revoke를 제공하며 외부 Hermes·플랫폼 connection 재인증과 Omarketing 로그인은 별도 상태로 표시한다.
- Omarketing project-context와 selection manifest에는 내부 `owner_user_id`를 저장한다. 서버는 요청 payload의 owner·tenant·actor·project 값을 신뢰하지 않고 로그인 세션과 workflow 경로에서 권한을 파생한다.
- 세션 cookie는 HttpOnly·Secure·SameSite를 적용하고 상태 변경 요청은 CSRF·Origin을 검사한다. logout·session revoke를 지원한다.
- 보안 경계는 별도 `omarketing-auth-gateway` reverse proxy로 둔다. `/`, `/api/**`, `/internal/**`, `/ws`, `/extensions/**`, `/templates/**`, `/view*` 전체를 같은 origin session으로 보호하고 ComfyUI backend 원본 포트는 외부에 공개하지 않는다.
- cookie는 `__Host-omarketing_session`, `Secure`, `HttpOnly`, `Path=/`, Domain 없음, `SameSite=Strict` 또는 검증된 `Lax`로 둔다. unsafe method는 정확한 Origin allowlist와 Fetch Metadata를 검사하고 arbitrary CORS reflection을 금지한다. `/ws` upgrade도 session과 Origin을 검증하며 logout/revoke-all 시 열린 WebSocket을 종료한다. API session 만료는 HTML redirect가 아니라 401 JSON을 반환한다.
- Hermes와 외부 팀 credential은 backend secret store에서만 읽는다. 프론트·workflow JSON·node widget·WebSocket query string에는 재사용 가능한 credential을 넣지 않는다.
- workflow·prompt·output metadata·selection manifest·browser storage에는 실제 credential을 넣지 않고 opaque `connection_id`만 저장한다. Omarketing 배포는 non-cloud distribution으로 고정하며 cloud token query 경로를 Omarketing credential에 재사용하지 않는다. 설치 가능한 custom node는 owner가 신뢰하고 pin/allowlist한 package로 제한한다.
- Workflow·Queue/History·Asset 권위 데이터와 API는 기존 ComfyUI 것을 사용한다. Omarketing은 별도 owner-aware Workflow/Run/Asset 저장소를 만들지 않는다.

### 7.1 Omarketing backend extension의 최소 책임

- 현재 workflow 최상위 폴더와 불변 `project_key`를 연결하고 PROJECT_CONTEXT를 읽고 저장한다.
- 선택된 output의 구조화 locator와 checksum을 서버에서 재검증해 `selection.json`에 기록하고 stale 여부를 계산한다.
- Hermes·자동화·영상사진 adapter의 연결 상태를 검사하고 backend custom node 실행에서 호출한다.
- safe error, 외부 job locator, 비용·시간 estimate, QA metadata를 node output 또는 기존 output metadata로 반환한다.
- workflow 저장, prompt 제출, Queue/History, Assets 인덱싱, cancel/interrupt, cache는 구현하지 않고 기존 ComfyUI 경로를 호출한다.

backend package는 별도 `comfyui-omarketing` 저장소를 사용하고 `<ComfyUI>/custom_nodes/comfyui-omarketing/`에 설치한다. custom node와 최소 route는 해당 package에서 등록하며 인증은 별도 gateway가 전체 Comfy HTTP/WS perimeter를 보호한다. 실제 package·gateway 구현 receipt가 생기기 전에는 integration Gate를 통과하지 않는다. 프론트 저장소에 임의 backend API를 만들지 않는다.

### 7.2 외부 adapter 공통 요청

모든 외부 요청 필드:

- request_id
- server-derived owner id, project key, workflow locator, prompt/job id
- service principal은 backend config에서 파생
- correlation_id, causation_id
- idempotency_key
- sent_at
- schema_version
- payload

비동기 응답:

- job_id, accepted_at, status_url
- status, progress counts, item outcomes
- artifact handles
- warnings/errors
- next_poll_after

### 7.3 진행·취소 매핑

- 외부 adapter의 progress·log·error는 backend custom node가 기존 ComfyUI execution/progress/output 의미로 매핑한다.
- Queue 취소·Interrupt는 기존 ComfyUI signal을 backend node가 감지해 외부 job cancel을 요청하되, 외부 서비스가 취소를 보장하지 못하면 `cancel_requested_but_external_job_may_continue` 경고를 남긴다.
- 외부 adapter 전용 browser WebSocket이나 독자 frontend event store는 만들지 않는다.
- production event delivery는 현재 POC로 검증되지 않았으므로 `conditional`이다. 외부 서비스가 push event를 지원하면 at-least-once delivery, event sequence, dedupe key, replay cursor, terminal-state reconciliation을 계약하고, 그렇지 않으면 idempotent polling으로 동일 상태를 수렴시킨다.
- artifact handle은 expiry·refresh·access denied·checksum mismatch를 처리한다. 이벤트 누락이나 순서 역전이 있어도 최종 status 조회와 checksum read-back으로 terminal 결과를 재조정한다.
- external adapter node는 짧은 connect/read timeout을 사용하고 status poll마다 ComfyUI interruption을 확인한다. interrupt 감지 시 외부 idempotent cancel을 요청하고 cancel 확인 전 결과를 publish하지 않는다. 늦게 도착한 artifact는 현재 prompt에 자동 연결하지 않으며 마지막 terminal status와 checksum을 다시 조회한다. 외부 서비스가 cancel endpoint 또는 idempotency를 제공하지 않으면 production adapter 승격을 차단한다.

### 7.4 팀별 입출력 계약

- 자동화 검색: SearchPlan → 후보 metadata/proxy handles
- 자동화 확보: Selection → actual asset handles/checksum/provenance/rights
- 영상·사진 분해: actual assets → decomposition + evidence frames
- 영상·사진 제작: ProductionBrief + actual assets → deliverable versions
- 최종 선택: server-validated structured output locator + checksum → selection manifest

파일은 채팅 텍스트나 로컬 경로가 아니라 접근 통제된 asset handle로 전달한다. 임시 URL은 만료시간과 checksum을 동반한다.

플랫폼별 API·브라우저·승인된 외부 데이터 connector 선택과 fallback 순서는 자동화팀이 소유한다. Omarketing은 필요한 결과 계약과 정책 제약만 정의하며 내부 수집 도구를 지정하지 않는다. 다만 유료 계약, 사용자 계정 연결, 법률·약관 위험 또는 보안 범위 변경이 필요한 경우에는 실행 전에 사용자 승인을 받는다.

---

## 8. 오류·검증 규칙

오류 category:

- CONFIG, INPUT, AUTH, PERMISSION, POLICY
- DEPENDENCY, RATE_LIMIT, TIMEOUT, QUOTA
- CONFLICT, DATA, PROCESSING, UNKNOWN

adapter 오류 최소 필드:

`code, category, retryable, safe_message, node_id, item_id, prompt_or_job_id, external_job_locator, remediation_actions`

프론트에는 `safe_message`만 표시하고 credential·cookie·내부 URL·원본 provider 오류 body는 로그에 그대로 노출하지 않는다.

실행 차단:

- 필수 입력 미연결
- 타입 불일치
- 영상·이미지·썸네일 중 사용 가능한 레퍼런스 handle 없음
- rights/use policy 금지
- claim 근거 없음(strict)
- connection 인증/권한 실패
- stale 결과를 최종 선택 또는 다운로드 대상으로 사용하려는 시도

후보 출력 실패:

- 후보 5개는 같은 job 내부의 독립 output branch로 구성한다.
- 하나라도 실패하면 job은 `failed`이며, 성공해 저장된 asset은 삭제하지 않는다.
- 전용 자동 재시도나 `실패 항목만 재시도` 버튼은 제공하지 않는다.
- 사용자는 실패한 워크플로를 열어 다시 Run하며, 성공한 branch는 ComfyUI 캐시로 재사용한다.

---

## 9. 코드 경계

### 9.1 그대로 유지할 기반

- Vue/Pinia/router/i18n/PrimeVue/Tailwind 기반
- `src/lib/litegraph` 캔버스 엔진
- graph selection/link/group/reroute/minimap
- workflow tabs/change tracking/undo-redo/draft UX
- sidebar/panel/dialog/toast/shortcut framework
- image/video/audio/text preview 컴포넌트
- 테스트 도구(Vitest/Playwright/Storybook)

### 9.2 수정하지 않을 core 경계

- `src/scripts/app.ts` prompt 제출
- `src/scripts/api.ts` 기본 API·WebSocket
- `src/stores/nodeDefStore.ts`
- `src/stores/queueStore.ts`
- `src/stores/executionStore.ts`
- `src/platform/workflow/**`
- `src/platform/remote/comfyui/jobs/**`
- `src/platform/assets/**`의 store·query·History-backed 인덱싱
- `src/lib/litegraph/**`

### 9.3 허용되는 최소 추가 경계

- built-in Omarketing frontend extension bootstrap import 1곳
- title·favicon·logo·manifest 등 정적 Omarketing branding과 GPL 수정 고지
- 기존 Assets 내부에 filter·상세 metadata·selection action을 주입하는 범용 presentation hook
- 공식 extension API로 등록되는 Omarketing node help·setting·command·template metadata
- backend custom node package와 외부 adapter. package는 별도 저장소의 `<ComfyUI>/custom_nodes/comfyui-omarketing/`에 설치하며 기준 backend는 `b08e6cf35fac50d3ca8470dffb3f9a1fbb7187d2`로 pin한다.

개발팀 Phase 0에서 승인한 정확한 ceiling은 `.hermes/phase0/contracts/core-file-allowlist.md`다. 목록 밖 기존 파일은 별도 계약 revision과 재승인 없이는 수정하지 않는다.

- bootstrap: `src/extensions/core/index.ts`
- branding/help: `index.html`, `manifest.json`, `src/config.ts`, `src/composables/useBrowserTabTitle.ts`, `src/composables/useExternalLink.ts`, `src/components/sidebar/ComfyMenuButton.vue`, `src/components/sidebar/HelpCenterMenuContent.vue`, `package.json`, `README.md`, `THIRD_PARTY_NOTICES.md`, 승인된 favicon·브랜드 자산
- Assets presentation host: `src/platform/assets/components/MediaAssetFilterBar.vue`, `src/platform/assets/composables/useMediaAssetFiltering.ts`, `src/components/sidebar/tabs/AssetsSidebarTab.vue`, `src/components/sidebar/tabs/queue/MediaLightbox.vue`, 관련 영문·한글 locale
- `MediaAssetCard.vue` 본문·context menu와 `MediaAssetSelectionBar.vue`는 수정하지 않는다.

수정 금지 파일은 `src/scripts/app.ts`, `src/scripts/api.ts`, Queue·execution·Assets store, `src/platform/remote/comfyui/jobs/**`, Workflow management, user file store, `src/lib/litegraph/**`, distribution types다.

실행 가능한 Omarketing node와 adapter는 Frontend 저장소가 아니라 별도 `comfyui-omarketing` 저장소의 Python custom-node package로 둔다. 설치 위치는 `<ComfyUI>/custom_nodes/comfyui-omarketing/`이며 node, 최소 routes, atomic storage, output locator, adapters, versioned schemas, optional web glue와 example workflows를 포함한다. 보안 gateway는 별도 프로세스로 유지한다.

기존 Comfy Cloud, model library, manager, diffusion node, mask/3D/layer UI, telemetry와 prompt queue contract는 제거·대체하지 않는다.

---

## 10. 구현 단계와 승인 게이트

### Gate 0 — 실제 UI 클릭 감사

- localhost 웹에서 모든 메뉴·탭·우클릭·더보기·설정·모달을 캡처
- localhost 기준 main menu, Assets, Node Library, Workflows, Templates, Settings, Queue/History, Run modes, Help, node/canvas context menu 확인
- 각 행을 이 문서와 대조
- 결과물: `.hermes/phase0/ui/current-ui-click-inventory.md`, screenshot 15개, `evidence-manifest.json`
- screenshot 01–12는 실제 localhost, 13–15는 backend를 변경하지 않은 request-intercept fixture이며 backend persistence·selection authority 증거로 사용하지 않는다.
- 상태: `PASS`

### Gate 0A — 완료된 POC 기준선

- 자동화 확대 POC: 6개 플랫폼 × 한국어·영어 × 3회, 총 36회 실행. 299 occurrence를 전역 canonical URL 기준 113개로 중복 제거했고 186건, 62.2%가 중복 판정됐다. 시각 증거 64/64가 유효했고 SHA-256 고유 evidence image는 44개였다. 원본 파일 확보는 0건이며 권리 상태는 299/299 `unverified`였다.
- 자동화 현재 판정: YouTube Shorts와 Google 광고주·도메인 검색 PASS, TikTok 일반 영상 조건부 PASS, Instagram 직접 검색·TikTok Creative Center 타기팅·Meta 자연어 검색은 안정성/적합도 미달이다. 모든 플랫폼은 목표 범위에 유지하되 미달 경로는 개선 후 같은 반복 matrix로 재검증한다.
- 자동화 증거: `/Users/ownuun/Documents/1. 개인문서/marketing/Test/automation-expanded-poc/final-report.md`와 `evidence-manifest.json`.
- 미디어 POC: 자체 제작 실제 MP4·PNG fixture에서 21/21 QA PASS, 후보군별 텍스트 허용 영역 밖 drift 0 pixel, complete-decode·A/V sync·OCR·stale 전파를 검증했다.
- 미디어 제한: 합성 fixture 1회에 대한 기술 POC이므로 타사 실제 레퍼런스, 다국어 OCR, 생성형 모델 품질, 반복 SLA와 production asset delivery는 아직 조건부다.
- 미디어 증거: `/Users/ownuun/Documents/1. 개인문서/design/1. 영상:사진/projects/MarketingBenchmarkCapabilityTest/reports/final-report-v1.md`와 `manifest-v1.json`.

Gate 0A는 `POC evidence`만 충족한다. `adapter implementation`, 실제 Omarketing `integration test`, 권리·비용·SLA를 포함한 `production gate`는 별개이며 현재 완료로 표시하지 않는다.

### Gate 0B — 개발팀 read-only 기술 판정

- 판정: Phase 0 `PASS`; Phase 1 foundation의 제한 범위 구현 착수는 `GO`다. backend 통합·production adapter·배포·release는 계속 `NO-GO`다.
- 검증된 근거: Frontend `f8db605df6c7a3fb1a936f17806e42ea2d76fe05`, CI-pinned backend `b08e6cf35fac50d3ca8470dffb3f9a1fbb7187d2`.
- 확인 완료: UI inventory, core allowlist, generic Assets presentation registry 계약, fan-out no-op/전용 action 계약, OutputLocator·SelectionManifest schema와 fixture, auth gateway lifecycle, external cancel/reconciliation vector, backend package 위치·template·GPL 계약.
- 검증 receipt: 8개 계약, 2개 schema, 6개 fixture, screenshot 15개. metaschema·selection valid/stale fixture·합성 Asset ID 거부·screenshot hash/size/dimension·fan-out/auth/cancel vector가 통과했다.
- 후속 integration/release blocker: 실제 `comfyui-omarketing` package와 `/object_info` 증거, gateway/session store/secret manager/canonical HTTPS origin, provider별 idempotent lookup·cancel·artifact fixture, 실제 completed output·Workflow folder E2E, 독립 source origin·namespace·logo 권리·SBOM/GPL/상표 검토.
- 전체 판정서: `.hermes/phase0/phase0-result.md`.

### Gate 0C — 자동화·Odesign 실제 handoff 판정

- 자동화 재검증: 6개 플랫폼 × 한국어·영어 × 3회, 총 36회 matrix와 482개 참조 read-back이 통과했다. handoff manifest 155개와 source→copy 146개는 SHA-256 재검산 결과 누락·불일치 0건이다.
- 권리 package: 쇼츠·캐러셀·정적 광고의 한국어·영어 6 slot 모두 package 내부 권리 감사상 `rights_verified=true`, `production_handoff_allowed=true`, blocker 0이다. 이 값은 production 제작 완료가 아니라 권리·원본 handoff 허용 판정이다.
- Odesign 계약: `reference-input-package.schema.json`, `asset-detail-response.schema.json`의 AJV 2020 strict compile과 local gate self-test 12/12가 통과했다. 기존 OCR fixture의 검증 언어는 영어뿐이며 한국어·혼합 OCR은 `preflight_required`다.
- 현재 통합 blocker: 자동화 handoff에는 Odesign `reference-input-package.schema.json`을 만족하는 실제 입력 JSON이 없어 두 팀 schema의 naming·transport가 아직 연결되지 않았다. Odesign의 실제 분석·제작·QA도 실행되지 않아 `production_readiness=not_assessed`다.
- 기술 예외: 한국어 쇼츠 WebM은 ffmpeg read-back이 exit 0이지만 `Error parsing Opus packet header`를 남긴다. 해당 자산은 권리 handoff는 유지하되 audio remux/repair 또는 무결점 decode preflight 전에는 production media 입력으로 승격하지 않는다.
- 통합 증거: `/Users/ownuun/Documents/1. 개인문서/marketing/Test/marketing-team-handoff-2026-08-27` 및 `/Users/ownuun/Documents/1. 개인문서/design/1. 영상:사진/projects/Odesign/contracts`.

### Phase 1 — 추가 경계·브랜딩·라이선스

- 착수 상태: foundation 제한 범위만 `GO`. 실제 외부 작업, backend 연결, selection manifest write, production adapter, 배포·release는 `NO-GO`.
- `.hermes/phase0/contracts/core-file-allowlist.md` enforcement test와 receipt
- frontend bootstrap skeleton, generic Assets presentation registry와 fixture-only Omarketing provider, normal Run no-op/fan-out callback unit fixture
- Omarketing title·favicon·logo·manifest·About 수정 고지
- Gate: 허용 core diff 목록 일치, GPL 고지·원본 링크·build·기존 UX smoke test 통과

### Phase 2 — backend custom node와 payload 계약

- PROJECT_CONTEXT, 검색, 선택, 분석, Hermes 카피, 제작, QA custom node 등록
- versioned payload schema와 safe error, idempotency, 외부 job locator
- project-context 설정과 selection manifest 최소 저장 action
- Gate: `/object_info`, prompt serialization, 기존 node와 혼합 workflow, credential 비노출 테스트

### Phase 3 — 공식 템플릿과 Workflows 프로젝트 규칙

- 기존 Templates 갤러리에 공식 템플릿 5개 추가
- Workflows 최상위 폴더와 불변 project key 연결
- 기존 Save·Save As·rename·duplicate·export·delete 동작 유지
- Gate: 템플릿 복사본 저장·재열기, prompt snapshot, 기존 템플릿·사용자 템플릿 회귀 없음

### Phase 4 — 자동화·Hermes·미디어 adapter

- Omarketing backend node 뒤에서 세 외부 서비스를 호출
- reference N개를 기존 Queue prompt N개로 제출하고 후보 5개는 job 내부 output branch로 실행
- 외부 progress·cancel·safe error를 기존 ComfyUI 실행 의미에 매핑
- Gate: 팀별 JSON Schema fixture, Queue FIFO·prompt snapshot·cache·failure·interrupt·다음 job 진행, artifact expiry/refresh, terminal reconciliation 회귀 테스트

### Phase 5 — 검색 플랫폼 안정화

- 6개 목표 플랫폼의 허용된 검색·fallback·적합도 검증 개선
- clean profile 한국어·영어 각 3회 재검증
- 원본 파일 확보, preview/embed, 권리 확인, production handoff 가능 상태 분리
- Gate: 플랫폼별 capability level, query mode, direct/fallback 결과, 성공률·적합도·차단·locator 갱신 증거와 비용·계정·정책 승인 사항 기록

### Phase 6 — 기존 Assets 내부 비교·선택·QA

- 기존 Assets filter·상세 metadata·영상 상세 재생·QA 표시
- 후보 5개 비교와 `selection.json` 기록
- source checksum 변경 시 대표 프레임·썸네일·QA·선택 stale 전파
- Gate: technical QA, owner 선택 확인, 실제 adapter 통합, 파일 download read-back, hash lineage, selection 재조회, History 삭제 시 기존 Assets 동작 유지를 각각 검증

### Phase 7 — 통합 회귀·upstream 전략

- 기존 Comfy 기능·탭·템플릿·모델·설정 회귀 전수 확인
- bundle/route/a11y/performance 확인
- upstream merge rehearsal
- Gate: 전체 test/build, license, auth/security, 허용 core diff, upstream 충돌 범위 통과

---

## 11. 테스트 계획

### 단위 테스트

- custom node payload schema version과 required field
- project key/context lookup과 prompt snapshot
- canonical URL·platform ID·checksum dedupe
- idempotency와 reference fan-out 순서
- rights·production handoff·claim 차단
- selection manifest·checksum·stale 전파
- adapter safe error와 credential redaction

### 컴포넌트 테스트

- Omarketing이 추가한 filter·상세·widget·dialog의 visible/disabled 조건
- 팝오버 keyboard/focus restore
- 모든 empty/loading/error/partial/stale 상태
- custom node widget validation
- Assets filter·상세·selection action
- 기존 MediaAssetCard·Queue/History·Templates 회귀

### E2E

- 프로젝트 폴더 → 공식 템플릿 복사 → 저장 → 재열기
- 자동 검색 → 레퍼런스 선택 → 독립 Queue jobs → 분석 → 제작 → QA → Assets 최종 선택
- 쇼츠/카드뉴스/광고물 각각 1개
- 연결 끊김/재연결
- 인증 만료·권한 부족
- 후보 branch 실패 후 성공 파일 보존·워크플로 재실행
- source 변경 후 selection·대표 프레임·QA stale 처리
- History 삭제 후 기존 Assets 표시 동작 유지
- 기존 Run·Shift+Run·Auto Queue·cancel·interrupt 회귀
- narrow viewport Assets 상세 보기

### 시각 회귀

- light/dark
- sidebar left/right, normal/small, connected/floating
- 기본/hover/focus/selected/disabled
- 100%, zoomed canvas, minimap
- 모든 주요 modal/popover/toast

---

## 12. GPL·저장소·upstream

- `LICENSE`와 기존 저작권 고지를 유지한다.
- 수정된 프론트엔드 전체 소스를 GPL-3.0-only 조건으로 제공한다.
- About/README에 원본 ComfyUI Frontend 링크, 수정일, 기준 commit, 수정 사실을 명시한다.
- 배포 artifact별 exact Corresponding Source 링크, source tag/version, lockfile, build/install script를 함께 보존한다.
- Omarketing 이름과 로고로 원본 프로젝트 공식 제품처럼 오인되지 않게 한다.
- README·package metadata의 `Official` 표현, splash aria-label, Comfy wordmark, favicon/PWA icon을 비혼동 기준으로 검수한다.
- 기존 copyright·no-warranty 고지를 유지하고 third-party dependency notice를 재생성·검증한다. 현재 `THIRD_PARTY_NOTICES.md` 한 줄은 배포 gate를 충족하지 않는다.
- 내부 백엔드·자동화·영상/사진 서비스는 HTTP/WebSocket 경계 뒤 독립 서비스로 유지한다.
- ComfyUI 프로세스 안에서 로드되는 `comfyui-omarketing` bridge는 GPL-3.0-only 또는 호환 라이선스를 명시한다. 공유 schema는 독립 작성하거나 별도 permissive/dual license를 명시한다.
- 독립 GitHub 저장소를 `origin`, `Comfy-Org/ComfyUI_frontend`를 `upstream`으로 둔다.
- upstream merge는 격리 브랜치에서 수행하고 `src/omarketing` 및 adapter boundary 충돌만 해결한다.
- 원본 핵심 파일 직접 수정은 정적 branding, extension bootstrap, 승인된 Assets presentation host에 한정한다. 외부 adapter 연결은 backend custom-node package 내부에서만 수행한다.
- remote 재구성·GitHub 저장소 생성·commit/push는 사용자 별도 지시 후 수행한다.

---

## 13. 구현 전 팀 확인 항목

사용자 제품 결정은 완료됐다. MVP는 소유자 1명이 Assets에서 최종 선택하며 다중 reviewer/quorum은 후속이다.

- 개발팀: Phase 1 foundation만 승인된 allowlist 안에서 구현한다. 실제 backend·provider·selection write·배포를 연결하지 않는다.
- 자동화팀: 현재 권리 package를 Odesign `reference-input-package.schema.json` v1으로 변환한 실제 instance와 schema validation receipt를 제공한다.
- 영상사진팀: 변환된 instance를 실제 validator로 read-back하고 6개 slot의 capability preflight를 반환한다. 한국어 쇼츠의 Opus packet 오류는 remux/repair 또는 교체 파일과 새 checksum·rights binding으로 해소한 뒤 분석한다.
- 디자인팀: 실제 preflight 결과를 기존 Assets 상세 계약에 매핑하고, 그 이후에만 실제 분석·제작·QA 1회 검증을 진행한다. 한국어·혼합 OCR은 별도 preflight를 유지한다.
- 공통: 유료 생성 호출·외부 업로드·계정/OAuth 연결은 비용·전송 데이터·범위를 사용자에게 먼저 제시하고 승인 전 실행하지 않는다.

---

## 14. 완료 정의

Omarketing MVP 추가 확장은 다음 조건을 모두 만족할 때만 완료로 선언한다.

- 기존 Workflows·Templates·Node Library·Assets·Queue/History·캔버스·모델·설정 기능이 유지되고 회귀 테스트를 통과한다.
- core diff가 built-in extension bootstrap, 정적 branding, 범용 Assets presentation hook 상한을 넘지 않는다.
- Omarketing 공식 기본 흐름에는 수동 파일 업로드·URL 붙여넣기가 필요하지 않다. 기존 ComfyUI의 업로드·붙여넣기 기능은 유지한다.
- 제작팀 handoff에는 실제 레퍼런스 파일, 추출 프레임 또는 썸네일 handle과 미디어 상태가 반드시 포함된다.
- 공식 템플릿 5개가 기존 갤러리에서 프로젝트 workflow 복사본으로 저장·재열기·실행된다.
- 레퍼런스 N개가 기존 Queue job N개로 제출되고 Queue/History의 기존 상태·실패·취소·cache 의미가 유지된다.
- 독립 job의 실패·취소·후속 Queue 진행·재연결이 검증됐다.
- 후보 5개와 server-validated output locator가 기존 output·History-backed Assets·selection manifest에서 일관되게 재조회된다.
- checksum 변경 시 대표 프레임·썸네일·QA·선택 상태가 stale로 처리된다.
- 6개 검색 플랫폼은 목표 범위에 남고 미달 경로는 experimental 표기와 실제 재검증 증거를 갖는다.
- MVP 로그인, CSRF·Origin, logout/revoke, credential 비노출이 검증된다.
- GPL 고지와 수정 소스 제공 조건을 충족한다.
