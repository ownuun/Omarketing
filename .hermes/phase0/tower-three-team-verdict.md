# Omarketing 세 팀 결과 Tower 판정

판정일: 2026-08-27

## 최종 판정

- 개발 Phase 0: PASS
- Phase 1 foundation 제한 범위: GO
- backend 통합, selection manifest 실제 쓰기, production adapter, 배포, release: NO-GO
- 자동화 권리·원본 handoff package: 내부 일관성 및 hash 검산 PASS
- Odesign 계약 validator: PASS
- 자동화 → Odesign 실제 schema handoff 및 실제 분석·제작·QA: 미완료
- production readiness: not_assessed

## 개발팀 검증

검증한 산출물:

- `.hermes/phase0/phase0-result.md`
- 계약 8개
- JSON Schema 2개
- JSON fixture 6개
- screenshot 15개와 evidence manifest

Tower 재검증 결과:

- `uvx check-jsonschema --check-metaschema`: PASS
- SelectionManifest valid/stale fixture: PASS
- JSON 9개 parse: PASS
- screenshot 15개 SHA-256, byte size, PNG width/height: PASS
- fan-out 10건, output locator 10건, auth 17건, external lifecycle 10건의 case ID 중복 없음
- core allowlist 필수 allowed/forbidden anchor 확인: PASS
- 현재 frontend HEAD: `f8db605df6c7a3fb1a936f17806e42ea2d76fe05`
- tracked product diff: 기존 `vite.electron.config.mts`만 존재

승인 범위:

- allowlist enforcement test/receipt
- built-in extension bootstrap skeleton
- 정적 branding/GPL/source metadata
- generic Assets presentation registry와 fixture-only provider
- normal Run no-op/fan-out callback unit fixture

금지 범위:

- 실제 backend/provider 연결
- selection manifest 실제 쓰기
- production adapter
- 배포/release
- allowlist 밖 core 수정

## 자동화팀 검증

검증한 handoff root:

`/Users/ownuun/Documents/1. 개인문서/marketing/Test/marketing-team-handoff-2026-08-27`

Tower 독립 재검산:

- handoff manifest entry: 155
- source→copy row: 146
- 실제 폴더 파일: 158 (manifest/readback/support 파일 포함)
- manifest SHA-256/size mismatch: 0
- source→copy SHA-256 mismatch: 0
- 6개 slot과 rights audit의 asset ID, rights_verified, production_handoff_allowed 교차 불일치: 0
- 36회 matrix와 6개 플랫폼×2개 언어×3회 구성: integration validator PASS

해석 제한:

- `rights_verified=true`와 `production_handoff_allowed=true`는 권리·원본 handoff 허용 판정이다.
- 실제 제작 성공이나 일반 production-ready 판정이 아니다.
- 기관 출처, attribution, 변경 표시, 비후원 조건은 downstream에서 유지해야 한다.

## Odesign 검증

검증한 계약 root:

`/Users/ownuun/Documents/1. 개인문서/design/1. 영상:사진/projects/Odesign/contracts`

Tower 실행 결과:

- `validate_reference_package.py --self-test`: 12/12 PASS
- `reference-input-package.schema.json`: AJV 2020 strict compile PASS
- `asset-detail-response.schema.json`: AJV 2020 strict compile PASS
- production candidate의 rights/checksum binding, expiry, preview-only, MIME, symlink, duplicate asset version 차단 fixture: PASS
- 기존 OCR fixture 기준선: 영어만 검증됨
- 한국어·한영 혼합 OCR: preflight_required

## 발견한 통합 blocker

1. 자동화 handoff 폴더에 Odesign `reference-input-package.schema.json`을 만족하는 실제 입력 instance가 없다.
2. 따라서 자동화 package가 Odesign validator를 실제로 통과한 end-to-end receipt는 아직 없다.
3. Odesign은 실제 6개 slot 분석·제작·QA를 실행하지 않았다.
4. 한국어 쇼츠 `Mon_and_Korean_tell_the_time.webm`은 ffmpeg read-back이 exit 0이지만 `Error parsing Opus packet header` 경고를 재현한다. 권리 handoff는 유지할 수 있으나 audio remux/repair 또는 교체 후 무결점 decode preflight 전에는 production media 입력으로 승격하지 않는다.
5. 실제 `comfyui-omarketing`, gateway, provider lifecycle fixture, completed output E2E, 독립 origin/SBOM/GPL/release receipt는 아직 없다.

## 다음 완료 조건

- 자동화팀이 6개 slot을 Odesign reference input schema v1 실제 instance로 변환
- Odesign validator의 실제 package read-back PASS receipt
- 한국어 쇼츠 audio 오류 해소와 새 checksum/rights binding
- 6개 slot capability preflight
- 이후 실제 분석·제작·QA 1회

유료 호출, 외부 업로드, 계정/OAuth 연결, 배포는 사용자 사전 승인 전 실행하지 않는다.
