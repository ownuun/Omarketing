# CI shell failure diagnosis (read-only source investigation)

## Outcome

Reproduced **17 failed / 9 passed / 26 tests**, across exactly the two requested files, using installed Vitest 4.1.10 on Node v26.7.0. Both scripts fail because the test subprocess resolves `bash` to macOS `/bin/bash` **3.2.57**, which has no `mapfile` builtin. This is an evidenced local shell compatibility/prerequisite failure, not evidence of a regression in the completed composable correction or browser tests. These shell tests remain red locally; do not describe the entire suite as green or every defect as fixed.

| File                                            | Failed | Passed | First blocked statement                                                        |
| ----------------------------------------------- | -----: | -----: | ------------------------------------------------------------------------------ |
| `scripts/cicd/check-binary-size.test.ts`        |     12 |      8 | `check-binary-size.sh:96`: `mapfile -d '' -t numstat_records <"$numstat_file"` |
| `scripts/cicd/reconcile-latest-release.test.ts` |      5 |      1 | `reconcile-latest-release.sh:22`: `mapfile -t stable_tags < <(...)`            |

The passing cases reject invalid arguments / an unset REPO before reaching `mapfile`.

## Safety and execution scope

Read both complete test files and invoked shell scripts before execution. The binary tests create and remove temporary fixture Git repositories; their init/add/commit/config operations affect only those disposable fixtures, not this checkout. No checkout Git writes were performed. The release tests prepend their own executable `gh` stub to PATH; release lists are fixture JSON and release edits only append to a temporary log. No actual GitHub API, publication, installation, or external network call was made.

The normal `vite.config.mts` calls `dotenvConfig()` at line 22. To avoid reading `.env` or secrets, invoked installed Vitest programmatically with config discovery disabled, env-file loading disabled, no setup files, Node environment, and cache disabled. This is a focused reproduction of the unchanged test files, **not** a rerun of the original full-suite17 command or original Vite configuration.

Exact full targeted reproduction command (run from repository root):

```sh
node --input-type=module -e 'import cp from "node:child_process"; import {syncBuiltinESMExports} from "node:module"; import {startVitest} from "vitest/node"; const original=cp.spawnSync; cp.spawnSync=function(...args){const r=original.apply(this,args); if(args[0]==="bash") console.error("SHELL_DIAGNOSTIC",JSON.stringify({command:args[0],args:args[1],status:r.status,stderr:r.stderr,stdout:r.stdout})); return r}; syncBuiltinESMExports(); const ctx=await startVitest("test",["scripts/cicd/check-binary-size.test.ts","scripts/cicd/reconcile-latest-release.test.ts"],{config:false,configFile:false,environment:"node",pool:"threads",maxWorkers:1,fileParallelism:false,isolate:false,cache:false,watch:false,reporters:["verbose"]},{configFile:false,envFile:false}); await ctx?.close();'
```

Actual result: process exit **1**, `Test Files 2 failed (2)`, `Tests 17 failed | 9 passed (26)`, duration 4.57s. Vite warned that `envFile` is deprecated in favor of `envDir: false`; the subsequent diagnostic run used the latter. The initial parent-process spawn wrapper did not cross the Vitest worker boundary and therefore emitted no subprocess diagnostics. It did not alter assertions.

## Exact subprocess evidence

A second Vitest run selected the first failing case in each file and used an in-memory Vite transform to insert `console.error` of the existing `spawnSync` result. No source/test files were edited and no return values/assertions were altered. Actual result: exit **1**, **2 failed / 24 skipped**.

Commands issued by those tests:

- `bash <absolute-repo>/scripts/cicd/check-binary-size.sh --base HEAD~1 --head HEAD`, cwd = disposable `binary-size-*` fixture, `MAX_BINARY_BYTES=1024`.
- `bash <absolute-repo>/scripts/cicd/reconcile-latest-release.sh`, cwd = disposable `reconcile-latest-*` fixture, `REPO=Comfy-Org/ComfyUI_frontend`, PATH begins with fixture `bin` containing stub `gh`.

Captured stderr (repository prefix abbreviated only here):

```text
<absolute-repo>/scripts/cicd/check-binary-size.sh: line 96: mapfile: command not found
status: 127; stdout: ""

<absolute-repo>/scripts/cicd/reconcile-latest-release.sh: line 22: mapfile: command not found
status: 127; stdout: ""
```

