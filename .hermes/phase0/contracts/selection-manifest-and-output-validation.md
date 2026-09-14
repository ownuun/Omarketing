# SelectionManifest·OutputLocator 서버 검증 계약

## Approved local selection persistence CR

This amendment supersedes legacy storage/request/response examples below for local selection. Current SelectionManifestStore HMAC owner namespace/expected_directory/manifest_path is authoritative, unchanged. Verify uses candidate_id, not candidate locator; PUT uses candidate_id, not output locator, with existing intent and revision. Both return schema_version/revision/reference_id/candidate_id/output with only job_id/node_id/filename/media_type/sha256/size_bytes/mime_type. New association POST and GET use plan §4 closed projections, not legacy fixtures or raw disk. Unique authorized run binding is required even for revision0; corruption/auth/unknown run never becomes empty. Reverse binding unavailable returns null candidate/output. GET is nonmutating; revalidate then GET proves freshness. Missing History is unavailable, not false output_missing. CAS precedes no-op. No blind PUT retry; success requires matching GET readback.

## Approved designated still-image adoption CR (2026-09-06)

Only an explicitly allowlisted local export capability for one designated, pre-produced PNG/JPEG may create a local output. The capability pins a single-link regular source file plus producer artifact/version/hash/size/MIME and independently verified production, QA and rights receipt digests. No request path, directory, URL, scan, video, generation or external fetch is authority. Admission reuses the authenticated `ProjectContextStore`, checks exact project revision/workflow ownership, assigns an independent canonical UUID local run, and immutably binds reference/candidate and real prompt/node before publication. Additional candidates may join only an already recorded exact owner/project/workflow run; an arbitrary supplied run cannot create authority. The output node copies without modifying the source through no-follow bounded reads into `SelectionManifestStore.expected_directory`, exclusive staging, fsync and no-overwrite publication. Admission/publication receipts are append-only under the existing owner namespace. Receipt publication does not forge completion: `SelectionHistory` joins these receipts only when an injected native History adapter reports genuine successful output membership. Failed/lost History, partial byte commit, foreign owner, changed source, symlink, hardlink, traversal or conflicting receipt is never selectable.

Status: Phase 0 contract; 제품 구현이 아니다.

## 권위 경계

- 권위 schema:
  - `../schemas/output-locator.v1.schema.json`
  - `../schemas/selection-manifest.v1.schema.json`
- valid/stale fixture:
  - `../fixtures/selection-manifest.valid.json`
  - `../fixtures/selection-manifest.stale.json`
- Frontend의 `AssetItem.id`, `${jobId}-${nodeId}-${subfolder}-${filename}` 합성 ID, preview URL, 화면 filename은 표시 상관관계일 뿐 권위 locator가 아니다.
- 서버가 session에서 owner를 파생하고 Comfy History/output metadata, project binding, reference/run binding과 실제 output bytes를 다시 확인한다.
- `selection.json`은 기존 output의 선택 상태만 기록한다. output을 `final/`로 복사하거나 별도 Asset index·Run store를 만들지 않는다.

## 저장 위치

선택 sidecar의 정확한 논리 위치는 다음과 같다.

```text
<COMFY_OUTPUT_DIRECTORY>/omarketing/
  <project_key>/
    <workflow_slug>/
      <run_key>/
        references/
          <reference_storage_key>/
            candidates/
        selection.json
```

`workflow_slug`는 저장 위치를 읽기 쉽게 만드는 backend-generated slug이며 identity나 권한 판단에 사용하지 않는다. `reference_storage_key`는 `r-` + domain-separated `(project_key, run_key, reference_id)` HMAC-SHA-256 전체 lowercase hex이며 backend storage secret으로 계산한다. Raw reference ID를 path에 넣지 않는다. 권위 identity는 `project_key`, normalized `workflow_locator`, `run_key`, `reference_id`다. 서버는 project/run receipt에서 기대되는 실제 디렉터리를 계산하며 request가 디렉터리나 `selection.json` 경로를 직접 지정하게 하지 않는다.

## HTTP contract

모든 route는 `auth-gateway.md`의 same-origin session, Origin, Fetch Metadata 규칙을 따른다. 응답은 `Cache-Control: no-store`다.

### 후보 검증

```text
POST /api/omarketing/v1/output-locators:verify
```

Request:

