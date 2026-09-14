# External adapter job lifecycle contract

Status: Phase 0 contract; product implementation is out of scope.

## Revision record (2026-08-28)

This revision clarifies the distinction between the Omarketing and Odesign
ComfyUI instances and their execution-authority hierarchy. The lifecycle rules
themselves are unchanged.

## Revision record (2026-08-31)

W1 fixes the v1 recovery persistence boundary and the closed provider status
projection. This is contract evidence only; it is not implementation or
production evidence. The dispatch journal, receipts, reconciler lease,
quarantine metadata/bytes, and incident holds are backend-owned atomic files
under the configured server user-data root. They are not auth SQLite and are
not Run, Asset, or Workflow authorities.

## 1. Scope and invariants

This contract applies to asynchronous Hermes, automation, image, and video operations invoked by executable nodes in the backend `comfyui-omarketing` custom-node package. Provider-specific complexity stays behind an adapter.

The adapter MUST use the existing Comfy prompt execution, Queue/History, output, cache, progress, failure, and interrupt paths. It MUST NOT create a browser-to-provider WebSocket, a frontend event store, an Omarketing Run record, a second Queue/History, or a frontend run state machine. It MUST NOT change `src/scripts/api.ts` or `src/stores/executionStore.ts`.

A Comfy prompt is the execution authority. An external job is subordinate work for one backend node; its locator is not a replacement Comfy job id. Human selection or approval MUST happen between normal Comfy executions, never by pausing a running prompt in a custom frontend state machine.

In this contract, a Comfy prompt means execution of our node in the Omarketing
ComfyUI instance. An external service may have its own ComfyUI instance and
durable job ledger without violating this contract. External work identifiers
are recorded only for correlation and MUST NOT be promoted to Omarketing Run
authority. The concrete Odesign identifier hierarchy is defined in the
separate Odesign integration contract.

## 2. Common request

The backend derives identity and authority. It MUST reject or ignore client-supplied owner, tenant, actor, service-principal, workflow, or project authority fields.

Every provider submission uses this logical envelope:

```json
{
  "request_id": "uuid-v4 for this transport attempt",
  "adapter_id": "configured non-secret adapter name",
  "environment": "production",
  "owner_user_id": "server-derived opaque owner id",
  "project_key": "server-derived immutable project key",
  "workflow_locator": {
    "path": "workflows/<project>/<workflow>.json",
    "revision_digest": "sha256:<hex>"
  },
  "prompt_id": "existing Comfy prompt id",
  "node_id": "existing Comfy node execution id",
  "service_principal_id": "backend-config-derived principal alias",
  "correlation_id": "trace id shared by the prompt operation",
  "causation_id": "request/event id that directly caused this request",
  "idempotency_key": "opaque ASCII key",
  "sent_at": "UTC RFC 3339 timestamp",
  "deadline_at": "UTC RFC 3339 timestamp",
  "schema_version": "omarketing.external-job-envelope.v1",
  "operation": "adapter operation name",
  "operation_payload_schema": "versioned operation-payload identifier",
  "canonical_payload_digest": "sha256:<lowercase hex>"
}
```

Requirements:

- `request_id` identifies one network attempt and MUST change on a retry. `idempotency_key` identifies the logical side effect and MUST remain unchanged on every submit retry, lookup, poll, and cancel for that operation.
- `owner_user_id`, `project_key`, workflow locator, `prompt_id`, `node_id`, and service principal MUST be derived by the backend from the authenticated session, workflow path/prompt snapshot, executing node, and deployment config.
- `sent_at` and `deadline_at` MUST use the canonical UTC lexical form asserted
  by the executable schemas, and `deadline_at` MUST be strictly after
  `sent_at`, no later than the operation profile's limit, and within the hard
  two-hour ceiling in section 5.
- The operation payload is a separate server-side argument. It MUST be validated by the exact registered `operation_payload_schema`, canonicalized, and matched to `canonical_payload_digest` before this envelope is created and before any side effect. A generic object-valued `payload` is deliberately absent from the envelope schema so that an unregistered operation schema cannot silently accept unknown fields.
- Files in an operation payload MUST be represented by access-controlled input asset handles with server-verified checksum and expiry, never chat text containing binary data, an absolute URL, or a local filesystem path.
- Reusable credentials, cookies, authorization material, private addresses, absolute URLs, and provider response fields MUST NOT be present in this envelope. The adapter resolves credentials and the connection/account binding server-side from the deployment-owned service-principal profile.
- Every normalized document in this contract MUST validate before use against its exact Draft 2020-12 schema in `.hermes/phase0/schemas/external-job-*.v1.schema.json`. Unknown fields are rejected; coercion and version fallback are forbidden.

## 3. Idempotency semantics

This contract chooses deterministic re-derivation. The raw idempotency key is
not persisted, but a restart can reproduce it byte-for-byte from durable,
non-secret scope fields and the recorded key-secret version. A hash-only entry
without those fields is invalid and MUST NOT dispatch.

The required derivation scope, in this exact order, is:

```text
adapter_id + environment + service_principal_id + operation
+ operation_payload_schema + owner_user_id + project_key + prompt_id
+ node_id + canonical_payload_digest
```

Every scope value MUST already satisfy its schema and be encoded as UTF-8. The
derivation input is the ASCII domain separator
`omarketing-idempotency-v1\0`, followed by each field name and value encoded as
`<decimal UTF-8 byte length>:<bytes>` in the order above. The key is
`oj1.<key_secret_version>.<digest>`, where `digest` is the unpadded base64url
encoding of `HMAC-SHA-256(versioned_secret, derivation_input)`.
`key_secret_version` is a 1-32 character deployment-owned ASCII identifier.
The result MUST match the envelope schema, MUST be no more than 80 ASCII
characters, and MUST NOT contain credentials or raw user content.

Before the first possible network byte is sent, one durable atomic transaction
MUST:

1. select the currently active `key_secret_version`;
2. persist every derivation-scope field verbatim, the version, the derived
   `idempotency_key_hash`, workflow locator, original deadline, and phase
   `prepared`;
3. enforce a unique constraint over the derivation scope; and
4. durably commit and acknowledge the journal write.

The hash is an integrity/audit check only. Recovery MUST re-derive the original
key from the recorded scope and recorded secret version. The stored value is
exactly `sha256:<lowercase hex SHA-256 of the ASCII key>`. Recovery verifies it
in constant time and uses the re-derived key for lookup. It MUST NOT attempt to
invert the hash. A mismatch closes publication, emits
`IDEMPOTENCY_JOURNAL_INTEGRITY_FAILURE`, and forbids lookup, cancellation, or
submission from that entry. It also forbids locator status lookup because the
locator belongs to an integrity-failed record. The known-locator status-only
exception below applies solely to an otherwise well-formed entry whose
recorded secret version is unavailable.

