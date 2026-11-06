---
doc_id: rizzoma-wiki-ver-gates-sweeps-and-deployment
title: "Verification & Deployment — Visual Sweep Gates, Handbuild Acceptance, and VPS Topology"
version: 1.0.0
status: active
owner: Stephan De Spiegeleire (SDS)
last_verified: 2026-11-06
source_branch: feature/native-fractal-port
source_commit: 12984319
edges:
  - type: requires
    target: ../subsystems/blb-and-editor-invariants.md
  - type: requires
    target: ../subsystems/server-collab-and-storage.md
  - type: elaborates
    target: ../decisions/contradictions-and-lint-findings.md
---

# Verification & Deployment — Visual Sweep Gates, Handbuild Acceptance, and VPS Topology

**¶1** □ Modernized Rizzoma enforces a strict **receipt-and-screenshot verification architecture** (`docs/VISUAL_SCREENSHOT_SWEEP.md:1-57`, `docs/GITHUB_DOCUMENTATION_SPINE.md:1-110`) paired with a **two-lane live/staging Hetzner VPS topology** (`STATUS.md:14-27`). No UI or fractal-rendering change may be declared complete from unit tests or code inspection alone.

---

## 1. VPS Deployment & Gate Topology (`Continuant` — `graph TD`)

```mermaid
graph TD
    subgraph HETZNER["Hetzner VPS (138.201.62.161 — /data/large-projects/stephan/rizzoma_260612)"]
        NGINX["Host nginx Reverse Proxy (:443 SSL)"]
        PROD_FE["Prod Frontend: Vite :3000 (138-201-62-161.nip.io)"]
        PROD_BE["Prod Backend: nohup tsx :8000"]
        DEV_FE["Staging Frontend: Vite :3100 (dev.138-201-62-161.nip.io)"]
        DEV_BE["Staging Backend: tsx :8100 (rizzoma-dev.service)"]
        DOCKER_DB["Docker: CouchDB :5984 + Redis :6379"]
    end

    subgraph VER_SUITES["Verification & Gate Scripts (scripts/)"]
        GEN_STATUS["scripts/gen_status.mjs -> STATUS.md"]
        HB_ACC["scripts/handbuild_acceptance.mjs (28 Behavioral Checks)"]
        VIS_SWEEP["scripts/visual-feature-sweep.mjs (133 Viewports/States)"]
        VIS_COV["scripts/visual-feature-coverage.mjs"]
        PAR_GATE["scripts/check-rizzoma-parity-gate.mjs"]
        WIKI_LINT["scripts/wiki_lint.py (Wiki + Security Audit)"]
    end

    NGINX -->|138-201-62-161.nip.io| PROD_FE
    NGINX -->|/api & /socket.io| PROD_BE
    NGINX -->|dev.138-201-62-161.nip.io| DEV_FE
    NGINX -->|dev /api| DEV_BE
    PROD_BE --> DOCKER_DB
    DEV_BE --> DOCKER_DB
    HB_ACC -->|tests against| DEV_FE
    VIS_SWEEP -->|captures PNGs from| DEV_FE
    VIS_COV -->|audits| VIS_SWEEP
    PAR_GATE -->|enforces| VIS_COV
```

---

## 2. Three-Stage Verification & Promotion Pipeline (`Occurrent` — `graph LR`)

```mermaid
graph LR
    EDIT_CODE["Edit Code in /mnt/c/Rizzoma"] --> UNIT_TEST["npm test (Vitest Unit Suite)"]
    UNIT_TEST --> HANDBUILD["node scripts/handbuild_acceptance.mjs (28 BLB Checks)"]
    HANDBUILD --> SWEEP["npm run visual:sweep -> visual:coverage -> parity:gate"]
    SWEEP --> GEN_STAT["npm run status:gen (Updates STATUS.md + docs/data/status.json)"]
    GEN_STAT --> WIKI_CHK["python3 scripts/wiki_lint.py (Zero Orphans / Broken Links / Leaks)"]
    WIKI_CHK --> PROMOTE["Deploy to Staging (:3100/:8100) -> Verify -> Promote to Prod (:3000/:8000)"]
```

---

## 3. Verification Gates & Scripts

### 3.1 `scripts/handbuild_acceptance.mjs` (The 28-Check Behavioral Gate)
- **¶2** □ [`scripts/handbuild_acceptance.mjs`](file:///mnt/c/Rizzoma/scripts/handbuild_acceptance.mjs) drives a real browser through creating a topic, adding multi-level inline child blips (`L1` → `L2` → `L3` → `L4`), folding/unfolding `[+]` markers, verifying single-active-editor handoff, testing `Ctrl+Enter` inline replies, and checking DOM order (`docs/NATIVE_RENDER_PORT_PLAN.md:115-140`).
- **¶3** ◇ Setting `HB_RENDER=native` runs the exact same 28 checks against `?render=native` (`src/client/components/RizzomaTopicDetail.tsx:1223-1262`). Phase 5 cutover is gated on `HB_RENDER=native node scripts/handbuild_acceptance.mjs` passing `28/28`.

### 3.2 Three-Layer Visual Parity Gate (`visual:sweep` → `visual:coverage` → `parity:gate`)
- **¶4** □ Documented in `docs/VISUAL_SCREENSHOT_SWEEP.md:1-57`:
  1. `npm run visual:sweep` (`scripts/visual-feature-sweep.mjs`): Captures 133 deterministic screenshots across desktop/mobile viewports and light/dark themes into `screenshots/sweep/`.
  2. `npm run visual:coverage` (`scripts/visual-feature-coverage.mjs`): Verifies every `[BOTH]` and `[NEW]` item in `docs/BLB.md` has corresponding screenshot coverage.
  3. `npm run parity:gate` (`scripts/check-rizzoma-parity-gate.mjs`): Fails if any visual regression or missing state is detected.

### 3.3 Auto-Generated Status Spine (`scripts/gen_status.mjs`)
- **¶5** □ [`scripts/gen_status.mjs`](file:///mnt/c/Rizzoma/scripts/gen_status.mjs) generates `STATUS.md` and `docs/data/status.json` from live git state, test counts, and sweep results (`docs/GITHUB_DOCUMENTATION_SPINE.md:1-90`). Never hand-edit the generated regions of `STATUS.md`; edit `scripts/gen_status.mjs` and run `npm run status:gen`.

### 3.4 Pre-Edit Hook Gate (`rizzoma-app-docs-gate.sh`)
- **¶6** □ Any agent editing `/mnt/c/Rizzoma/` is gated by `~/.claude/hooks/rizzoma-app-docs-gate.sh` (Gate #47), which requires reading `CLAUDE.md`, `STATUS.md`, `docs/ARCHITECTURE.md`, `docs/BLB.md`, `docs/NATIVE_RENDER_PORT_PLAN.md`, `docs/VISUAL_SCREENSHOT_SWEEP.md`, `docs/GITHUB_DOCUMENTATION_SPINE.md`, and `docs/ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md` in the current session before mutating code.
