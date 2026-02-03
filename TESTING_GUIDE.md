# 🧪 Testing Rizzoma Core Features

Run the app at **http://localhost:3000** with `FEAT_ALL=1` and `EDITOR_ENABLE=1` enabled, and sign in via the AuthPanel (no demo/query-string logins on this branch).

## Quick Test Checklist

### 1. Rich Text Editor (Track B)
- [ ] Create or edit a topic
- [ ] **Toolbar appears** above the editor
- [ ] Test formatting: Bold, Italic, Headings, Lists
- [ ] Create a **task list** with checkboxes
- [ ] Add a **link** using the link button
- [ ] Type **@** to trigger mention autocomplete

### 2. Inline Comments (Track A)
- [ ] Open any topic or wave with text
- [ ] **Select some text** in the editor
- [ ] Click the **yellow comment button** (💬) that appears
- [ ] Add a comment
- [ ] View comments in the sidebar
- [ ] **Resolve** a comment
- [ ] Click on a comment to highlight its text

### 3. "Follow the Green" (Track C)
- [ ] Make some edits to create unread changes
- [ ] Look for **green indicators** on changed content
- [ ] Find the **"Follow the Green"** button (bottom right)
- [ ] Click to navigate through unread changes
- [ ] Watch the **green count** decrease as you read

### 4. Live Collaboration (Track D)
- [ ] Open the same wave/topic in two browser tabs
- [ ] Start typing in one tab
- [ ] See **colored cursors** in the other tab
- [ ] Watch **"User is typing..."** indicator
- [ ] See **live selection highlighting**

## Feature Verification

### Check Features Are Active
```javascript
// In browser console:
console.log('Features enabled:', window.FEATURES);
```

### API Endpoints to Test

1. **Get inline comments**
```bash
curl http://localhost:8000/api/blip/YOUR_BLIP_ID/comments
```

2. **Check health**
```bash
curl http://localhost:8000/api/health
```

## Visual Indicators

- 🟢 **Green bars/highlights** = Unread changes
- 🟡 **Yellow highlights** = Text with comments  
- 🔵 **Colored cursors** = Other users' positions
- ⌨️ **Typing dots** = Someone is typing

## Troubleshooting

### Features not showing?
1. Check browser console for errors
2. Verify `FEAT_ALL=1` was set when starting
3. Hard refresh (Ctrl+Shift+R)

### Can't see other users?
1. Make sure you're in the same wave/topic
2. Check WebSocket connection in Network tab
3. Try different browsers for testing

### Comments not saving?
1. Check you're logged in
2. Verify CouchDB is running: http://localhost:5984/_utils/
3. Check browser console for API errors

## Success Criteria

✅ All formatting options work in the toolbar
✅ @mentions show user dropdown
✅ Text selection creates comment option
✅ Green navigation finds all changes
✅ Multiple users see each other's cursors
✅ Real-time updates work instantly

Enjoy testing the full Rizzoma experience! 🚀
