# Omarketing authentication gateway contract

## Approved local selection persistence CR

Existing session authority only; real listener and trusted History producer are separate activation gates. Only new selection-manifest GET permits absent Origin with immutable authenticated provenance, exact configured Host, Sec-Fetch-Site:same-origin, empty body/query; any supplied Origin must match exactly. Unsafe methods and adjacent GET policy unchanged. No fake Origin, credential provisioning or server start.

## Approved actual-owner host CR (2026-09-06)

The authorized implementation adds an explicit aiohttp HTTP/WebSocket host around the existing `AuthService`, `GatewayCore`, and authenticated selection descriptors. Construction and import bind no listener, open no database, load no `.env`, and provision no credential. The host requires injected canonical HTTPS origin, one explicit loopback upstream, digest-pinned static allowlist, existing gateway, and optional complete selection capability set. Socket conversion rejects wrong/duplicate Host, Origin, Fetch Metadata, framing and security headers and bounded-body violations before dispatch. Cookies, authorization, forwarding and owner-like headers are consumed/stripped. Successful protected activity is applied once; session observation and WebSockets are non-touch. Selection descriptors mount through one staged immutable table or zero routes. Real downstream/upstream WebSockets are session-bound, suppress frames after revocation and close within five seconds. The live operator surface is restrictive peer-credential AF_UNIX IPC only; offline bootstrap consumes a one-shot TTY/stdin password and never argv/environment. This CR authorizes isolated synthetic credentials/TLS/temp DB tests, not production activation, real credential creation/readback, deployment, or changes to 8188/8288/5174.

Status: Phase 0 contract; product implementation is out of scope.

## Revision record (2026-08-28)

Decisions recorded by the project owner:

- The deployment location is the owner's always-on home desktop, as decided by
  the project owner; the single-owner, non-cloud premise remains unchanged.
- The access path is exclusively the Tailscale mesh VPN, as decided by the
  project owner; its tailnet host name and certificate are used, with no public
  DNS name or router port forwarding.
- Session lifetime changes to 30 days idle and 90 days absolute, as decided by
  the project owner.
- Password replacement uses the operator CLI from the server console or SSH,
  with an offline emergency recovery method kept separately, as decided by the
  project owner.

## Revision record (2026-08-31)

The W1 auth amendment is contract evidence only, not implementation evidence.
The reviewed v1 topology and operational defaults below are technical defaults
for the single-owner home desktop:

- one gateway process and one configured SQLite durable database;
- `busy_timeout=1000` milliseconds with no unbounded retry;
- WAL auto-checkpoint at 1,000 pages plus a non-blocking `PASSIVE` checkpoint
  at least every five minutes when no write transaction is active;
- terminal authentication records retained for 90 days after their terminal
  timestamp; and
- one consistent backup every 24 hours, retaining the 14 most recent backups.

The values bound lock wait, keep the WAL from growing indefinitely, cover the
longest 90-day session lifetime for audit/revocation recovery, and provide
two weeks of daily rollback points without introducing another service.

## 1A. v1 durable store topology and SQLite policy

The v1 gateway MUST run as exactly one `omarketing-auth-gateway` process with
exactly one configured SQLite durable database file. This is a topology
invariant, not a scale-out recommendation. PostgreSQL, Redis, any alternate
database or cache, and any in-memory session or limiter fallback are
prohibited. The gateway process is the sole owner of runtime database access.
While the gateway is running, the operator CLI MUST NOT open SQLite directly:
from the server console or SSH it MUST communicate over a restrictive local
operator IPC/control channel, and the gateway MUST perform the requested
transaction. Only offline emergency recovery, migration, backup, and restore
tools MAY open the database, and only while the gateway is stopped behind an
exclusive maintenance fence. A custom node, provider adapter, and Comfy bridge
MUST have zero database path or database-driver access.

The running-gateway operator control channel is precisely one local macOS
`AF_UNIX` stream socket (or Linux `AF_UNIX`/`SOCK_STREAM` equivalent). TCP,
loopback HTTP, inherited anonymous pipes, and network fallbacks are forbidden.
The socket directory MUST be mode `0700`; the socket MUST be mode `0600` and
owned by the gateway OS account. The gateway MUST obtain kernel-attested peer
credentials with macOS `getpeereid` or Linux `SO_PEERCRED` and require the
exact configured operator UID; it MUST also verify that the socket is
gateway-owned. If the peer-credential primitive is unavailable or the UID or
ownership check mismatches, live IPC MUST be disabled and only stopped-gateway
offline maintenance remains available. HTTP auth/origin routes MUST NOT reach
this socket, and the CLI MUST require local console or SSH OS access.

IPC messages use a closed `schema_version: 1` schema and a strict command
allowlist of `password_replace`, `revoke_all`, and read-only `status`.
Requests are exactly `{schema_version, request_id, correlation_id, command}`
plus `password` only for `password_replace`; `revoke_all` and `status` have no
additional fields. `request_id` is a fresh 32-byte random base64url value
(43 characters) for every frame; `correlation_id` is the operation identifier
and a status query reuses it with a new `request_id`. Responses are exactly
`{schema_version, request_id, correlation_id, command, outcome}` plus
`credential_version` for a committed password replacement and
`revoked_session_count` for a committed revoke-all. `outcome` is one of
`committed`, `rejected`, or `unknown`. Frames are bounded to 16 KiB
inclusive and use one 4-byte big-endian length prefix followed by one UTF-8
JSON object (the prefix plus object MUST be at most 16 KiB). Duplicate or
unknown fields, unsupported versions, malformed framing, arbitrary paths, SQL,
and URLs MUST be rejected before a transaction.
A password or recovery value arrives only from CLI stdin/TTY, is sent once
over the authenticated socket, is never echoed, logged, persisted in IPC
traces, or returned in a response, and is zeroized and length-bounded as far
as the runtime permits.