A committed entry missing any derivation field, version, hash, deadline, or
phase emits `IDEMPOTENCY_JOURNAL_INVALID`, closes publication, and forbids
lookup or submission. The evaluator derives journal/provider/locator state from
the crash transition; a fixture label or caller-supplied “committed” boolean is
not authority. Every fail-closed branch after a committed journal requires
private quarantine even when execution-registry evidence had still identified
the original invocation as active.

Submission may begin only after that commit. Acceptance and the safe locator
MUST be committed atomically as phase `accepted`. A crash before the
`prepared` commit cannot have sent a provider request. A crash after that
commit, including during connect, after request-body transmission, after
provider commit, after response receipt, or before locator commit, is an
unknown outcome and MUST enter lookup-before-retry with the re-derived key.
Only an authoritative not-found lookup permits a same-key submission retry.
That permission applies only while the same node invocation still owns active
execution. Active invocation authority MUST be derived from matching
`prompt_id` and `node_id` execution evidence plus constant-time equality
between the execution registry's unforgeable invocation token and the
journal's SHA-256 token digest. A `mode`, `active`, or `recovery_mode` label is
never authority. Startup/orphan reconciliation never submits work for a dead
invocation, even after a not-found result.

New dispatches use the active secret version; existing journal entries always
use their recorded version. A versioned secret MUST remain available to the
reconciler until every entry using it has reached terminal reconciliation and
its provider/local dedupe retention has elapsed. Rotation therefore overlaps
the maximum of seven days and `deadline_at` plus the quarantine/reconciliation
window. Normal rotation MUST NOT rewrite an entry's version or key. If a secret
is unavailable because of emergency revocation or storage failure, recovery
MUST close publication, emit `IDEMPOTENCY_KEY_UNRECOVERABLE`, and use a known
locator only for authoritative status and quarantine. Because v1 cancellation
also requires the original key, it records
`cancel_requested_but_external_job_may_continue` rather than canceling with a
different key. It MUST NOT derive with another version or submit again.

That unavailable-secret exception is evaluated only after exact journal-format
validation: journal version, canonical scope and digest formats, key-version
token, fixed-length lowercase SHA-256 key hash, phase, deadline, and (for
`accepted`) the complete safe locator. Presence-only or malformed fields close
publication, require quarantine, and authorize no locator status request.

Consequences are normative:

1. Repeating the same key and canonical payload MUST return the original acceptance/result and the same external job, without creating another external side effect.
2. Reusing a key with a different canonical payload digest or operation MUST return `409 IDEMPOTENCY_CONFLICT`; the adapter MUST fail the Comfy node safely and MUST NOT submit either payload again.
3. A connection timeout or lost acceptance response is an unknown outcome. The adapter MUST query by idempotency key before retrying submission and MUST retry with the same key. It MUST NOT mint a new key to escape ambiguity.
4. A normal manual Comfy rerun has a new `prompt_id`, therefore a new key and a new external operation. Comfy cache may avoid executing the node at all; the adapter MUST NOT bypass that cache decision.
5. Provider and local dedupe records MUST be retained for at least seven days and for no less than the external job's absolute deadline plus the quarantine/reconciliation window, whichever is longer.
6. A provider without an atomic idempotent create-or-return operation and lookup-by-key capability MUST NOT be promoted to a production adapter.

`request_id`, correlation ids, timestamps, retry counters, and credential material are excluded from the canonical payload digest. All content-affecting inputs, input asset checksums, schema version, and operation are included.

## 4. External job locator and responses

### 4.1 Provider acceptance

A successful asynchronous acceptance is normalized internally as:

```json
{
  "schema_version": "omarketing.external-job-acceptance.v1",
  "accepted_at": "UTC RFC 3339 timestamp",
  "external_job_locator": {},
  "status": "accepted",
  "next_poll_after_seconds": 2
}
```

Before normalization, the adapter MUST validate that the provider-native
response is tied to the transport request and expected service account. The
normalized acceptance has one request identity source: the
`external_job_locator.request_id`; no duplicate outer request id is accepted.
`accepted_at` MUST be at or after the locator's `submitted_at`. A provider
response may contribute only a bounded opaque `job_id`; the adapter constructs
the locator and every request destination from its reviewed profile.
Provider-supplied `status_url`, callback URL, artifact URL, hostname, port,
path, query, or credential fields are not normalized and MUST be rejected if
they appear at this boundary.

### 4.1.1 Adapter-owned destinations

Each production adapter profile MUST own an immutable HTTPS base, exact
lowercase ASCII host (IDNA conversion happens during profile review, never at
request time), effective port, and fixed path template. The template may
substitute only one schema-valid opaque job or artifact identifier into one
declared path segment. It MUST NOT accept a complete URL, scheme-relative
value, userinfo, fragment, query override, encoded separator, dot segment, or
provider-controlled host/path suffix.

Automatic redirects are disabled for submit, lookup, status, cancel, and
artifact clients. Every `3xx`, including a same-origin redirect, is a provider
protocol error and no `Location` is followed. A future profile that cannot
operate without redirects requires a reviewed contract revision that validates
the exact scheme, lowercase ASCII host, effective port, and canonical path at
every hop, rejects userinfo/fragments, re-runs the DNS controls below before
every connect, caps hops, and never forwards credentials across an origin
change. No such exception exists in v1.

Before every socket connect or reconnect, including after connection-pool
eviction, the adapter MUST:

1. reconstruct and canonicalize the destination from the profile and opaque
   identifier, then match exact scheme, host, effective port, and path;
2. resolve and inspect the full DNS/CNAME chain, rejecting an unapproved CNAME
   target and every loopback, unspecified, private, link-local, carrier-grade
   NAT, multicast, documentation, benchmarking, reserved, or otherwise
   non-global IPv4/IPv6 result, including IPv4-mapped IPv6;
3. pin that connection to one validated answer while preserving exact TLS SNI
   and certificate hostname verification; and
4. repeat resolution and classification for the next connect so a
   public-to-private DNS rebind cannot reuse an earlier decision.

HTTP libraries MUST ignore `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`
and platform-equivalent proxy environment variables. An explicit outbound
proxy is allowed only as a reviewed deployment-profile destination and cannot
weaken target validation. Provider authorization is bound to the exact
configured origin. An origin mismatch, TLS mismatch, redirect, or proxy
override fails before forwarding any cookie, authorization header, client
certificate, signed query, or service-principal credential. Deployment egress
policy MUST independently restrict the adapter to the reviewed provider and
proxy destinations.

