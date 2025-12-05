// Floating Rich Text Toolbar for Rizzoma
// Provides keyboard shortcut buttons when editing content

class FloatingRichToolbar {
  constructor() {
    this.toolbar = null;
    this.isVisible = false;
    this.activeEditor = null;
    this.init();
  }

  init() {
    // Create toolbar HTML
    this.createToolbar();
    
    // Monitor for edit mode
    this.monitorEditMode();
    
    // Handle keyboard shortcuts
    this.setupKeyboardShortcuts();
  }

  createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'floating-rich-toolbar';
    toolbar.style.display = 'none';
    toolbar.innerHTML = `
      <button data-action="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
      <button data-action="italic" title="Italic (Ctrl+I)"><em>I</em></button>
      <button data-action="underline" title="Underline (Ctrl+U)"><u>U</u></button>
      <button data-action="strike" title="Strikethrough">S̶</button>
      <div class="separator"></div>
      <button data-action="heading1" title="Heading 1">H1</button>
      <button data-action="heading2" title="Heading 2">H2</button>
      <button data-action="paragraph" title="Paragraph">P</button>
      <div class="separator"></div>
      <button data-action="bulletlist" title="Bullet List">•</button>
      <button data-action="orderedlist" title="Numbered List">1.</button>
      <div class="separator"></div>
      <button data-action="undo" title="Undo (Ctrl+Z)">↶</button>
      <button data-action="redo" title="Redo (Ctrl+Y)">↷</button>
    `;

    // Add event listeners
    toolbar.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button && button.dataset.action) {
        this.executeAction(button.dataset.action);
        e.preventDefault();
      }
    });

    document.body.appendChild(toolbar);
    this.toolbar = toolbar;
  }

  executeAction(action) {
    if (!this.activeEditor) return;

    const keyMap = {
      'bold': 'b',
      'italic': 'i', 
      'underline': 'u',
      'strike': 'shift+x',
      'undo': 'z',
      'redo': 'y'
    };

    if (keyMap[action]) {
      // Simulate keyboard shortcut
      this.simulateKeyboardShortcut(keyMap[action]);
    } else {
      // Handle other actions
      this.handleSpecialAction(action);
    }
  }

  simulateKeyboardShortcut(key) {
    if (!this.activeEditor) return;

    const keys = key.split('+');
    const mainKey = keys[keys.length - 1];
    const modifiers = keys.slice(0, -1);

    const event = new KeyboardEvent('keydown', {
      key: mainKey,
      code: `Key${mainKey.toUpperCase()}`,
      ctrlKey: modifiers.includes('ctrl') || !modifiers.includes('shift'),
      shiftKey: modifiers.includes('shift'),
      bubbles: true,
      cancelable: true
    });

    this.activeEditor.dispatchEvent(event);
  }

  handleSpecialAction(action) {
    // For now, just focus the editor
    if (this.activeEditor) {
      this.activeEditor.focus();
    }
  }

  monitorEditMode() {
    // Check every 100ms if we're in edit mode
    setInterval(() => {
      const editableElement = document.querySelector('p[contenteditable="true"], div[contenteditable="true"], [contenteditable="true"]');
      
      if (editableElement && editableElement !== this.activeEditor) {
        this.showToolbar(editableElement);
      } else if (!editableElement && this.isVisible) {
        this.hideToolbar();
      }
    }, 100);
  }

  showToolbar(editor) {
    this.activeEditor = editor;
    this.isVisible = true;
    if (this.toolbar) {
      this.toolbar.style.display = 'flex';
    }
  }

  hideToolbar() {
    this.activeEditor = null;
    this.isVisible = false;
    if (this.toolbar) {
      this.toolbar.style.display = 'none';
    }
  }

  setupKeyboardShortcuts() {
    // Monitor for keyboard shortcuts to update button states
    document.addEventListener('keydown', (e) => {
      if (this.isVisible && this.activeEditor) {
        // Update button active states based on current formatting
        setTimeout(() => this.updateButtonStates(), 10);
      }
    });
  }

  updateButtonStates() {
    if (!this.toolbar || !this.activeEditor) return;

    // Simple heuristic: check if selection contains formatted text
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer.parentElement || range.commonAncestorContainer;
      
      // Update button states based on parent elements
      this.updateButtonState('bold', this.hasStyle(container, 'font-weight: 700') || container.querySelector('strong, b'));
      this.updateButtonState('italic', this.hasStyle(container, 'font-style: italic') || container.querySelector('em, i'));
      this.updateButtonState('underline', this.hasStyle(container, 'text-decoration') || container.querySelector('u'));
    }
  }

  hasStyle(element, styleCheck) {
    if (!element || !element.style) return false;
    const computedStyle = window.getComputedStyle(element);
    return computedStyle.cssText.includes(styleCheck);
  }

  updateButtonState(action, isActive) {
    const button = this.toolbar.querySelector(`[data-action="${action}"]`);
    if (button) {
      button.classList.toggle('active', isActive);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new FloatingRichToolbar();
  });
} else {
  new FloatingRichToolbar();
}