The gateway MUST reject replayed request IDs before executing a second
transaction. A password replacement or revoke-all is reported as successful
only on a delivered, schema-valid response stating `committed`; response
loss, disconnect, timeout, malformed response, or `unknown` MUST remain
`operator_outcome_unknown`. The CLI MUST query read-only `status` with a new
request ID and the same correlation ID when available, and MUST not claim
success from local socket closure or a missing response; a replacement may be
retried only as a newly confirmed operator command. The gateway transaction
remains the sole database write, including all IPC commands.

The database scope is limited to owner credential metadata and credential
version, sessions, rate-limit windows and counters, revocation facts, and the
global restore epoch. It MUST never store project context, the selection
sidecar, an external job journal, Run, Asset, Workflow, provider payloads,
signed URLs, credentials, or secrets. Existing project JSON and selection
sidecar files remain their authorities, and external lifecycle state uses
backend atomic files; neither authority is copied into this database.
When state is `awaiting_approval`, Odesign supplies the next action; Omarketing
approval state is not mutated by the gateway.

Every gateway database connection MUST set and verify `PRAGMA
foreign_keys=ON`, `PRAGMA journal_mode=WAL`, and `PRAGMA synchronous=FULL`.
Startup MUST verify the expected application ID and schema ID before serving
requests. Writes MUST use short `BEGIN IMMEDIATE` transactions with a fixed
lock order of owner credential, sessions/revocations, rate-limit windows, and
restore epoch. `busy_timeout=1000` milliseconds is the sole busy policy:
after that bounded wait the operation returns the fixed
`503 SERVICE_UNAVAILABLE` response (or its operator-tool equivalent), with no
unbounded retry and no fallback store.

The gateway MUST configure `wal_autocheckpoint=1000` pages and issue a
non-blocking `PASSIVE` WAL checkpoint at least every five minutes whenever no
write transaction is active. A live request MUST NOT run a blocking
`FULL`, `RESTART`, or `TRUNCATE` checkpoint; those modes are reserved for the
exclusive maintenance fence. Terminal authentication records (revoked or
expired sessions and their revocation facts) MUST be retained for exactly 90
days after the terminal timestamp, then pruned only in a bounded maintenance
transaction. No external-job terminal record is in scope for this database.

Once every 24 hours, the backup tool MUST create a consistent snapshot through
the SQLite backup API while holding the exclusive maintenance fence and retain
exactly the 14 most recent snapshots. Each snapshot receipt MUST include its
SHA-256 checksum, application ID, schema ID, restore epoch, and successful
integrity result. A busy, unreadable, corrupt, incompatible, or integrity-
failing database MUST fail closed at startup and at runtime; the gateway MUST
not auto-create an empty replacement database after corruption.

Maintenance and restore MUST follow this order:

1. Stop the gateway, drain and verify zero connected clients, and acquire an
   exclusive lock covering the database and its WAL/SHM files.
2. Use only the consistent SQLite backup/restore API. Before replacing a
   database, write a rollback copy and verify the source receipt's checksum,
   application ID, schema ID, restore epoch, and integrity result.
3. Restore into the fenced database, advance the global restore epoch, and
   invalidate every restored session (an epoch mismatch is itself unusable).
   Preserve the current credential metadata while advancing its credential
   version; if that metadata is unavailable, remain closed until the operator
   performs mandatory password replacement.
4. Apply the conservative limiter policy: after restore every limiter bucket
   enters a full-window cooldown beginning at reopen (15 minutes for login and
   failed-login buckets, one minute for logout/revoke-all, and five minutes
   for WebSocket and other protected HTTP). No bucket may be reset early.
5. Re-run application/schema ID and integrity checks, record a new checksum and
   restore-epoch receipt, release the lock, and reopen only after every check
   passes. Any failed check leaves the gateway stopped and fail closed.

## 1B. Versioned TEST/staging deployment profile (D2/S2)

This section is an explicit contract-only profile for the approved sequential
TEST/staging maintenance window. It does not amend the normal production
canonical-origin, Tailscale, cookie, or session rules in this contract and
does not authorize a server start/restart, production write/deploy,
credentials, or external calls.

Profile `auth-gateway-staging-v1` uses S2: the same configured Tailscale
hostname with a different explicit staging effective port. The production
origin remains the one exact configured HTTPS origin in section 5; the
staging origin is that same scheme and ASCII hostname with explicit port
`8443` (for example, the fixture origin
`https://omarketing.example.invalid:8443`). Production and staging are never
concurrently active. Because `__Host-` cookies are host-scoped and not
port-scoped, this profile makes no session non-interference claim.

Before production logout or any profile switch, a maintenance preflight MUST
prove all of the following for the active production profile: active sessions
`= 0`, bound WebSockets `= 0`, Queue/running prompts `= 0`, and external
provider work `= 0`. Any unknown or unavailable count fails closed and blocks
the window. The exact sequential order is mandatory:

