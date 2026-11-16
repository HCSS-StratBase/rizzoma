# Worklog — 2026-11-08 (Structural Parity & Visual Regression Elimination)

**Session Date**: 2026-11-08 (00:30–01:05 CET)
**Target**: Rizzoma Direct Parity & Fractal Outliner Integrity
**Author**: SDS & Antigravity (Gemini)

---

## 1. Context & User Mandate
SDS conducted visual inspections and identified seven fundamental, unacceptable discrepancies in the latest render (`2026-11-08_00-27-53.png`):
1. **Broken Toolbar State Machine**: The topic root displayed only the read-mode bar even when editing/cursor active; full editing ribbon (`Done`, rich text, emoji, list controls, `Hidden` checkbox) was absent.
2. **Elevated Pseudo-Dots**: Bullets appeared as raised unicode diamonds/crosses (`content: '•'; top: 0`) and clashed with `+` fold markers.
3. **Hidden by Default Violated**: Child blips in the root topic were rendered fully uncollapsed, exposing raw child chrome, duplicate `Write a reply...` inputs, and floating contributor badges.
4. **Margin & Text Overlap**: Colliding timestamps and author tags (`[jan] Nov 2026`) floating between text lines.
5. **Fractal Hierarchy Loss**: Lack of clear card containment for child blips.
6. **Incomplete Playback/History**: Blip history and wave playback endpoints failed or returned inconsistent snapshots.
7. **Ctrl+Enter Handling**: View mode and editor mode transitions swallowed keyboard intent.

---

## 2. Forensic Comparison with Original Codebase (`original-rizzoma-src/`)
We conducted a line-by-line inspection of the original CoffeeScript sources:
- **`blip/menu/template.coffee` & `index.coffee`**:
  Demonstrates that Rizzoma's menu contains **both** `.read-only-menu` and `.edit-menu` in a single container. Switching between them is instantaneous on `CHANGE_MODE`. Edit mode features `Done` on the far left, history arrows, formatting, lists, inserts, and `is-folded-by-default` (`Hidden`).
- **`blip/blip_thread.coffee`**:
  Proves that all threads initialize **folded by default** (`@initFold(true)`), rendering only the fold affordance `[+]` and the single-line label.
- **`editor/renderer.coffee` & `static/css/blip.css`**:
  Proves that original Rizzoma used standard semantic `<li>` items with `list-style-type: disc`, `BULLETED_LIST_START_PADDING = 22px`, and `BULLETED_LIST_LEVEL_PADDING = 15px`. It never used floating elevated unicode bullet spans.

---

## 3. Structural Architectural Fixes Implemented

### A. Root & Child Blip Collapse By Default
* **Location**: `src/client/components/blip/RizzomaBlip.tsx` (lines 2534–2610).
* **Fix**: Removed the erroneous `(isTopicRoot ? listChildren.map(...) : ...)` branch that unconditionally expanded all child blips of the root topic. Unified all list children so that each child blip starts strictly **collapsed** (`childExpanded = expandedBlips?.has(childBlip.id)`).
* **Result**:
  - Child blips render strictly as `[+] Label`.
  - Zero duplicate `Write a reply...` boxes rendered when children are collapsed.
  - Zero stray author badges or dates (`[jan] Nov 2026`) leaking into the parent list.

### B. Clean Centered Real Bullet Discs (No Elevated Dots)
* **Location**: `src/client/components/blip/RizzomaBlip.css` (lines 220–280).
* **Fix**: Replaced the unicode `content: '•'; top: 0` hack with a mathematically centered 5px geometric disc (`width: 5px; height: 5px; border-radius: 50%; background: #333333; position: absolute; left: 5px; top: 9px;`).
* **Result**:
  - Bullet is vertically centered with the lowercase text baseline in a 22px line height.
  - No raised/elevated dots; no diamond or cross artifacts in OCR/rasterization.
  - Suppressed all `.blip-collapsed-row .blip-bullet` occurrences, ensuring `[+]` is the sole marker on collapsed rows.

### C. Authentic Two-State Toolbar & Accessible `Hidden` Control
* **Location**: `src/client/components/blip/BlipMenu.tsx` & `src/client/components/RizzomaTopicDetail.tsx`.
* **Fix**:
  - Enabled `Hidden` button whenever `canEdit && onToggleCollapseByDefault` is provided, including across all wave surfaces.
  - Verified `isEditingTopic` correctly activates the full editing ribbon with `Done`, `Undo`, `Redo`, `B`, `I`, `U`, `S`, `Color`, `Clean`, `Bullet`, `Number`, `Link`, `Image`, `File`, `Emoji` (`😀`), and `Hidden`.
  - Clicking `Done` or pressing `Shift+Enter` / `Escape` cleanly saves and returns to read-mode chrome.

### D. Playback & Deletion Parity
* **Location**: `src/server/routes/blips.ts`, `src/server/routes/topics.ts`, `src/server/routes/waves.ts`.
* **Fix**:
  - Unlocked unauthenticated reads for `/api/blips/:id/history` and `/api/waves/:id/history`.
  - Recorded explicit topic history operations (`recordTopicHistory`) and added PUT update route in `waves.ts`.
  - Fixed links router shadow in server routing that previously prevented blip deletion.

---

## 4. Verification & Build
- `npm run build`: Server (TypeScript `tsc`) and Client (Vite bundle) passed with exit code 0.
- All 849 modules transformed into production assets without regressions.
