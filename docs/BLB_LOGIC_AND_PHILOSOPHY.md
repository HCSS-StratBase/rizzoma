# Rizzoma BLB Logic & Philosophy

> **"Think BLB!!!"** - The core philosophy of Rizzoma structure.

This document defines the mandatory structural logic and interaction patterns for Rizzoma. It is not just about features, but about the *methodology* of collaboration.

## 1. The Core Concept: BLB (Bullet-Label-Blip)

Rizzoma is **not** a chat app and **not** a standard document editor. It is a fractal, rhizomatic outliner.

*   **Modular, Not Discursive:** Avoid long-winded prose. Break thoughts down into atomic modules.
*   **One Thought = One Blip:** disassembling complex sentences into component modules.
*   **The "Bullet-Label" Structure:**
    *   **Bullet:** The visual marker (implicit in the blip structure).
    *   **Label:** The "headline" or first line of the blip. This acts as the Table of Contents entry.
    *   **Blip:** The body content, which is only visible when drilled down into.

### Why?
*   **Hyperlinking:** You can link to a specific *thought* (module) rather than a giant text block.
*   **Navigation:** Users read the "Labels" (headlines) to find what they need, ignoring the rest.
*   **Fractal:** Top-level blips are structured, and their children are structured recursively.

## 1b. Topic = Meta-Blip (The Root Container)

A **Topic** is just a special blip - the root/meta-blip that contains everything else.

### The Title IS the First Line
*   The **Topic Title** is simply the **first line** of the meta-blip's content
*   It's editable just like any other text in any blip
*   The only difference: default styling is **bigger font + bold** (like an H1)
*   User CAN change this styling if they want

### Topic Structure
```
TOPIC (meta-blip)
├── Title (first line, default: H1/bold styling)
├── Body content (rest of this blip's content)
├── [+] Inline comments at anchor positions
├── Child blips (replies) at bottom
│   ├── Blip A [+]
│   ├── Blip B [+]
│   └── ...
└── "Write a reply..."
```

### Editing the Title
*   Click to edit the topic (just like any blip)
*   The title is the first line - edit it directly
*   Can add content below the title in the same blip
*   Can add inline comments (Ctrl+Enter) anywhere in the topic content
*   Can add replies ("Write a reply...") as child blips

### This is Fractal
Everything is a blip. A topic is a blip. The title is just text in a blip. Child items are blips. It's blips all the way down.

## 2. Default "Hidden" (Collapsed) State

The system enforces modularity by default:

*   **Default State:** Modular blips default to **COLLAPSED** ("Hidden").
*   **The View:** Users initially see only the **Label** (headline) and the `+` expand control.
*   **The Behavior:** This creates a clean **Table of Contents** by default. Users "drill down" (expand) only the branches they care about.
*   **Note:** Expanding a parent does *not* automatically expand its children. Users traverse the tree level by level.

## 3. Reply vs Inline Comment (Two Ways to Create Child Blips)

Rizzoma has **TWO ways** to create a child blip, each serving a different purpose:

### Reply = Blip UNDER a Blip
*   **Created via:** "Write a reply..." input at the **bottom** of an expanded blip
*   **Purpose:** Comments on the **ENTIRE** parent blip
*   **Location:** Appears at the **end** of the parent's content, after all other children
*   **Use when:** You want to respond to or add to the overall topic/thought

### Inline Comment = Blip IN a Blip
*   **Created via:** **Ctrl+Enter** at cursor position while editing
*   **Purpose:** Comments on **THAT SPECIFIC POINT** in the content
*   **Location:** Appears **INLINE at the exact cursor position** within the parent's content
*   **Use when:** You want to annotate, question, or expand on a specific part of the text

### Both Are Full Blips!
Both replies and inline comments are **complete blip documents** with:
*   Their own content (a blank sheet - user decides format)
*   Their own author and timestamp
*   Their own children (can have replies AND inline comments)
*   Their own toolbar when expanded
*   Recursive/fractal structure - blips within blips within blips

### A Blip is a Blank Sheet
When you create a reply or inline comment, you get a **blank rich text container**. The user decides what to put in it:
*   A bulleted list (common for structured content)
*   Plain unbulleted text (quick comment)
*   Bold heading, links, images
*   Any combination

The collapsed label shows the **first line of whatever content** the user wrote - not necessarily bulleted.

### Visual Example
```
BLIP A (expanded):
┌─────────────────────────────────────────────────────────────┐
│ Toolbar                                                     │
│                                                             │
│ The quick brown [+] fox jumped over [+] the lazy dog.       │
│                  ↑                    ↑                     │
│           INLINE BLIP B         INLINE BLIP C               │
│           (comments on          (comments on                │
│            "brown")              "jumped over")             │
│                                                             │
│ I think this is wrong [+]          ← REPLY: plain text      │
│ • Point one about this [+]         ← REPLY: user used bullet│
│                                                             │
│ Write a reply...                   ← Creates REPLY at bottom│
└─────────────────────────────────────────────────────────────┘
```

### The "Right Place" Philosophy
*   **Insert Precisely:** Use **Ctrl+Enter** to place your comment *exactly* where it belongs in the text
*   **Zoom Out:** If lost, collapse parent blips to see the "Forest" (high-level structure)
*   **Refactor:** If you see a messy discussion, restructure it - move inline comments to better positions
*   **Copy/Paste Rule:** Only **Blips** can be copy/pasted while preserving author/timestamp metadata

## 4. Visual & Behavioral Mandates

1.  **Never side-by-side:** Do not place multiple root blips or unnested blips adjacent if they belong together. Structure them.
2.  **No "Messy" Text:** If a blip looks like a wall of text, break it down.
3.  **Playback:** If content jumps, disappears, or looks "weird" (often a browser sync issue), use the **Playback** feature to recover context or refresh immediately.
4.  **Self-Structuring:** It is every user's duty to maintain the BLB structure. If you see a "non-BLB" message, refactor it (e.g., break a long email-style post into labeled bullets).

## 5. Topic-Level vs Blip-Level Structure

Rizzoma has a **two-level toolbar architecture**. This is critical to understand:

### Level 1: Topic-Level Toolbars (Always Visible)

At the very top of every topic, there are TWO persistent toolbars:

#### 1A. Topic Collaboration Toolbar
```
[ Invite ] [👤👤👤👤] +78 [ 🔒 Share ]    [⚙️]
```
- **Invite button** - Add new participants
- **Participant avatars** - Shows WHO is in the topic
- **+N count** - Additional participants not shown (e.g., "+78")
- **Share button** - Permission/visibility settings
- **Gear icon** - Topic settings

#### 1B. Topic-Level Edit Toolbar
```
Edit | 💬 | 💬 | 🔗 | icon
```
This is for actions on the **topic itself** (not individual blips).

### Level 2: Blip-Level Toolbar (Only When Focused/Expanded)

When you click/focus on a specific blip, its toolbar appears:
```
Edit | 💬 | 📎 | 🔗 | ☑ Hidden | 🗑 | 🔗
```

**CRITICAL**: This toolbar **ONLY appears when the blip is expanded/focused**. Collapsed blips have NO toolbar visible.

## 6. Collapsed vs Expanded Blip States

This is the **heart of the BLB system**:

### Collapsed State (Default)
```
• Actual corpora [+]
```
- Shows **ONLY the label** (first line)
- **[+] expand icon** indicates hidden content
- **NO toolbar visible**
- **NO body content visible**
- **NO nested items visible**
- This creates the "Table of Contents" view

