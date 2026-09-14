# Odesign 연동 v1 계약

## 1. 문서 목적과 상태

이 문서는 Omarketing과 Odesign이 2026-08-28에 합의한 Phase 0 연동 계약이다. 구현 전에 합의한 기준을 기록하는 문서이며, 이 문서의 어떤 문장도 구현 완료, 운영 중, 또는 검증 완료를 뜻하지 않는다. 아래에서 “합의됨”은 동작과 책임에 대한 합의를 뜻하고 “구현됨”은 별도로 표시한다.

이 계약은 두 개의 ComfyUI 인스턴스를 연결할 때의 권위, 상태, 보안, 결과물 경계를 정한다. 구현되지 않은 API나 기능을 구현된 것처럼 취급하지 않는다.

## 개정 기록 (2026-08-31)

W1은 `awaiting_approval` 표시와 승인 경계를 고정하고, 외부 상태 영수증의
계약상 투영을 명확히 한다. 이 기록과 아래 규칙은 계약 증거일 뿐 구현
또는 production 증거가 아니다. Odesign의 여섯 원문 상태는 그대로
보존하며, Omarketing에는 두 번째 실행 상태를 만들지 않는다.

## 2. 실행 권위 계층

두 인스턴스의 ID는 다음 계층으로 분리한다.

- **Omarketing `prompt_id`**: Omarketing 인스턴스에서 마케팅 노드 실행의 권위다. Omarketing의 Queue/History와 실행 결과를 이 ID가 가리킨다.
- **Odesign `run_id`**: Odesign 인스턴스의 제작 이력, 비용, 결과물, 감사기록의 권위다.
- **Odesign `prompt_id`**: Odesign `run_id` 내부에서 발생한 개별 생성 시도의 ID다.

세 ID는 상관관계로 연결할 수 있지만 서로의 권위를 대체하지 않는다. 특히 Odesign `run_id`를 Omarketing의 Run authority로 승격하지 않는다. Omarketing에는 두 번째 Queue, History, Run store 또는 프론트엔드 run state machine을 만들지 않는다.

## 3. 범위

첫 시험 연동의 범위는 정적 광고(StaticAd)와 Shorts다. 카드뉴스는 지원하지 않는다.

이 v1 연동은 시험 연동으로만 운용한다. 취소 계약과 실제 구현·검증이 별도로 마련되기 전에는 정식 운영으로 승격하지 않는다.

## 4. 상태 모델

Odesign API v1의 상태는 다음 여섯 개만 사용한다.

| 상태                | 전이                                                                                         | 쉬운 한국어 표시 | 사용자가 할 일                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `accepted`          | `accepted → running`                                                                         | 접수됨           | 실행이 시작될 때까지 기다린다.                                                                                                                                                                         |
| `awaiting_approval` | `awaiting_approval → accepted → running`                                                     | **승인 대기**    | **Odesign에서 승인을 완료해야 작업이 계속됩니다.** Omarketing에서는 승인 action을 제공하지 않는다. 현재 Omarketing Comfy prompt는 기다리지 않고 `APPROVAL_REQUIRED_IN_ODDESIGN`으로 안전하게 실패한다. |
| `running`           | `running → succeeded` 또는 `running → failed`; 결과가 불명확하면 `running → outcome_unknown` | 실행 중          | 완료 또는 실패가 확정될 때까지 기다린다. 취소할 수 없다.                                                                                                                                               |
| `succeeded`         | 종결 상태                                                                                    | 제작 완료        | 후보를 확인하고 Omarketing에서 최종 선택을 한다. 사람의 최종 승인은 별도다.                                                                                                                            |
| `failed`            | 종결 상태                                                                                    | 실패             | `error.code`와 안내를 확인하고, `retryable`이 true일 때만 재시도를 선택한다.                                                                                                                           |
| `outcome_unknown`   | `outcome_unknown → succeeded` 또는 `outcome_unknown → failed`                                | 결과 확인 중     | polling과 재조회가 끝날 때까지 기다리며 자동 재실행하지 않는다.                                                                                                                                        |