```json
{
  "schema_version": 1,
  "project_key": "uuid",
  "workflow_locator": "workflows/project/workflow.json",
  "run_key": "uuid",
  "reference_id": "opaque-id",
  "candidate": {
    "job_id": "prompt-uuid",
    "node_id": "42",
    "directory_type": "output",
    "subfolder": "omarketing/.../<run-key>/references/<reference-storage-key>/candidates",
    "filename": "candidate-03.png",
    "media_type": "images",
    "asset_id": null
  }
}
```

Request candidate에는 client hash, MIME, size 또는 filesystem path가 없다. 성공 응답은 서버가 만든 완전한 `OutputLocator v1`과 현재 manifest revision을 반환한다.

### 선택 쓰기

```text
PUT /api/omarketing/v1/projects/{project_key}/runs/{run_key}/selections/{reference_id}
```

Request:

```json
{
  "schema_version": 1,
  "workflow_locator": "workflows/project/workflow.json",
  "expected_manifest_revision": 3,
  "output": {
    "job_id": "prompt-uuid",
    "node_id": "42",
    "directory_type": "output",
    "subfolder": "omarketing/.../<run-key>/references/<reference-storage-key>/candidates",
    "filename": "candidate-03.png",
    "media_type": "images",
    "sha256": "64 lowercase hex",
    "size_bytes": 2481937,
    "mime_type": "image/png"
  },
  "intent": "confirm_final_selection"
}
```

`expected_manifest_revision`은 처음 생성할 때 `0`이다. 서버는 이전 verify 응답을 신뢰하지 않고 아래 전체 검증을 다시 수행한다. 성공은 새 revision의 `SelectionManifest v1` 전체를 반환한다. 동일 owner, 동일 expected revision, 동일 reference/output으로 반복한 request는 `unchanged`로 idempotent하게 성공한다.

### revalidation

```text
POST /api/omarketing/v1/projects/{project_key}/runs/{run_key}/selection-manifest:revalidate
```

Download, 후속 규격 변환, Assets detail 새로고침은 이 검증을 사용한다. 파일 부재·내용 변경·binding 불일치를 발견하면 해당 selection을 `stale`로 바꾸고 manifest revision을 원자적으로 증가시킨다. stale selection은 다시 선택하기 전 다운로드 bundle·후속 규격 변환에 사용할 수 없다.

## 서버 검증 순서

서버는 순서를 생략하거나 client 값으로 대체하면 안 된다.

1. gateway가 보장한 session에서 `owner_user_id`를 파생한다. body/header의 owner·actor·tenant를 거부한다.
2. path parameter와 body를 schema-validate하고 canonical UUID, reference ID, normalized Workflow locator를 확인한다.
3. `(owner, project_key)` project record와 top-level Workflow binding을 확인한다. 다른 owner의 존재 여부는 노출하지 않는다.
4. 기존 prompt snapshot과 output metadata(필요 시 bounded dispatch journal
   receipt)를 확인해 `run_key`, `reference_id`, `job_id`, `node_id`, expected
   output branch가 같은 실행에서 나온 것인지 확인한다. 이 receipt는
   별도 Run record/store가 아니며 Queue/History를 대체하지 않는다.
5. 선택 시점에는 기존 completed History/output metadata에서 `(job_id, node_id, type, subfolder, filename)` 일치를 확인한다. failed/pending/running/unknown job의 output은 선택할 수 없다.
6. configured Comfy output root에서 `directory_type=output`, `subfolder`, `filename`으로 canonical path를 계산한다. 절대 경로, backslash, dot segment, NUL/control, encoded separator, symlink escape, root 밖 `realpath`를 거부한다.
7. output-root directory descriptor에서 각 subfolder component를
   no-follow/directory-only `openat` equivalent로 열고 마지막 basename도
   no-follow로 연다. Path를 검증한 뒤 다시 문자열 path로 여는 TOCTOU
   방식은 금지한다. regular file이고 link count가 정확히 1인 경우만
   허용하며 pre-read stat과 restrictive file mode를 기록한다. 해당
   primitive가 없는 platform은 동등한 race-safe containment API를
   제공하지 못하면 production을 차단한다.