### Expanded/Focused State
```
• Actual corpora [−]
  ┌─ BLIP TOOLBAR ─────────────────────────────────┐
  │ Edit | 💬 | 📎 | 🔗 | ☑ Hidden | 🗑 | 🔗       │
  └────────────────────────────────────────────────┘
  Below is a list of all RuBase-related full-text
  corpora. Please also note...

    • What has to be documented [+]
    • Actual corpora (per project) [+]
      ◦ Chinese [+]
      ◦ English [+]
      ◦ Russian [+]     ← Green [+] = has unread!
      ◦ Ukrainian [+]
    • List of sources

  ┌──────────────────────────────────────────────┐
  │ Write a reply...                             │
  └──────────────────────────────────────────────┘
```
- **[−] icon** indicates expanded state
- **Blip toolbar** appears at top
- **Full body content** visible
- **Nested items** visible (but collapsed by default!)
- **"Write a reply..."** input at bottom

### The Expand/Collapse Interaction

```
COLLAPSED                              EXPANDED
    │                                      │
    │  Click [+] or the blip itself        │
    │ ────────────────────────────────────>│
    │                                      │
    │                              • See toolbar
    │                              • See content
    │                              • See nested [+] items
    │                              • See reply input
    │                                      │
    │      Click [−] or outside            │
    │<──────────────────────────────────── │
    │                                      │
    ▼
Back to collapsed "TOC" view
```

**KEY INSIGHT**: Expanding a parent does **NOT** auto-expand children. You traverse the tree level by level, expanding only what you need.

## 7. View Mode vs Edit Mode (Within Expanded Blip)

Once a blip is **expanded**, you can toggle between View and Edit mode:

### View Mode (Reading/Navigating)

**Blip toolbar shows:**
```
Edit | 💬 | 📎 | 🔗 | ☑ Hidden | 🗑 | ⚙
```

**Characteristics:**
- **"Edit" button** at left
- Content is **read-only**
- Can see nested blips and navigate
- "Write a reply..." input visible but for creating NEW nested content
- View toolbar includes **Collapse/Expand**, **Hidden**, and **Gear** actions (see `rizzoma-blip-view.png`)

### Edit Mode (Modifying This Blip)

**Blip toolbar shows:**
```
Done | ↩ | ↪ | 🔗 | 📷 | B | I | U | S̶ | 🎨 | ≡ | ≡≡ | ☐ Hide | 🗑
```

**Toolbar elements:**
| Button | Function |
|--------|----------|
| **Done** | Save and exit edit mode |
| ↩ ↪ | Undo / Redo |
| 🔗 | Insert link |
| 📷 | Insert image |
| **B** | Bold |
| *I* | Italic |
| U | Underline |
| S̶ | Strikethrough |
| 🎨 | Text background color |
| ≡ | Bulleted list |
| ≡≡ | Numbered list |
| **Hidden** | **THE KEY BLB CONTROL** - checkbox to collapse by default |
| 🗑 | Delete |

**Characteristics:**
- **"Done" button** replaces "Edit"
- Full **formatting toolbar** appears
- Text is **editable**
- **Hidden checkbox** - THE KEY CONTROL for BLB! (also visible in view toolbar)
- Click **Done** to save and exit edit mode

### The Complete Flow

```
COLLAPSED    →    EXPANDED (View)    →    EXPANDED (Edit)
    │                  │                       │
    │  Click [+]       │   Click "Edit"        │
    │ ────────────────>│ ─────────────────────>│
    │                  │                       │
    │                  │               • Type/format text
    │                  │               • Check "Hidden" ← BLB!
    │                  │               • Add content
    │                  │                       │
    │                  │    Click "Done"       │
    │<─ Click [−] ─────│<───────────────────── │
```

## 8. Creating a New Topic - The Actual Workflow

### Step 1: Topic Creation Wizard

Click "New" button to open the 3-step wizard:
1. **Enter subject** - The topic title
2. **Add participants** - Email addresses to invite
3. **Create new topic** - Finalize creation

### Step 2: Initial Empty Topic

The topic opens with:
- Topic title displayed at top
- Formatting toolbar visible
- Empty content area
- "Write a reply..." area below

### Step 3: Build the Standard Structure

Create the standard HCSS topic template:
```
#HCSS (or relevant hashtags like #HCSSTools #Tutorial)
• Oneliner
• Relevant links
• Research design
• Methodology
• Progress
```

Each line becomes a **blip** that can:
- Be expanded/collapsed independently
- Have nested children (sub-blips)
- Be marked as "Hidden" to show only the label

### Step 4: Apply BLB Structure

For each blip:
1. Click **Edit** to enter edit mode
2. Type the **Label** (first line - always visible)
3. Add body content below the label
4. Click **Fold** to collapse the blip by default
5. Click **Done** to save

### Step 5: The Final Result

A properly formatted topic shows:
```
Topic Title
#Hashtag #Tags
• Oneliner □
• Relevant links □
• Research design □
• Methodology □
• Progress □
```

Each **□** indicates hidden content - click to expand and drill down.

## 9. Key Visual Elements

| Element | Visual | Purpose |
|---------|--------|---------|
| **Bullet** | • | Visual marker for each blip |
| **Sub-bullet** | ◦ | Marker for nested blips (2nd level) |
| **Label** | First line text | Always visible when collapsed, acts as TOC entry |
| **Expand icon** | [+] | Indicates COLLAPSED state - click to expand |
| **Collapse icon** | [−] | Indicates EXPANDED state - click to collapse |
| **Green [+]** | [+] in green | Indicates collapsed blip has UNREAD content! |
| **Hidden checkbox** | ☑ Hidden | THE KEY BLB CONTROL - makes blip collapse by default |
| **Indentation** | Nested spacing | Shows hierarchy level (32px per level) |
| **Done button** | Blue/teal | Saves edits and exits edit mode |
| **Edit button** | Gray | Enters edit mode for a blip |
| **Write a reply...** | Input placeholder | Appears at bottom of EXPANDED blip only |
| **Avatar + date** | 👤 Date | Author info on right side of blip |
| **Participant avatars** | 👤👤👤 +N | Topic collaboration toolbar shows who's involved |
| **Hashtags** | #Tag | Topic categorization, shown below title |

## 10. Summary for Developers

### Critical Implementation Requirements

1. **Two-Level Toolbar Architecture:**
   - **Topic-level toolbars** (collaboration + edit) are ALWAYS visible at top
   - **Blip-level toolbar** appears ONLY when that blip is expanded/focused
   - Never show blip toolbars on collapsed blips!

2. **Default Collapsed State:**
   - Blips are **COLLAPSED by default** (when "Hidden" is checked)
   - Collapsed view shows: `• Label [+]` only
   - This creates the "Table of Contents" / "Mind Map" view

3. **Expand/Collapse Icons:**
   - `[+]` = collapsed, click to expand
   - `[−]` = expanded, click to collapse
   - Green `[+]` = has UNREAD content inside!

4. **Expand Does NOT Cascade:**
   - Expanding a parent does NOT auto-expand children
   - Users drill down level by level
   - Each nested level has its own `[+]` icons

