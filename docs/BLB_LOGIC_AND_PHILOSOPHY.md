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

## 2. Default "Hidden" (Collapsed) State

The system enforces modularity by default:

*   **Default State:** Modular blips default to **COLLAPSED** ("Hidden").
*   **The View:** Users initially see only the **Label** (headline) and the `+` expand control.
*   **The Behavior:** This creates a clean **Table of Contents** by default. Users "drill down" (expand) only the branches they care about.
*   **Note:** Expanding a parent does *not* automatically expand its children. Users traverse the tree level by level.

## 3. "Comments" vs. "Replies" (The "Right Place")

*   **The "Reply" Field:** Avoid it. It appends content linearly (like a chat) or unstructured at the bottom.
    *   *Constraint:* Replies cannot be hidden/structured as effectively.
*   **"Comments" (Nested Blips):** Use these primarily.
    *   **Insert Precisely:** Place your blip *exactly* where it belongs in the tree (the "Forest").
    *   **Zoom Out:** If lost, collapse parent blips to see the "Forest" (high-level structure) and find the correct insertion point (e.g., under "Progress" -> "Today's Date").
    *   **Refactor:** If you see a messy discussion, **restructure it**. Break it into bullets. Move content into the correct hierarchy.
*   **Copy/Paste Rule:** Only **Blips** can be copy/pasted while preserving author/timestamp metadata. Large text blocks cannot.

## 4. Visual & Behavioral Mandates

1.  **Never side-by-side:** Do not place multiple root blips or unnested blips adjacent if they belong together. Structure them.
2.  **No "Messy" Text:** If a blip looks like a wall of text, break it down.
3.  **Playback:** If content jumps, disappears, or looks "weird" (often a browser sync issue), use the **Playback** feature to recover context or refresh immediately.
4.  **Self-Structuring:** It is every user's duty to maintain the BLB structure. If you see a "non-BLB" message, refactor it (e.g., break a long email-style post into labeled bullets).

## 5. View Mode vs Edit Mode

Rizzoma has two distinct interaction modes for each blip:

### View Mode (Reading/Navigating)

**Toolbar shows:**
```
Edit | 📎 | 📄 | 🔗
```

**Characteristics:**
- **"Edit" button** visible at top-left of blip
- Content is **read-only**
- Blips shown as **bulleted list with expand icons (□)**
- Click the **□ icon** to expand/collapse and see hidden content
- You're **navigating**, not modifying
- This is the "Table of Contents" view

### Edit Mode (Creating/Modifying)

**Toolbar shows:**
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
| **Fold** | **THE KEY BLB CONTROL** - collapses blip to label only |
| 🗑 | Delete |

**Characteristics:**
- **"Done" button** (green/teal) replaces "Edit"
- Full **formatting toolbar** appears
- Text is **editable** - you can type
- **Fold button** - THE KEY CONTROL for BLB!
- **"Write a reply..."** area visible below for adding nested content
- Click **Done** to save and exit edit mode

### The Mode Transition Flow

```
VIEW MODE                           EDIT MODE
    │                                   │
    │  Click "Edit" on a blip           │
    │ ─────────────────────────────────>│
    │                                   │
    │                          • Type text
    │                          • Format (bold, bullets)
    │                          • Check "Hide" ← BLB!
    │                          • Add replies (nesting)
    │                                   │
    │        Click "Done"               │
    │<───────────────────────────────── │
    │                                   │
    ▼
Content saved, back to View Mode
```

## 6. Creating a New Topic - The Actual Workflow

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

## 7. Key Visual Elements

| Element | Visual | Purpose |
|---------|--------|---------|
| **Bullet** | • | Visual marker for each blip |
| **Label** | First line text | Always visible, acts as TOC entry |
| **Expand icon** | □ | Indicates hidden children, click to expand |
| **Fold button** | Fold | Collapses body content, shows only label |
| **Indentation** | Nested spacing | Shows hierarchy level |
| **Done button** | Green/teal | Saves edits and exits edit mode |
| **Edit button** | Gray | Enters edit mode for a blip |

## 8. Summary for Developers

*   **Default View:** Must act like a "Mind Map" or "Folder Structure".
*   **Rendering:** If a blip is marked "Hidden", render **only** the first line/label and the expand control.
*   **Persistence:** The "Hidden" state is a **shared property** of the blip, not a local user preference.
*   **Toolbar:** Must include the "Fold" button prominently in edit mode.
*   **Mode Toggle:** Clear visual distinction between View Mode ("Edit" button) and Edit Mode ("Done" button).
*   **Insertion:** UI must encourage nested insertion (threading) over linear appending.
*   **Expand Icons:** All collapsed blips must show an expand indicator (□).

## 9. Reference Screenshots

The following screenshots from live Rizzoma (captured 2026-01-19) document the actual behavior:

| Screenshot | Shows |
|------------|-------|
| `screenshots/260119/01-new-topic-clicked.png` | Topic creation wizard |
| `screenshots/260119/02-title-typed.png` | Initial topic with title |
| `screenshots/260119/03-structure-created.png` | Standard HCSS template structure |
| `screenshots/260119/08-blb-interaction-proof.png` | Edit mode with nested blips and Hide checkbox |
| `screenshots/260119/11-blb-bulleted-forced.png` | Collapsed view (Table of Contents) |
| `screenshots/260119/39-blb-final-check.png` | View mode with expand icons |
| `screenshots/260119/41-blb-mouse-only-done.png` | Final BLB structure |