1. Confirm the preflight zero counts, then perform production logout/revoke
   and wait for its socket-closure requirement to complete.
2. Stop and fence the production profile.
3. Snapshot and read back the prior production directory, configuration, and
   canonical origin. This is preservation evidence only; this profile does
   not authorize the target action.
4. Switch to separate staging directory, auth database, configuration,
   canonical staging origin/port, and distinct config, data, output, and
   quarantine roots.
5. Run staging login, the approved TEST checks, staging logout, and a zero
   staging session/zero bound-WebSocket check.
6. Stop and fence staging.
7. Restore the exact prior production directory, configuration, and canonical
   origin, verify the read-back, and require production reauthentication.

Each profile accepts only its exact canonical origin including scheme, host,
and effective port. Production MUST reject the staging origin, and staging
MUST reject the production origin. No origin wildcard, omitted staging port,
shared listener, redirect or cookie fallback, or browser credential storage
is permitted. Tailscale-only access and the section 4
`__Host-omarketing_session` cookie remain in force.

Failure, interruption, or `outcome_unknown` at any step MUST block promotion.
Listeners MUST remain closed whenever state is uncertain. The prior
production directory and origin MAY be restored only after their checksums,
configuration, origin, schema/application IDs, and integrity have been
verified; reopening then requires the production reauthentication step. An
unknown external outcome MUST never be auto-retried.

Staging roots and state are not shared with production: staging has distinct
configuration, database, data, output, and quarantine paths. Active
production sessions, credentials, provider secrets, and other live state MUST
not be copied into staging. A TEST operator MAY later bootstrap a
staging-only credential through approved offline/local mechanisms, but no
credential action is authorized by this contract amendment.

## 1. Boundary and invariants

`omarketing-auth-gateway` is the only Internet-facing listener. It terminates TLS, authenticates the owner, applies request policy, and reverse-proxies accepted traffic to ComfyUI on loopback or a private network. The ComfyUI origin port MUST NOT be reachable from an untrusted network.

The gateway runs on the owner's home desktop. External access is available
only inside the Tailscale mesh VPN; no public DNS name or router port
forwarding is used. Tailscale-only access leaves the gateway as the sole
externally reachable listener while ComfyUI remains bound to loopback or a
private address and its origin port remains unreachable from untrusted
networks.

This is a single-owner, non-cloud deployment. The gateway MUST NOT add public registration, organizations, invitations, roles, billing, a second Workflow/Run/Asset authority, or a frontend authentication/run state machine. ComfyUI's core `src/scripts/api.ts`, WebSocket protocol, prompt submission, Queue/History, Assets, cache, failure, and interrupt behavior MUST remain unchanged.

The unchanged non-cloud `api.ts` is compatible with this boundary because it uses same-origin relative HTTP URLs, the browser's default same-origin cookie behavior, and a same-origin `ws(s)://<location.host>/<api_base>/ws` connection. The gateway MUST NOT require a CSRF token or custom request header that `api.ts` does not send.

The production Electron shell MUST navigate the same canonical Tailscale
gateway HTTPS origin as the web client and use its normal isolated cookie jar.
It MUST NOT
load a `file://` renderer that talks directly to Comfy, inject a bearer token,
expose loopback port `8188`, or maintain an Electron-only Workflow/Queue/Asset
store. Login, logout, revoke-all, expiry, HTTP, `/view`, templates/extensions,
and WebSocket closure therefore act on the same server data and session
contract in web and Electron. Proving that navigation/deep links and
Tailscale certificate trust use the canonical Tailscale origin is a deployment
Gate.

First-release H2 disposition: Omarketing v1 supports one server-owned
password/session boundary for its single owner. Every Comfy sign-in and API-key
control MUST be hidden and unreachable in the supported v1 flow; this includes
DOM, commands, settings, dialogs, and deep links. A visible Comfy control is not
acceptable. The supported flow MUST NOT solicit, create, or rely on
`comfy_api_key` or any reusable Comfy Org/API-node credential. Existing upstream
auth/cloud source capability remains present; this contract does not authorize
deleting or rewriting it. That retained source is not a supported v1 entry
point and MUST NOT act as the Omarketing identity or session authority.

The gateway access password and session are separate from every Comfy or
provider credential. The gateway MUST verify the password and apply its rate
limits server-side, then issue the owner session described below. The plaintext
access password MUST NOT be persisted in browser storage, workflow/project
data, prompt bodies, URLs, logs, or telemetry, and MUST NOT be sent to Comfy or
any provider. A Comfy/provider login, key, or reusable credential MUST NOT
create, refresh, revoke, or authorize the Omarketing owner session.

No signup, public registration, user-account UI, roles, teams, invitations, or
multi-user UI is supported. Local Workflows, Templates, Nodes, Assets, Queue,
History, and Omarketing MUST remain available without Comfy account login.
This is a contract-level disposition only: it proves or authorizes no gateway,
UI, or product implementation and grants no product-file write scope. A
presentation allowlist is a separate Tower gate.