5. **Blip Structure When Expanded:**
   ```
   • Label [−]
     ┌── BLIP TOOLBAR ──────────────────────┐
     │ Edit | 💬 | 📎 | 🔗 | ☑ Hidden | 🗑 │
     └──────────────────────────────────────┘
     Body content here...
       ◦ Nested item [+]
       ◦ Nested item [+]
     ┌────────────────────────────────────┐
     │ Write a reply...                   │
     └────────────────────────────────────┘
   ```

6. **"Write a reply..." Placement:**
   - Appears at bottom of EXPANDED blip only
   - NOT on every blip
   - NOT at topic level (only at blip level when expanded)

7. **The "Hidden" Checkbox:**
   - THE KEY BLB CONTROL
   - When checked: blip collapses to show only label
   - This is a **shared property** (all users see same collapsed state)
   - Replaces the old "Fold" button terminology

8. **Visual Hierarchy:**
   - Root blips use `•` bullet
   - Nested blips use `◦` sub-bullet with indentation
   - Each level adds ~32px indentation

9. **Author Attribution:**
   - Avatar + date shown on RIGHT side of blip (in collapsed and expanded views)
   - Format: `[Avatar] Mon Year` (e.g., "Aug 2023")

## 11. Reference Screenshots

The following screenshots from live Rizzoma (captured 2026-01-19) document the actual behavior:

### Topic Structure Screenshots
| Screenshot | Shows |
|------------|-------|
| `screenshots/260119/01-new-topic-clicked.png` | Topic creation wizard |
| `screenshots/260119/02-title-typed.png` | Initial topic with title |
| `screenshots/260119/03-structure-created.png` | Standard HCSS template structure |
| `screenshots/260119/08-blb-interaction-proof.png` | Edit mode with nested blips and Hide checkbox |
| `screenshots/260119/11-blb-bulleted-forced.png` | Collapsed view (Table of Contents) |
| `screenshots/260119/39-blb-final-check.png` | View mode with expand icons |
| `screenshots/260119/41-blb-mouse-only-done.png` | Final BLB structure |

### Live Rizzoma Analysis Screenshots (Critical Reference!)
| Screenshot | Shows |
|------------|-------|
| `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-main.png` | Topic landing with single meta‑blip container (title is first line) |
| `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-blip-view.png` | Expanded blip in view mode with read‑only toolbar |
| `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-blip-edit.png` | Same blip in edit mode with full formatting toolbar + Hidden checkbox |

### Visual Reference: Complete Topic Anatomy

From the live Rizzoma screenshot, the complete topic structure is:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TOPIC COLLABORATION TOOLBAR                                             │
│ [ Invite ] [👤👤👤👤👤] +78 [ 🔒 Share ]                        [⚙️]   │
├─────────────────────────────────────────────────────────────────────────┤
│ META‑BLIP CONTAINER (single scrollable pane)                            │
│   Topic title + tags (FIRST LINE inside meta‑blip)                      │
│   #HCSSProposal  #RuBase  #RuBaseCCNY                     [👤] May 2023  │
│                                                                         │
│   BLIPS (Collapsed = Table of Contents):                                │
│   • One-liner [+]                                                       │
│   • New to Rizzoma? Please, read this topic carefully [+]               │
│   • This topic in 5 [+]                                                 │
│   • General pointers [+]                                                │
│   • Relevant links [+]                                                  │
│   • Tools [+]                                                           │
│   • Actual corpora [−]  ← EXPANDED, shows toolbar:                      │
│     ┌── Edit | 💬 | 📎 | 🔗 | ☑ Hidden | 🗑 | 🔗 ──┐                   │
│     │ Below is a list of all RuBase-related...      │                   │
│     │   • What has to be documented [+]             │                   │
│     │   • Actual corpora (per project) [+]          │                   │
│     │     ◦ Chinese [+]                             │                   │
│     │     ◦ English [+]                             │                   │
│     │     ◦ Russian [+]  ← GREEN = unread!          │                   │
│     │     ◦ Ukrainian [+]                           │                   │
│     │   • List of sources                           │                   │
│     │ ┌─────────────────────────────────────────┐   │                   │
│     │ │ Write a reply...                        │   │                   │
│     │ └─────────────────────────────────────────┘   │                   │
│     └───────────────────────────────────────────────┘                   │
│   • How to store corpora [+]                                            │
│   • Conversion [+]                                                      │
│   • Consolidating corpora [+]                                           │
│   • Technical work [+]                                                  │
│   • Metafindings [+]                                                    │
│   • Progress [+]                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Topic Pane Container Hierarchy (Single Container Rule)

The topic pane uses ONE scrollable container for the meta‑blip. The topic title is just the **first line** inside that container, followed by its body and then the child blips list. There is no separate “topic header” container inside the pane.

```
Topic Pane
├─ Collab Toolbar (Invite / avatars / Share / gear)  ← separate bar above
└─ Meta‑blip Container (single scrollable body)
   ├─ Topic content (title = first line, tags, body text)
   ├─ Inline [+] markers anchored inside content
   └─ Child blips list (collapsed rows + expanders) + “Write a reply…”
```

**Key observations:**
1. Most blips are COLLAPSED with `[+]` icons
2. Only ONE blip ("Actual corpora") is EXPANDED with `[−]` icon
3. The expanded blip shows its TOOLBAR
4. Nested items within expanded blip are STILL collapsed with `[+]`
5. "Write a reply..." only appears in the EXPANDED blip
6. Green `[+]` on "Russian" indicates unread content inside

## 12. Keyboard Shortcuts in Edit Mode

When editing a blip (after clicking "Edit"), these keyboard shortcuts apply:

### Content Editing Shortcuts

| Shortcut | Action | Result |
|----------|--------|--------|
| **Enter** | New line/bullet | Stays within SAME blip's content |
| **Tab** | Indent bullet | Nests deeper WITHIN the blip |
| **Shift+Tab** | Outdent bullet | Promotes up one level WITHIN the blip |
| **Ctrl+Enter** | **Create INLINE COMMENT** | Creates NEW BLIP at cursor position |

### CRITICAL: Ctrl+Enter Creates a NEW BLIP

> **Ctrl+Enter = Create an INLINE COMMENT (a blip IN a blip)**

When you press Ctrl+Enter while editing:
1. A **NEW blip document** is created in the database
2. It is **anchored to the cursor position** in the parent's content
3. It appears **INLINE** at that exact location (not at the bottom)
4. It's a **blank sheet** - you decide what to write in it
5. It can have its own children (replies and inline comments)

**This is different from Tab indentation:**
- **Tab** = indent a bullet WITHIN the same blip (no new document)
- **Ctrl+Enter** = create a NEW blip document AT the cursor position

### Two Ways to Create Child Blips

| Method | What it creates | Where it appears |
|--------|----------------|------------------|
| **"Write a reply..."** | Reply (blip UNDER) | At the BOTTOM, comments on everything |
| **Ctrl+Enter** | Inline Comment (blip IN) | At CURSOR POSITION, comments on that spot |

Both create separate blip documents. Both are blank sheets. Both can have their own children.

### Visual: Ctrl+Enter in Action

```
BEFORE (editing Blip A):
┌─────────────────────────────────────────────────────────────┐
│ Done | B | I | ...                                          │
│                                                             │
│ The quick brown fox| jumped over the lazy dog.              │
│                    ↑                                        │
│              cursor here, press Ctrl+Enter                  │
└─────────────────────────────────────────────────────────────┘

AFTER (new inline blip created):
┌─────────────────────────────────────────────────────────────┐
│ The quick brown fox [+] jumped over the lazy dog.           │
│                      ↑                                      │
│               BlipThread marker inserted                    │
│               (click [+] to navigate into subblip)          │
│               URL now: /topic/{waveId}/{newBlipPath}/       │
└─────────────────────────────────────────────────────────────┘
```