### 4.2 Safe external job locator

Node output, safe errors, and existing output metadata may contain only this locator:

```json
{
  "schema_version": "omarketing.external-job-locator.v1",
  "adapter_id": "configured non-secret adapter name",
  "environment": "production",
  "operation": "operation name",
  "job_id": "provider opaque job id",
  "request_id": "original accepted request id",
  "submitted_at": "UTC RFC 3339 timestamp"
}
```

The locator MUST be sufficient for the backend adapter to resolve status through configured routing. It MUST NOT contain `status_url`, hostnames, ports, query strings, access tokens, signed URLs, cookies, service-account ids, local paths, or a frontend-generated synthetic id. Unknown fields MUST be rejected at the contract boundary.

### 4.3 Normalized status response

Each poll is normalized as:

```json
{
  "schema_version": "omarketing.external-job-status.v1",
  "external_job_locator": {},
  "observed_at": "UTC RFC 3339 timestamp",
  "status": "accepted | running | succeeded | failed | canceled",
  "progress": { "value": 3, "max": 10, "unit": "items" },
  "item_outcomes": [
    {
      "item_id": "opaque item id",
      "status": "pending | running | succeeded | failed",
      "artifact_handle_ids": []
    }
  ],
  "artifact_handles": [],
  "warnings": [],
  "errors": [],
  "next_poll_after_seconds": 2
}
```

When progress is known, `max` MUST be a positive integer and `value` a
non-negative integer with `value <= max`; unavailable progress is `null`, never
`max: 0`. A provider percentage MUST be normalized to integer counts. Progress
MUST be monotonic for one provider attempt.

`item_id` values and top-level artifact `handle_id` values MUST each be unique.
The top-level `artifact_handles` array is the only handle table and is globally
capped at 64. Item outcomes contain only unique `artifact_handle_ids` that must
resolve to that table; nested handle objects are rejected. A `succeeded`
snapshot has no errors and every listed item is `succeeded`; a `failed`
snapshot has at least one registry-coded safe error. `observed_at` MUST be at
or after the locator's `submitted_at`. A regression, duplicate/conflicting item
set, dangling handle reference, aggregate-cap bypass, impossible terminal
content, or terminal response that changes content is a provider protocol
error and triggers authoritative reconciliation rather than a frontend
correction.

The normalized status, nested item outcomes, errors, progress values, and
artifact handles MUST pass their versioned schemas before they alter local
state. `next_poll_after_seconds` is `null` for a terminal status and an integer
from 1 through 15 otherwise. The deterministic contract evaluator additionally
enforces `value <= max`, monotonic progress, immutable item identity, and
terminal precedence because those are cross-document invariants.

Artifact handles are provisional until section 9 validation completes. A
`succeeded` status without all required artifacts is not publishable success.

## 5. Bounded network and poll deadlines

Every network operation MUST have explicit connect, read/inactivity, and overall deadlines; library defaults and unbounded waits are prohibited.

| Operation                          | Connect timeout | Read/inactivity timeout |                       Overall bound |
| ---------------------------------- | --------------: | ----------------------: | ----------------------------------: |
| Submit or idempotency lookup       |             5 s |                    30 s |                    35 s per attempt |
| Status poll                        |             5 s |                    15 s |                       20 s per poll |
| Cancel request/status confirmation |             3 s |                     7 s |                    10 s per attempt |
| Artifact stream                    |             5 s |     30 s between chunks | 10 min and never past `deadline_at` |

- Poll delay MUST honor a valid provider hint but clamp it to 1–15 seconds. Missing/invalid hints use 2 seconds. Jitter is allowed only within the clamped bound.
- The default whole-node external wait budget is 30 minutes. An operation profile MAY choose a shorter or longer budget, but MUST be explicit and MUST NOT exceed two hours without revising this contract.
- Retryable connect failures, `408`, `429`, and `5xx` responses use the same idempotency key, exponential backoff capped at 15 seconds, provider `Retry-After` clamped to the remaining deadline, and at most three consecutive attempts for one submit/lookup/poll action. Other `4xx` responses are not retried unless the provider contract explicitly classifies them.
- Exhausting a per-call or whole-node deadline produces category `TIMEOUT`. The adapter MUST stop publishing, attempt cancel as section 8 permits, and fail through existing Comfy execution semantics.
- A deadline MUST include parsing, checksum read-back, and required artifact validation; a provider status received just before the deadline does not create an unbounded validation extension.

## 6. Existing Comfy state and event mapping

The adapter's internal statuses MUST NOT be surfaced as new frontend job states.

| External/node condition                                                                                                          | Existing Comfy meaning                                                                                                 | Required behavior                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt accepted but not executing                                                                                                | `pending`                                                                                                              | Core Queue owns it. The adapter MUST NOT submit external work yet.                                                                                                  |
| Existing infrastructure reports machine startup                                                                                  | `initialization` where already supported                                                                               | The adapter MUST NOT synthesize this frontend state for provider acceptance.                                                                                        |
| `execution_start`; node connecting/submitting; external `accepted`/`running`; cancel requested but unconfirmed                   | `running`                                                                                                              | Remain inside the current node and emit only existing progress mechanisms.                                                                                          |
| Odesign `awaiting_approval`                                                                                                      | `failed`                                                                                                               | Close publication and terminate the current normal prompt through the fixed safe code `APPROVAL_REQUIRED_IN_ODDESIGN`; never keep the node open for human approval. |
| External `succeeded`, every required artifact validated, node returns output, then core emits `execution_success`                | `completed`                                                                                                            | Completion is owned by Comfy core, not an adapter event.                                                                                                            |
| External `failed`, protocol conflict, timeout, unrecoverable orphan, artifact validation failure, or spontaneous provider cancel | `failed`                                                                                                               | Raise a redacted node error; core emits `execution_error`.                                                                                                          |
| Existing Comfy Queue cancel/Interrupt is observed                                                                                | Existing interruption behavior; `executionStore` records the workflow outcome as `failed` with `execution_interrupted` | Core emits `execution_interrupted`; do not add a durable `canceled` frontend state.                                                                                 |

A five-branch candidate node completes only when every required branch succeeds. One branch failure fails the current Comfy job; already written successful files are not deleted, the next Queue job continues according to core behavior, and a later Run relies on existing Comfy cache. The adapter MUST NOT add automatic whole-job retry, rollback, or a retry-failed-items frontend action.

An external service MAY have more lifecycle stages than this mapping. If those
stages are shown to a user, they are informational external labels only; they
MUST NOT become new Omarketing frontend job states or change the terminal
meaning of `completed` and `failed`, or the Queue and History meanings owned by
Comfy core.

