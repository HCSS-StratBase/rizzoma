---
doc_id: rizzoma-wiki-index
title: "Modernized Rizzoma — LLM Wiki Master Index"
version: 1.0.0
status: active
owner: Stephan De Spiegeleire (SDS)
last_verified: 2026-11-07
source_branch: feature/native-fractal-port
source_commit: a4d4d583
---

# Modernized Rizzoma — LLM Wiki Master Index (`wiki/index.md`)

**¶1** □ This is the **entry-point catalog** for the `/mnt/c/Rizzoma` compounding LLM Wiki (`Layer 2`). Read this index **first** at the start of any Rizzoma engineering session alongside `CLAUDE.md` and `STATUS.md`. Every wiki page carries BFO dual-axis Mermaid diagrams (`Continuant TD` + `Occurrent LR`), `¶` paragraph anchors, deontic modalities (`□` obligatory invariant, `◇` optional flag, `▷` planned phase target), and exact `file:line` ground-truth citations into `src/`.

---

## 1. Constitutional Schema & Operations

| Page | Modality | Last Verified | Summary |
|---|---|---|---|
| [`SCHEMA.md`](SCHEMA.md) | `□` | `2026-11-06` | Three-layer architecture (`src/` ground truth → `wiki/` synthesis → `SCHEMA.md`), `Ingest`/`Query`/`Lint` operations, BFO `TD`/`LR` rules, and `codegraph` workflow. |
| [`log.md`](log.md) | `□` | `2026-11-06` | Append-only chronological record of wiki initializations, code/spec ingestions, and mechanical lint runs. |

---

## 2. Architecture (`wiki/architecture/`)

| Page | Modality | Last Verified | Summary |
|---|---|---|---|
| [`architecture/content-array-vs-react-hybrid.md`](architecture/content-array-vs-react-hybrid.md) | `□` | `2026-11-06` | Structural (`TD`) and runtime (`LR`) comparison of original Rizzoma's flat `ContentArray` + linear `renderContent()` walk (`src/client/native/`) against the 7-layer React/TipTap portal hybrid (`RizzomaBlip.tsx`, `InlineHtmlRenderer.tsx`, `BlipThreadNode.tsx`) and its 12 failure seams. |

---

## 3. Subsystems (`wiki/subsystems/`)

| Page | Modality | Last Verified | Summary |
|---|---|---|---|
| [`subsystems/native-render-port.md`](subsystems/native-render-port.md) | `□` / `▷` | `2026-11-06` | Complete module-by-module guide to all 12 files (`2,185 LOC`) in `src/client/native/` (`types.ts`, `parser.ts`, `serializer.ts`, `content-lookup.ts`, `renderer.ts`, `blip-thread.ts`, `blip-view.ts`, `wave-view.ts`, `blip-editor-host.ts`, `tiptap-adapter.ts`, `yjs-binding.ts`, `awareness.ts`) plus `NativeWaveView.tsx` and Phase 1–5 status. |
| [`subsystems/blb-and-editor-invariants.md`](subsystems/blb-and-editor-invariants.md) | `□` | `2026-11-06` | Normative `[BOTH]` / `[OLD]` / `[NEW]` invariants from `docs/BLB.md`: imposed `<ul><li>` bullets (`ensureBulletedBody`), single active editor per wave (`rizzoma:active-blip-claim` / `BlipEditorHost`), `Ctrl+Enter` inline child creation, and folded `[+]` markers. |
| [`subsystems/server-collab-and-storage.md`](subsystems/server-collab-and-storage.md) | `□` | `2026-11-06` | Express 5 backend (`src/server/app.ts`), CouchDB Mango views & 13 indexes (`src/server/lib/couch.ts`), Socket.IO + Y.js CRDT state cache (`socket.ts`, `yjsDocCache.ts`, `editorPresence.ts`), OAuth/SAML auth, unread watermarks, and ClamAV upload scanning. |

