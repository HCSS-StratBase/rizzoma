# Resumable Projection Ledger

Status: implementation proposal

Last verified: 2026-08-21

Proposed BLB label: **Resumable projection ledger**

Live attributed label: **[GPT-5.6 Sol · Codex] Resumable projection ledger**

## Decision

Rizzoma publication should become resumable through durable content identity and verified-effect receipts, not through an ordinal retry switch such as `--only=18`. GitHub should be the durable control plane. The authenticated Windows CDP browser remains the executor because GitHub Actions cannot safely inherit the interactive Rizzoma session.

The private pilot repository should be `hcss-utils/documentation-spine`. The existing private repositories `hcss-utils/agentic-documents`, `hcss-utils/rizzoma-playback`, and `hcss-utils/rizzoma` solve different problems and should not be repurposed into the ledger.

## Why ordinal recovery is unsafe

An ordinal identifies a position in one rendering of a plan. It does not identify the intended effect. An inserted or reordered job can make “job 18” refer to different content while the command still appears valid.

A resumable writer instead needs a stable job identity derived from:

- the bound run identity;
- the normalized parent path;
- the rendered job-body hash.

The bound run identity includes the canonical Git commit, source-draft hash, depth-contract hash, target topic and blip, writer version, and expected pre-write tree hash. If any binding changes, the previous receipt cannot authorize a continuation.

## Repository topology

```text
documentation-spine/
├── README.md
├── schemas/
│   ├── project.schema.json
│   ├── projection-manifest.schema.json
│   ├── checkpoint-event.schema.json
│   └── final-receipt.schema.json
├── projects/<project-id>/
│   ├── project.yaml
│   ├── RESEARCH_DESIGN.md
│   ├── PROGRESS.md
│   ├── DECISIONS.md
│   ├── EVIDENCE.md
│   ├── sources.yaml
│   └── projections/rizzoma.yaml
├── runs/<project-id>/<run-id>/
│   ├── manifest.json
│   ├── plan.json
│   ├── events.jsonl
│   ├── checkpoint.json
│   └── receipt.json
├── tools/
│   ├── build_projection_plan.py
│   ├── validate_projection_run.py
│   └── resume_projection.py
├── tests/fixtures/
└── .github/workflows/validate.yml
```

### Canonical branch

The protected `main` branch contains schemas, canonical project documentation, projection declarations, and completed compact receipts. It must not become a high-frequency runtime event database.

### Projection branches

Every execution starts from the exact canonical commit and receives its own `projection/<project-id>/<run-id>` branch. The branch contains the bound manifest, deterministic plan, append-only events, and derived checkpoint. Per-operation commits stay on that branch.

After final acceptance, the detailed branch is tagged and retained. A compact final receipt is merged into `main`, preserving canonical discoverability without filling its history with heartbeat or checkpoint churn.

## Run manifest

The manifest is immutable after the first browser mutation. It records:

- schema and writer versions;
- project and run identifiers;
- canonical Git commit;
- draft and depth-contract SHA-256 hashes;
- exact Rizzoma topic URL and target blip identifier;
- normalized parent path;
- expected pre-write readback hash;
- creation time and executor identity.

A changed manifest creates a new run. Editing the manifest in place after effects have landed would sever the proof connecting the intended tree to the persisted one.

## Deterministic plan

`plan.json` contains every intended operation in parent-before-child order. Each operation has a stable job ID computed from the manifest identity, normalized parent path, operation type, and rendered body hash. The plan also records dependencies, expected preconditions, and the source-point identifiers covered by the operation.

Two identical effects in different parents remain distinct because the normalized path participates in identity. An unrelated insertion elsewhere does not change an existing job ID because list position does not participate.

## Verified-effect event stream

The writer may append a successful event only after a fresh persisted-page read confirms the intended effect. Sending a click or receiving a successful browser call is not enough.

Every `events.jsonl` record includes:

- stable job ID and sequence number;
- attempted and verified timestamps;
- affected Rizzoma node identifiers;
- rendered readback hash;
- observed parent path;
- fold, link, and emphasis evidence where relevant;
- executor and writer versions;
- result or classified failure.