The built-in `authSession.ts` extension is a thin gateway client, not an auth
store. It keeps no token or durable identity state. On setup and foreground
resume it calls the non-touch `GET /auth/session` observation, schedules a
check no later than the server-reported idle/absolute expiry (and at most once
per minute), and on `401` performs a full top-level navigation to the gateway
login with a normalized local `return_to`. Its commands call logout/revoke-all
and then clear only noncredential Omarketing ephemeral caches before the same
navigation. It cannot read the HttpOnly cookie, mint/refresh a session,
automatically retry a mutation after `401`, or reinterpret an API error as
authenticated state. For revoke-all, only a schema-valid delivered `200`
confirms completion. A network error, response loss, `5xx`, or `401` leaves
`revoke_outcome_unknown`; local ephemeral data may still be closed, but the
client MUST present the outcome as unconfirmed and converge through a new
owner authentication followed by a new revoke-all request.

## 2. Owner bootstrap

There is exactly one owner identity.

- Bootstrap MUST be an operator-only, one-time CLI operation on the server, for example `omarketing-auth owner bootstrap --username <name> --password-stdin`.
- Bootstrap MUST read the password from an interactive prompt, standard input, or a one-shot secret file descriptor. It MUST NOT accept the password in an argv value, URL, checked-in file, image layer, workflow, or persistent environment variable.
- Bootstrap MUST fail closed if an owner already exists. It MUST NOT overwrite or create a second owner.
- The owner record MUST contain an opaque immutable `owner_user_id`, normalized login name, password hash parameters and hash, creation time, and credential version. It MUST NOT contain the plaintext password.
- The externally returned opaque `owner_user_id` encoding is 16 to 128 ASCII
  characters matching `[A-Za-z0-9][A-Za-z0-9._:-]*`; clients MUST NOT parse
  identity or privilege from that encoding.
- Password hashing MUST use a maintained password-hashing implementation with deployment-calibrated Argon2id (preferred) or scrypt parameters and a unique random salt. A fast general-purpose hash is prohibited.
- Password replacement MUST be a separate authenticated operator CLI action. Replacement MUST increment the credential version and revoke every existing session.
- Password replacement MUST be run through the operator CLI from the server
  console or SSH. A separate emergency recovery method MUST be kept offline
  for loss of server access; it MUST NOT create an HTTP password-reset path.
- While the gateway is running, this CLI uses only the restrictive local
  operator IPC/control channel; it does not open SQLite directly, so routine
  password replacement does not require gateway downtime.
- No HTTP registration or bootstrap route may exist.

`owner_user_id` is derived from the authenticated session. Any client-supplied `owner_user_id`, actor, tenant, project, or privilege header/body field MUST be ignored or rejected, never used for authorization.

## 3. Protected route matrix

Matching is against the normalized URL pathname after one percent-decoding pass and dot-segment removal. Ambiguous encodings, encoded path separators, duplicate slashes that change routing, and invalid UTF-8 MUST be rejected before proxying.

| Path match                                                 | Allowed methods    | Authentication | Additional rule                                                                          |
| ---------------------------------------------------------- | ------------------ | -------------- | ---------------------------------------------------------------------------------------- |
| `/` (exact)                                                | `GET`, `HEAD`      | Required       | Unauthenticated top-level navigation redirects to login.                                 |
| `/api/**`                                                  | Upstream-defined   | Required       | Includes all Comfy core and custom-node API routes. Non-navigation auth failure is JSON. |
| `/internal/**`                                             | Upstream-defined   | Required       | Never exposed without the same owner session.                                            |
| `/ws` (exact)                                              | `GET` Upgrade only | Required       | Session and WebSocket Origin validation are required.                                    |
| `/extensions/**`                                           | `GET`, `HEAD`      | Required       | Custom-node web assets do not bypass authentication.                                     |
| `/templates/**`                                            | `GET`, `HEAD`      | Required       | Template assets do not bypass authentication.                                            |
| `/view*` (pathname begins with the literal string `/view`) | `GET`, `HEAD`      | Required       | Covers `/view`, `/view_metadata/...`, and any other upstream `/view...` resource.        |

In this table, `/**` includes the named base path and all slash descendants. The gateway-owned public surface is limited to `GET /auth/login` and `POST /auth/login`. The login document MUST be self-contained. The only other public files are immutable frontend presentation files whose exact paths and digests appear in the deployed build manifest (JavaScript, CSS, fonts, static branding, and favicon); they MUST contain no user, workflow, provider, or credential data. `GET /auth/session`, `POST /auth/logout`, and `POST /auth/revoke-all` are gateway-owned but session-aware routes. Health endpoints, if required by infrastructure, MUST be bound to a private listener and MUST NOT proxy application data.

`POST /auth/logout` is the sole idempotent unauthenticated-safe exception: it
still requires the exact unsafe-request Origin/Fetch-Metadata checks, clears
the cookie, and returns the fixed revoked response even when no live session
remains. It grants no application access and reveals no session existence.
`GET /auth/session` and `POST /auth/revoke-all` require a current session.

Any application route outside the table and the explicit gateway-owned routes MUST be default-denied until added to a reviewed contract. A route MUST NOT become public merely because ComfyUI or a custom-node package registers it later.

## 4. Server-side session

A successful login creates a cryptographically random opaque session identifier with at least 256 bits of entropy. Only a keyed hash of that identifier is stored. The durable session record has:

```text
session_id_hash, owner_user_id, credential_version,
restore_epoch,
created_at, last_seen_at, idle_expires_at, absolute_expires_at,
revoked_at?, revoke_reason?, source_ip_prefix, user_agent_hash
```