정상 흐름은 `accepted`에서 `running`으로 간 뒤 `succeeded` 또는 `failed`로 끝난다. 비용 재승인이 필요하면 Odesign의 자체 run이 `awaiting_approval`에서 `accepted`로 돌아간 뒤 실행한다. Omarketing Comfy prompt는 승인 대기에서 종료되므로 기존 prompt를 재개하지 않는다. 실행 결과가 불명확하면 `running`에서 `outcome_unknown`으로 두고 이후 `succeeded` 또는 `failed`로 확정한다.

`succeeded`는 요청한 후보가 전부 생성되고, 후보 개수와 SHA-256 무결성 검사를 통과했다는 뜻이다. 사람의 최종 선택이나 최종 승인을 뜻하지 않는다. Omarketing의 Odesign informational receipt view는 여섯 원문 label을 모두 표시하되, 이름만 쉬운 한국어로 바꾼다. 이 view는 Omarketing의 generic run state가 아니다. 특히 `awaiting_approval`은 **승인 대기**로 표시하고 “Odesign에서 승인을 완료해야 작업이 계속됩니다.”라는 고정 안내를 함께 보여 다른 대기나 실행 상태와 구분한다. 이 상태의 승인 버튼, 승인 action, 승인 API mutation은 Omarketing에 없다.

Omarketing은 Odesign이 승인된 API를 외부에 제공하고 양 팀이 그 API와
권한·감사 범위를 별도로 승인하기 전까지 승인 버튼, action 또는 API
mutation을 추가하지 않는다. 승인 API가 생겨도 별도 계약 개정과 양 팀
승인이 먼저이며, 그 전까지 `awaiting_approval`은 Odesign에서만 해소된다.

`omarketing.odesign-status-receipt.v1`의 정확한 필드는 `operation`,
`external_run_id`, `odesign_status`, `omarketing_projection`,
`guidance_code`, `observed_at`, `publication`, `lookup_before_retry`다.
`awaiting_approval`은 `failed` 투영·닫힌 publication·
`guidance_code=APPROVE_IN_ODDESIGN`을 기록하고, 현재 prompt에는
`APPROVAL_REQUIRED_IN_ODDESIGN`을 사용한다. 승인을 완료한 Odesign run의
늦은 결과는 Odesign 권위이면서 private receipt/quarantine 대상이며,
새 prompt에 자동 연결하지 않는다. 이후 Omarketing run은 새 normal prompt로
시작하고 이전 run을 authoritative read-back 하기 전 자동 재제출하지 않는다.
`guidance_code`는 그 상태에서만 이 값을 가지며 나머지 다섯 상태에서는
null이다.

## 5. 상태 확정 권위

polling이 상태 확정의 권위다. terminal event는 참고 신호일 뿐이며, event만으로 상태를 확정하거나 Omarketing 실행을 완료로 바꾸지 않는다. Omarketing은 `run_id`를 다시 조회해 최종 상태를 확정하고 artifact 목록과 각 artifact의 SHA-256을 재확인한다.

HMAC push 수신과 callback listener는 Odesign v1에서 비활성일 뿐 아니라
도달 불가능해야 한다. v1에는 이를 켜는 설정, route, listener 또는
feature toggle이 없다. 활성화하려면 별도 버전 계약, exact write-set 검토,
명시적 범위 승인, 구현·검증이 먼저 필요하며 polling은 언제나 권위다.

### 5.1 외부 상태 영수증 투영

Omarketing backend가 보관하는 상태 영수증은
`omarketing.odesign-status-receipt.v1`로 버전을 고정한 계약 문서다.
정확한 v1 필드는 다음과 같으며, 2026-08-31 개정이 구현 전의 이전
비실행 스케치를 대체한다.

