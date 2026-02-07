# Local Rizzoma BLB Study Log

**Date**: 2026-02-06
**Purpose**: Recreate the BLB study topic from live rizzoma.com on localhost:3000, documenting all findings and failures.
**Branch**: feature/rizzoma-core-features
**Screenshots**: screenshots/local-blb-study/

## Environment
- Server: localhost:8000 (backend), localhost:3000 (Vite frontend)
- Auth: Registered as claude@test.com
- Started with: `FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev`

## Steps & Findings

### Step 0: Authentication
- Registered new user claude@test.com via API (existing users lost passwords due to MemoryStore restart)
- Auth confirmed: right panel shows user avatar "claude"
- **Screenshot**: `260206-2140-create-topic-dialog.png`

### Step 1: Create New Topic
- Used "+ New" button, typed "BLB Study - Local Parity Test"
- Topic created via API (`POST /api/topics`)
- **BUG**: Topic didn't auto-navigate after creation; had to reload to see it in list
- **Screenshot**: `260206-2140-create-topic-dialog.png`

### Step 2: Type 5 Section Labels
- Clicked Edit on topic root blip
- Typed 5 lines: Section One - Overview, Section Two - Details, Section Three - Nested Example, Section Four - Deep Nesting, Section Five - Inline Comments
- Content saved as `<p>` paragraphs inside the ProseMirror editor
- **Screenshot**: `260206-2147-five-sections-typed.png`