Normative lifetime:

- idle lifetime: 30 days from the last accepted allowlisted activity;
- absolute lifetime: 90 days from creation and never extended;
- the only requests allowed to refresh idle activity are an accepted
  authenticated `GET` or `HEAD` for `/`, any accepted authenticated
  upstream-defined method for `/api/**` or `/internal/**`, and an accepted
  authenticated `GET` or `HEAD` for `/view*`;
- accepted means that gateway normalization, request policy, and session
  checks succeeded and the request was admitted to the protected application;
  the eventual upstream response status does not change that activity
  decision;
- `GET /auth/session`, every other `/auth/**` request, `/ws` upgrade and
  WebSocket frames, `/extensions/**`, `/templates/**`, public build assets,
  rejected requests, preflights, and policy failures MUST NOT refresh
  `last_seen_at` or `idle_expires_at`;
- an allowed activity sets `last_seen_at` to its accepted time and sets
  `idle_expires_at` to the earlier of 30 days after that time and the
  immutable `absolute_expires_at`;
- `last_seen_at` MAY be write-coalesced, but the server-side idle decision MUST be accurate to within 60 seconds;
- expiry and revocation MUST be checked on every protected HTTP request and WebSocket upgrade, not only when the cookie is parsed;
- a session that is idle-expired, absolute-expired, credential-version-stale, or revoked MUST be rejected and MUST NOT be revived.

The longer lifetimes increase the risk window for a lost or stolen session
cookie. Because access is Tailscale-only, a leaked cookie cannot be used from
outside the tailnet, which is the compensating access-path control.

The response cookie is exactly:

```http
Set-Cookie: __Host-omarketing_session=<opaque>; Path=/; Secure; HttpOnly; SameSite=Strict
```

It MUST have no `Domain` attribute. Its expiry/`Max-Age` MUST NOT exceed the
absolute session lifetime (90 days in this contract). Login MUST rotate any
supplied session identifier. Logout, revoke-all, credential replacement, and
expiry MUST clear the browser cookie when an HTTP response can be returned.
Session identifiers and cookie values MUST NOT be logged.

## 5. CSRF, Origin, and Fetch Metadata

The canonical public origin is exactly one configured HTTPS origin based on the
Tailscale tailnet host name and its Tailscale-issued tailnet certificate. The
actual host name MUST be fixed in deployment configuration; this contract does
not choose its value. The origin consists of one exact `https` scheme, ASCII
host, and effective port. Wildcards, suffix matches, `null`, alternate ports,
and reflected origins are forbidden. A placeholder, if used in deployment
examples, is illustrative only and is not an actual host name. The
Tailscale-issued tailnet certificate is the trust basis instead of a
certificate from a public certificate authority.

The following algorithm is mandatory:

1. For every unsafe request (`POST`, `PUT`, `PATCH`, or `DELETE`), including login/logout/revoke and unsafe `/api/**` or `/internal/**` calls, `Origin` MUST be present and exactly equal to the canonical public origin after standard origin serialization. `Sec-Fetch-Site` MUST be present and exactly `same-origin`. Failure returns `403 CSRF_REJECTED` before reading a large body or proxying.
2. For safe non-navigation requests, a present `Origin` MUST equal the canonical origin. A present `Sec-Fetch-Site: cross-site` MUST be rejected. `same-origin`, `same-site`, and `none` are accepted for safe requests; absence is accepted for direct clients but does not relax session authentication.
3. A top-level navigation is exactly a `GET` or `HEAD` with `Sec-Fetch-Mode: navigate` and an HTML-compatible `Accept` value. It may arrive cross-site, but `SameSite=Strict` normally withholds the cookie; an unauthenticated navigation is redirected as specified below and never performs a mutation.
4. A `/ws` upgrade MUST have `Origin` exactly equal to the canonical public origin. If `Sec-Fetch-Site` is present, it MUST be `same-origin`; `cross-site`, `same-site`, and `none` are rejected. The only accepted query parameter is optional existing Comfy `clientId`. `token`, credentials, and unknown query parameters MUST be rejected.
5. Cross-origin preflight MUST be rejected. The gateway MUST NOT emit wildcard or reflected `Access-Control-Allow-Origin`, MUST NOT enable credentialed CORS, and MUST NOT treat `SameSite` alone as CSRF protection.

This Origin/Fetch-Metadata policy deliberately uses only headers browsers already attach, so unchanged core `api.ts` remains usable.

## 6. Gateway-owned HTTP API

All timestamps are UTC RFC 3339 strings. Every JSON response uses
`Content-Type: application/json` and `Cache-Control: no-store`.

Every gateway-owned auth JSON request or response document carries integer
`schema_version: 1` and MUST validate without coercion against the
corresponding Draft 2020-12 schema below. Raw JSON containing duplicate object
member names, including names made equal by escape decoding, MUST be rejected
before schema validation. Unknown properties are rejected; a parser MUST NOT
strip an unknown credential, URL, owner, or privilege field and then accept
the remainder.