```json
{
  "schema_version": "omarketing.odesign-status-receipt.v1",
  "operation": "StaticAd|Shorts",
  "external_run_id": "opaque Odesign run id",
  "odesign_status": "accepted|awaiting_approval|running|outcome_unknown|succeeded|failed",
  "omarketing_projection": "accepted|running|succeeded|failed",
  "guidance_code": null,
  "observed_at": "UTC RFC 3339 timestamp",
  "publication": "open|closed",
  "lookup_before_retry": false
}
```

영수증의 `odesign_status`는 여섯 원문 상태 중 하나이고
`omarketing_projection`은 기존 generic `accepted|running|succeeded|failed`
중 하나다. `awaiting_approval`은 `failed`로 투영하고
`guidance_code=APPROVE_IN_ODDESIGN`와 고정 안내를 기록한다.
`outcome_unknown`은 `running`으로 투영하되 publication을 닫고
`lookup_before_retry=true`로 기록하며 재제출하지 않는다. `succeeded`는
fresh polling과 artifact SHA-256 read-back 뒤에만 투영한다. 알 수 없는
필드·상태·투영은 거부한다. 영수증은 Odesign `run_id`나 Omarketing
Run/Asset/Workflow 권위를 대체하지 않는다.

## 6. 취소

Odesign API v1에는 `cancel`, `pause`, `resume`이 없다. 따라서 v1 화면에는 취소 버튼을 노출하지 않으며, 실제 작업을 확인하지 않고 취소됨으로 표시하지 않는다.

이 제약으로 v1은 시험 연동으로만 운용하고 정식 운영 승격을 차단한다. 정식 운영을 다시 판정하려면 별도의 취소 계약과 구현·검증이 먼저 필요하다. 후속 취소 계약이 생기면 전이는 `cancel_requested → cancelled` 또는 `cancel_failed` 또는 `completed_late`로 정의한다.

## 7. 재조회와 다운로드

Odesign은 다음 재조회 endpoint를 계약 목표로 보장한다.

- `GET /v1/runs/{run_id}`
- `GET /v1/runs/{run_id}/artifacts`

artifact 다운로드 URL은 15분 동안 유효한 capability로 발급한다. URL이 만료되면 같은 `artifact_id`로 새 URL을 재발급할 수 있어야 한다. URL 만료는 artifact 보존 만료와 별개다.

Omarketing은 매 다운로드 때 artifact의 SHA-256을 다시 확인한다. 다운로드 URL을 로그, 감사기록, event payload에 남기지 않는다. URL 자체는 제작 이력이나 권위 식별자가 아니다.

v1에서는 run metadata, artifact metadata, 감사기록에 자동 만료를 두지 않으며 `run_id` 재조회에도 시간 제한을 두지 않는다. 보존 정책을 나중에 도입하려면 versioned 계약, 사전 고지, 삭제 전 회수 기간을 별도로 합의한다.

## 8. 중복 비용 방지 흐름

Omarketing 연결이 끊겼고 Odesign run이 이미 존재할 가능성이 있으면 새 run을 자동 생성하지 않는다. 기존 `run_id`를 보존하고 polling으로 상태와 artifact를 먼저 회수한다.

상태가 불명확하면 `outcome_unknown`을 유지한다. `run_id`와 artifact를 재조회해 사실을 확인하기 전에는 자동 재실행하지 않는다. 재시도나 재연결은 기존 작업의 상태·artifact·SHA-256을 확인한 뒤에만 별도 판단한다. 이 흐름은 중복 유료 실행과 중복 비용을 막으며, Odesign run을 Omarketing의 새 Run authority로 만들지 않는다.

## 9. 최종 선택 회신

최종 후보를 선택하는 화면과 최종 결정 기록은 Omarketing이 소유한다. Omarketing은 Odesign에 선택된 `AssetHandle`만 회신한다. 게시 URL과 게시 ID는 Odesign에 보내지 않는다.

Odesign은 회신받은 `AssetHandle`을 기존 제작 이력에 append-only usage record로 결속한다. 이 회신은 Odesign의 `succeeded` 상태를 바꾸지 않으며 artifact bytes도 바꾸지 않는다.

## 10. 인증과 범위 식별자