The backend custom node MAY report:

- existing `progress` data: `{value: integer, max: integer, prompt_id: existing Comfy id, node: existing node id}`;
- existing `progress_state` data keyed by node id, with each value containing `{value, max, state: pending|running|finished|error, node_id, prompt_id}` and optional existing display/parent/real node ids;
- existing `progress_text`: `{nodeId, text, prompt_id}` containing only bounded safe text.

The adapter MUST NOT emit `execution_start`, `execution_success`, `execution_error`, or `execution_interrupted` directly; the Comfy execution engine owns those events. Provider events MUST NOT be forwarded to the browser as custom WebSocket event types.

### 6.1 Closed provider informational status receipt

The backend MUST retain a provider informational status receipt for each
Odesign operation, and the receipt is a closed, versioned document rather than
a second frontend run state. Its exact shape is:

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

Unknown fields, labels, operations, projections, and guidance codes are
rejected. `guidance_code` is null except for `APPROVE_IN_ODDESIGN` on
`awaiting_approval`. The normative mapping is closed and exact:

| Odesign provider label | Normalized projection | Receipt rule                                                                                                                                                               |
| ---------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accepted`             | `accepted`            | Publication remains open; `guidance_code` is null.                                                                                                                         |
| `awaiting_approval`    | `failed`              | Publication is closed, `guidance_code` MUST be `APPROVE_IN_ODDESIGN`, and the current Comfy prompt terminates through the fixed safe code `APPROVAL_REQUIRED_IN_ODDESIGN`. |
| `running`              | `running`             | Publication remains open; `guidance_code` is null.                                                                                                                         |
| `outcome_unknown`      | `running`             | `publication` MUST be `closed`, `lookup_before_retry` MUST be `true`, and no resubmission is permitted.                                                                    |
| `succeeded`            | `succeeded`           | Projection is permitted only after a fresh authenticated poll and artifact checksum read-back; otherwise publication remains closed.                                       |
| `failed`               | `failed`              | Publication is closed and the existing Comfy failure path remains authoritative.                                                                                           |

The generic normalized lifecycle enum and the Comfy terminal meanings remain
unchanged. In particular, `awaiting_approval` and `outcome_unknown` never become generic
lifecycle enum members or new Omarketing frontend states. Awaiting approval is
a trial limitation: Omarketing displays the informational label and next action,
then closes the current prompt; approval never keeps a Comfy node open.
Odesign may complete its own run after approval, but v1 never resumes the old
prompt or attaches that late result to a new prompt. A later Omarketing run is
a new normal prompt and MUST read back the prior Odesign run authoritatively
before any resubmission; late results remain private receipts/quarantine.
For Odesign v1, HMAC push and its callback listener are unreachable: no route,
listener, setting, or toggle may enable them. A separately versioned contract,
exact write-set review, and explicit scope approval are required before any
future change; polling remains authoritative.

## 7. Optional provider push events

Push delivery is disabled by default for every provider and environment.
Polling is always implemented and remains the required convergence path. A
callback listener MUST NOT be bound, routed, advertised, or made reachable
until a provider-specific push profile and its hostile fixtures have passed a
separate security review.

The approved profile MUST bind one adapter, environment, service-principal
account, ingress path, and source ACL. It MUST define:

- either an exact mTLS trust profile and provider certificate identity, or an
  exact raw-request-byte MAC/signature algorithm and provider key id; a profile
  MAY require both;
- for raw-byte signatures, the signed method, canonical path, timestamp, nonce,
  and exact received body bytes, with no parse, Unicode normalization,
  decompression, reserialization, or newline conversion before verification;
- a maximum accepted clock skew no greater than 300 seconds and a persisted
  nonce/replay lifetime at least twice that skew;
- two separate atomic uniqueness keys: nonce replay scope
  `(adapter_id, environment, service_principal_id, nonce)` and event retry
  scope `(adapter_id, environment, service_principal_id, job_id, dedupe_key)`;
  combining nonce and dedupe into one key is forbidden because a retry may use
  a fresh nonce;
- a pre-parse body cap no greater than 262144 bytes, exact accepted
  `Content-Type`, `Content-Encoding: identity`, per-source and per-account rate
  limits, burst limits, and an ingress network ACL;
- a versioned key/certificate rotation schedule, activation and retirement
  times, bounded old/new overlap, emergency revocation behavior, and an atomic
  replay store shared by every ingress replica.

The ingress MUST apply ACL, connection/body byte cap, rate limit,
timestamp/skew, nonce syntax, and mTLS/signature checks before JSON parsing.
For a raw signature, the exact reviewed algorithm binds the received method,
canonical ingress path, timestamp, nonce, and exact raw body bytes under an
explicit domain separator and unambiguous length-prefix encoding. A digest of
the body plus an independent “signature valid” flag is not evidence.

The v1 HMAC profile uses HMAC-SHA-256 and this byte-exact input:

```text
ASCII("omarketing-callback-v1") || 0x00 ||
LP("method")    || LP(received method) ||
LP("path")      || LP(canonical received path) ||
LP("timestamp") || LP(received timestamp) ||
LP("nonce")     || LP(received nonce) ||
LP("body")      || LP(exact received body bytes)
```

For text fields, `LP(X)` is ASCII decimal UTF-8 byte length, one ASCII colon,
then the UTF-8 bytes; for body it counts and appends the raw bytes without
decoding or reserialization. The key-id and algorithm headers are exact
allowlisted tokens, the signature is lowercase 64-hex, and comparison is
constant-time. Any method, path, timestamp, nonce, body-byte, key-id, or
algorithm mutation fails before JSON parsing. The profile declares its
immutable authentication mode. The v1 fixtures use separate `raw_signature`
and `mtls` profiles; request data cannot select or switch the mode, and a
provider cannot silently switch between profiles.
mTLS acceptance derives from the pinned trust-bundle digest
and exact allowlisted certificate/SPIFFE identity plus a SHA-256 digest derived
from the authenticated peer certificate's SPKI bytes. Executable evidence
verifies an issuer/trust-anchor signature over that identity, trust-bundle
digest, and leaf SPKI, then verifies a leaf-private-key proof over method, path,
timestamp, nonce, and exact received body bytes. Independent identity/SPKI labels, a standalone
`mtls_identity_verified` boolean, or a caller-supplied trust digest are not
authority. A future explicit `both` profile must verify both mechanisms rather
than choosing either branch.
After authenticated parsing and schema validation, it atomically checks and
consumes the separate nonce key, checks and consumes the event-dedupe key, and
advances the sequence cursor only for the next contiguous sequence. A repeated
nonce mutates nothing. A duplicate event with a new nonce consumes only that
nonce and does not advance the cursor. A reordered event does not advance the
cursor; a sequence gap triggers one bounded polling reconciliation and remains
uncommitted until contiguous evidence arrives. Unknown keys, algorithms,
content encodings, fields, and schema versions fail closed. A retired or
revoked key is never accepted merely because an event timestamp falls in an old
overlap.

After authentication, the provider document is normalized to:

```json
{
  "schema_version": "omarketing.external-job-event.v1",
  "event_id": "provider unique id",
  "dedupe_key": "stable retry key",
  "sequence": 17,
  "external_job_locator": {},
  "status": "accepted | running | succeeded | failed | canceled",
  "progress": { "value": 3, "max": 10, "unit": "items" },
  "emitted_at": "UTC RFC 3339 timestamp"
}
```

Delivery MUST be treated as at-least-once. The backend MUST tolerate duplicate
delivery and reordering, retrieve missed events when supported, and preserve
the separate replay/dedupe/cursor transitions above. Duplicate or stale
delivery does not mutate the cursor and is not allowed to trigger unbounded
poll work.

Push events are advisory: every terminal event MUST be confirmed by a fresh
authenticated status lookup through section 4.1.1 and artifact checksum
read-back before local commitment. Event authentication never authenticates
artifact bytes or provider status. If replay is unavailable, a sequence gap is
unrecoverable, or push is disabled, idempotent polling remains authoritative.

Provider push never enters the public Omarketing/Comfy origin, browser
WebSocket, or `omarketing-auth-gateway`. It terminates at a separately reviewed
adapter-service ingress satisfying the profile above and its own network
policy. The bridge receives only normalized authenticated events over the
private service boundary. A provider that requires an unreviewed public
Comfy/custom-node callback route uses polling instead.

## 8. Cooperative interrupt and external cancellation

The node MUST check the existing Comfy interruption signal:

1. before dispatch-journal creation and before external submission;
2. immediately after every network response or exception;
3. before every poll and before each retry;
4. during poll/backoff waits in interruptible segments no longer than one second;
5. before artifact download, at least once per second or per streamed chunk while downloading, and before validation/publish;
6. immediately before returning node outputs.

Cancel request:

```json
{
  "schema_version": "omarketing.external-job-cancel-request.v1",
  "request_id": "new transport request id",
  "external_job_locator": {},
  "idempotency_key": "original logical key",
  "reason": "comfy_interrupt",
  "requested_at": "UTC RFC 3339 timestamp"
}
```

Normalized cancel response:

```json
{
  "schema_version": "omarketing.external-job-cancel-response.v1",
  "request_id": "echoed transport request id",
  "external_job_locator": {},
  "status": "cancel_requested | canceled | already_terminal",
  "observed_external_status": "accepted | running | succeeded | failed | canceled",
  "observed_at": "UTC RFC 3339 timestamp"
}
```

Cancellation is best effort from the node's perspective and MUST NOT block beyond the cancel bounds in section 5. The endpoint itself MUST be idempotent: repeated cancel calls return the current outcome and create no new job. If cancellation is unconfirmed, unavailable, or races with provider work, the adapter MUST record the safe warning code `cancel_requested_but_external_job_may_continue`, continue reconciliation in the backend, and let existing Comfy interruption finish. It MUST NOT report success or attach subsequent artifacts to the interrupted prompt.

The response request id and locator MUST match the request. A
`cancel_requested` response can observe only `accepted` or `running`;
`canceled` observes `canceled`; and `already_terminal` observes only
`succeeded`, `failed`, or `canceled`. Schema or correlation failure is a
provider protocol error, never cancel confirmation.

A provider without a cancel endpoint or without idempotent cancellation MUST NOT be promoted to production. “Best effort” permits network/provider failure after a valid cancel call; it does not permit omitting the capability.

## 9. Artifact validation and late-artifact quarantine

The only normalized artifact reference is:

```json
{
  "schema_version": "omarketing.external-job-artifact-handle.v1",
  "handle_id": "versioned opaque backend-only identifier",
  "expires_at": "UTC RFC 3339 timestamp"
}
```

The object and `handle_id` MUST contain no URL, hostname, port, path, query,
provider credential, storage credential, owner/project id, or signed material.
They are backend-only and MUST NOT enter node output, History, browser events,
analytics, or logs. The access-controlled resolver record, keyed by
`handle_id`, binds the adapter, environment, service-principal account, owner,
project, provider job and artifact ids, expected media kind, size, checksum,
MIME allowlist, expiry, and operation profile. A provider artifact id or URL is
never itself a handle.
Handle lookup is exact, owner/project/job-bound, single-purpose, and
fail-closed; a refreshed handle creates a new opaque id and resolver record.

Before the first artifact socket and every reconnect, the resolver MUST validate
the handle, expiry, ownership/project/job association, and then construct the
destination solely from its adapter-owned artifact base and opaque
profile-constrained artifact id. All section 4.1.1 scheme/host/port/path,
DNS/CNAME/IP, TLS, proxy, egress, and credential-forwarding controls apply
before connect. Redirects are disabled; every `3xx`, including same-origin, is
an artifact protocol error and is not followed.

Every production operation profile MUST set positive
`compressed_byte_limit`, `uncompressed_byte_limit`, and
`decompression_ratio_limit` values. Neither byte limit may exceed 2147483648
bytes and the ratio limit may not exceed 100. A lower media/provider limit
wins. `Content-Length` and provider size metadata are preflight hints only:
values over a limit reject before body read, while missing or smaller values do
not relax streaming counters.

The adapter MUST stream into a private unpublished temporary destination with
bounded buffers. It increments a 64-bit compressed counter before accepting
each network chunk and a separate uncompressed counter before writing each
decoder output chunk. It aborts and closes the stream before the next write
would exceed either byte cap or the expansion-ratio cap; it MUST NOT buffer the
whole body or decompressed body in memory. Unsupported or nested content
encoding, truncation, timeout, counter overflow, and decompressor error fail
closed. Partial bytes are deleted or moved to private quarantine according to
the already-closed publication state.

For `identity`, each accepted wire byte is exactly one uncompressed byte; a
different compressed/uncompressed count is impossible. For `gzip`, output
bytes and counters come only from the bounded decoder, never from provider
metadata or a fixture-supplied byte count. The hostile corpus carries concrete
wire bytes and exercises successful identity, bounded gzip, invalid gzip, and
ratio/byte-limit failure through that single byte path.

Completing the bounded stream sets only a private `stream_accepted` fact. It
does not set `artifact_validated` or publication authority. The server derives
uncompressed size and SHA-256 from the streamed bytes, then independently
requires completeness, decoder success, byte-derived MIME allowlisting,
expected size/checksum equality, authenticated provider checksum read-back,
owner/project/job binding, unexpired resolver state, and an open publication
gate. Any missing or mismatched fact blocks publication.

Checksum read-back is a separate authenticated status request through the
reviewed canonical client profile and is bound to the same service principal,
job locator, and artifact handle. A field merely named “authenticated” is not
evidence. Likewise, publication authority comes only from the current
lifecycle state machine; an artifact response, fixture, or adapter result
cannot supply a `publication_gate_open` boolean.

Before publication, every required artifact MUST then be checked server-side
for expected media kind, allowlisted MIME determined from uncompressed bytes,
server-recomputed size and checksum, completeness, ownership/project context,
and binding to the same owner, immutable `project_key`, prompt/node invocation,
and external job locator recorded in the journal. The provider's authenticated
status or checksum read-back is compared with, but never substitutes for, the
server-recomputed values. Signed URL query strings MUST never be copied into
output metadata.

The fresh poll-confirmed `succeeded` projection supplies the exact required
artifact-handle set. Publication requires that every and only those handles
resolve and validate; another valid handle from the same job, a stale handle,
an omitted handle, or an extra handle cannot satisfy the terminal projection.
The lifecycle state carries the canonical terminal digest and required handle
set through output commit.

The publication gate is permanently closed for the current prompt after interrupt, local timeout, unrecoverable orphan classification, execution error, or any committed terminal. An artifact arriving after that point, before cancel confirmation, after a conflicting terminal, or after its handle expired MUST:

- be placed in a private quarantine namespace outside Comfy outputs and the History-backed Assets index;
- be recorded only by locator, server-recomputed checksum/MIME/size, arrival time, and a safe quarantine reason;
- never be automatically linked to the old or a new prompt, selection manifest, workflow, or frontend synthetic id;
- never be selectable/downloadable through the normal Assets presentation hook;
- be deleted after seven days unless an operator security/incident hold applies.

Closing the gate is an atomic state transition over both future arrivals and
bytes already in private staging: every unpublished staged artifact is moved
to private quarantine or deleted in the same transition. Reversing event order
(`artifact arrived` before interrupt/deadline/failure) cannot strand bytes in
staging or reopen them for publication.

Reconciliation MAY use a refreshed opaque handle to validate the quarantined
bytes, but it MUST re-run every resolver and destination check and MUST NOT
reopen publication. A user must start a normal new Comfy execution to produce
selectable output.

## 10. Restart and orphan reconciliation

The dispatch journal is adapter recovery metadata, not an Omarketing Run store. It contains only:

```text
journal_format_version, adapter_id, environment, service_principal_id, operation,
operation_payload_schema, owner_user_id, project_key, prompt_id, node_id,
canonical_payload_digest, key_secret_version, idempotency_key_hash,
workflow locator, invocation_token_hash?, safe external job locator?, phase, deadline_at,
cancel_requested_at?, last_observed_status, last_poll_at,
terminal_committed_at?, publication_closed_at?, quarantine reason?
```

These are the exact deterministic re-derivation fields from section 3; omission,
normalization after commit, or substitution of the active secret version makes
the entry non-dispatchable. The versioned HMAC secret remains in the deployment
secret manager and MUST NOT be copied into the journal.

When an external service assigns a durable work identifier, the journal MUST
retain it only as the safe external job locator recovery metadata listed above.
That identifier is not an Omarketing Run identifier, and the journal MUST NOT
gain fields beyond the section 10 allowlist.

The workflow locator is the closed `{prompt_id, node_id}` pair. The optional
accepted locator is the exact closed v1 locator, including schema version,
adapter, environment, operation, job id, original request id, and submission
timestamp. A presence-only partial locator never authorizes status lookup.

The journal MUST be written atomically, encrypted or access-controlled as
server data, excluded from frontend APIs, and retained for seven days after
terminal reconciliation and for at least the corresponding key/dedupe
retention, whichever is longer. Raw idempotency keys, derivation secrets,
credentials, provider response bodies, signed URLs, and artifact bytes MUST NOT
be stored in it.

### 10.1 Backend-owned atomic-file authority

For v1, the journal and recovery records use one configured path beneath
`<COMFY_USER_DIRECTORY>/omarketing/v1/external-lifecycle/`, owned by the
backend service account. The normative layout is:

```text
<COMFY_USER_DIRECTORY>/omarketing/v1/external-lifecycle/
├── journals/<scope_id>/dispatch-journal.json
├── locks/<scope_id>.lock
├── leases/reconciler.lease
├── receipts/<scope_id>.json
└── quarantine/
    ├── records/<scope_id>/<artifact_id>.metadata.json
    ├── bytes/<scope_id>/<artifact_id>.bytes
    └── incident-holds/<scope_id>.json