| Document                           | Schema                                                           |
| ---------------------------------- | ---------------------------------------------------------------- |
| Login request                      | `.hermes/phase0/schemas/auth-login-request.v1.schema.json`       |
| Login and session success response | `.hermes/phase0/schemas/auth-session-response.v1.schema.json`    |
| Logout success response            | `.hermes/phase0/schemas/auth-logout-response.v1.schema.json`     |
| Revoke-all success response        | `.hermes/phase0/schemas/auth-revoke-all-response.v1.schema.json` |
| Any auth JSON error response       | `.hermes/phase0/schemas/auth-error-response.v1.schema.json`      |

Logout and revoke-all retain an exactly empty request body, so there is no JSON
request document to validate for those two routes. A nonempty body, including
`{}`, is rejected as `400 INVALID_REQUEST`.

Gateway-owned auth errors use only the fixed code/message pairs in
`auth-error-response.v1`: malformed requests use `400 INVALID_REQUEST`,
credential failure uses `401 INVALID_CREDENTIALS`, other session failure uses
`401 AUTH_REQUIRED`, Origin/Fetch-Metadata failure uses `403 CSRF_REJECTED`,
rate-limit rejection uses `429 RATE_LIMITED`, and an auth-service `5xx` uses
the fixed `503 SERVICE_UNAVAILABLE`. Error bodies MUST NOT include exception
text, internal URLs, credentials, or upstream host details.

### `POST /auth/login`

Request:

```json
{
  "schema_version": 1,
  "username": "owner login name",
  "password": "plaintext transported only inside this TLS request"
}
```

The normalized username is 1 to 128 characters without leading/trailing
whitespace or control characters. The password is 1 to 1,024 JSON string
characters; this transport bound does not normalize or trim the password.
The gateway MUST apply the unsafe-request CSRF checks before credential
verification. On success it returns `200`, sets a fresh session cookie, and
returns:

```json
{
  "schema_version": 1,
  "owner_user_id": "owner_01J6A3M2Z8R4T5V7",
  "idle_expires_at": "2026-09-25T12:00:00Z",
  "absolute_expires_at": "2026-11-24T12:00:00Z"
}
```

Invalid username and invalid password MUST have the same status, body, and
materially equivalent timing:
`401 {"schema_version":1,"error":{"code":"INVALID_CREDENTIALS","message":"Invalid username or password."}}`.
Passwords MUST NOT be echoed or logged.

### `GET /auth/session`

This route is a non-touch observation. The server MUST determine revocation,
credential-version staleness, idle expiry, and absolute expiry before choosing
the response. A live session returns `200` with the
`auth-session-response.v1` document, but the observation MUST NOT change
`last_seen_at`, `idle_expires_at`, or `absolute_expires_at`, even when polled.
An unusable session returns the standard `401` JSON below and MUST NOT be
revived. The response MUST NOT return the session identifier, credential
version, password metadata, or external connection credentials.

### `POST /auth/logout`

Request body is empty. With a current session, the gateway MUST atomically
revoke it, clear its cookie, and terminate all WebSockets registered to that
session. Without a current session, after the mandatory same-origin CSRF
checks, it still clears the cookie and returns the same fixed result. Success
is `200 {"schema_version":1,"revoked":true}`; repeating logout is idempotent
and reveals no prior session state.

### `POST /auth/revoke-all`

Request body is empty. After rate-limit admission, the gateway MUST atomically
revoke every owner session, including the caller, clear the caller cookie, and
terminate all owner WebSockets. Success is
`200 {"schema_version":1,"revoked":true,"revoked_session_count":<positive-integer>}`.
The count includes the caller, is owner-visible only, and MUST NOT identify
sessions.

Only receipt of that schema-valid `200` is confirmation. A network failure,
request or response loss, malformed response, `5xx`, or `401` after an attempt
MUST be represented as `revoke_outcome_unknown`, never as confirmed success.
The client MAY immediately close noncredential local ephemeral state and
navigate to login, but that local action is not evidence of server commit. To
converge, the owner authenticates again and explicitly invokes revoke-all
again; that transaction also revokes the newly created caller session, and
only its delivered schema-valid `200` confirms completion. The convergence
step is a new authenticated command, not an automatic retry with a stale
session.

The operation is state-idempotent but not response-replayable: duplicate or
concurrent deliveries each mean “revoke all sessions that exist at this
commit, including this caller.” One request may commit and invalidate the
credentials used by a duplicate, causing that duplicate to receive `401`.
That `401` does not prove that the other request committed. If the only `200`
was lost, the outcome remains unknown and requires the reauthentication
convergence above.

There is no public per-session listing, token minting, password reset, registration, or impersonation API in MVP.

## 7. Authentication failure behavior

Only an unauthenticated top-level navigation, as exactly defined in section 5, receives `303 See Other` to `/auth/login?return_to=<encoded-local-path>`. `return_to` MUST be a normalized local path matching the protected matrix; absolute, scheme-relative, backslash-containing, or authority-changing values MUST fall back to `/`.

