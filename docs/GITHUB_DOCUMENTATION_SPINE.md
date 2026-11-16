# GitHub Documentation Spine and Rizzoma Synchronization

Status: proposed architecture; the first human-facing design is published and verified, but the synchronizer and cross-project repository have not been implemented.

Last verified: 2026-08-21

## Decision

A private GitHub repository should become the canonical, version-controlled documentation spine for project Markdown. Rizzoma should remain the navigable collaborative view, Tana the cross-project outcome and retrieval index, and `HANDOFF.md` the short-lived operational continuity layer.

This is a one-way authority model:

1. Source artifacts establish measured facts.
2. Canonical Markdown in Git records the reconciled knowledge.
3. Rizzoma projects that knowledge into a human-friendly BLB tree.
4. Tana records concise outcomes and links back to the canonical record.
5. HANDOFF records current state, blockers, and the next operational move.

Direct Rizzoma edits are not a second source of truth. They become proposed Git patches before the next projection.

## Why Git is the missing layer

Rizzoma is excellent for collaborative navigation and progressive disclosure, but it is not a defensible provenance system for a continuously revised research design. Git adds:

- line-level diffs and reviewable changes;
- immutable commit identifiers;
- branches and worktrees for concurrent CLI sessions;
- rollback to a known-good state;
- machine-readable synchronization cursors and receipts;
- secret scanning and structural gates before publication.

The point is not to replace Rizzoma. It is to give Rizzoma a versioned authority behind it.

## Documentation roles

| Surface | Durable role | Must not become |
|---|---|---|
| Source artifacts | Evidence for measurements and technical facts | Unlinked bulk data inside Git |
| GitHub Markdown | Canonical reconciled prose and provenance | A chronological dumping ground |
| Rizzoma Research Design | Human BLB projection of the surviving method | An independently authoritative copy |
| Rizzoma Progress | Chronological conversational projection | The final research design |
| Tana | Compact outcome index across projects | A process transcript |
| HANDOFF | Current state, blockers, and next steps | Long-term canonical documentation |

## Per-project contract

Each managed project should have a stable project identifier and, where applicable, these documents:

- `RESEARCH_DESIGN.md` – the method and design that ultimately survived;
- `PROGRESS.md` – the chronological path, including failed approaches and pivots;
- `DECISIONS.md` – consequential choices, rejected alternatives, and supersessions;
- `EVIDENCE.md` – claim-to-artifact mapping, including files, commits, datasets, URLs, and checksums;
- `sources.yaml` or equivalent metadata – stable source identifiers and discovery metadata.

Front matter should record the project, document role, status, owner, stable document identifier, and last verified date. Large binaries remain in the relevant artifact store and are linked by stable URL and checksum.

## Synchronization protocol

### 1. Capture deltas

The synchronizer reads only material created or changed after the last verified cursor. It classifies each candidate as a decision, method, dataset, tool, result, caveat, supersession, or temporary operational detail.

### 2. Reconcile meaning

New evidence is compared with the current canonical research design. Confirmed additions become scoped patches. Contradictions enter an explicit review queue. Temporary detail stays in Progress or HANDOFF instead of accumulating in the canonical design.

### 3. Review the patch

Every update begins on a dedicated branch or worktree. The proposed change records what changed, why, and which evidence supports it. Structural, link, provenance, and secret-scanning gates must pass before merge.

### 4. Project outward

After merge, verified Markdown is projected into the corresponding Rizzoma branches. Acceptance requires persisted readback of text, links, emphasis, and fold state, a scoped structural probe, and visual inspection of medium-resolution PNGs.

### 5. Advance the cursor

The cursor advances only after Git and Rizzoma agree. A receipt records source identifiers, Git commit, affected Rizzoma nodes, validation results, and timestamps. Failed publication leaves the previous canonical and Rizzoma state intact.

## Authority and inclusion rules

- GitHub Markdown is canonical.
- Credentials and secrets are categorically excluded.
- Temporary transcripts and generated bulk output are excluded unless analytically necessary.
- Personal material belongs only in an explicitly scoped private repository.
- Binaries remain outside Git and are referenced by links and hashes.
- Deletions, contradictions, and structural reorganizations always require review.
- A synchronizer must never attempt automatic two-way reconciliation between independently authoritative copies.