**Implementation (2026-01-24):** The `[+]` marker is a TipTap `BlipThreadNode` - an inline atom node that stores the `threadId` (child blip ID). The marker is embedded in the content HTML as `<span data-blip-thread="...">`. Clicking navigates to the subblip URL.

### Content Within a Single Blip

A blip IS a rich text container. Within ONE blip you can have:
- Multiple paragraphs (Enter)
- Bullet lists with nested sub-items (Tab to indent)
- Formatted text (bold, italic, etc.)

All this is **ONE blip** with ONE author:

```
• Project Status [−]
  ┌── BLIP TOOLBAR ──────────────────────┐
  │ Done | B | I | ≡ | ...               │
  └──────────────────────────────────────┘

  Current progress:              ← Paragraph (ONE blip's content)
  • Completed phase 1            ← Bullet list (same blip)
    • Sub-task A done            ← Indented with Tab (same blip)

  [+]                            ← INLINE COMMENT (separate blip!)

  Next steps:                    ← Back to parent blip's content
  We need to focus on...

  I disagree with this [+]       ← REPLY (separate blip, at bottom)

  ┌────────────────────────────────────┐
  │ Write a reply...                   │  ← Creates REPLY at bottom
  └────────────────────────────────────┘
```

### Text Formatting Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+B** | Bold |
| **Ctrl+I** | Italic |
| **Ctrl+U** | Underline |
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** | Redo |

### Navigation & Actions

| Shortcut | Action |
|----------|--------|
| **Escape** | Exit edit mode (saves automatically) |
| **Ctrl+Shift+ArrowUp** | **Hide** all inline comments (collapse all [+]) |
| **Ctrl+Shift+ArrowDown** | **Show** all inline comments (expand all [+]) |

## 13. Technical Architecture: Blip Data Model

### Topic = Meta-Blip (The Root)

A **Topic** (also called "Wave") is the root container. It IS a blip - the meta-blip:

```typescript
type Topic = {
  _id: string;              // The waveId itself
  type: 'topic' | 'wave';
  title: string;            // DISPLAYED title (extracted from first line of content)
  content: string;          // Full content - title is just first line with H1 styling
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  // ... other topic metadata
};
```

**The Title IS the First Line:**
- When creating a topic, the title is stored in `title` field for indexing/display
- But it's ALSO the first line of `content` with default H1/bold styling
- Editing the topic edits the content directly - title updates automatically
- The `title` field is derived/synced from the first line of content

### Server-Side Blip Structure

Each child blip is stored with these fields:

```typescript
type Blip = {
  _id: string;              // Format: "waveId:bTIMESTAMP"
  type: 'blip';
  waveId: string;           // Parent topic/wave ID
  parentId?: string | null; // Parent blip ID (null = root-level, child of the topic itself)
  anchorPosition?: number;  // Character offset for INLINE comments (null = REPLY at bottom)
  content: string;          // Rich HTML content (can include bullets, formatting, etc.)
  authorId: string;         // User who created it
  authorName: string;       // Display name
  createdAt: number;        // Timestamp
  updatedAt: number;        // Last modified
  deleted?: boolean;        // Soft-delete flag
};
```

### Root-Level Blips vs Topic Content

- **parentId = null**: This blip is a direct child of the TOPIC (meta-blip)
- **parentId = blipId**: This blip is a child of another blip
- **Topic content**: The topic itself has content (including title as first line) that can have inline comments

### Reply vs Inline Comment in the Data Model

| Field | Reply (blip UNDER) | Inline Comment (blip IN) |
|-------|-------------------|--------------------------|
| `parentId` | Set to parent blip ID | Set to parent blip ID |
| `anchorPosition` | **null/undefined** | **Character offset** where it's embedded |
| Location | At the END of parent's content | At the ANCHOR POSITION within content |

### Creating a Reply

```
POST /api/blips
{
  "waveId": "topic-123",
  "parentId": "topic-123:b1705123456789",
  "content": "<p>My reply to everything</p>"
  // NO anchorPosition = appears at bottom
}
```

### Creating an Inline Comment (Ctrl+Enter)

```
POST /api/blips
{
  "waveId": "topic-123",
  "parentId": "topic-123:b1705123456789",
  "anchorPosition": 15,  ← Character offset where cursor was
  "content": "<p></p>"   ← Empty, user will fill it in
}
```

### Flat Storage, Tree + Anchor Rendering

- **Database**: Blips are stored FLAT (no nesting in storage)
- **Client**: Reconstructs tree using `parentId` references
- **Rendering**:
  - Blips with `anchorPosition` → rendered INLINE at that position in parent's content
  - Blips without `anchorPosition` → rendered as REPLIES at the bottom

### Container Structure When Rendering

```
EXPANDED BLIP CONTAINER
├── Toolbar
├── Content with INLINE COMMENTS embedded at anchor positions
│   │
│   │  "Text text [BLIP X] more text [BLIP Y] end text"
│   │             ↑                  ↑
│   │        anchor=10          anchor=25
│   │
├── REPLIES (child blips with NO anchor)
│   ├── Reply 1 [+]
│   └── Reply 2 [+]
│
└── "Write a reply..." (creates reply with no anchor)
```

### Content vs Child Blips (CORRECTED 2026-01-20)

| Aspect | Within ONE Blip | Child Blips (Reply OR Inline Comment) |
|--------|-----------------|---------------------------------------|
| **Created by** | Enter, Tab, Shift+Tab | "Write a reply..." OR Ctrl+Enter |
| **Storage** | Single `content` field | Separate database documents |
| **Author** | One author per blip | Each blip has own author |
| **Timestamp** | One updatedAt | Each blip has own timestamps |
| **Can collapse** | No (internal structure) | Yes (each child can collapse) |
| **Can have children** | No | Yes (recursive) |

**CORRECTED:** Both "Write a reply..." AND Ctrl+Enter create separate blip documents. The difference is WHERE they appear (bottom vs inline at cursor).

## 14. Editor Implementation (TipTap)

The blip editor uses TipTap 2.x with these key extensions:

### Core Extensions (from StarterKit)
- **Paragraph** - Basic text blocks
- **BulletList** - Unordered lists (•)
- **OrderedList** - Numbered lists (1. 2. 3.)
- **ListItem** - Handles Enter/Tab/Shift+Tab for list manipulation
- **Bold, Italic, Strike, Code** - Inline formatting
- **Heading** - H1-H6 headers
- **BlockQuote** - Quoted text blocks
- **HorizontalRule** - Divider lines

### Custom Extensions
- **Underline** - Ctrl+U support
- **TextColor** - Text color picker
- **Highlight** - Background color highlighting
- **Link** - URL linking
- **ImageGadget** - Image insertion
- **InlineCommentsVisibility** - Toggle inline comments

### Keyboard Handling Architecture (Updated 2026-01-24)

The keyboard handling uses TipTap's `addKeyboardShortcuts()` in `BlipKeyboardShortcuts.ts`:

