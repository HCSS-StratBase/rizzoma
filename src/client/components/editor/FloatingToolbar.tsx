import { useEffect, useState } from 'react';
import './FloatingToolbar.css';

interface FloatingToolbarProps {
  editor: any; // TipTap editor instance
  isVisible: boolean;
}

export function FloatingToolbar({ editor, isVisible }: FloatingToolbarProps) {
  const [activeButtons, setActiveButtons] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!editor) return;
    
    const updateActiveStates = () => {
      const active = new Set<string>();
      
      if (editor.isActive('bold')) active.add('bold');
      if (editor.isActive('italic')) active.add('italic');
      if (editor.isActive('underline')) active.add('underline');
      if (editor.isActive('strike')) active.add('strike');
      if (editor.isActive('heading', { level: 1 })) active.add('heading1');
      if (editor.isActive('heading', { level: 2 })) active.add('heading2');
      if (editor.isActive('bulletList')) active.add('bulletlist');
      if (editor.isActive('orderedList')) active.add('orderedlist');
      
      setActiveButtons(active);
    };

    // Update active states on selection change
    editor.on('selectionUpdate', updateActiveStates);
    editor.on('transaction', updateActiveStates);
    
    // Initial update
    updateActiveStates();

    return () => {
      editor.off('selectionUpdate', updateActiveStates);
      editor.off('transaction', updateActiveStates);
    };
  }, [editor]);

  const handleAction = (action: string) => {
    if (!editor) return;

    switch (action) {
      case 'bold':
        editor.chain().focus().toggleBold().run();
        break;
      case 'italic':
        editor.chain().focus().toggleItalic().run();
        break;
      case 'underline':
        editor.chain().focus().toggleUnderline().run();
        break;
      case 'strike':
        editor.chain().focus().toggleStrike().run();
        break;
      case 'heading1':
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        break;
      case 'heading2':
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case 'paragraph':
        editor.chain().focus().setParagraph().run();
        break;
      case 'bulletlist':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'orderedlist':
        editor.chain().focus().toggleOrderedList().run();
        break;
      case 'undo':
        editor.chain().focus().undo().run();
        break;
      case 'redo':
        editor.chain().focus().redo().run();
        break;
    }
  };

  if (!isVisible) return null;

  return (
    <div className="floating-rich-toolbar">
      <button
        className={activeButtons.has('bold') ? 'active' : ''}
        onClick={() => handleAction('bold')}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      
      <button
        className={activeButtons.has('italic') ? 'active' : ''}
        onClick={() => handleAction('italic')}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </button>
      
      <button
        className={activeButtons.has('underline') ? 'active' : ''}
        onClick={() => handleAction('underline')}
        title="Underline (Ctrl+U)"
      >
        <u>U</u>
      </button>
      
      <button
        className={activeButtons.has('strike') ? 'active' : ''}
        onClick={() => handleAction('strike')}
        title="Strikethrough"
      >
        S̶
      </button>
      
      <div className="separator" />
      
      <button
        className={activeButtons.has('heading1') ? 'active' : ''}
        onClick={() => handleAction('heading1')}
        title="Heading 1"
      >
        H1
      </button>
      
      <button
        className={activeButtons.has('heading2') ? 'active' : ''}
        onClick={() => handleAction('heading2')}
        title="Heading 2"
      >
        H2
      </button>
      
      <button
        className={activeButtons.has('paragraph') ? 'active' : ''}
        onClick={() => handleAction('paragraph')}
        title="Paragraph"
      >
        P
      </button>
      
      <div className="separator" />
      
      <button
        className={activeButtons.has('bulletlist') ? 'active' : ''}
        onClick={() => handleAction('bulletlist')}
        title="Bullet List"
      >
        •
      </button>
      
      <button
        className={activeButtons.has('orderedlist') ? 'active' : ''}
        onClick={() => handleAction('orderedlist')}
        title="Numbered List"
      >
        1.
      </button>
      
      <div className="separator" />
      
      <button
        onClick={() => handleAction('undo')}
        title="Undo (Ctrl+Z)"
      >
        ↶
      </button>
      
      <button
        onClick={() => handleAction('redo')}
        title="Redo (Ctrl+Y)"
      >
        ↷
      </button>
    </div>
  );
}