Except for the fixed idempotent logout behavior above, every other protected
HTTP request, including requests made by unchanged `api.ts`, receives:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
Cache-Control: no-store
```

```json
{
  "schema_version": 1,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication is required."
  }
}
```

The body MUST NOT distinguish missing, expired, revoked, or malformed sessions. API/subresource requests MUST NOT receive HTML or a login redirect. A rejected WebSocket upgrade returns HTTP `401` and MUST NOT be redirected.

## 8. WebSocket ownership and revocation

At successful `/ws` upgrade, the gateway MUST bind the upstream/downstream
socket pair to the validated `session_id_hash` in a live connection registry.
It MUST periodically re-check absolute/idle expiry at least once per minute.
Only the explicit section 4 activity allowlist may refresh idle expiry for the
same session; the WebSocket upgrade and every WebSocket frame are non-touch
observations and MUST NOT extend either deadline.

Logout, revoke-all, password replacement, idle expiry, or absolute expiry MUST
synchronously mark the session unusable and signal all associated sockets to
close. For explicit logout, revoke-all, and password replacement, the closure
SLA starts at the committed unusable marker. For idle or absolute expiry, it
starts when the gateway detects expiry. Frames MUST be dropped immediately
after that marker or detection, and the gateway MUST `force-close both directions within 5 seconds`. The gateway SHOULD send close code `4401` with
the fixed reason `authentication expired` before the force-close.
A reconnect is a new upgrade and MUST pass current session, Origin, and
rate-limit checks.

The gateway MUST preserve existing Comfy WebSocket messages (`status`, `execution_start`, `progress`, `progress_state`, `execution_success`, `execution_error`, `execution_interrupted`, and others) without inventing Omarketing auth or run events.

## 9. Rate limits

Limits use a shared server-side limiter and return `429` JSON with integer
`Retry-After`; they MUST NOT be implemented in browser storage. The fixed
`RATE_LIMITED` error body contains integer `retry_after_seconds` equal to that
header.

| Scope                | Limit               | Key                                                                                                    | Required behavior                                                                                                                                                                     |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login requests       | 20 per 15 minutes   | normalized client IP                                                                                   | Reject before password hashing when exceeded.                                                                                                                                         |
| Failed logins        | 5 per 15 minutes    | owner id plus normalized client IP                                                                     | Lock that pair for the remainder of the window; success clears its failure counter.                                                                                                   |
| Logout/revoke-all    | 10 per minute       | owner id plus normalized client IP when authenticated; normalized client IP for unauthenticated logout | Limiter admission or rejection occurs before a revocation transaction. A `429` commits no revocation and returns integer `Retry-After`; response loss after commit is client-unknown. |
| WebSocket upgrades   | 20 per 5 minutes    | session and client IP                                                                                  | Maximum 5 simultaneously open sockets per session; reject excess upgrades.                                                                                                            |
| Other protected HTTP | 1,200 per 5 minutes | session                                                                                                | Burst capacity MUST be at least 100 so normal Queue/Assets loading is not throttled.                                                                                                  |

Authentication failures MUST NOT reset or bypass limits. This direct Tailscale
deployment has no trusted forwarding-header sender, so proxy-aware IP
derivation MUST NOT trust forwarding headers. Client-supplied forwarding,
owner, tenant, and actor headers remain untrusted. Rate-limit records MUST NOT
include raw passwords, cookies, or request bodies.

Reauthentication does not reset the owner-plus-IP revoke-all bucket. On a
delivered `429`, the client MUST NOT show success; it honors `Retry-After` and
may retry with the still-current session after the window. If that retry
instead receives `401`, or if a `429` response is lost, the
`revoke_outcome_unknown` reauthentication convergence in section 6 applies.

## 10. Credential and header non-exposure

- Hermes/provider/platform credentials MUST exist only in a backend secret store and be resolved from an opaque `connection_id` plus authenticated server context.
- Reusable credentials MUST NOT appear in frontend JavaScript, browser storage, URLs, WebSocket query strings/messages, workflow JSON, prompt/widget values, output metadata, selection manifests, artifact locators, exception text, analytics, or logs.
- The Omarketing gateway MUST consume and remove `__Host-omarketing_session` before proxying. It MUST strip client-supplied `X-Omarketing-*`, `Forwarded`, `X-Forwarded-*`, owner/tenant/actor headers, and any cloud `token` query parameter before adding its own trusted forwarding metadata.
- If backend Omarketing routes need identity, the gateway MUST inject an integrity-protected, short-lived internal context containing only `owner_user_id`, request id, issued time, and expiry. The backend MUST accept it only from the private gateway connection and MUST reject replay/expiry. Core Comfy routes may ignore it.
- Client `Comfy-User` and owner-like body fields MUST NOT grant authorization.
- Responses MUST set `Cache-Control: no-store` for auth/session data and MUST NOT expose upstream private hostnames or ports.
- The gateway MUST override authenticated dynamic `/api/**`, `/internal/**`,
  and `/view*` responses with `Cache-Control: no-store, private` and prevent a
  service worker from caching them. Only exact digest-addressed public build
  assets and reviewed static extension/template bytes may use immutable
  caching. Logout/revoke tests MUST prove that browser back/forward cache and
  offline cache cannot reveal Workflow, Queue/History, output, or session data.

## 11. Trusted custom-node threat model

A backend custom-node package executes with ComfyUI process privileges. Therefore only owner-approved packages pinned to an exact version or immutable digest and present on an operator-maintained allowlist may be installed. Package provenance and digest MUST be verified before startup; runtime installation from an unauthenticated UI MUST be disabled.

The gateway protects against unauthenticated network access and browser-origin attacks. It does not sandbox a malicious custom node. A trusted node could read process-visible files, inspect prompt data, or register routes, so secrets SHOULD be delivered to a separate adapter service over a narrow authenticated private API rather than placed in the ComfyUI process. Packages that require direct reusable credentials, expose an unprotected listener, register public auth bypasses, or send credentials to the browser MUST be rejected from production.

## 12. Verification checklist

The Phase 1 schema validator and fake-clock evaluator are contract-artifact
evidence only. They MUST NOT be cited as proof that a gateway listener,
session store, cookie boundary, WebSocket registry, browser client, or
Electron client enforces these controls.

- [ ] Only the gateway is reachable externally; direct Comfy HTTP and WebSocket ports are unreachable.
- [ ] Every matrix path is tested authenticated and unauthenticated, including encoded/dot-segment bypass variants.
- [ ] Unauthenticated navigation gets a local `303`; `fetch('/api/...')`, `/view...`, and `/ws` never get HTML redirects.
- [ ] Unchanged non-cloud `api.ts` can load `/api/**`, submit `/api/prompt`, fetch `/internal/**`, retrieve `/extensions/**`, `/templates/**`, `/view*`, and connect/reconnect `/ws` using only the session cookie.
- [ ] Unsafe requests reject missing/mismatched `Origin`, every non-`same-origin` `Sec-Fetch-Site`, `Origin: null`, and cross-origin preflight.
- [ ] Cookie attributes, 30-day idle expiry, 90-day absolute expiry, `Max-Age` at or below 90 days, rotation, no-Domain rule, server-side revocation, and no session resurrection are verified.
- [ ] Topology proves exactly one gateway process and one SQLite file, the
      database scope excludes project/selection/lifecycle/provider data and all
      secrets, and custom node/adapter/bridge code has no database path or driver.
- [ ] SQLite startup and runtime checks prove foreign keys, WAL, synchronous
      FULL, application/schema IDs, ordered `BEGIN IMMEDIATE` writes, the
      1,000-ms busy bound, 1,000-page/5-minute checkpoint policy, 90-day terminal
      retention, and 24-hour/14-snapshot backups; corruption never creates an
      empty replacement.
- [ ] Restore proves a stopped gateway, exclusive fence, zero clients,
      consistent backup API, checksum/epoch/schema/integrity receipts, rollback
      copy, epoch-based session invalidation, credential preservation/version
      advance or mandatory replacement, full-window limiter cooldown, and
      check-gated reopen.
- [ ] Fake-clock polling proves `/auth/session`, `/ws` upgrades, and WebSocket frames never refresh idle; only the section 4 activity allowlist can do so, the 30-day idle boundary is enforced, and the 90-day absolute expiry never moves.
- [ ] Logout, revoke-all, password replacement, and expiry terminate every bound live WebSocket within 5 seconds and block reconnect.
- [ ] Revoke-all fault injection covers before-commit request loss, after-commit response loss, `5xx`, `401`, `429`, and duplicate delivery; no unknown outcome is displayed as success, and reauthentication plus a delivered `200` converges.
- [ ] Login enumeration resistance and each rate-limit bucket/`Retry-After` behavior are verified through the real shared limiter.
- [ ] Requests cannot spoof owner/tenant/actor/forwarding headers, and gateway session cookies do not reach Comfy/custom-node handlers.
- [ ] Secret scanning covers workflow JSON, prompts, outputs, manifests, browser storage, logs, error bodies, HTTP captures, and WebSocket captures.
- [ ] A package outside the pinned custom-node allowlist cannot load or register a route.

The following first-release H2 checks are later implementation proof
requirements. They are not current contract-artifact evidence and MUST NOT be
cited as implemented until a separately authorized product lane supplies the
evidence:

- [ ] Supported-v1 DOM, command, settings, dialog, and deep-link scans each report an entry count of `0` for Comfy sign-in and API-key controls.
- [ ] Supported UI flow analysis proves it never creates, solicits, or uses `comfy_api_key`.
- [ ] The real gateway proves server-side password-hash verification, server-side rate limiting, session issuance, and the required HttpOnly cookie, with negative evidence for every password sink named in section 1.
- [ ] Local Workflows, Templates, Nodes, Assets, Queue, History, and Omarketing remain reachable without Comfy account login.

## 13. Unresolved implementation dependencies

These dependencies block production approval but do not alter the contract:

1. Select the gateway implementation and secret manager, then prove atomic
   revoke plus single-process WebSocket registry closure against the one
   configured SQLite store.
2. Configure the one canonical HTTPS origin from the deployment's Tailscale
   tailnet host name, Tailscale-issued certificate rotation, and private
   ComfyUI bind address for the target deployment. This direct Tailscale
   deployment has no public domain, no load balancer, and no trusted
   load-balancer hop. The matching Electron shell navigation, Tailscale
   certificate-trust, and deep-link fixture is part of this dependency.
3. Confirm the backend custom-node middleware entry point that verifies the gateway's internal owner context without editing core frontend `api.ts` or core Comfy authorization semantics.
4. Define and audit the pinned custom-node package allowlist, artifact signature/digest source, and startup enforcement mechanism.
5. Supply integration fixtures for every protected route, navigation/API
   distinction, CSRF header matrix, 30-day idle and 90-day absolute expiry
   races, rate-limit window, and live WebSocket revocation.
6. Implement and prove the decided first-release H2 policy in section 1 under
   a separate Tower-approved presentation allowlist. The policy itself is
   resolved; only implementation evidence remains open. The auth schemas in
   this contract neither model nor authorize reusable Comfy credentials.
