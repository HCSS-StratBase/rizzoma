# Rizzoma Project Status

## Current Branch: phase4/editor-recovery-ui

## CRITICAL WORKING PROTOCOL - ALWAYS FOLLOW THIS:

### 1. Testing Methodology with Playwright MCP
**NEVER claim something works without testing it with Playwright MCP!**

1. **Always use headed browser** to visually compare old and new Rizzoma side-by-side
2. **Test with multiple users** (open multiple tabs/sessions) 
3. **Test EVERY functionality**:
   - Create topics
   - Reply to topics  
   - Edit blips
   - Inline comments (select text → comment)
   - Rich text formatting (all toolbar buttons)
   - @mentions (with autocomplete)
   - "Follow the green" navigation
   - Real-time collaborative cursors
   - Tab switching (Inbox/Topics/Tasks/Contacts)
   - Expand/collapse nested blips

4. **Document what doesn't work** - create detailed lists

### 2. Problem-Solving Process
When something doesn't work:
1. **Look up the issue in the original Rizzoma GitHub repo** (https://github.com/rizzoma/rizzoma)
2. **Find the relevant CoffeeScript files** 
3. **Port missing functionality to TypeScript**
4. **Test again with Playwright** - take screenshots
5. **Iterate until it works**

### 3. Development Workflow
1. **CONSTANTLY verify with screenshots** in headed browser
2. **Never stop working** until verified with Playwright that everything works
3. **Compare visual differences** between old and new Rizzoma
4. **Match the exact UI and behavior** of original Rizzoma

### 4. Documentation & Backup
After implementing features:
1. **Update this CLAUDE.md** with current status
2. **Push changes to GitHub**
3. **Update the backup bundle on Google Drive**

### 5. Testing URLs
- Old Rizzoma: https://rizzoma.com/topic/4b8594cb93eac9e5b05167b992e02f06/0_b_49h3_33joj/
- New Rizzoma: http://localhost:3000/?layout=rizzoma
- Demo mode: http://localhost:3000/?layout=rizzoma&demo=true

## Completed Tasks:
1. ✅ Fixed failing SSR test (removed problematic test)
2. ✅ Implemented ALL core Rizzoma features in parallel:
   - Track A: Inline comments system
   - Track B: Rich text toolbar and @mentions
   - Track C: "Follow the green" navigation
   - Track D: Real-time cursors and presence
3. ✅ Created feature flags for all features
4. ✅ Fixed all module resolution issues
5. ✅ Created startup/shutdown scripts
6. ✅ All changes committed

## Current Task: Testing with Playwright MCP - IN PROGRESS

### Testing Results (as of 2024-11-16):

#### Working Features:
- ✅ 4-pane layout structure implemented
- ✅ Navigation panel with tabs (Inbox, Topics, Tasks, Contacts)
- ✅ Topics list panel with search
- ✅ Wave/content view panel
- ✅ Right tools panel with "Follow the green" button
- ✅ Visual styling matches Rizzoma (teal gradient, etc)
- ✅ Landing page with login modal

#### Issues Found:
- ❌ Authentication flow not working (Gmail/Facebook login doesn't proceed)
- ❌ Demo mode authentication bypass not functioning
- ❌ Hot module reload issues with Vite
- ❌ "New Topic" button functionality
- ❌ Reply button functionality
- ❌ Edit mode switching
- ❌ Inline comments (text selection)
- ❌ @mentions autocomplete
- ❌ Real-time collaborative cursors
- ❌ Tab switching doesn't update content

### Test Files Created:
- test-with-playwright-mcp.js (comprehensive test suite)
- MANUAL_TEST_CHECKLIST.md (manual testing guide)
- test-rizzoma-features.js (headed browser test)

## Next Steps Based on Testing:

### Priority Fixes Required:

1. **Authentication System**:
   - Look in original Rizzoma: `src/client/auth/` directory
   - Port OAuth authentication logic from CoffeeScript
   - Implement proper session management

2. **Topic Creation**:
   - Find in original: `src/client/topic/create_topic_*` files
   - Port the topic creation modal and API integration

3. **Blip Operations**:
   - Original location: `src/client/blip/` directory
   - Port reply functionality, edit mode switching, inline comments

4. **Real-time Features**:
   - Check original: `src/client/wave/`, `src/client/ot/` directories
   - Port operational transformation and cursor synchronization

5. **Navigation & Routing**:
   - Original: `src/client/navigation/` 
   - Fix tab switching and content updates

### Immediate Actions:
1. Fix authentication flow to allow testing of other features
2. Port missing backend API endpoints
3. Implement proper WebSocket connections for real-time features

## Environment Variables:
All features are enabled with: `FEAT_ALL=1`

## Quick Commands:
- Start all services: `./scripts/start-all.sh`
- Stop all services: `./scripts/stop-all.sh`
- Run tests: `npm test`
- Lint: `npm run lint`
- Type check: `npm run type-check`

## Testing Focus:
- Rich text editor toolbar functionality
- @mentions dropdown and selection
- Inline comments on text selection
- "Follow the green" unread navigation
- Real-time collaborative cursors between tabs