```typescript
addKeyboardShortcuts() {
  return {
    // Tab: indent bullet (works in list context)
    'Tab': () => {
      if (inListItem) {
        this.editor.commands.sinkListItem('listItem');
      } else {
        this.editor.commands.toggleBulletList();
      }
      return true;  // Always capture to prevent focus escape
    },

    // Shift+Tab: outdent bullet
    'Shift-Tab': () => {
      if (inListItem) {
        this.editor.commands.liftListItem('listItem');
      }
      return true;
    },

    // Ctrl+Enter: Create NEW inline child blip with [+] marker
    'Mod-Enter': () => {
      if (opts.onCreateInlineChildBlip) {
        const { from } = this.editor.state.selection;
        opts.onCreateInlineChildBlip(from);  // Callback handles everything
      }
      return true;
    },

    // Plain Enter: NOT intercepted - TipTap handles naturally
  };
}
```

**Ctrl+Enter Flow (Current Implementation):**

1. `BlipKeyboardShortcuts` captures Mod-Enter
2. Calls `onCreateInlineChildBlip(anchorPosition)` callback
3. Callback in `RizzomaBlip.tsx`:
   - Creates child blip via `POST /api/blips` with `anchorPosition`
   - Gets new blip ID from response
   - Calls `editor.commands.insertBlipThread({ threadId: newBlipId })`
   - Navigates to new subblip URL