```

`scope_id` is the lowercase hexadecimal SHA-256 of the canonical derivation
input from section 3 (including its domain separator, field names, lengths,
and values); it is not a caller-provided identifier. Every path component is
backend-generated from schema-valid ASCII tokens, and containment is checked
against the configured root before opening. Journal, lock, lease, receipt,
quarantine record/bytes, and incident-hold paths are distinct and each is
contained beneath this root. This tree is the sole v1
dispatch-journal, receipt, reconciler-lease, quarantine, and incident-hold
authority. It is not auth SQLite and is not a Run, Asset, or Workflow
authority. The bridge and adapter MUST have no auth-database path or driver
access.

Before the first possible network byte, the backend MUST exclusively create
the record directory and `dispatch-journal.json` with the complete
deterministic scope, canonical request/payload digest
(`canonical_payload_digest`), idempotency key version/hash, safe locator slot,
deadline, and `prepared` phase. Existing scope identity is
opened only after an exact digest match; a mismatch is an idempotency conflict
and cannot replace the record. Every record mutation is serialized by the
per-record OS lock. The reconciler obtains one OS-held exclusive
`reconciler.lease`; a second process MUST exit without scanning or mutating
records.

All JSON mutations and receipt/quarantine metadata writes use a same-directory
temporary file, write-through `fsync`, atomic replace, parent-directory
`fsync`, and read-back validation against the exact versioned schema before
acknowledgement. A crash leaves either the prior valid record or the new valid
record; a malformed/partial file is quarantined and publication is closed.
Startup recovery scans records under the lease, performs lookup-before-retry
for every committed nonterminal phase, and never sends a second request merely
because a process restarted. Known locators are polled first; only an
authoritative not-found result can permit the same-key retry while the
original invocation remains active.

Cleanup MUST retain terminal journal/receipt records and quarantined metadata
and bytes for at least seven days and for the longer deadline/reconciliation
window required by section 3. It MUST NOT delete a path with a valid
`incident-hold.json`; an operator removes the hold only through the reviewed
incident process, after which the same retention rule applies. Auth SQLite
backup/restore or epoch changes MUST NOT roll these files back, forward, or
delete them.

If an external run may already exist, reconciliation MUST NOT automatically
create a new run. It MUST first recover status and artifacts using the existing
identifier, following the lookup-before-retry and same-key rules in section 3
and the bounded poll/deadline rules in section 5.

At custom-node/backend startup, a single-owner reconciler MUST scan nonterminal entries and:

1. re-derive and hash-verify the byte-identical original idempotency key using
   the entry's recorded secret version, then look up a missing locator by that
   key; never use the current secret version or blindly resubmit with a new key;
   an authoritative not-found result closes the orphan without submission;
2. fetch authoritative external status for known locators within the original `deadline_at`;
3. compare the original `prompt_id` with existing Comfy queue/execution/history evidence without creating or rewriting a Comfy job;
4. if the original Comfy execution is no longer actively executing the node, classify the external work as orphaned, request cancel, quarantine any result, and close publication permanently;
5. if no authoritative status can be obtained before the deadline, record safe `ORPHAN_RECONCILIATION_TIMEOUT`, request cancel when possible, and quarantine later results;
6. never mark an old Comfy prompt completed, inject output into History, resume a graph mid-node, or attach the job to a later prompt.

Only the active node invocation may publish into its current Comfy execution. Recovery after process death converges external side effects and quarantine; it does not invent execution recovery that Comfy core does not provide.

Any result arriving after the original Omarketing execution has ended MUST
follow the section 9 late-artifact quarantine rules and MUST NOT be
automatically attached to a new prompt.

## 11. Terminal precedence and race resolution

The following precedence is mandatory:

1. **Local publication authority wins.** Once existing Comfy interruption/cancel, local deadline, process-loss orphan determination, or execution termination closes publication, no external success can reopen it. A later artifact is quarantined.
2. **Authoritative status lookup wins over events and cached polls.** Push
   events, progress, acceptance responses, and terminal status reported by a
   cancel response are nonterminal observations until the exact terminal
   projection is confirmed by a fresh authenticated status lookup. A prior
   running poll is not reusable terminal evidence.
3. **First confirmed provider terminal is immutable.** Repeats of the same terminal are idempotent. A later different provider terminal is `EXTERNAL_TERMINAL_CONFLICT`; before Comfy termination it fails the node, and after termination it is audit/quarantine information only.
4. **Success is provisional until validation.** Fresh-poll-confirmed
   `succeeded` becomes publishable only after all required artifacts pass
   section 9. Validation failure commits local failure and cannot be reversed
   by another success event.
5. **Cancel intent is not a terminal.** `cancel_requested` remains running internally until `canceled`, another authoritative provider terminal, or a local deadline/interruption closes the Comfy execution. Regardless of the provider race, an already interrupted prompt never publishes.
6. **Existing Comfy terminal is final for UI/History.** Adapter reconciliation MUST NOT overwrite `completed`/`failed` History semantics or synthesize a new terminal state.

These rules apply even when events are duplicated, missing, reversed, or received after reconnect.

Terminal immutability compares a server-derived canonical digest of the full
normalized terminal projection: schema version, locator, status, progress,
item outcomes, artifact handles, warning codes, and errors. Object keys are
canonically sorted and array order is preserved. Transport observation time
and the now-null next-poll hint are excluded. A caller-supplied fingerprint or
fixture label is never terminal-integrity evidence.

Across authenticated polls, `observed_at` MUST NOT move backward and the
canonical item-id sequence established by the first poll is immutable:
addition, removal, replacement, or reordering is a provider protocol error.

Classification order is mandatory and not merely advisory. An authenticated
status whose artifact handles are not bound to this job is rejected first,
because an unbound document is not trusted enough to classify a terminal at
all. A terminal status that disagrees with the already confirmed provider
terminal is then classified as `EXTERNAL_TERMINAL_CONFLICT`, and that
classification outranks the lower-priority cross-poll protocol checks
(progress monotonicity, `observed_at` ordering, item-identity drift). A
conflicting terminal document commonly violates those checks as well, and
without this precedence the conflict would be masked as a generic provider
protocol error. Publication is closed in every one of these branches, so the
ordering changes only the emitted classification, never the fail-closed
outcome. A repeat of the _same_ confirmed terminal whose canonical digest
changed is content mutation, not disagreement, and remains a provider protocol
error.

## 12. Safe error and warning contract

Every adapter error exposed through node output metadata or existing Comfy error handling has:

```json
{
  "schema_version": "omarketing.external-job-error.v1",
  "code": "stable allowlisted code",
  "node_id": "existing node id",
  "item_id": null,
  "prompt_id": "existing Comfy prompt id",
  "external_job_locator": null,
  "diagnostic_id": "opaque server log correlation id"
}
```

`item_id` and `external_job_locator` may be `null` when unavailable. The
serialized boundary has no provider-derived or caller-selected message,
category, retryability, or remediation field. A versioned server-owned registry
keyed only by the schema's closed `code` enum deterministically supplies the
category, retryability policy, fixed localized message key, and fixed
remediation actions. Consumers MUST derive all four from that registry and
MUST NOT accept an override from a provider body, operation payload, fixture,
or transport response. In particular, retryability never bypasses the
idempotency lookup-before-retry state machine.

The registry entry for `APPROVAL_REQUIRED_IN_ODDESIGN` is fixed as
non-retryable, category `POLICY`, localized message key
`omarketing.external.approval_required_in_odesign`, and remediation key
`complete_approval_in_odesign_then_start_a_new_prompt`. Its rendered guidance
is the fixed Korean sentence “Odesign에서 승인을 완료해야 작업이 계속됩니다.”
No URL, provider prose, or retryable/category/remediation override is accepted.
The `awaiting_approval` receipt MUST carry a schema-valid
`external-job-error.v1` document using this code; a loose receipt-only code is
invalid.

The fixed message selected by `code` is the only text rendered in the frontend
or placed in `exception_message`/`progress_text`; dynamic provider text and
interpolation are forbidden. Normalized warnings likewise carry only an
allowlisted warning `code`; display text is registry-owned.

Before logging or serialization, the adapter MUST structurally redact cookies,
authorization headers, API keys, bearer/basic tokens, signed URL query strings,
credentials, private/internal URLs and ports, local paths, request/response
bodies, workflow content, and provider stack traces. Raw provider error bodies
MUST NOT be logged “as is,” copied into rendered messages, node outputs,
History metadata, analytics, or traceback fields. Server logs use
`diagnostic_id`, stable code, registry-derived category, safe locator, HTTP
status class, and redacted timing only.

An unknown exception maps to `UNKNOWN`; its registry entry is non-retryable and
uses a fixed safe message key. Redaction failure MUST replace the entire
suspect log field. Errors MUST NOT expose whether another owner/project/job
exists.

## 13. Verification checklist

- [ ] Repeating a submission after a lost response uses the same idempotency key and produces exactly one provider job; key/payload mismatch returns `409` without a side effect.
- [ ] Every crash boundary from pre-journal through locator commit re-derives the byte-identical key; normal key rotation retains the recorded version, while a missing version closes publication without a retry.
- [ ] A new Comfy prompt gets a new key, while a Comfy cache hit performs no external request.
- [ ] Every connect/read/overall deadline, poll clamp, retry cap, `Retry-After` clamp, and two-hour hard ceiling is exercised with a controllable provider fixture.
- [ ] Provider URL fields, redirects, noncanonical paths/ports, hostile CNAME/DNS answers, private and IPv4-mapped addresses, proxy environment overrides, and TLS/origin changes are rejected before credentials or a socket side effect.
- [ ] `pending`, existing `initialization`, `running`, `completed`, `failed`, and interruption map exactly to current Queue/History and `executionStore` behavior; no new frontend state/event store appears.
- [ ] Only existing `progress`, `progress_state`, and safe `progress_text` reach the browser; core alone emits execution terminal events.
- [ ] Interrupt is detected at every required checkpoint, cancel is idempotent and bounded, and unconfirmed cancel records `cancel_requested_but_external_job_may_continue` without publishing.
- [ ] Success racing interrupt, timeout, restart, conflicting terminal events, and late artifacts always closes publication and quarantines bytes outside Assets.
- [ ] Restart lookup uses the original key/locator, never duplicates a side effect, never rewrites Comfy History, and closes unrecoverable orphans.
- [ ] The backend-owned atomic-file tree proves exclusive pre-network journal creation, per-record locking, one OS-held reconciler lease, temp-file `fsync`/atomic replace/parent `fsync`/read-back, crash recovery, seven-day cleanup, and incident-hold preservation; auth SQLite restore cannot roll it back.
- [ ] The closed Odesign status receipt maps all six provider labels to the unchanged generic lifecycle and Comfy terminal semantics, including fixed `awaiting_approval` guidance and closed `outcome_unknown` lookup-before-retry.
- [ ] `external-job-lifecycle.cases.json` `odesign_status_receipt_cases` covers StaticAd and Shorts for both special labels as contract-only evidence, without treating those labels as generic lifecycle states.
- [ ] Duplicate/out-of-order/missing push events converge through status polling and checksum read-back.
- [ ] Push is unreachable by default; replay, stale timestamp, body encoding mutation, oversize, unknown fields, ACL/rate-limit failure, and retired keys fail before cursor mutation.
- [ ] Artifact expiry/refresh, access denied, destination redirect/rebind, wrong MIME, compressed or uncompressed oversize, decompression bomb, truncation, checksum mismatch, and wrong job association all block publication.
- [ ] All strict Draft 2020-12 schemas compile; every positive fixture passes, every hostile schema fixture fails, and case ids are globally unique.
- [ ] Error fixtures for every category prove that browser output, History, logs, analytics, HTTP captures, and WebSocket captures contain no credential, signed URL, private URL, provider body, or stack trace.
- [ ] Partial branch failure fails only the current Comfy job, preserves already written files, allows the next Queue job, and uses existing cache on a normal rerun.

## 14. Unresolved implementation dependencies

These dependencies block production approval but do not authorize a different lifecycle:

1. Pin the target Comfy backend revision and prove the custom-node interruption API, progress emission API, History terminal behavior, and startup hook used by the reconciler.
2. For each Hermes/automation/media provider, obtain fixtures proving atomic idempotent submit/lookup, idempotent cancel, authoritative status, terminal immutability, artifact refresh, checksum read-back, and the stated deadline envelope. A provider missing idempotency or cancel remains non-production.
3. Implement and verify the resolved backend-owned atomic-file journal, receipt,
   single-reconciler lease, private quarantine, cleanup, and operator
   incident-hold process from section 10.1; this amendment resolves the v1
   storage choice but does not claim implementation or production readiness.
4. Define each provider's versioned operation payload schema, per-operation deadline profile, lower compressed/uncompressed/ratio limits, media MIME allowlist, canonical endpoint/path templates, DNS/CNAME/egress allowlist, and TLS policy.
5. Keep HMAC push and callback listeners unreachable for Odesign v1. Any
   future activation requires a separately versioned contract, exact write-set
   review, explicit scope approval, and the section 7 hostile fixtures;
   polling remains required.
6. Approve the safe error code/remediation allowlists and automated redaction corpus with provider-specific hostile error fixtures.

## 15. Executable normalized schemas

The v1 executable boundary consists only of these external-lifecycle schemas:

- `external-job-envelope.v1.schema.json`
- `external-job-locator.v1.schema.json`
- `external-job-acceptance.v1.schema.json`
- `external-job-artifact-handle.v1.schema.json`
- `external-job-error.v1.schema.json`
- `external-job-status.v1.schema.json`
- `external-job-cancel-request.v1.schema.json`
- `external-job-cancel-response.v1.schema.json`
- `external-job-event.v1.schema.json`

They describe normalized internal documents, not provider-native bodies and not
an implemented network adapter. The deterministic evaluator and hostile corpus
under `.hermes/phase1/security/external-lifecycle-contract/` provide contract
evidence only. They MUST NOT be cited as proof of a live provider, journal,
callback ingress, egress policy, artifact streamer, or deployment control.

Schema validation and the deterministic semantic evaluator are one mandatory
boundary. Every consumer MUST run both before a document can affect retry,
polling, cancellation, cursor state, artifact I/O, publication, or rendering.
The evaluator owns relations Draft 2020-12 cannot express portably: timestamp
ordering and the two-hour ceiling, acceptance/cancel correlation,
`value <= max`, globally unique item/handle identities, handle-reference integrity,
nested-locator equality, progress history, polling authority, and immutable
terminal content. Passing only the JSON Schema is never sufficient evidence.
The selected validator MUST assert `format: date-time`; the canonical UTC regex
in every schema additionally limits lexical form and fractional precision.
