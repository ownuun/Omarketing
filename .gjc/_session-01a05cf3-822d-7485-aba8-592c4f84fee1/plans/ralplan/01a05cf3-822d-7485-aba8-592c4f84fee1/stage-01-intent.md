# Intent Reconciliation

## Evidence inspected

- Deep-interview spec: fixture-only scope, Pass semantics, simulated status labels, and existing unfiltered job-history links.
- Planner stage 1: additive registry approach, no-authority boundary, file ownership, tests, pre-mortem, and ADR.
- Existing contracts: no second Run/Queue/History/Assets authority; real persistence is deferred.

## Resolved material decisions

- Pass means one explicit fixture selection followed by simulated handoff only.
- Selection, queue, and read-back fixture data are visibly non-authoritative.
- Queue and History links only open the existing unfiltered job-history panel.

## Retained non-goals

No endpoints, provider calls, real persistence, publishing, deployment, dashboard/sidebar, or Comfy core changes.

material-open-items: none
