import type { JSX } from 'react';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { BlipMenu } from '../client/components/blip/BlipMenu';

type Listener = () => void;

class TestEditor {
  calls: string[] = [];
  undoEnabled = true;
  redoEnabled = true;
  activeMarks: Record<string, boolean> = {};
  private listeners: Record<string, Set<Listener>> = {};

  chain() {
    const commands = {
      focus: () => commands,
      toggleBold: () => { this.calls.push('bold'); return commands; },
      toggleItalic: () => { this.calls.push('italic'); return commands; },
      toggleUnderline: () => { this.calls.push('underline'); return commands; },
      toggleStrike: () => { this.calls.push('strike'); return commands; },
      setHighlight: ({ color }: { color?: string }) => { this.calls.push(`highlight:${color ?? ''}`); return commands; },
      toggleBulletList: () => { this.calls.push('bullet'); return commands; },
      toggleOrderedList: () => { this.calls.push('ordered'); return commands; },
      undo: () => { this.calls.push('undo'); return commands; },
      redo: () => { this.calls.push('redo'); return commands; },
      clearNodes: () => { this.calls.push('clearNodes'); return commands; },
      unsetAllMarks: () => { this.calls.push('unsetAllMarks'); return commands; },
      run: () => true,
    };
    return commands;
  }

  can() {
    return {
      undo: () => this.undoEnabled,
      redo: () => this.redoEnabled,
    };
  }

  isActive(mark: string) {
    return !!this.activeMarks[mark];
  }

  on(event: string, listener: Listener) {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event].add(listener);
  }

  off(event: string, listener: Listener) {
    this.listeners[event]?.delete(listener);
  }

  emit(event: string) {
    this.listeners[event]?.forEach((listener) => listener());
  }
}

function renderMenu(jsx: JSX.Element): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(jsx);
  });
  return { container, root };
}