8. byte stream에서 SHA-256과 byte size를 서버가 계산하고 MIME을 extension이 아니라 content sniffing으로 결정한다. media type별 MIME·size allowlist를 적용한다.
9. post-read stat을 다시 확인한다. inode/device/size/mtime가 읽는 동안 바뀌면 `OUTPUT_CHANGED_DURING_VALIDATION`으로 거부하고 쓰지 않는다.
10. request의 sha256/size/MIME가 있으면 server 결과와 constant-time/정확 비교한다. 불일치는 stale/conflict이며 client 값을 canonical 값으로 덮어써 성공시키지 않는다.
11. 현재 manifest를 process/file lock 아래 읽고 schema와 owner/project/workflow/run binding, `expected_manifest_revision`을 확인한다.
12. 새 manifest를 같은 디렉터리의 mode `0600` temporary file에 canonical JSON으로 쓴다. file `fsync` → atomic replace → parent directory `fsync` 순서를 지킨다.
13. 저장한 bytes를 다시 읽어 schema와 revision을 확인한 뒤에만 성공 응답을 반환한다.

## 오류 contract

| HTTP | code                                                                                        | manifest 변경                                            |
| ---: | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
|  400 | `INVALID_SELECTION_REQUEST`                                                                 | 없음                                                     |
|  401 | `AUTH_REQUIRED`                                                                             | 없음                                                     |
|  403 | `CSRF_REJECTED` 또는 `SELECTION_NOT_AUTHORIZED`                                             | 없음                                                     |
|  404 | `PROJECT_RUN_OR_OUTPUT_NOT_FOUND`                                                           | 없음; foreign 존재 여부 비노출                           |
|  409 | `MANIFEST_REVISION_CONFLICT`, `OUTPUT_LOCATOR_CONFLICT`, `OUTPUT_CHANGED_DURING_VALIDATION` | 없음                                                     |
|  410 | `OUTPUT_STALE` 또는 `OUTPUT_MISSING`                                                        | explicit revalidate route에서만 stale revision 기록 가능 |
|  413 | `OUTPUT_TOO_LARGE`                                                                          | 없음                                                     |
|  415 | `OUTPUT_MIME_NOT_ALLOWED`                                                                   | 없음                                                     |
|  422 | `JOB_NOT_COMPLETED` 또는 `OUTPUT_NOT_IN_JOB`                                                | 없음                                                     |
|  500 | `SELECTION_WRITE_FAILED`                                                                    | 성공으로 보고하지 않음; old manifest 보존                |

오류에는 safe code/message와 diagnostic ID만 포함한다. 실제 path, owner ID, provider body, credential, stack trace를 반환하지 않는다.

## History 삭제 후 의미

- History가 존재할 때만 기존 Assets가 output card/stack을 발견한다.
- History 삭제 후 output file과 `selection.json`은 디스크에 남을 수 있고 기존 선택의 server revalidation은 가능하다.
- 그러나 Omarketing은 filesystem을 스캔해 그 파일을 기존 Assets에 다시 삽입하지 않는다.
- 따라서 History 삭제 후 Assets에서 재발견되지 않는 현재 한계를 의도적으로 유지한다.
- History 삭제 뒤 새 선택을 만들 수 있는 별도 file picker나 permanent Asset index를 제공하지 않는다.

## 구현 Gate 검증표

| Case              | PASS                                                                            | FAIL                                             |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| 합성 ID           | request/manifest에 primitive locator가 분리되어 있고 synthetic ID가 없어도 동작 | 합성 ID를 split/parse하거나 단독 조회 key로 사용 |
| Path containment  | traversal·absolute·symlink escape가 모두 거부                                   | output root 밖 파일을 열 수 있음                 |
| Byte verification | 서버 hash/MIME/size가 fixture 및 실제 bytes와 일치                              | client metadata를 복사                           |
| TOCTOU            | read 중 변경을 감지하고 manifest 불변                                           | 변경된 파일을 선택 성공 처리                     |
| History status    | completed job의 실제 output만 선택 가능                                         | failed/unknown output 선택 가능                  |
| Revision          | stale expected revision은 409, old manifest 보존                                | lost update 또는 silent overwrite                |
| Atomicity         | fault injection 각 단계 후 old 또는 new valid JSON만 존재                       | partial/truncated JSON 존재                      |
| Stale             | checksum/size/MIME/path 변경이 stale로 기록되고 후속 처리 차단                  | stale output 다운로드/변환 허용                  |
| History deletion  | file/manifest는 남아도 기존 Assets에서 재발견되지 않음                          | 별도 scan/index가 Assets membership을 복구       |
| Redaction         | 오류/로그/UI에 credential·실제 path·provider body가 없음                        | 민감 정보 노출                                   |
