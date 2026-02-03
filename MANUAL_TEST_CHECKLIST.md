# 🧪 Rizzoma Manual Testing Checklist

## 🌐 Open the app at http://localhost:3000 (run with `FEAT_ALL=1` and `EDITOR_ENABLE=1`, sign in via AuthPanel)

### 📋 Step-by-Step Test Guide:

## 1. First, Verify Features Are Enabled
Open browser DevTools (F12) and run:
```javascript
console.log(window.FEATURES)
```
You should see all features as `true`.

## 2. Test Rich Text Editor (Track B) ✏️
1. **Create a new topic** or open an existing one
2. **Look for the toolbar** above the editor
3. Try these formatting options:
   - [ ] **Bold** (B button or Ctrl+B)
   - [ ] **Italic** (I button or Ctrl+I)
   - [ ] **Headings** (H1, H2, H3 buttons)
   - [ ] **Lists** (• and 1. buttons)
   - [ ] **Task lists** (☐ button) - create checkboxes!
   - [ ] **Links** (🔗 button)
   - [ ] **Code blocks** ({ } button)

## 2b. Inline Blip Toolbar & Overflow 🛠️
1. **Read mode surface**
   - [ ] Hover any blip and confirm the inline toolbar shows **Edit**, **Fold**, **💬 Hide/Show comments**, **Get Link**, **Delete**, and the ⚙️ gear menu.
   - [ ] Click the 💬 button to toggle inline comments; the title should swap between *Hide Comments* and *Show Comments* and the highlights should follow.
   - [ ] Open the gear menu and verify you see **Copy comment**, **Playback history**, **Paste as reply**, and **Copy direct link**. When the clipboard is empty, the paste actions should be disabled with helper text.
2. **Edit mode surface**
   - [ ] Click **Edit** to enter edit mode. Confirm **Done** returns you to read mode and undo/redo buttons enable/disable as you type.
   - [ ] Use the inline toolbar buttons (Bold/Italic/Underline/Strike, bullets, highlight) to ensure formatting applies at the cursor.
   - [ ] Click the ⋯ overflow to verify **Send**, **Copy comment**, **Playback history**, **Paste at cursor**, **Paste as reply**, **Copy direct link**, and **Delete blip** all appear with correct disabled/loading states (paste items disabled when clipboard empty, Delete disabled while request is running).
   - [ ] If you temporarily disable commenting (e.g., impersonate a read-only viewer), confirm the toolbar shows the red inline comments banner in both edit and read modes so degraded states are obvious.

## 3. Test @Mentions 👤
1. In the editor, type `@`
2. **A dropdown should appear** with user names
3. Use arrow keys to navigate
4. Press Enter to select a user
5. The mention should appear highlighted in blue

## 4. Test Inline Comments (Track A) 💬
1. Type some text in the editor
2. **Select any text** with your mouse
3. **Yellow comment button (💬) should appear**
4. Click it to add a comment
5. Type a comment and save
6. The text should be highlighted in yellow
7. Comments appear in a sidebar
8. Try resolving a comment with the ✓ button
9. Use the inline toolbar toggle **or** press `Ctrl+Shift+↑/↓` to hide/show inline comments and confirm the visibility preference persists when reloading.
10. Check the inline comment navigation rail for **All / Open / Resolved** filters—switching filters should update the list immediately.
11. Press `Alt+↑` / `Alt+↓` to move between inline comment anchors without losing your current selection.
12. While resolved threads exist, make sure the navigation shows a **Resolved** badge and that reopening a comment updates the counts.

## 5. Test "Follow the Green" (Track C) 🟢
1. Make some edits to create changes
2. Look for **green indicators** on changed content
3. Find the **"Follow the Green" button** (bottom right)
4. Click it to navigate through unread changes
5. The count should decrease as you view changes

## 6. Test Live Collaboration (Track D) 👥
1. **Open the same topic in two browser tabs**
2. Position them side by side
3. Start typing in one tab
4. In the other tab, you should see:
   - [ ] **Colored cursor** showing where the other user is
   - [ ] **Live text updates** as they type
   - [ ] **"User is typing..."** indicator
   - [ ] **Selection highlighting** when text is selected

## 7. Additional Tests

### Navigation
- [ ] Switch between Topics and Waves views
- [ ] Use keyboard shortcuts (j/k for navigation)
- [ ] Test the Editor Search at `#/editor/search`

### Performance
- [ ] Editor responds quickly to typing
- [ ] Real-time updates are instant
- [ ] No lag when switching between topics

## 🎯 Success Indicators

✅ **All toolbar buttons work**
✅ **@mentions show dropdown**
✅ **Selected text shows comment option**
✅ **Green navigation finds changes**
✅ **Multiple tabs show live cursors**
✅ **Changes sync instantly**

## 🐛 Common Issues

**No toolbar visible?**
- Make sure you're editing a topic, not just viewing
- Confirm `FEAT_ALL=1` was set before starting `npm run dev`

**No comment button on selection?**
- Try selecting more text
- Make sure you're in an editable area

**No live cursors?**
- Open same topic/wave in both tabs
- Check WebSocket connection in Network tab

## 📸 What You Should See

1. **Rich Toolbar**: A gray toolbar with formatting buttons
2. **Yellow Comments**: Selected text with yellow highlight
3. **Green Indicators**: Green bars on left of changed content
4. **Colored Cursors**: Thin vertical lines in other user's color
5. **Mention Dropdown**: White popup with user list

---

**Enjoy testing the full Rizzoma experience!** 🚀