## Operational controls

Concurrent CLI sessions use separate branches or worktrees. A single orchestrator serializes validated merges into the canonical branch, and project-level leases prevent simultaneous projections into the same Rizzoma subtree.

The unattended workflow must expose four distinct health claims:

- process existence;
- fresh heartbeat;
- measurable forward progress;
- verified effect on Git and Rizzoma.

Retries are bounded. Contradictions remain visible. A last-known-good snapshot prevents partial output from replacing correct documentation.

## Pilot repository and receipt-backed recovery

The pilot should use a private repository named `hcss-utils/documentation-spine`. Generic writer code, schemas, and synthetic tests may later be mirrored into the public Rizzoma repository, but real drafts, target URLs, project state, and execution receipts remain private.

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

`main` holds canonical project documentation, schemas, and completed receipts. Each live projection runs on `projection/<project-id>/<run-id>`, created from the exact canonical commit being projected. Per-operation checkpoint commits stay on that branch. On completion, the branch is tagged and a compact final receipt is merged into `main`; runtime churn therefore does not turn the canonical branch into an event database.

The run manifest binds the exact draft hash, depth-contract hash, canonical Git commit, target Rizzoma URL and blip, normalized parent path, writer version, and expected pre-write readback hash. The plan contains stable job IDs derived from the bound run identity, normalized parent path, and rendered job-body hash. Ordinal retry flags such as `--only=18` are forbidden because order is not identity.

After each browser mutation, the writer must persistently read back the affected subtree before appending a checkpoint event. The event records the stable job ID, affected node IDs, rendered readback hash, fold/link/emphasis evidence, timestamp, and result. It is then committed and pushed with an expected remote head; a concurrent writer or changed branch head fails closed.

`--resume` reloads the manifest and events, revalidates every binding, confirms that already-completed effects still exist on the live Rizzoma page, and executes only missing stable job IDs. Any draft, contract, target, parent-path, canonical-commit, or live-tree drift produces `blocked_drift`; it is never silently reconciled. A final receipt is issued only after full persisted readback, scoped structure probing, fold/link/emphasis checks, and human inspection of medium-resolution PNGs.

GitHub Actions validates schemas, hashes, source-ID coverage, stable-job uniqueness, receipt completeness, and secret exclusions. It does not drive the authenticated Rizzoma browser. A supervised local Windows-CDP orchestrator remains the sole executor and GitHub remains its durable control plane.

The first test must use a disposable Rizzoma blip: intentionally stop after two jobs, restart with `--resume`, and prove that completed jobs are not duplicated and the final receipt covers the complete subtree.

## Adoption path

1. Select one mature project with rich Progress and Research Design histories.
2. Run several cycles in proposal-only mode.
3. Compare each machine-proposed patch with the patch a human would have made.
4. Measure source coverage, false additions, missed supersessions, receipt completeness, and Rizzoma projection fidelity.
5. Automate only low-risk additions after the pilot meets explicit thresholds.
6. Keep contradictions, deletions, and structural changes under human review.
7. Expand project coverage only after receipts remain complete and reproducible.

## Published human-facing version

The first BLB rendering is live in the [GitHub documentation proposal blip](https://rizzoma.com/topic/62d6bdc5ec1c533e13df57763219272c/0_b_cjjg_cpovf/).

Acceptance on 2026-08-21 measured:

- 82 expected nodes and 82 persisted nodes;
- no missing, extra, or mismatched nodes;
- 24 of 24 threads folded by default;
- maximum rendered depth 4;
- two rendered hyperlinks and no visible raw URLs;
- all three emphasis tiers present;
- structural gate pass;
- four 1366 × 900 PNG views visually inspected, with no empty first lines or obvious structural breakage.

## Honest boundary

This document records a decision and an accepted Rizzoma design. It does not claim that the private cross-project repository, ingest pipeline, reconciliation model, merge orchestrator, receipts ledger, or pilot have been implemented. Those are the next engineering phase.