describe('client: BlipMenu toolbar', () => {
  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });
  let editor: TestEditor;
  let container: HTMLDivElement;
  let root: Root;

  const createBaseProps = () => ({
    isActive: true,
    isEditing: true,
    canEdit: true,
    canComment: true,
    onStartEdit: vi.fn(),
    onFinishEdit: vi.fn(),
    onSend: vi.fn(),
    onToggleComments: vi.fn(),
    onDelete: vi.fn(),
    onGetLink: vi.fn(),
    onToggleCollapseByDefault: vi.fn(),
    collapseByDefault: false,
    onShowHistory: vi.fn(),
  });
  let baseProps: ReturnType<typeof createBaseProps>;

  beforeEach(() => {
    editor = new TestEditor();
    baseProps = createBaseProps();
    ({ container, root } = renderMenu(<BlipMenu {...baseProps} editor={editor as any} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('finishes editing when Done is clicked', () => {
    const doneBtn = container.querySelector('button[title="Finish editing"]');
    expect(doneBtn).toBeTruthy();
    act(() => {
      doneBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(baseProps.onFinishEdit).toHaveBeenCalled();
  });

  it('fires formatting and history commands when buttons clicked', () => {
    const click = (title: string) => {
      const btn = container.querySelector(`button[title="${title}"]`);
      expect(btn).toBeTruthy();
      act(() => {
        btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    };

    click('Undo (Ctrl+Z)');
    click('Redo');
    click('Bold (Ctrl+B)');
    click('Italic (Ctrl+I)');
    click('Underline (Ctrl+U)');
    click('Strikethrough');
    click('Bulleted list');
    click('Numbered list');
    click('Clear formatting');

    expect(editor.calls).toEqual([
      'undo',
      'redo',
      'bold',
      'italic',
      'underline',
      'strike',
      'bullet',
      'ordered',
      'clearNodes',
      'unsetAllMarks',
    ]);
  });

  it('reflects active marks and toggles undo/redo disabled state', () => {
    editor.activeMarks = { bold: true, italic: true, underline: true, strike: true };
    editor.undoEnabled = false;
    editor.redoEnabled = false;

    act(() => editor.emit('selectionUpdate'));

    const boldBtn = container.querySelector('button[title="Bold (Ctrl+B)"]');
    const italicBtn = container.querySelector('button[title="Italic (Ctrl+I)"]');
    const underlineBtn = container.querySelector('button[title="Underline (Ctrl+U)"]');
    const strikeBtn = container.querySelector('button[title="Strikethrough"]');
    const undoBtn = container.querySelector('button[title="Undo (Ctrl+Z)"]');
    const redoBtn = container.querySelector('button[title="Redo"]');

    expect(boldBtn?.classList.contains('active')).toBe(true);
    expect(italicBtn?.classList.contains('active')).toBe(true);
    expect(underlineBtn?.classList.contains('active')).toBe(true);
    expect(strikeBtn?.classList.contains('active')).toBe(true);
    expect((undoBtn as HTMLButtonElement)?.disabled).toBe(true);
    expect((redoBtn as HTMLButtonElement)?.disabled).toBe(true);
  });

  it('renders read-only controls when not editing', () => {
    act(() => root.unmount());
    container.remove();
    ({ container, root } = renderMenu(
      <BlipMenu
        {...baseProps}
        isEditing={false}
        editor={editor as any}
      />
    ));

    const editBtn = container.querySelector('button[title="Edit"]');
    const commentsBtn = container.querySelector('button[title="Hide Comments"]');
    const linkBtn = container.querySelector('button[title="Get Direct Link"]');
    const deleteBtn = container.querySelector('button[title="Delete blip"]');
    const collapseBtn = container.querySelector('button[title="Collapse this thread by default"]');

    expect(editBtn).toBeTruthy();
    expect(commentsBtn).toBeTruthy();
    expect(linkBtn).toBeTruthy();
    expect(deleteBtn).toBeTruthy();
    expect(collapseBtn).toBeTruthy();

    act(() => editBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(baseProps.onStartEdit).toHaveBeenCalled();

    act(() => commentsBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(baseProps.onToggleComments).toHaveBeenCalled();

    act(() => linkBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(baseProps.onGetLink).toHaveBeenCalled();

    act(() => collapseBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(baseProps.onToggleCollapseByDefault).toHaveBeenCalled();
  });

  it('shows "Show Comments" label when comments hidden', () => {
    act(() => root.unmount());
    container.remove();
    ({ container, root } = renderMenu(
      <BlipMenu
        {...baseProps}
        isEditing={false}
        editor={editor as any}
        areCommentsVisible={false}
      />
    ));

    const commentsBtn = container.querySelector('button[title="Show Comments"]');
    expect(commentsBtn).toBeTruthy();
    expect(commentsBtn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('surfaces a read-only banner and disables paste-as-reply when comments are read-only', () => {
    act(() => root.unmount());
    container.remove();
    baseProps = {
      ...createBaseProps(),
      canComment: false,
      clipboardAvailable: true,
      onPasteAsReply: vi.fn(),
    };
    ({ container, root } = renderMenu(
      <BlipMenu
        {...baseProps}
        isEditing={false}
        editor={editor as any}
      />
    ));

    const banner = container.querySelector('[data-testid="blip-menu-comments-disabled"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('read-only');

    const commentsToggle = container.querySelector('[data-testid="blip-menu-comments-toggle"]') as HTMLButtonElement | null;
    expect(commentsToggle).toBeTruthy();
    expect(commentsToggle?.disabled).toBe(false);

    const gear = container.querySelector('button[title="More options"]');
    expect(gear).toBeTruthy();
    act(() => gear!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const pasteReply = Array.from(container.querySelectorAll('.menu-dropdown-item')).find(
      (btn) => btn.textContent === 'Paste as reply'
    ) as HTMLButtonElement | undefined;
    expect(pasteReply).toBeTruthy();
    expect(pasteReply?.disabled).toBe(true);
    expect(pasteReply?.getAttribute('title')).toContain('read-only');
  });

  it('shows API failure notices when inline comments report an error', () => {
    act(() => root.unmount());
    container.remove();
    baseProps = {
      ...createBaseProps(),
      inlineCommentsNotice: 'Inline comments are temporarily unavailable',
    } as any;
    ({ container, root } = renderMenu(
      <BlipMenu
        {...baseProps}
        isEditing={false}
        editor={editor as any}
      />
    ));

    const banner = container.querySelector('[data-testid="blip-menu-comments-disabled"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('temporarily unavailable');
  });

  it('renders inline comment notices while editing', () => {
    act(() => root.unmount());
    container.remove();
    baseProps = {
      ...createBaseProps(),
      inlineCommentsNotice: 'Inline comments are temporarily unavailable',
    } as any;
    ({ container, root } = renderMenu(
      <BlipMenu
        {...baseProps}
        editor={editor as any}
      />
    ));

    const banner = container.querySelector('[data-testid="blip-menu-comments-disabled"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('temporarily unavailable');
  });

  it('shows highlight palette and applies color', () => {
    const bgBtn = container.querySelector('button[title="Text background color"]');
    expect(bgBtn).toBeTruthy();

    act(() => {
      bgBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const swatches = container.querySelectorAll('.blip-menu-color-swatch');
    expect(swatches.length).toBeGreaterThan(1);

    act(() => {
      swatches[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(editor.calls).toContain('highlight:#ffd93d');
  });

  it('opens overflow and triggers playback handler', () => {
    const gear = container.querySelector('button[title="Other actions"]');
    expect(gear).toBeTruthy();

    act(() => {
      gear!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const items = Array.from(container.querySelectorAll('.menu-dropdown-item')) as HTMLButtonElement[];
    const playbackBtn = items.find((btn) => btn.textContent === 'Playback history');
    expect(playbackBtn).toBeTruthy();

    act(() => {
      playbackBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(baseProps.onShowHistory).toHaveBeenCalled();
  });

  it('invokes send handler from overflow', () => {
    const gear = container.querySelector('button[title="Other actions"]');
    expect(gear).toBeTruthy();

    act(() => {
      gear!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const sendBtn = Array.from(container.querySelectorAll('.menu-dropdown-item')).find(
      (btn) => btn.textContent === 'Send'
    ) as HTMLButtonElement | undefined;
    expect(sendBtn).toBeTruthy();

    act(() => {
      sendBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(baseProps.onSend).toHaveBeenCalled();
  });

  it('exposes copy link and delete actions inside overflow', () => {
    const gear = container.querySelector('button[title="Other actions"]');
    expect(gear).toBeTruthy();

    act(() => {
      gear!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const linkBtn = Array.from(container.querySelectorAll('.menu-dropdown-item')).find(
      (btn) => btn.textContent === 'Copy direct link'
    ) as HTMLButtonElement | undefined;
    const deleteBtn = Array.from(container.querySelectorAll('.menu-dropdown-item')).find(
      (btn) => btn.textContent === 'Delete blip'
    ) as HTMLButtonElement | undefined;

    expect(linkBtn).toBeTruthy();
    expect(deleteBtn).toBeTruthy();

    act(() => {
      linkBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(baseProps.onGetLink).toHaveBeenCalled();

    const reopenGear = container.querySelector('button[title="Other actions"]');
    expect(reopenGear).toBeTruthy();
    act(() => reopenGear!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const deleteAfterReopen = Array.from(container.querySelectorAll('.menu-dropdown-item')).find(
      (btn) => btn.textContent === 'Delete blip'
    ) as HTMLButtonElement | undefined;
    expect(deleteAfterReopen).toBeTruthy();

    act(() => {
      deleteAfterReopen!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(baseProps.onDelete).toHaveBeenCalled();
  });

  it('fires copy/paste handlers when clipboard payload is available', () => {
    act(() => root.unmount());
    container.remove();
    baseProps = {
      ...createBaseProps(),
      clipboardAvailable: true,
      onCopyComment: vi.fn(),
      onPasteAsReply: vi.fn(),
      onPasteAtCursor: vi.fn(),
    };
    ({ container, root } = renderMenu(<BlipMenu {...baseProps} editor={editor as any} />));

    const clickMenuItem = (label: string) => {
      const gear = container.querySelector('button[title="Other actions"]');
      expect(gear).toBeTruthy();
      act(() => gear!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      const btn = Array.from(container.querySelectorAll('.menu-dropdown-item')).find(
        (el) => el.textContent === label
      ) as HTMLButtonElement | undefined;
      expect(btn).toBeTruthy();
      act(() => btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    };

    clickMenuItem('Copy comment');
    clickMenuItem('Paste as reply');
    clickMenuItem('Paste at cursor');

    expect(baseProps.onCopyComment).toHaveBeenCalled();
    expect(baseProps.onPasteAsReply).toHaveBeenCalled();
    expect(baseProps.onPasteAtCursor).toHaveBeenCalled();
  });

  it('disables paste actions when clipboard is empty', () => {
    const gear = container.querySelector('button[title="Other actions"]');
    expect(gear).toBeTruthy();
    act(() => gear!.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const pasteAtCursor = Array.from(container.querySelectorAll('.menu-dropdown-item')).find(
      (btn) => btn.textContent === 'Paste at cursor'
    ) as HTMLButtonElement | undefined;
    const pasteAsReply = Array.from(container.querySelectorAll('.menu-dropdown-item')).find(
      (btn) => btn.textContent === 'Paste as reply'
    ) as HTMLButtonElement | undefined;

    expect(pasteAtCursor?.disabled).toBe(true);
    expect(pasteAsReply?.disabled).toBe(true);
  });

  it('shows upload progress and disables attachment/image buttons during upload', () => {
    act(() => root.unmount());
    container.remove();
    baseProps = {
      ...createBaseProps(),
      isUploading: true,
      uploadProgress: 42,
    };
    ({ container, root } = renderMenu(<BlipMenu {...baseProps} editor={editor as any} />));

    const attachmentBtn = container.querySelector('button[title="Uploading attachment…"]') as HTMLButtonElement | null;
    const imageBtn = container.querySelector('button[title="Uploading image…"]') as HTMLButtonElement | null;
    expect(attachmentBtn?.disabled).toBe(true);
    expect(imageBtn?.disabled).toBe(true);

    const progress = container.querySelector('.menu-upload-progress');
    expect(progress?.textContent).toContain('42%');
  });

  it('disables edit overflow paste-as-reply when inline comments are read-only', () => {
    act(() => root.unmount());
    container.remove();
    baseProps = {
      ...createBaseProps(),
      canComment: false,
      clipboardAvailable: true,
      onPasteAsReply: vi.fn(),
      onPasteAtCursor: vi.fn(),
    };
    ({ container, root } = renderMenu(<BlipMenu {...baseProps} editor={editor as any} />));

    const overflowToggle = container.querySelector('[data-testid="blip-menu-overflow-toggle"]');
    expect(overflowToggle).toBeTruthy();
    act(() => overflowToggle!.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const pasteAsReply = Array.from(container.querySelectorAll('.menu-dropdown-item')).find(
      (btn) => btn.textContent === 'Paste as reply'
    ) as HTMLButtonElement | undefined;
    expect(pasteAsReply).toBeTruthy();
    expect(pasteAsReply?.disabled).toBe(true);
    expect(pasteAsReply?.getAttribute('title')).toContain('read-only');
  });

  it('honors delete button disabled state while deleting', () => {
    act(() => root.unmount());
    container.remove();
    baseProps = {
      ...createBaseProps(),
      isEditing: false,
      isDeleting: true,
    };
    ({ container, root } = renderMenu(<BlipMenu {...baseProps} editor={editor as any} />));

    const deleteBtn = container.querySelector('button[title="Delete blip"]') as HTMLButtonElement | null;
    expect(deleteBtn?.disabled).toBe(true);

    const gear = container.querySelector('button[title="More options"]') as HTMLButtonElement | null;
    expect(gear).toBeTruthy();
    act(() => gear!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const overflowDelete = Array.from(container.querySelectorAll('.menu-dropdown-item')).find((btn) => {
      const text = btn.textContent ?? '';
      return text.includes('Delete blip') || text.includes('Deleting…');
    }) as HTMLButtonElement | undefined;
    expect(overflowDelete?.disabled).toBe(true);

    act(() => root.unmount());
    container.remove();
    baseProps = {
      ...createBaseProps(),
      isEditing: false,
      isDeleting: false,
    };
    ({ container, root } = renderMenu(<BlipMenu {...baseProps} editor={editor as any} />));

    const enabledDelete = container.querySelector('button[title="Delete blip"]') as HTMLButtonElement | null;
    expect(enabledDelete?.disabled).toBe(false);
    act(() => enabledDelete!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(baseProps.onDelete).toHaveBeenCalled();
  });

  it('toggles collapse state button labels', () => {
    const foldBtn = container.querySelector('button[title="Collapse this thread by default"]');
    expect(foldBtn).toBeTruthy();
    act(() => foldBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(baseProps.onToggleCollapseByDefault).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
    baseProps = createBaseProps();
    ({ container, root } = renderMenu(
      <BlipMenu
        {...baseProps}
        isEditing={false}
        editor={editor as any}
        collapseByDefault={true}
      />
    ));

    const expandedTitleBtn = container.querySelector('button[title="Expand this thread by default"]');
    expect(expandedTitleBtn).toBeTruthy();
    expect(expandedTitleBtn?.getAttribute('aria-pressed')).toBe('true');
  });
});