**Key insight:** We DO create a separate blip document (that's correct BLB behavior), but we ALSO insert a `[+]` marker into the parent content so users can navigate back to it.

**What NOT to do:**
```typescript
// DON'T block TipTap's natural handlers with DOM listeners
dom.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.preventDefault();  // Breaks bullet lists!
});
```

TipTap's ListItem extension handles Enter/Tab/Shift+Tab correctly for list manipulation. Only intercept specific shortcuts like Mod-Enter.

## 15. Implementation Status (2026-01-24)

### Topic as Meta-Blip - IMPLEMENTED

The Topic is now a true meta-blip with editable content:

| Feature | Status | Notes |
|---------|--------|-------|
| **Topic IS a blip** | ✅ Working | Topic is the root meta-blip container |
| **Title = First line** | ✅ Working | Title shown as H1 in TipTap editor |
| **Topic content editable** | ✅ Working | Click Edit button, edit title + content via TipTap |
| **Title syncing** | ✅ Working | `extractTitleFromContent()` syncs H1 to title field |
| **Auto-save** | ✅ Working | Debounced 300ms save on content change |
| **Topic toolbars** | ✅ Working | Collab toolbar + Edit toolbar at top of topic |

**Key Implementation Details:**
- `RizzomaTopicDetail.tsx` uses `useEditor` hook from TipTap
- When entering edit mode, `startEditingTopic()` merges title (as H1) with content
- Uses `hasSetInitialContentRef` to prevent useEffect feedback loop
- `extractTitleFromContent()` extracts title from H1 for database syncing
- CSS `.topic-content-edit` styles the editable area

### Keyboard Shortcuts - Current State

| Shortcut | Status | Notes |
|----------|--------|-------|
| **Enter** | ✅ Working | TipTap default - new line/bullet at same level |
| **Tab** | ✅ Working | Indents bullet (sinkListItem) |
| **Shift+Tab** | ✅ Working | Outdents bullet (liftListItem) |
| **Ctrl+Enter** | ✅ **IMPLEMENTED** | Creates child blip + inserts `[+]` marker + navigates |

### BlipThread - IMPLEMENTED (2026-01-24)

The inline `[+]` marker system is now fully implemented:

| Feature | Status | Notes |
|---------|--------|-------|
| **BlipThreadNode** | ✅ Working | TipTap inline atom node for `[+]` markers |
| **insertBlipThread command** | ✅ Working | Editor command to insert markers |
| **Click navigation** | ✅ Working | Clicking `[+]` navigates to subblip URL |
| **anchorPosition storage** | ✅ Working | Server stores position in blip document |
| **Content persistence** | ✅ Working | Markers saved as `<span data-blip-thread>` in HTML |
| **Unread indicator** | ✅ Working | Green color via `.has-unread` class |

### Key Files

| File | Purpose |
|------|---------|
| `src/client/components/editor/extensions/BlipThreadNode.tsx` | TipTap node + click handler |
| `src/client/components/editor/extensions/BlipThread.css` | Marker styling |
| `src/client/components/editor/extensions/BlipKeyboardShortcuts.ts` | Ctrl+Enter handler |
| `src/client/components/editor/EditorConfig.tsx` | Extension registration |
| `src/client/components/blip/RizzomaBlip.tsx` | Callback creates blip + inserts marker |
| `src/client/main.tsx` | Click handler setup |
| `src/server/schemas/wave.ts` | Blip type with `anchorPosition` field |
| `src/server/routes/blips.ts` | API accepts `anchorPosition` |

### Console Verification

When Ctrl+Enter is pressed, should see in browser console:
```
[RizzomaBlip] stableCreateInlineChildBlip wrapper called with position: N
[RizzomaBlip] createChildBlipFromEditor called, canComment: true, anchorPosition: N
[RizzomaBlip] Creating child blip for wave: xxx, parent: xxx:byyy
[RizzomaBlip] Created child blip via Ctrl+Enter: xxx:bzzz
```

Then the `[+]` marker appears at cursor and navigation occurs.

## 16. Subblips: The Hidden Dimension (Hands-On Learning 2026-01-20)

This section documents critical learnings from hands-on experimentation in live Rizzoma (rizzoma.com).

### What Was Previously Misunderstood

The previous documentation described Ctrl+Enter as creating "inline comments at anchor positions within text" - implying margin-note-style annotations embedded in prose. **This was incomplete.**

**The key insight:** When you press **Ctrl+Enter at ANY cursor position** — whether at the end of a list item, mid-sentence in prose, or even mid-word — you create a **SUBBLIP**: a completely new navigable document anchored at that exact position.

> **CORRECTION (2026-02-06):** Ctrl+Enter is NOT limited to list item endings. It works at ANY cursor position in ANY text. The [+] marker always appears at the exact character position where the cursor was. Mid-sentence Ctrl+Enter splits the text: `text-before [+] text-after`.

### The BLB Pattern is Literal

The name "Bullet-Label-Blip" is more literal than previously understood:

| Component | What It Actually Is |
|-----------|---------------------|
| **Bullet** | The list item marker (•) |
| **Label** | The visible text of the list item ("Label one", "Label two") |
| **Blip** | The **HIDDEN SUBBLIP** that collapses behind the [+] indicator |

When you create a list item and then create content below it with Ctrl+Enter, you're creating **the Blip part of the BLB triplet** - a nested document that users drill into.

### Subblip Creation: Step-by-Step

**From the hands-on exercise creating "Try" topic structure:**

1. **Start with a list item:**
   ```
   • Label one
   ```

2. **Position cursor (e.g., at END of list item) and press Ctrl+Enter:**
   ```
   • Label one [+]   ← [+] appears at cursor position!
   ```
   - Works at ANY cursor position: end of list item, mid-sentence, mid-word
   - The URL CHANGES: `/topic/{topicId}/` → `/topic/{topicId}/0_b_xxx/`
   - You're now INSIDE the subblip, editing a blank document

3. **Add content in the subblip:**
   ```
   (Inside the subblip)
   Nested item A
   Nested item B
   ```

4. **Click "Hide" to collapse the subblip:**
   - Returns to the parent view
   - The [+] indicator shows the subblip is there but collapsed

5. **Final view in parent:**
   ```
   • Label one [+]   ← Contains "Nested item A", "Nested item B"
   ```

### URL Structure for Subblips

Rizzoma uses URL paths to represent the current blip being viewed:

| Context | URL Pattern |
|---------|-------------|
| **Topic root** | `/topic/{topicId}/` |
| **First-level subblip** | `/topic/{topicId}/{blipPath}/` |
| **Deeper nesting** | `/topic/{topicId}/{path1}/{path2}/...` |

**Example from exercise:**
- Topic: `/topic/cdefd4249451e7015ca4c8c1aaeb12e5/`
- After Ctrl+Enter: `/topic/cdefd4249451e7015ca4c8c1aaeb12e5/0_b_cjs5_coktm/`

This URL change is **critical** - it means subblips are addressable, linkable, and navigable as first-class entities.

### Clicking Behavior: Navigation Not Selection

**Key discovery:** Clicking on the [+] indicator **navigates INTO the subblip** rather than selecting the text for editing.

| Click Target | Behavior |
|--------------|----------|
| Text WITHOUT [+] | Enters edit/view mode for that content |
| The [+] icon itself | **Opens/navigates INTO the subblip** |
| Text near [+] in view mode | May navigate into the subblip |

> **Note (2026-02-06):** The [+] marker can appear on list items, in mid-sentence prose, or even mid-word. Clicking the [+] icon itself always navigates into the subblip regardless of context.

### Creating Sibling Entries After Collapsed Subblips

When you have a collapsed subblip and want to add a sibling (not a child), you need to:

1. Click on the parent list (NOT on the item with [+])
2. Press **End** to go to end of line
3. Press **Enter** to create a new sibling list item

**From the exercise - adding "Label two" after "Label one [+]":**
```
• Label one [+]
• Label two        ← Created with End + Enter on previous line
```

### The [+] Indicator Meaning (Corrected 2026-02-06)

The [+] indicator means:

**"There is a SUBBLIP (inline comment) anchored at this position that you can navigate into"**

- It represents a **first-class blip document** with its own URL
- Clicking it navigates INTO that document (or expands it inline)
- It can appear on list items, in mid-sentence prose, or even mid-word
- Multiple [+] markers can exist within a single sentence at different positions
- It is NOT limited to list items — any text can have [+] markers

### Reply vs Inline Comment (Corrected 2026-02-06)

> **IMPORTANT:** "Inline Comment" and "Subblip" are the SAME thing. There is NO distinction based on cursor position. Ctrl+Enter ALWAYS creates an inline comment blip, whether at end of a list item, mid-sentence, or mid-word.

| Type | Created By | Where It Appears | Has Hide Button? | URL Changes? |
|------|-----------|------------------|------------------|--------------|
| **Reply** | "Write a reply..." | Bottom of expanded blip | **NO** — cannot collapse to [+] | No |
| **Inline Comment (= Subblip)** | Ctrl+Enter at ANY cursor position | [+] marker at exact anchor position | **YES** — can collapse to [+] | YES - new URL path |

**Key distinctions:**
- **Replies** are standalone thread comments — they cannot be hidden/collapsed
- **Inline comments** are anchor-positioned subblips — they CAN be hidden to [+]
- Both are full blip documents with their own content, author, timestamp, and children
- The "Blip" in BLB refers to inline comments (Ctrl+Enter), NOT replies

### Final Structure from Hands-On Exercise

The "Try" topic now has this structure:

```
Try                          ← Topic title (H1)
• Label one [+]              ← Contains: Nested item A, Nested item B
• Label two [+]              ← Contains: Nested item C, Nested item D
```

Each [+] represents a fully navigable subblip with its own content and URL.

### Summary: The Fractal Navigation Model

Rizzoma implements a true fractal outliner:

1. **Topics contain blips** (the root level)
2. **Blips can contain subblips** (infinite nesting)
3. **Each subblip is a full document** with its own URL
4. **The [+] is a portal** into the nested document
5. **Labels are the navigation UI** - click to drill down
6. **"Hide" collapses back** to the parent view

This is why it's "Bullet-Label-Blip" - you see bullets with labels, and behind each label is a potentially rich blip document that you can explore.

## 17. BlipThread Implementation (2026-01-24)

This section documents the technical implementation of inline `[+]` markers using TipTap's node system.

### Architecture Decision: Marker IS Content

Following the original Rizzoma architecture, the `[+]` marker is **embedded directly in the content**, not stored separately with anchor positions. This means:

1. **The marker is a TipTap node** - part of the document structure
2. **Yjs syncs automatically** - collaborative editing works out of the box
3. **Content persists the marker** - saved as HTML with `<span data-blip-thread="...">` tags

### BlipThreadNode: TipTap Inline Atom

The `[+]` marker is implemented as a TipTap `Node` extension:

```typescript
// src/client/components/editor/extensions/BlipThreadNode.tsx
export const BlipThreadNode = Node.create({
  name: 'blipThread',
  group: 'inline',      // INLINE, not block
  inline: true,
  atom: true,           // Non-editable, self-contained
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      threadId: { default: null },    // Child blip ID (e.g., "waveId:b1234567")
      hasUnread: { default: false },  // Green indicator for unread content
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-blip-thread]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { class: 'blip-thread-marker', ...HTMLAttributes }, '[+]'];
  },

  addCommands() {
    return {
      insertBlipThread: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs }),
    };
  },
});
```

### Ctrl+Enter Flow (Updated)

When the user presses **Ctrl+Enter** in edit mode:

1. **Keyboard handler triggers** (`BlipKeyboardShortcuts.ts`)
2. **API call creates child blip** with `anchorPosition` stored
3. **`[+]` marker inserted** via `editor.commands.insertBlipThread({ threadId: newBlipId })`
4. **Content auto-saves** - the `[+]` marker becomes part of the parent blip's content
5. **Navigation to subblip** - URL changes to `/topic/{waveId}/{blipPath}/`

```typescript
// From RizzomaBlip.tsx - createChildBlipFromEditor callback
const response = await fetch('/api/blips', {
  method: 'POST',
  body: JSON.stringify({
    waveId,
    parentId: blip.id,
    content: '<p></p>',
    anchorPosition,  // Character offset where cursor was
  }),
});

const newBlipId = (await response.json()).id;

// Insert [+] marker at cursor position
editor.commands.insertBlipThread({ threadId: newBlipId, hasUnread: false });

// Navigate to new subblip
window.location.hash = `#/topic/${waveId}/${blipPath}/`;
```

### HTML Storage Format

When saved, the content includes the marker as a span element:

```html
<p>The quick brown <span data-blip-thread="topic123:b1705123456789" class="blip-thread-marker">[+]</span> fox jumped.</p>
```

When TipTap loads this content, `parseHTML()` converts it back to a BlipThread node.

### Click Handler: Event Delegation

Click handling is implemented via document-level event delegation:

```typescript
// src/client/components/editor/extensions/BlipThreadNode.tsx
export function setupBlipThreadClickHandler(): () => void {
  const handler = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('blip-thread-marker')) return;

    const threadId = target.getAttribute('data-blip-thread');
    if (!threadId) return;

    e.preventDefault();
    e.stopPropagation();

    // Navigate to subblip URL
    const [waveId, blipPath] = threadId.split(':');
    window.location.hash = `#/topic/${waveId}/${blipPath}/`;
  };

  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
}
```

This is called once in `main.tsx` on app mount.

### CSS Styling

```css
/* src/client/components/editor/extensions/BlipThread.css */
.blip-thread-marker {
  font-family: monospace;
  font-size: 11px;
  color: #999;
  cursor: pointer;
  padding: 0 2px;
}

