# Original rizzoma.com vs. my "joke" depth-N implementation (2026-05-05)

User logged me into rizzoma.com and pointed me at the [Try topic](https://rizzoma.com/topic/8738c4e1a37aa1118ff3f6318b086734/0_b_ck1g_cp839/) (a sandbox safe to add content to). I drove the original Rizzoma editor end-to-end via Playwright to build a depth-3 fractal AND took screenshots of every state, so I could honestly compare against my own implementation.

## What's in this folder (chronological)

| File | What it shows |
|---|---|
| `00-rizzoma-com-before-anything_old-260505.png` | Topic landed on, empty body, view mode |
| `01-rizzoma-com-view-mode_old-260505.png` | Topic in view mode (after re-load) |
| `02-rizzoma-com-edit-mode-entered_old-260505.png` | After Ctrl+E, edit toolbar visible (full ~14 controls) |
| `03-rizzoma-com-3-bulleted-labels-typed_old-260505.png` | 3 disc-bulleted labels typed under "Try" title — extreme density (3 labels in ~50px) |
| `04-rizzoma-com-after-ctrl-enter-on-first_old-260505.png` | Ctrl+Enter on label 1 → inline depth-1 subblip created with its own toolbar, anchored INLINE |
| `05-rizzoma-com-subblip-with-3-bullets_old-260505.png` | depth-1 subblip filled with 3 bulleted labels |
| `06-rizzoma-com-depth2-subblip-created_old-260505.png` | Ctrl+Enter on Subblip 1.A → depth-2 inline subblip, both toolbars visible |
| `07-rizzoma-com-depth3-with-content_old-260505.png` | depth-3 subblip created with 2 bulleted labels — THREE LEVELS OF NESTED EDIT-MODE TOOLBARS visible at once |
| `08-rizzoma-com-after-done-view-mode-fractal_old-260505.png` | After Done attempts (some still in edit mode) |
| `09-rizzoma-com-final-view-mode-fractal_old-260505.png` | Final view-mode rendering of the depth-3 fractal — ALL 3 LEVELS rendered in ~440px |

## How original rizzoma.com differs MASSIVELY from my "depth-10 fractal" implementation

I'd been smug yesterday about my depth-10 fractal fixture passing the visual sweep gate. Driving the actual rizzoma.com directly, the differences are not subtle. Honest list, ordered by how badly mine compares:

### 1. Density per blip — mine is ~3× taller per item

- **Original**: ~30px per blip. Three nested levels fit in 200-440px total.
- **Mine**: ~80px per blip. Avatar + author + date + "Write a reply..." input box reserved at every level. Same content takes 600+px vertical.
- Effect: original lets you see ~30 items on one screen; mine maybe 8.

### 2. Backgrounds — mine looks like floating card panels

- **Original**: each expanded subblip is a SUBTLY shaded box with thin grey vertical guide lines on the left margin. Reads as "structure", not "container".
- **Mine**: solid lavender/light-blue rounded-corner boxes with visible borders. Reads as "card stack" — each level looks like a separate widget, not a continuation of the bullet hierarchy.

### 3. Bullet markers — different convention

- **Original**: disc (•) at every level, all the way down. Indentation alone signals depth.
- **Mine**: disc → circle → square progression per nesting level (the standard CSS `list-style-type` cascade).
- Hard to call mine "wrong" — it's the conventional HTML/CSS expectation. But it's a deliberate departure from rizzoma.com.

### 4. Inline-subblip marker — `[+]` vs `[💬]`

- **Original**: when a label has an inline subblip attached, the marker is a small chat-bubble glyph `[💬]` after the label. Clicking it expands the subblip inline.
- **Mine**: small `[+]` / `[-]` text glyph in a gray pill background.
- Differ in semantic intent: rizzoma.com's `[💬]` says "there's a comment here", mine's `[+]` says "there's an expandable section here".

### 5. Toolbar — visible per active blip in original

- **Original**: full ~14-control edit toolbar appears INLINE above the currently-active blip being edited (Done | undo/redo | link | attach | image | B | I | U | S | color | format-clear | bullet | numbered | Hide | trash | gear). Same toolbar at every depth, just attached to whatever blip you're editing.
- **Mine**: compact 5-button toolbar (`Done | 💬 | 💬+ | 🔗 | ⚙️`) — most formatting controls missing. (Filed earlier as toolbar-parity gap.)

### 6. "Write a reply..." input — once per expansion vs. always

- **Original**: a thin "Write a reply..." input shows ONLY at the bottom of an expanded blip, ~20px tall, only when the blip is in edit mode AND has been opened by the user.
- **Mine**: similar input persistently rendered for every expanded blip at every level, taking 30-40px each. Adds up to a lot of vertical noise at depth.

### 7. Date/time display

- **Original**: full time `12:18 AM`, `12:19 AM`, `12:20 AM` — minute precision.
- **Mine**: month abbreviation `May 2026` — coarse-grained.
- Original is more useful when scanning a discussion for "when was this said".

### 8. `Done` cascade behavior

- **Original**: clicking `Done` on the deepest subblip closes its edit mode AND pops the focus up to the parent's edit mode (still open). Each level has its own `Done`.
- **Mine**: clicking `Done` on an inner blip closes both itself AND the outer (cascade close). User has to re-enter edit mode at parent if they wanted to keep editing it. (Documented in CLAUDE.md memory M5.)

### 9. URL state per subblip

- **Original**: each inline subblip update advances the URL (`/topic/<wave>/0_b_ck1g_cp839/` → `cp83b` → `cp83c` → `cp83d`). Deep-links work to any specific subblip.
- **Mine**: URL stays at the topic root; subblip identity isn't reflected in the URL. Sharing a sub-conversation requires copying the blip id manually.

### 10. Active blip's render is the same component as inactive — original

- **Original**: the active subblip renders WITH its own complete edit toolbar PLUS its body PLUS its sibling tree below it, all in one continuous rendered subtree. No separate "card" wrap, no portal.
- **Mine**: active subblip is rendered via React `createPortal` into an inline-child-portal anchor. The wrapping `<div className="inline-child-expanded">` styles it as a separate panel.
- Effect on visual fidelity: my portal wrap is a structural choice that produces the "card stack" look noted in #2.

## Honest tally

My implementation **functionally** captures BLB:
- Inline subblip creation via Ctrl+Enter ✓
- Recursive nesting (depth-10 verified by my fixture) ✓
- Per-level bullet hierarchy ✓
- [+] expansion working in both view AND edit mode (after the #47 fix) ✓
- Auto-save ✓
- Content persists across save/reload ✓

My implementation **stylistically** is far from parity:
- ~3× too tall per blip (#1)
- Card-stack look vs. inline-bullet-continuation look (#2, #10)
- Reduced toolbar (#5)
- Persistent reply input padding (#6)
- Coarse date display (#7)
- Cascade-close Done behavior (#8)
- No URL-per-subblip (#9)

The "fractal blip editing is awful" complaint that triggered all of yesterday's work was substantially correct on the stylistic axis. The functional fixes I shipped (#47 unified portal, view-mode CSS for bullets, OAuth) are real improvements but they don't move the needle on visual fidelity vs. rizzoma.com.

## What I'd file next (out of scope for tonight)

- **GH #50** (visual-density parity): reduce per-blip vertical to ≤40px by suppressing the "Write a reply..." input until user clicks into the blip + collapsing the avatar+date row to a single line.
- **GH #51** (background parity): replace the lavender card panels with subtle vertical guide lines on the left margin of the indented subtree.
- **GH #52** (toolbar parity): expose the full ~14-control toolbar on every active blip (continues the #47 line of work).
- **GH #53** (bullet-marker convention): switch to disc-only at every level OR document why we deliberately use disc/circle/square cascade.
- **GH #54** (Done semantics): change Done on a subblip to keep parent's edit mode open.

## Reproducing this comparison

```bash
# 1. Authenticate the Playwright MCP browser to rizzoma.com (one-time):
#    Open the MCP-controlled Chrome and sign in via Google.
# 2. Drive the rizzoma.com editor via Playwright run_code_unsafe:
#    See the screenshots' chronology — each was preceded by a JS+keyboard
#    interaction sequence. The full sequence is in this conversation transcript
#    (Claude session 2026-05-05).
```
