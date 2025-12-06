import type { Editor } from '@tiptap/core';
import { useState, useRef, useEffect } from 'react';
import { DEFAULT_BG_COLORS } from '@shared/constants/textFormatting';
import './EditorToolbar.css';

interface EditorToolbarProps {
  editor: Editor | null;
}

// Common emojis for quick access
const EMOJI_LIST = [
  '😀', '😃', '😄', '😊', '😎', '🤔', '😍', '🥰',
  '😂', '🤣', '😭', '😢', '😅', '😆', '🙄', '😏',
  '👍', '👎', '👏', '🙏', '💪', '✨', '🔥', '💯',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '⭐', '🌟', '💫', '🌈', '🎉', '🎊', '🎯', '🚀',
  '💡', '📌', '📍', '🔗', '📎', '✅', '❌', '⚠️',
  '🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '🌿', '🍀'
];

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [showBgColor, setShowBgColor] = useState(false);
  const [showTextColor, setShowTextColor] = useState(false);
  const [showGadget, setShowGadget] = useState(false);
  
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef<HTMLDivElement>(null);
  const formatRef = useRef<HTMLDivElement>(null);
  const bgColorRef = useRef<HTMLDivElement>(null);
  const textColorRef = useRef<HTMLDivElement>(null);
  const gadgetRef = useRef<HTMLDivElement>(null);

  const fontSizes = ['Small', 'Normal', 'Large', 'Extra Large'];
  const textColors = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#666666'];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(target)) {
        setShowEmojiPicker(false);
      }
      if (fontSizeRef.current && !fontSizeRef.current.contains(target)) {
        setShowFontSize(false);
      }
      if (formatRef.current && !formatRef.current.contains(target)) {
        setShowFormat(false);
      }
      if (bgColorRef.current && !bgColorRef.current.contains(target)) {
        setShowBgColor(false);
      }
      if (textColorRef.current && !textColorRef.current.contains(target)) {
        setShowTextColor(false);
      }
      if (gadgetRef.current && !gadgetRef.current.contains(target)) {
        setShowGadget(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!editor) {
    return null;
  }

  const insertEmoji = (emoji: string) => {
    // Get current selection/cursor position
    const { from, to } = editor.state.selection;
    
    // Insert emoji at cursor position
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }: { tr: any; dispatch?: (tr: any) => void }) => {
        if (dispatch) {
          tr.insertText(emoji, from, to);
          dispatch(tr);
        }
        return true;
      })
      .run();
    
    setShowEmojiPicker(false);
  };

  const setFontSize = (size: string) => {
    const level = size === 'Small' ? 3 : size === 'Large' ? 2 : size === 'Extra Large' ? 1 : 0;
    if (level > 0) {
      editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
    } else {
      editor.chain().focus().setParagraph().run();
    }
    setShowFontSize(false);
  };

  const clearFormatting = () => {
    editor.chain()
      .focus()
      .clearNodes()
      .unsetAllMarks()
      .run();
  };

  const parseChartSeries = (input: string | null): Array<{ label: string; value: number }> => {
    if (!input) return [];
    return input
      .split(',')
      .map((pair) => {
        const [label, value] = pair.split(':');
        return {
          label: label?.trim() || '',
          value: Number(value ?? 0),
        };
      })
      .filter((item) => item.label);
  };

  const insertChartGadget = () => {
    const title = window.prompt('Chart title', 'Sprint burndown');
    const typeInput = window.prompt('Chart type (bar, line, pie)', 'bar');
    const seriesInput = window.prompt('Data points (label:value, comma separated)', 'Todo:5,Doing:3,Done:2');
    const type = ['bar', 'line', 'pie'].includes((typeInput || '').toLowerCase())
      ? (typeInput as string).toLowerCase()
      : 'bar';
    const data = parseChartSeries(seriesInput);
    editor
      .chain()
      .focus()
      .insertChart({
        title: title || 'Chart',
        type,
        data: data.length ? data : [{ label: 'Empty', value: 0 }],
      })
      .run();
    setShowGadget(false);
  };

  const insertPollGadget = () => {
    const question = window.prompt('Poll question', 'Which option should we ship?') || 'Poll question';
    const optionsInput = window.prompt('Poll options (comma separated)', 'Option A,Option B,Option C');
    const allowMultiple = window.confirm('Allow multiple selections?');
    const options = (optionsInput || '')
      .split(',')
      .map((opt) => opt.trim())
      .filter(Boolean)
      .map((label, idx) => ({ id: `opt-${idx}`, label, votes: 0 }));
    editor
      .chain()
      .focus()
      .insertPoll({
        question,
        options: options.length ? options : [{ id: 'opt-0', label: 'Yes', votes: 0 }],
        allowMultiple,
      })
      .run();
    setShowGadget(false);
  };

  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'active' : ''}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'active' : ''}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? 'active' : ''}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={editor.isActive('code') ? 'active' : ''}
          title="Inline Code"
        >
          &lt;/&gt;
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? 'active' : ''}
          title="Underline (Ctrl+U)"
        >
          <u>U</u>
        </button>
      </div>

      <div className="toolbar-group">
        <div className="dropdown-wrapper" ref={fontSizeRef}>
          <button
            onClick={() => setShowFontSize(!showFontSize)}
            className={showFontSize ? 'active' : ''}
            title="Text Size"
          >
            Size ▼
          </button>
          {showFontSize && (
            <div className="dropdown-menu">
              {fontSizes.map(size => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className="dropdown-item"
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={editor.isActive('highlight') ? 'active' : ''}
          title="Highlight"
        >
          <span className="highlight-icon">H</span>
        </button>
        <div className="dropdown-wrapper" ref={formatRef}>
          <button
            onClick={() => setShowFormat(!showFormat)}
            className={showFormat ? 'active' : ''}
            title="Text Format"
          >
            Format ▼
          </button>
          {showFormat && (
            <div className="dropdown-menu">
              <button
                onClick={() => editor.chain().focus().setParagraph().run()}
                className={`dropdown-item ${editor.isActive('paragraph') ? 'active' : ''}`}
              >
                Normal Text
              </button>
              <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={`dropdown-item ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
              >
                Heading 1
              </button>
              <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={`dropdown-item ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
              >
                Heading 2
              </button>
              <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                className={`dropdown-item ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}
              >
                Heading 3
              </button>
              <button
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className={`dropdown-item ${editor.isActive('blockquote') ? 'active' : ''}`}
              >
                Blockquote
              </button>
              <button
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                className={`dropdown-item ${editor.isActive('codeBlock') ? 'active' : ''}`}
              >
                Code Block
              </button>
            </div>
          )}
        </div>
        <div className="dropdown-wrapper" ref={bgColorRef}>
          <button
            onClick={() => setShowBgColor(!showBgColor)}
            className={showBgColor ? 'active' : ''}
            title="Background Color"
          >
            <span style={{ background: '#ffd93d', padding: '2px 4px', borderRadius: '2px' }}>Bg</span>
          </button>
          {showBgColor && (
            <div className="color-picker">
              {DEFAULT_BG_COLORS.map(color => (
                <button
                  key={color}
                  className="color-button"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    editor.chain().focus().setHighlight({ color }).run();
                    setShowBgColor(false);
                  }}
                  title={color === '#ffffff' ? 'Clear' : color}
                />
              ))}
            </div>
          )}
        </div>
        <div className="dropdown-wrapper" ref={textColorRef}>
          <button
            onClick={() => setShowTextColor(!showTextColor)}
            className={showTextColor ? 'active' : ''}
            title="Text Color"
          >
            <span style={{ color: '#ff0000' }}>A</span>
          </button>
          {showTextColor && (
            <div className="color-picker">
              {textColors.map(color => (
                <button
                  key={color}
                  className="color-button"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    editor.chain().focus().setColor(color).run();
                    setShowTextColor(false);
                  }}
                  title={color}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'active' : ''}
          title="Bullet List"
        >
          • List
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'active' : ''}
          title="Ordered List"
        >
          1. List
        </button>
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={editor.isActive('taskList') ? 'active' : ''}
          title="Task List"
        >
          ☐ Tasks
        </button>
        <button
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          disabled={!editor.can().sinkListItem('listItem')}
          title="Indent"
        >
          →
        </button>
        <button
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          disabled={!editor.can().liftListItem('listItem')}
          title="Outdent"
        >
          ←
        </button>
      </div>

      <div className="toolbar-group">
        <button
          onClick={() => {
            const url = window.prompt('Enter URL:');
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }}
          className={editor.isActive('link') ? 'active' : ''}
          title="Add Link"
        >
          🔗
        </button>
        <button
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={!editor.isActive('link')}
          title="Remove Link"
        >
          🔗✕
        </button>
        <button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Line"
        >
          ―
        </button>
      </div>

      <div className="toolbar-group">
        <button
          onClick={() => {
            const text = window.prompt('Enter text to mention:');
            if (text) {
              editor.chain().focus().insertContent(`@${text} `).run();
            }
          }}
          title="Mention (@)"
        >
          @
        </button>
        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={showEmojiPicker ? 'active' : ''}
          title="Insert Emoji"
        >
          😊
        </button>
        {showEmojiPicker && (
          <div className="emoji-picker" ref={emojiPickerRef}>
            <div className="emoji-grid">
              {EMOJI_LIST.map((emoji, index) => (
                <button
                  key={index}
                  className="emoji-button"
                  onClick={() => insertEmoji(emoji)}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
          title="Undo (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
          title="Redo (Ctrl+Y)"
        >
          ↷
        </button>
        <button
          onClick={clearFormatting}
          title="Clear Formatting"
        >
          T̄x
        </button>
        <div className="dropdown-wrapper" ref={gadgetRef}>
          <button
            onClick={() => setShowGadget(!showGadget)}
            className={showGadget ? 'active' : ''}
            title="Insert Gadget"
          >
            🧩
          </button>
          {showGadget && (
            <div className="dropdown-menu">
              <button
                className="dropdown-item"
                onClick={() => {
                  const url = window.prompt('Enter image URL:');
                  if (url) {
                    editor.chain().focus().setImage({ src: url }).run();
                  }
                  setShowGadget(false);
                }}
              >
                🖼️ Image
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  const file = document.createElement('input');
                  file.type = 'file';
                  file.accept = '*/*';
                  file.onchange = (e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.files?.[0]) {
                      // In production, upload file and get URL
                      alert('File upload: ' + target.files[0].name);
                    }
                  };
                  file.click();
                  setShowGadget(false);
                }}
              >
                📎 Attachment
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  insertChartGadget();
                }}
              >
                📊 Chart
              </button>
              <button
                className="dropdown-item"
                onClick={insertPollGadget}
              >
                🗳️ Poll
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  const formula = window.prompt('Enter LaTeX formula:');
                  if (formula) {
                    editor.chain().focus().insertContent(`$${formula}$`).run();
                  }
                  setShowGadget(false);
                }}
              >
                ∑ Formula
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            const selection = editor.state.selection;
            const text = editor.state.doc.textBetween(selection.from, selection.to, ' ');
            const html = editor.getHTML();
            navigator.clipboard.writeText(text || html);
            window.dispatchEvent(new CustomEvent('toast', { 
              detail: { message: 'Copied to clipboard!', type: 'success' } 
            }));
          }}
          title="Copy"
        >
          📋
        </button>
      </div>
    </div>
  );
}