.blip-thread-marker:hover {
  color: #666;
  background-color: rgba(0, 0, 0, 0.05);
}

/* Green for unread (Follow-the-Green) */
.blip-thread-marker.has-unread {
  color: #2e8b57;
  font-weight: bold;
}
```

### Server-Side: anchorPosition Field

The `Blip` type now includes an optional `anchorPosition` field:

```typescript
// src/server/schemas/wave.ts
export type Blip = {
  _id?: string;
  type: 'blip';
  waveId: string;
  parentId?: string | null;
  content?: string;
  anchorPosition?: number;  // Character offset for inline blips
  // ... other fields
};
```

The `POST /api/blips` endpoint accepts and stores this field:

```typescript
// src/server/routes/blips.ts
const { waveId, parentId, content, anchorPosition } = req.body;

const blip: Blip = {
  // ... other fields
  ...(typeof anchorPosition === 'number' ? { anchorPosition } : {}),
};
```

### Key Files

| File | Purpose |
|------|---------|
| `src/client/components/editor/extensions/BlipThreadNode.tsx` | TipTap node + click handler |
| `src/client/components/editor/extensions/BlipThread.css` | Marker styling |
| `src/client/components/editor/EditorConfig.tsx` | Extension registration |
| `src/client/components/blip/RizzomaBlip.tsx` | Ctrl+Enter handler that creates blip + inserts marker |
| `src/client/main.tsx` | Click handler setup on mount |
| `src/server/schemas/wave.ts` | Blip type with `anchorPosition` |
| `src/server/routes/blips.ts` | API endpoint accepting `anchorPosition` |

### Why This Architecture?

1. **Content-embedded markers** - The `[+]` is part of the text, not a separate overlay
2. **Collaborative editing** - Yjs handles the marker like any other content
3. **Persistence simplicity** - Just HTML, no separate anchor mapping table
4. **TipTap integration** - Uses standard node/command patterns
5. **Click navigation** - Event delegation handles all markers uniformly

### Comparison: Old vs New Understanding

| Aspect | Previous Understanding | Corrected Understanding |
|--------|----------------------|------------------------|
| **Inline comment** | Margin-note annotation | `[+]` marker embedded in content |
| **Storage** | Separate anchor positions | Marker IS part of content HTML |
| **Rendering** | Overlay at anchor offset | TipTap node rendered inline |
| **Sync** | Manual anchor mapping | Yjs syncs naturally as content |
| **Click behavior** | Select/expand inline | Navigate to subblip URL |

### Testing the Implementation

1. Enter edit mode on a blip
2. Type some text, position cursor
3. Press **Ctrl+Enter**
4. Verify: `[+]` marker appears at cursor position in content
5. Verify: New blip created in database with `anchorPosition`
6. Verify: Navigation occurs to `/topic/{waveId}/{blipPath}/`
7. Verify: "Hide" returns to parent with `[+]` still visible in content
8. Verify: Clicking `[+]` navigates back to the subblip

## 18. Hands-On BLB Study (2026-02-06) — New Findings

This section documents critical new learnings from a comprehensive hands-on session where a multi-layered BLB topic was created from scratch on live rizzoma.com, testing every feature.

**Study topic:** "BLB Study - Multi-Layer Hierarchy Test" — [rizzoma.com/topic/6cd1d04acf0cf762f920bdcf0fdc9e51/](https://rizzoma.com/topic/6cd1d04acf0cf762f920bdcf0fdc9e51/)
**Screenshots:** 24 screenshots with companion .md analysis files in `snapshots/blb-study/`

### 18a. Mid-Sentence Inline Comment Anchoring

Ctrl+Enter is NOT limited to end-of-line or end-of-list-item positions. It works at **any character position** in any text:

```
BEFORE: "...includes a strategic planning component, a financial oversight mechanism, and..."
                                                  ↑ cursor here, Ctrl+Enter

AFTER:  "...includes a strategic planning component[+], a financial oversight mechanism, and..."
                                                   ↑ [+] splits the text at anchor point
```

**Multiple [+] markers in one sentence** — confirmed with 3 inline blips within a single sentence:
```
The governance framework includes a strategic planning component[+], a financial oversight
mechanism[+], and an operational review process[+] that together ensure organizational alignment.
```

Each [+] anchors at the exact cursor position. When expanded, the inline blip content appears between the text fragments. When collapsed, only the small [+] icon appears inline.

### 18b. Inline Blip Lifecycle (Ctrl+Enter → Edit → Done → View → Hide → [+])

The full lifecycle of an inline comment blip:

```
1. Ctrl+Enter      → Inline blip CREATED, immediately in EDIT mode (cursor inside)
                      Edit toolbar visible: Done, Undo, Redo, formatting, Hide
2. Type content    → Edit in TipTap editor
3. Click "Done"    → Switches to VIEW mode, toolbar stays visible (active state)
                      Read toolbar: Edit, Hide, Link, Gear
4. Click outside   → Toolbar HIDES (just text visible, passive state)
5. Click into blip → Toolbar REAPPEARS (active state again)
6. Click "Hide"    → Blip COLLAPSES to [+] marker
                      Returns to parent blip view
7. Click [+]       → Expands to PASSIVE view (just text, NO toolbar)
                      See Section 18b2 for the three-state pattern