호출 주체는 Omarketing backend이며, 통신은 server-to-server로 한다. 브라우저는 Odesign, provider 또는 ComfyUI를 직접 호출하지 않는다.

Omarketing backend 전용 service token은 서버측 secret store에만 보관한다. token과 key를 프론트엔드 bundle, 브라우저 storage, workflow 파일, 요청 문서 또는 로그에 넣지 않는다. 실제 인증과 권한은 server-side service identity와 Odesign 정책 scope로 판정한다.

모든 요청에는 다음 네 식별자를 붙인다.

- `organization_id`
- `brand_id`
- `project_id`
- `campaign_id`

`organization_id`는 Omarketing 서버 설정에 고정된 단일 값이다. 이 값을 이유로 Omarketing에 조직, 역할, 초대 또는 다중 사용자 개념과 화면을 만들지 않는다. 네 식별자는 요청의 범위 식별자이며, 인증 주체나 권위를 브라우저 입력에 위임하지 않는다.

## 11. 실패 표시

Odesign 실패 응답은 안정적인 `error.code`, 같은 의미의 요청을 다시 시도할 수 있는지를 나타내는 `retryable`, 사용자 화면용 한국어 한 줄 `message`를 제공한다.

`retryable`이 false이면 Omarketing은 재시도 버튼을 숨긴다. 화면에는 한국어 안내 한 줄과 `error.code`를 함께 표시하고, 사용자가 코드를 복사할 수 있는 버튼을 둔다. 오류에 내부 경로, provider detail 또는 secret을 포함하지 않는다.

네트워크 전송만 다시 시도하는 경우에는 기존 `Idempotency-Key`를 그대로 사용한다. 연결 끊김이나 응답 유실을 새 작업으로 간주해 새 key를 발급하지 않는다.

## 12. 결과물 보관 권위

Odesign Asset Library가 원본 bytes, `AssetHandle`, SHA-256, 제작 lineage의 단일 권위다. Omarketing은 만료형 URL로 캠페인 사본을 내려받아 보관하고 게시할 수 있다.

Omarketing에 보관한 캠페인 사본은 Odesign 제작 이력의 authoritative source가 아니다. 원본, lineage, 무결성 또는 감사기록의 사실을 확인할 때는 Odesign Asset Library와 `run_id` 재조회를 사용한다.

## 13. 구현 현황표

아래 표는 합의와 구현을 구분한 현재 상태다. “미구현”, “계획됨”, “검증 전”은 구현 완료를 뜻하지 않는다.

| 항목                                                                                 | 합의 여부                      | Odesign 구현 상태                                | Omarketing 구현 상태                |
| ------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------ | ----------------------------------- |
| 두 인스턴스의 실행 권위와 세 ID 상관관계                                             | 합의됨                         | 계약 방향은 합의 가능; production 구현·검증 없음 | `comfyui-omarketing` 연동 구현 없음 |
| TEST-ONLY `run_id`/artifact 조회 기반                                                | 조회 필요성 합의됨             | 기존 기반 일부 존재(TEST-ONLY)                   | 호출 adapter·표시 연동 없음         |
| 정적 광고 production API                                                             | 범위 합의됨                    | Omarketing-facing API 미구현                     | 패키지·노드·라우트 미구현           |
| Shorts execution API                                                                 | 범위 합의됨                    | 미구현                                           | 패키지·노드·라우트 미구현           |
| selection feedback endpoint                                                          | 회신 방향 합의됨               | 미구현                                           | 회신 호출·결정 연동 미구현          |
| 15분 download URL 발급 및 같은 `artifact_id` 재발급                                  | 계약 목표 합의됨               | 계획됨, 미구현                                   | 다운로드 adapter·검증 미구현        |
| 시간 제한 없는 durable `run_id` 재조회                                               | 계약 목표 합의됨               | production 검증 전                               | 재조회 adapter 미구현               |
| polling 기반 상태 확정과 artifact SHA-256 재확인                                     | 규칙 합의됨                    | production 검증 전                               | polling·무결성 검증 미구현          |
| 실제 provider 호출·유료 실행·외부 게시                                               | v1 시험 범위에서 수행하지 않음 | 수행하지 않음                                    | 수행하지 않음                       |
| Omarketing backend package, Omarketing 노드와 라우트, auth gateway, provider adapter | 구현 필요성 합의됨             | 해당 없음                                        | 전부 미구현                         |