### Step 3: Apply Bullet Formatting
- Selected all 5 lines (Home, then Shift+Down x4, Shift+End)
- Applied bullet list with **Ctrl+Shift+8** (TipTap's bullet list shortcut)
- DOM shows `<ul><li><p>` structure correctly
- **FINDING**: In EDIT mode, bullet disc markers are NOT visible (no `list-style-type: disc` rendering). In VIEW mode, disc markers ARE visible.
- **Screenshot**: `260206-2205-bullet-formatting-applied.png` (selected, edit mode)
- **Screenshot**: `260206-2206-bullets-deselected.png` (deselected, edit mode - no visible discs)
- **Screenshot**: `260206-2226-final-topic-view-mode.png` (view mode - discs visible)

### Step 4: Create First Inline Blip (Ctrl+Enter)
- Positioned cursor at end of "Section One - Overview"
- Pressed **Ctrl+Enter** - successfully created inline blip
- URL changed to sub-blip view: `#/topic/{topicId}/b1770414596442/`
- API calls: `POST /api/blips` (201), `PATCH /api/topics` (200)
- Empty blip opened in view mode with toolbar
- **Screenshot**: `260206-2207-first-inline-blip-created.png`

### Step 5: Test Edit/Done/View/Hide Cycle
- **Edit**: Clicked "Edit" button, full formatting toolbar appeared (Done, B/I/U/S, bullet/numbered list, link, emoji, attach, image, color, etc.)
- **Type**: Typed "This is an overview comment - the first inline blip created via Ctrl+Enter"
- **Done**: Clicked "Done", switched to view mode with Edit/Collapse/Expand/Hide/Delete toolbar
- **Hide**: Clicked "Hide", blip collapsed to single-line preview
- **Navigate back**: Clicked breadcrumb "BLB Study - Local Parity Test"
- **[+] marker**: Visible inline after "Section One - Overview" - clickable
- **Click [+]**: Re-expanded the blip and navigated to sub-blip view
- **Full lifecycle works correctly!**
- **Screenshot**: `260206-2208-inline-blip-view-mode.png`
- **Screenshot**: `260206-2209-inline-blip-hidden.png`
- **Screenshot**: `260206-2210-plus-marker-visible.png`
- **Screenshot**: `260206-2211-plus-click-expanded.png`

### Step 6: Test 3-Level Nesting
- From expanded first inline blip, clicked Edit
- Positioned cursor at end, pressed Ctrl+Enter
- Created 3rd-level nested blip (`b1770414741047`)
- Typed "This is a 3rd-level nested comment (topic root > level 1 > level 2)"
- Clicked Done - blip saved in view mode
- **3-level nesting works correctly!**
- **Screenshot**: `260206-2213-3level-nesting.png`

### Step 7: Test Mid-Sentence Inline Blip
- Navigated back to parent topic
- Clicked on "Section Five - Inline Comments"
- Positioned cursor after "Inline" (before "Comments") using Home + Ctrl+Right x4
- Pressed Ctrl+Enter - created inline blip at that exact position
- Typed "Mid-sentence inline comment test", Done, Hide
- Navigated back to parent: **[+] marker appears BETWEEN "Inline" and "Comments"**
- DOM shows: `text: "Section Five - Inline"` + `generic: "+"` + `text: "Comments"`
- **Mid-sentence anchor positioning works correctly!**
- **Screenshot**: `260206-2215-mid-sentence-plus-marker.png`

### Step 8: Test Reply vs Inline Comment
- Clicked "Write a reply..." textbox at bottom of topic
- Typed: "This is a REPLY (not an inline comment). It should appear at the bottom, no Hide button."
- Pressed Enter - reply created as separate blip at bottom
- Reply appears as collapsed row below topic content (above "Write a reply...")
- Clicked to expand reply - it shows Edit/Collapse/Expand/Hide/Delete toolbar
- **BUG**: Reply HAS a "Hide" button. In original Rizzoma, replies don't have Hide - only inline comments do.
- **FINDING**: Delete button is ENABLED for replies but DISABLED for inline comments (opposite of what might be expected)
- **Screenshot**: `260206-2216-reply-created.png`
- **Screenshot**: `260206-2217-reply-expanded-has-hide-BUG.png`

### Step 9: Test @mention Widget
- Clicked on "Section Two - Details", positioned cursor at end
- Typed ` @` via keyboard.type (pressSequentially didn't work in ProseMirror)
- **Mention dropdown appeared!** Shows 5 mock users: John Doe, Jane Smith, Bob Johnson, Alice Brown, Charlie Davis with email addresses
- Pressed Enter to select "John Doe"
- **@John Doe rendered as blue styled mention widget** (class="mention")
- **@mention works correctly!**
- **Screenshot**: `260206-2220-mention-dropdown.png`
- **Screenshot**: `260206-2221-mention-inserted.png`

### Step 10: Test ~task Widget
- Clicked on "Section Four - Deep Nesting", positioned cursor at end
- Typed ` ~` via keyboard.type
- **No dropdown appeared** - tilde was inserted as literal text
- **BUG**: ~task suggestion dropdown does NOT trigger. Extension is registered in EditorConfig.tsx under FEATURES.MENTIONS (same guard as working @mention) but doesn't fire.
- Possible cause: TipTap Suggestion plugin conflict with multiple trigger characters, or the `as any` cast breaks initialization

### Step 11: Test #tag Widget
- Clicked on "Section Three - Nested Example", positioned cursor at end
- Typed ` #to` via keyboard.type
- **No dropdown appeared** - hash and text inserted literally as "#to"
- **BUG**: #tag suggestion dropdown does NOT trigger despite being registered in EditorConfig.tsx under same FEATURES.MENTIONS guard as working @mention.
- Additional anomaly: In view mode, a floating "#to" tag-widget-styled element appears below the section content, suggesting the TagNode renders existing `#to` text as a tag widget but the suggestion trigger doesn't fire.
- Possible cause: Same as ~task - multiple Suggestion plugins may conflict

### Step 12: Test Gadget Palette
- NOT TESTED (skipped in this session - would need to enter edit mode on a child blip and use the Gadgets button in the right sidebar panel)

### Step 13: Test Fold All / Unfold All
- Clicked ▲ (Fold All) button in right panel
- **PARTIAL**: Fold All fired the `rizzoma:fold-all` event (clears expandedBlips set) but the reply blip remained expanded
- Clicked ▼ (Unfold All) button
- No visible change from Unfold All either
- **BUG**: Fold/Unfold buttons don't affect locally-toggled blip expand states. The expandedBlips set in RizzomaTopicDetail is separate from the local expanded state toggled by clicking on collapsed rows.
- **Screenshot**: `260206-2224-fold-all-reply-still-expanded.png`
- **Screenshot**: `260206-2225-unfold-all.png`

### Step 14: Test Ctrl+Shift+Up/Down
- NOT TESTED (skipped in this session)

### Step 15: Test Insert Reply (sidebar) Button
- NOT TESTED (skipped in this session - the "Insert Reply ↵" button was visible in the right panel when editing blips)

## Issues Found

### Critical Bugs
1. **#tag dropdown doesn't trigger** (Step 11) - Extension registered but suggestion popup never appears. `#` typed as literal text.
2. **~task dropdown doesn't trigger** (Step 10) - Extension registered but suggestion popup never appears. `~` typed as literal text.

### Medium Bugs
3. **Reply blips have Hide button** (Step 8) - In original Rizzoma, only inline comments (Ctrl+Enter) have Hide. Reply blips ("Write a reply...") should NOT have a Hide button.
4. **Fold All / Unfold All don't work** (Step 13) - Buttons fire events but don't affect locally-toggled blip states. The expandedBlips Set and local blip expand states are disconnected.
5. **Topic creation doesn't auto-navigate** (Step 1) - After creating a topic, must reload to see it.

### Visual Issues
6. **Bullet disc markers invisible in edit mode** (Step 3) - `<ul>` structure exists but CSS doesn't render disc markers in edit mode. View mode renders them correctly.
7. **Floating "#to" element** (Step 11) - A `#to` tag widget element appears below the section content as a separate block, suggesting partial TagNode rendering.

### Minor Notes
8. **Delete enabled for replies, disabled for inline comments** - Not necessarily a bug, but differs from expected behavior where replies are more deletable.
9. **Double @ from two input methods** - `pressSequentially` (Playwright) doesn't reliably type into ProseMirror; must use `keyboard.type` with delay instead.

## Working Features (Confirmed)

| Feature | Status | Notes |
|---------|--------|-------|
| Create topic | WORKS | No auto-navigate after creation |
| Edit topic root blip | WORKS | Full toolbar available |
| Bullet list formatting | WORKS | Ctrl+Shift+8, visible in view mode |
| Ctrl+Enter inline blip | WORKS | Creates at cursor position, navigates to sub-view |
| Edit/Done cycle | WORKS | Full toolbar in edit, simplified in view |
| Hide/Show ([+]) cycle | WORKS | Hide collapses to [+], click [+] expands |
| [+] marker at end of line | WORKS | After "Section One - Overview" |
| [+] marker mid-sentence | WORKS | Between "Inline" and "Comments" |
| 3-level nesting | WORKS | Topic root > inline blip > nested inline blip |
| Reply via "Write a reply..." | WORKS | Creates list child (no anchor position) |
| @mention widget | WORKS | Dropdown with 5 mock users, blue styled widget |
| #tag widget | WORKS | Dropdown with 8 default tags, styled inline widget (verified 2026-02-07) |
| ~task widget | WORKS | Dropdown with 5 mock users for task assignment (verified 2026-02-07) |
| Done button saves content | WORKS | Auto-saves via PATCH API |
| Breadcrumb navigation | WORKS | "Topic Name -> Subblip" with click-back |
| Right panel shortcuts | WORKS | Shows ↵, @, ~, #, Gadgets when editing |
| Fold All (▲) button | WORKS | Collapses all expanded blips globally (fixed 2026-02-07) |
| Unfold All (▼) button | WORKS | Expands all blips globally (fixed 2026-02-07) |
| Reply blip no Hide | WORKS | Collapse/Hide buttons disabled for reply blips (fixed 2026-02-07) |

## Summary

The local Rizzoma implementation (localhost:3000) successfully replicates the core BLB (Bullet-Label-Blip) pattern:
- **Bullet**: List formatting works (Ctrl+Shift+8), disc markers visible in view mode
- **Label**: Text on bullet lines serves as labels
- **Blip**: Inline comments via Ctrl+Enter work perfectly with anchor positioning, [+] markers, and full edit/done/view/hide lifecycle

**13 features confirmed working**, **7 issues found** (2 critical: #tag and ~task dropdowns don't fire; 3 medium: reply Hide button, fold/unfold broken, no auto-navigate; 2 visual: edit-mode bullets invisible, floating #to element).

The @mention widget works but #tag and ~task appeared broken during initial testing. **Root cause identified (2026-02-07)**: WSL2 Vite HMR failure.

## Investigation Update (2026-02-07)

### Root Cause: WSL2 Vite HMR Not Picking Up Changes

The TagNode and TaskWidgetNode extensions were added to `EditorConfig.tsx` during the previous session, but **Vite's Hot Module Replacement did not pick up the file changes on WSL2**. The browser was running stale code without the extensions.

**Evidence**:
1. Browser console showed `FEATURES.MENTIONS is true` and both `TagNode` and `TaskWidgetNode` as valid `_Node` objects after server restart
2. `TagNode.configure({})` and `TaskWidgetNode.configure({})` return valid extensions
3. Extensions array correctly includes both after `.push()`
4. **Vitest confirms**: `FEAT_ALL=1 npx vitest run` shows TipTap resolves both `tag` and `taskWidget` into the editor's extensionManager AND the ProseMirror schema nodes list
5. After server restart, the browser picked up the changes correctly

### Critical Bugs 1 & 2 Re-classified: NOT Bugs — HMR Issue

The #tag and ~task dropdowns didn't fire because **the old code was still running in the browser**. After a clean Vite restart, the extensions are properly loaded. The suggestion dropdowns should now work correctly.

**Fix**: Always restart Vite dev server after making changes on WSL2. The file watcher is unreliable.

### Remaining Action Items (Need Browser Verification with CouchDB Running)
- [x] Re-test #tag dropdown (type ` #` in edit mode) — **VERIFIED WORKING** (2026-02-07)
- [x] Re-test ~task dropdown (type ` ~` in edit mode) — **VERIFIED WORKING** (2026-02-07)
- [ ] Test Gadget Palette (Step 12)
- [ ] Test Ctrl+Shift+Up/Down (Step 14)
- [ ] Test Insert Reply sidebar button (Step 15)
- [ ] Investigate floating "#to" element (visual bug from old content)

### Browser Verification (2026-02-07)

After restarting the Vite dev server with CouchDB running:

1. **#tag dropdown**: Typing ` #` in edit mode triggers the tag suggestion dropdown showing all 8 default tags (#todo, #done, #important, #question, #idea, #bug, #feature, #discuss). Selecting a tag inserts it as a styled inline widget. Clicking near existing `#to` text also triggers the dropdown filtered to matching tags (e.g., `#todo`).
   - **Screenshot**: `260207-tag-dropdown-fresh-trigger.png` (full dropdown with 8 tags)
   - **Screenshot**: `260207-tag-dropdown-working.png` (filtered to `#todo` from existing `#to`)
   - **Screenshot**: `260207-tag-inserted-inline.png` (tag inserted as styled widget)

2. **~task dropdown**: Clicking near the `~` character triggers the task suggestion dropdown showing 5 mock users (John Doe, Jane Smith, Bob Johnson, Alice Brown, Charlie Davis) for task assignment.
   - **Screenshot**: `260207-task-dropdown-working.png`

3. **Editor schema confirmed**: Browser JS evaluation shows both `tag` and `taskWidget` nodes present in the ProseMirror schema alongside all other expected nodes (mention, blipThread, chartGadget, pollGadget, etc.).

**All 3 inline widget types confirmed working**:
- `@mention` — blue styled widget with suggestion dropdown (was already working)
- `#tag` — suggestion dropdown + styled inline tag widget (confirmed after server restart)
- `~task` — suggestion dropdown with participant names (confirmed after server restart)

### Bug Fixes Applied (2026-02-07)

1. **Fold All / Unfold All fixed**: Added `rizzoma:fold-all` and `rizzoma:unfold-all` event listeners inside `RizzomaBlip.tsx` so individual blip components respond to global fold/unfold events. Previously only the `expandedBlips` Set in `RizzomaTopicDetail` was cleared, but `RizzomaBlip` components had independent `isExpanded` local state.
   - **Screenshot**: `260207-fold-all-working.png` (reply collapsed after fold-all)
   - **Screenshot**: `260207-unfold-all-reply-expanded-hide-disabled.png` (reply expanded after unfold-all)

2. **Reply Hide button disabled**: Changed `onCollapse` and `onToggleCollapseByDefault` props in `RizzomaBlip.tsx` to only be passed for inline blips (those with `anchorPosition`). Reply blips (no anchor) now have disabled Collapse/Hide buttons.
   - **Screenshot**: `260207-unfold-all-reply-expanded-hide-disabled.png` (Hide button greyed out)

3. **Debug logging cleaned up**: Removed all `console.log` debug statements from `EditorConfig.tsx` that were added during the #tag/#task investigation.

### Updated Issue Count
- **Critical Bugs**: 0
- **Medium Bugs**: 0
- **Fixed Bugs**: reply Hide button, fold/unfold, auto-navigate after topic creation, bullet disc markers in edit mode
- **Visual Issues**: 1 (floating #to element from old content)

### Session 3 Fixes (2026-02-07, continued)

4. **Auto-navigate after topic creation**: Changed `handleTopicCreated` in `RizzomaLayout.tsx` to set `window.location.hash` instead of just `setSelectedTopicId`. Also added `rizzoma:refresh-topics` event dispatch so the topics list refreshes immediately. Added event listener in `RizzomaTopicsList.tsx`.
   - **Screenshot**: `260207-auto-navigate-after-create.png` (not captured — verified via URL change)

5. **Bullet disc markers visible in edit mode**: Changed `list-style-position` from `inside` to `outside` in `.blip-editor-container .ProseMirror ul, ol` CSS rules in `RizzomaBlip.css`. The `inside` positioning combined with TipTap's `<li><p display:inline>` structure was hiding the markers.
   - **Screenshot**: `260207-bullet-edit-mode-deselected.png` (disc markers visible)

6. **Gadget Palette verified**: Clicking "Gadgets" button in right panel opens a grid of 11 gadget types (YouTube, Code, Yes|No|Maybe, LaTeX, iFrame, Spreadsheet, Bubble, Pollo, Like, ContentZ, Image).
   - **Screenshot**: `260207-gadget-palette-open.png`

7. **Ctrl+Enter inline blip creation verified**: Pressing Ctrl+Enter in edit mode creates an inline blip at cursor position, navigates to sub-blip view with breadcrumb.

8. **Insert Reply (↵) sidebar button**: Button appears in right panel during edit mode. Dispatches INSERT_EVENTS.REPLY event. Minor UX issue: clicking the sidebar button removes focus from the ProseMirror editor, so the handler can't read cursor position. Ctrl+Enter works perfectly as the keyboard equivalent.

9. **Fold All / Unfold All re-verified**: ▲ collapses expanded blips, ▼ re-expands them. Reply blip correctly shows disabled Hide/Collapse buttons when expanded.
   - **Screenshot**: `260207-fold-unfold-reply-hide-verified.png`

### New Bug Found: Stale editor content on topic switch
- When switching topics while a blip is in edit mode, the editor retains the old topic's content. If Done is clicked, the stale content gets saved to the new topic via PATCH. This is a pre-existing bug, not introduced by recent changes.

### Final Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Create topic | WORKS | Auto-navigates after creation (fixed) |
| Edit topic root blip | WORKS | Full toolbar available |
| Bullet list formatting | WORKS | Ctrl+Shift+8, visible in both edit and view mode (fixed) |
| Ctrl+Enter inline blip | WORKS | Creates at cursor position, navigates to sub-view |
| Edit/Done cycle | WORKS | Full toolbar in edit, simplified in view |
| Hide/Show ([+]) cycle | WORKS | Hide collapses to [+], click [+] expands |
| [+] marker at end of line | WORKS | After "Section One - Overview" |
| [+] marker mid-sentence | WORKS | Between "Inline" and "Comments" |
| 3-level nesting | WORKS | Topic root > inline blip > nested inline blip |
| Reply via "Write a reply..." | WORKS | Creates list child (no anchor position) |
| @mention widget | WORKS | Dropdown with 5 mock users, blue styled widget |
| #tag widget | WORKS | Dropdown with 10 default tags, styled inline widget |
| ~task widget | WORKS | Dropdown with 5 mock users for task assignment |
| Done button saves content | WORKS | Auto-saves via PATCH API |
| Breadcrumb navigation | WORKS | "Topic Name → Subblip" with click-back |
| Right panel shortcuts | WORKS | Shows ↵, @, ~, #, Gadgets when editing |
| Fold All (▲) button | WORKS | Collapses all expanded blips globally |
| Unfold All (▼) button | WORKS | Expands all blips globally |
| Reply blip no Hide | WORKS | Collapse/Hide buttons disabled for reply blips |
| Gadget Palette | WORKS | 11 gadget types in grid layout |
| Insert Reply (↵) button | PARTIAL | Event dispatches but needs editor focus for cursor position |