The exact in-memory logging run was:

```sh
node --input-type=module -e 'import {startVitest} from "vitest/node"; const diagnostic={name:"read-only-shell-diagnostic",enforce:"pre",transform(code,id){if(!/scripts\/cicd\/(check-binary-size|reconcile-latest-release)\.test\.ts$/.test(id))return; const log="console.error(\"SHELL_DIAGNOSTIC\", JSON.stringify({status:result.status,stderr:result.stderr,stdout:result.stdout})); "; return code.replace("return { status: result.status",log+"return { status: result.status").replace("const edits = fs.existsSync",log+"const edits = fs.existsSync")}}; const ctx=await startVitest("test",["scripts/cicd/check-binary-size.test.ts","scripts/cicd/reconcile-latest-release.test.ts"],{config:false,configFile:false,environment:"node",maxWorkers:1,fileParallelism:false,cache:false,watch:false,testNamePattern:"passes when the range changes no binary files|reassigns latest to the highest stable semver when it lags",reporters:["verbose"]},{configFile:false,envDir:false,plugins:[diagnostic]}); await ctx?.close();'
```

Independent probe `bash -c 'type mapfile; declare -A probe'` also reports `mapfile: not found` and `declare: -A: invalid option` (exit 2). Thus merely shimming `mapfile` would not fix the binary script: line 101 also requires associative arrays. `/usr/bin/jq` exists. `/usr/bin/sort -V` was tested on `v1.47.9` and `v1.47.10`, returns correctly ordered output and exit 0; it is not the observed failure.

## Read-only Git baseline evidence

At inspection HEAD was **`7dce57dbe49bc24dec701ec66f22a81cde142356`**. Scoped `git --no-optional-locks status --short` and `git diff HEAD -- <four files>` both emitted no changes, before/after test execution. Each working-tree file was also compared byte-for-byte to `git show HEAD:<path>` and **all four matched**.

| File                                            | Working-tree SHA-256                                               |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/cicd/check-binary-size.test.ts`        | `ff09af67582e4196d5f1749678d1823720e1af69a92d2816dc8ca1cb8f7a32ab` |
| `scripts/cicd/check-binary-size.sh`             | `5ddf9119be03869704e4fc6610d0b48afe8c956f26dd5c3f1660a9483da499cd` |
| `scripts/cicd/reconcile-latest-release.test.ts` | `3ae9eb3c79bc80a1f0bdf959fe2a84f748754e1b13cf58e39c5bcdc7f88b8af3` |
| `scripts/cicd/reconcile-latest-release.sh`      | `4969948e80d66a9add28f745b27e53b888ddbbf6966957b13d5d3b843d888d7a` |

Latest commit returned by scoped `git log -1` across these four paths: `58e9ea45ddd695e2c194f765153b9c4d3bee3e30 ci(release): harden core-release workflow (fixes from 1.47.10) (#14039)`.

This establishes **current HEAD baseline contents**, not historical CI pass/fail status, not cleanliness of unrelated files, and not a historical good-to-bad regression boundary. No remote CI logs or previous commits were executed.

## Smallest remedy / closure limit

Use an already available modern Bash (prefer Bash 5.x, with `mapfile -d` and associative arrays) earlier on **the test process PATH**, then rerun the same two real test files without disabling assertions. Merely launching Vitest from a different interactive shell is insufficient because both tests explicitly `spawnSync('bash', ...)` through PATH.

Only `/bin/bash` was found among executable `bash` entries on current PATH. None of `/opt/homebrew/bin/bash`, `/usr/local/bin/bash`, or `/opt/homebrew/opt/bash/bin/bash` exists. Therefore no verified no-install PATH-only remedy was available among the checked locations. No install or source portability rewrite was attempted, per scope. A compatible pre-provisioned environment would permit the smallest environment-only fix; a Bash 3.2 portability rewrite is a separate code change requiring authorization and testing. **No green rerun is claimed.**

Node v26.7.0 is also outside package.json's `>=25 <26` requirement, but the captured subprocess evidence identifies Bash's missing builtin as the immediate cause of these 17 failures; do not attribute this result to Node without further evidence.

Only this diagnostic Markdown file was intentionally persisted. The investigation is complete; environment remediation and green verification remain open under the no-install/no-edit constraint.