| [`subsystems/legacy-visual-parity.md`](subsystems/legacy-visual-parity.md) | `□` / `▷` | `2026-11-07` | The 21 commits of 6–7 Nov: legacy chrome, blip edit mode and Done bar, TipsBox, pixel-comparison scripts. Post-change gate result not yet filed. |
| [`reference-doc-catalog.md`](reference-doc-catalog.md) | `□` | `2026-11-07` | Every non-spine doc (features contract, QUICKSTART, VPS deployment, toolbar parity, projection ledger, worklogs, the superseded Drive repo) and how far to trust it. |

---

## 4. Verification & Deployment (`wiki/verification/`)

| Page | Modality | Last Verified | Summary |
|---|---|---|---|
| [`verification/gates-sweeps-and-deployment.md`](verification/gates-sweeps-and-deployment.md) | `□` | `2026-11-06` | `scripts/handbuild_acceptance.mjs` (28 checks), the 3-layer visual parity gate (`visual:sweep` → `visual:coverage` → `parity:gate`), `scripts/gen_status.mjs` → `STATUS.md`, `rizzoma-app-docs-gate.sh`, and the Hetzner VPS Prod (`:3000`/`:8000`) vs. Staging (`:3100`/`:8100`) topology. |

---

## 5. Decisions, Contradictions & Audits (`wiki/decisions/`)

| Page | Modality | Last Verified | Summary |
|---|---|---|---|
| [`decisions/contradictions-and-lint-findings.md`](decisions/contradictions-and-lint-findings.md) | `□` | `2026-11-06` | Active doc-vs-code contradictions (`?render=native` vs comment, `QUICKSTART.md` vs host `tsx`/`vite`), open Phase 1→Phase 2 gaps (`content-lookup.ts:71-76` inline anchor synthesis, `MemoryStore` session resets), and baseline `secure-agents` security audit. |

---

## 6. Quick Commands for Agents

- **Mechanical Wiki + Security Lint**:
  ```bash
  python3 /mnt/c/Rizzoma/scripts/wiki_lint.py
  ```
- **CodeGraph AST Call-Graph & Blast-Radius Queries**:
  ```bash
  ~/.local/bin/codegraph status /mnt/c/Rizzoma
  ~/.local/bin/codegraph context "wire BlipEditorHost into NativeWaveView" --path /mnt/c/Rizzoma
  ~/.local/bin/codegraph callers renderContent --path /mnt/c/Rizzoma
  ~/.local/bin/codegraph impact buildNativeContentLookup --path /mnt/c/Rizzoma
  ```

---

## 6. Reference catalogs (generated — `python3 scripts/wiki_generate_catalogs.py`)

| Page | Modality | Last Verified | Summary |
|---|---|---|---|
| [`reference/legacy-screenshots.md`](reference/legacy-screenshots.md) | `□` | `2026-11-07` | **Start here for any UI work.** Pointer to the 126 original-Rizzoma reference screenshots (each with its own `.md` description), section counts, and every image linked by name. |
| [`reference/screenshot-folders-catalog.md`](reference/screenshot-folders-catalog.md) | `□` | `2026-11-07` | All 60 folders under `screenshots/`: image counts, kind (legacy reference / comparison / our sweeps), description files. |
| [`reference/source-map.md`](reference/source-map.md) | `□` | `2026-11-07` | Every code file under `src/` (client, server, shared, types, tests) with length and header. |
| [`reference/scripts-catalog.md`](reference/scripts-catalog.md) | `□` | `2026-11-07` | Every file in `scripts/`, every npm script, every project hook. |
| [`reference/docs-inventory.md`](reference/docs-inventory.md) | `□` | `2026-11-07` | Every markdown doc outside `wiki/` and `screenshots/`, with title and status line. |
| [`reference/assets-and-snapshots.md`](reference/assets-and-snapshots.md) | `□` | `2026-11-07` | `public/` (legacy sprites under `public/s/`), `snapshots/`, root files. |

**¶ Coverage rule** □ `python3 scripts/wiki_coverage.py` fails when any code file, script, doc, legacy image or screenshot folder is not mentioned by name in `wiki/`. Run the generator, then the check, after adding files.
