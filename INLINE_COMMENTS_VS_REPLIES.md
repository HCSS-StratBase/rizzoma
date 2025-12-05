# Understanding Rizzoma: Inline Comments vs Replies

## 1. REPLIES (What we have now)
- Appear UNDERNEATH the blip as separate blips
- Form a threaded conversation below the original content
- Example:
  ```
  [Original Blip]
  This is the main content of a blip.
  
  ↩ Reply
  
    [Reply 1]
    This is a reply to the whole blip
    
      [Nested Reply]
      This is a reply to Reply 1
    
    [Reply 2]
    Another reply to the main blip
  ```

## 2. INLINE COMMENTS (What we need)
- Attached to SPECIFIC TEXT within a blip
- Highlighted/underlined text shows there's a comment
- Comments appear in margin/sidebar or as popups
- Example:
  ```
  [Original Blip]
  This is the main content with [some highlighted text]¹ that has
  a comment attached to it.
  
  ¹ Comment: "This text needs clarification"
  ```

## Key Differences:
1. **Location**: Inline comments are ON the text, replies are BELOW the blip
2. **Scope**: Inline comments refer to specific text selections, replies refer to the whole blip
3. **Display**: Inline comments show as annotations on text, replies show as separate blips
4. **Interaction**: Click highlighted text to see inline comment, click Reply button to add reply

## Current Implementation Issues:
- The "Add inline comment" button creates a regular reply with quoted text
- No visual indication of which text has comments
- Comments don't stay attached to the selected text
- Missing the annotation/highlight system

## What Needs to be Fixed:
1. Store inline comments with text range/position data
2. Render highlights/underlines on commented text
3. Show comments in margin or popup when hovering/clicking
4. Keep inline comments separate from replies in the data model