```

**Key:** "Hide" button is available in BOTH edit and view modes. The "Done" button saves and switches to view mode (does NOT collapse).

### 18b2. Inline Child Three-State Toolbar Pattern

Inline children differ from regular blips in toolbar visibility. Regular blips show their toolbar immediately when expanded. Inline children use a **progressive disclosure** pattern:

| State | Trigger | Toolbar | Content |
|-------|---------|---------|---------|
| **Collapsed** | Default / click Hide | None — just `[+]` marker | Hidden |
| **Expanded (passive)** | Click `[+]` marker | **NO toolbar** — just text | Visible, read-only |
| **Expanded (active)** | Click anywhere in blip content | Read toolbar: Edit, Hide, Link, Gear | Visible, read-only |
| **Expanded (editing)** | Click Edit button | Full edit toolbar: Done, undo/redo, formatting | Editable with TipTap |

**Why**: When a user expands `[+]` to read a comment, they want to see the TEXT, not a toolbar cluttering the view. The toolbar only appears when they deliberately interact with the blip (click into it). This matches original Rizzoma behavior where expanded inline comments show clean text first.

**Implementation** (`RizzomaBlip.tsx`):
- `isActive` state controls toolbar visibility
- Inline children initialize with `isActive = false` (even though `effectiveExpanded = true`)
- The `useEffect` that syncs `isActive` with `effectiveExpanded` explicitly skips inline children
- `handleBlipClick` sets `isActive = true` on click into the blip
- Click-outside handler (mousedown on document) sets `isActive = false`
- `BlipMenu` returns `null` when `!isActive`, so no DOM elements render

**CSS** (`BlipMenu.css`):
- Inline child toolbar uses `position: relative` (not `absolute`) to flow in layout
- CSS cascade protection: `.inline-child-expanded .blip-container:not(.active) .blip-menu-container { opacity: 0 !important }` prevents parent's `.active` from leaking through portal DOM

### 18c. "Hide" vs "Hide comments" — Two Different Operations

| Operation | Scope | Triggered By |
|-----------|-------|-------------|
| **"Hide"** | Collapses THIS specific inline blip to [+] | Button on individual inline blip's toolbar |
| **"Hide replies" (Ctrl+Shift+Up)** | Hides ALL child inline comments of the parent | Topic-level toolbar button |
| **"Show replies" (Ctrl+Shift+Down)** | Shows ALL child inline comments of the parent | Topic-level toolbar button |

### 18d. Reply vs Inline Comment — The Critical Difference

| Feature | Reply ("Write a reply...") | Inline Comment (Ctrl+Enter) |
|---------|---------------------------|---------------------------|
| **Created by** | "Write a reply..." input | Ctrl+Enter OR turquoise Insert Reply button |
| **Position** | Bottom of parent blip | At exact cursor position |
| **Has Hide button?** | **NO** — cannot collapse to [+] | **YES** — can collapse to [+] |
| **Can be hidden?** | Never | Yes, via Hide button or Ctrl+Shift+Up |
| **Toolbar (view mode)** | Edit, Delete | Edit, Get direct link, **Hide**, Delete comment, Other |
| **Is "BLB's Blip"?** | No | **Yes** — this IS the Blip in Bullet-Label-Blip |

Both can coexist within the same parent: an inline blip can contain text AND have threaded replies below it.

### 18e. The 5 Turquoise Sidebar Buttons

The right sidebar of the topic view has 5 turquoise/teal buttons (top to bottom):

| Button | Icon | Shortcut | What It Does |
|--------|------|----------|-------------|
| **Insert reply** | 💬 | Ctrl+Enter | Creates inline comment at cursor position (identical to Ctrl+Enter) |
| **Insert mention** | @ | — | Opens contact dropdown → inserts `\|@Name\|` widget inline |
| **Insert task** | ☑ | ~ | Opens contact + calendar picker → inserts `\|☐ Name DD Mon\|` widget |
| **Insert tag** | # | — | Opens existing tags dropdown → inserts `#tagname` widget |
| **Gadgets** | ⚙ | — | Opens gadget palette with 11 gadget types |

**Auto-Enter-Edit-Mode (2026-02-08):** These buttons are now visible whenever a blip with edit permission is active (not just in edit mode). Clicking a button when not editing will:
1. Queue the insert action in `pendingInsertRef`
2. Call `handleStartEdit()` to enter edit mode
3. Once the TipTap editor initializes, execute the queued action via `requestAnimationFrame`

This bridges the gap between "active blip" and "editing blip" — users no longer need to click Edit first before using sidebar insert buttons. The `BLIP_ACTIVE_EVENT` custom event notifies `RightToolsPanel` when an editable blip becomes active, making the buttons visible.

### 18f. Inline Widgets — @mention, ~task, #tag

Three types of inline widgets can be embedded in blip content:

#### @mention
- **Trigger:** Click turquoise @ button, or type `@` in text
- **Flow:** Contact dropdown appears → select person → widget inserted
- **Rendering:** `|@Stephan De Spiegeleire|` — teal/green colored inline widget with pipe `|` delimiters
- **Clicking:** Opens contact profile or action menu

#### ~task
- **Trigger:** Click turquoise ☑ button, or type `~` in text
- **Flow:** Checkbox + contact dropdown → select person → calendar date picker → select date
- **Rendering:** `|☐ Stephan De Spiegeleire 13 Feb|` — widget with checkbox, assignee name, due date
- **Clicking:** Opens task editor popup (assignee email textbox, date picker, Complete status, Delete/Convert to @/Close)
- **Task editor popup fields:** assignee email, due date, optional description, status

#### #tag
- **Trigger:** Click turquoise # button, or type `#` in text
- **Flow:** `#` inserted + dropdown of existing workspace tags → type or select → Enter to confirm
- **Rendering:** `#featuretest` — clickable inline widget (NO pipe delimiters, unlike @mention and ~task)
- **Clicking:** Filters topics by that tag
- **Note:** Rizzoma strips hyphens from tag names (e.g., "blb-study" → "blbstudy")

### 18g. Gadgets — 11 Embedded Interactive Widget Types

Gadgets are **embedded interactive widgets** that render as **iframes** within the editor content.

| # | Gadget | Purpose |
|---|--------|---------|
| 1 | **Add gadget** | Generic gadget URL input |
| 2 | **LaTeX** | Mathematical formula rendering |
| 3 | **Google Spreadsheet** | Embedded spreadsheet |
| 4 | **Bubble on Picture** | Image annotation tool |
| 5 | **Code formatting** | Syntax-highlighted code blocks |
| 6 | **Pollo** | Polling/survey widget |
| 7 | **Yes \| No \| Maybe** | Quick 3-option voting (green/red/yellow buttons) |
| 8 | **Googley Like Button** | +1/like widget |
| 9 | **iFrame** | Embed any URL |
| 10 | **YouTube** | Embedded video player |
| 11 | **ContentZ** | Content aggregation widget |

**Gadget behavior (Yes|No|Maybe example):**
- Renders as full-width block element (not inline like @mention)
- Shows 3 colored buttons: Green=Yes, Red=No, Gold=Maybe
- Click to vote → your avatar + name appears under your choice
- Button becomes disabled after voting (one vote per user)
- Votes persist server-side

**Insertion gotcha:** The cursor must be actively focused inside the editor content BEFORE clicking the Gadgets button. Clicking the gadget palette alone moves focus away from the editor.

### 18h. Widget Rendering Pattern Summary

| Widget Type | Rendering | Inline? | Delimiters | Collapsible? |
|-------------|-----------|---------|------------|-------------|
| **@mention** | Colored text widget | Yes (inline) | `\|...\|` pipes | No |
| **~task** | Checkbox + name + date | Yes (inline) | `\|...\|` pipes | No |
| **#tag** | Clickable text | Yes (inline) | None | No |
| **Gadget** | Full-width iframe | No (block) | None | No |
| **Inline blip [+]** | Small gray icon | Yes (inline) | None | **Yes** (Hide/Show) |

### 18i. BLB Study Screenshots Reference

All 24 screenshots are in `snapshots/blb-study/` with `260206-HHMM-description.png` naming. Each has a companion `.md` analysis file.

**Key reference screenshots:**
| Screenshot | What It Proves |
|------------|---------------|
| `260206-1906-all-five-sections-collapsed-blb.png` | Canonical BLB "Table of Contents" view — 5 bullets with [+] |
| `260206-1902-three-level-nesting.png` | 3-level recursive BLB hierarchy (root → blip → blip) |
| `260206-1915-three-midsentence-inline-blips-collapsed.png` | 3 [+] markers within ONE sentence |
| `260206-1913-reply-inside-inline-blip.png` | Reply vs inline comment — reply has NO Hide button |
| `260206-1920-mention-task-tag-widgets.png` | @mention + ~task + #tag all on one line |
| `260206-1922-gadget-dropdown.png` | All 11 gadget types in palette |
| `260206-1926-yesno-voted.png` | Yes\|No\|Maybe gadget after voting |
| `260206-1928-insert-reply-button-inline-blip.png` | Insert Reply button splits text mid-word |