The derived `checkpoint.json` summarizes the latest verified event, completed job IDs, next eligible jobs, and current branch head. It can be rebuilt from the append-only event stream and is therefore not the primary evidence.

## Resume algorithm

`--resume` performs these steps before any new mutation:

1. Load and validate the manifest, plan, events, and checkpoint.
2. Confirm the source branch and expected Git head.
3. Recompute all manifest and plan hashes.
4. Read the live target subtree from Rizzoma.
5. Reconfirm every completed effect by stable job ID and persisted readback evidence.
6. Execute only dependency-ready jobs that have no verified success event.
7. Repeat persisted readback and checkpoint publication after every effect.

The writer reports `blocked_drift` and stops when it detects a changed draft, contract, canonical commit, target, parent path, branch head, or completed live effect. It never silently reinterprets the old receipt against new content.

## Concurrency

Only one orchestrator may hold the project projection lease. Every checkpoint push must compare the expected remote branch head with the actual head. A mismatch indicates another writer or an out-of-band change and fails closed.

Normal Git fast-forward pushes are sufficient when the lease is valid. Force-pushing checkpoint history is prohibited because it would erase execution evidence.

## Executor boundary

The supervised local Windows-CDP process owns browser mutation and persisted visual readback. Its responsibilities are:

- use the authenticated Rizzoma tab;
- execute the canonical recursive writer;
- read back each effect from a fresh page;
- append and push checkpoint evidence;
- expose heartbeat, progress, and verified-effect state;
- stop on bounded retries or drift.

GitHub Actions owns deterministic validation only:

- JSON-schema validation;
- manifest and plan hash checks;
- stable-job uniqueness;
- source-point coverage;
- receipt completeness;
- secret and forbidden-artifact checks.

Actions must never receive Rizzoma cookies, browser profiles, OAuth tokens, or local session state.

## Final receipt

The immutable `receipt.json` is issued only when:

- every planned job has a verified success event;
- the complete persisted subtree matches the bound contract;
- the scoped structure probe passes;
- all intended child threads are Hidden by default;
- links and all three emphasis tiers survive readback;
- medium-resolution PNGs have been inspected;
- the final Rizzoma tree hash and Git heads are recorded.

The receipt points to screenshot hashes and durable artifact URLs rather than storing large image binaries in Git.

## Security and repository separation

Real topic URLs, project drafts, manifests, and receipts remain in the private documentation-spine repository. Credentials, cookies, browser profiles, session-state files, and generated bulk captures are excluded categorically.

Generic schemas, validators, fixture data, and reusable writer code may later be mirrored into the public `HCSS-StratBase/rizzoma` repository after synthetic tests and secret scanning. Public code must not depend on private receipts to run its test suite.

## Pilot

The first live test must target a disposable Rizzoma blip and use a deterministic five-job tree:

1. Start the projection and allow exactly two verified jobs to land.
2. Terminate the executor without running cleanup.
3. Restart through `--resume` using the same manifest and branch.
4. Prove that the first two jobs are recognized rather than duplicated.
5. Complete the remaining three jobs.
6. Verify the final tree, Hidden state, links, emphasis, screenshots, event stream, and receipt.

The test fails if it produces a duplicate node, advances without persisted readback, accepts drift, loses an event, rewrites history, or emits a receipt with incomplete evidence.

Only after this controlled interruption passes should the system backfill the currently incomplete benchmark branch or manage a real documentation projection.

## Honest boundary

This proposal specifies the repository, identity model, event ledger, resume semantics, executor boundary, and pilot acceptance test. It does not claim that the private repository, schemas, resume implementation, or live pilot already exist.

## Related records

- [GitHub documentation spine](https://github.com/HCSS-StratBase/rizzoma/blob/feature/native-fractal-port/docs/GITHUB_DOCUMENTATION_SPINE.md)
- [Design commit](https://github.com/HCSS-StratBase/rizzoma/commit/62299d48)
- [Live Rizzoma proposal](https://rizzoma.com/topic/62d6bdc5ec1c533e13df57763219272c/0_b_cjjg_cpovf/)