## 14. 연동 개시 전 충족해야 할 조건

실제 연동을 시작하기 전 양 팀은 다음을 확인하고 증거를 남겨야 한다.

- [ ] Odesign이 StaticAd와 Shorts의 Omarketing-facing API 및 요청·응답 schema를 구현하고 버전을 고정한다.
- [ ] Odesign이 `GET /v1/runs/{run_id}`와 `GET /v1/runs/{run_id}/artifacts`를 TEST-ONLY가 아닌 durable 조회로 검증한다.
- [ ] Odesign이 15분 download URL 발급과 동일 `artifact_id` 재발급을 구현하고, URL이 로그·감사기록·event payload에 남지 않음을 확인한다.
- [ ] Odesign Asset Library가 원본 bytes, `AssetHandle`, SHA-256, lineage의 권위를 제공하고 다운로드 시 재검증 가능한 자료를 제공한다.
- [ ] Odesign이 `error.code`, `retryable`, 한국어 한 줄 `message`와 안전한 오류 정보 경계를 제공한다.
- [ ] Odesign이 선택된 `AssetHandle`을 받는 selection feedback endpoint와 append-only usage record를 구현한다. 게시 URL·게시 ID는 받지 않는다.
- [ ] Omarketing이 `comfyui-omarketing` backend package, 마케팅 노드와 라우트, auth gateway, provider adapter를 구현한다.
- [ ] Omarketing backend가 server-to-server 호출, 서버측 secret store, 네 개 범위 식별자와 고정 `organization_id`를 구현하며 브라우저 직접 호출과 secret 노출을 차단한다.
- [ ] 양 팀이 여섯 상태의 원문·한국어 표시, `awaiting_approval` 구분, polling 권위, `outcome_unknown` 재조회 흐름을 fixture와 read-back으로 검증한다.
- [ ] `awaiting_approval`은 **승인 대기**와 고정 안내 “Odesign에서 승인을 완료해야 작업이 계속됩니다.”로 표시되고, 승인 API가 양 팀 승인되기 전 Omarketing에 버튼/action/mutation이 없다.
- [ ] 양 팀이 같은 `Idempotency-Key` 재사용과 연결 끊김 뒤 기존 `run_id` 우선 회수로 중복 비용 방지 흐름을 검증한다.
- [ ] Omarketing이 모든 다운로드에서 SHA-256을 재확인하고, 검증 전 artifact를 캠페인 결과로 게시하지 않음을 확인한다.
- [ ] v1에서 `cancel`, `pause`, `resume`이 없음을 반영해 취소 버튼을 숨기고, 별도 취소 계약 전에는 정식 운영 승격을 하지 않는다.
- [ ] Odesign v1은 HMAC push route/listener/setting/toggle을 노출하지 않아 도달 불가능하다. 향후 push 활성화에는 별도 versioned 계약, exact write-set 검토, 명시적 scope 승인, 구현과 검증이 모두 필요하며, polling이 계속 권위다.

## 15. 기존 Omarketing 계약과의 관계

이 문서는 다음 기존 계약의 금지 조항을 약화하거나 대체하지 않는다.

- `Omarketing/.hermes/phase0/contracts/external-job-lifecycle.md`
- `Omarketing/.hermes/phase0/contracts/core-file-allowlist.md`

충돌이 생기면 기존 Omarketing 계약이 우선한다. 특히 Omarketing의 기존 Queue/History·파일 allowlist·실행 권위·보안 경계와 second Run authority 금지를 이 문서의 Odesign 연동 규칙으로 우회할 수 없다. 이 문서와 기존 계약을 함께 구현하려면 별도 계약 개정과 검토가 필요하다.
