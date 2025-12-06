import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet, Decoration } from '@tiptap/pm/view';
import { Awareness } from 'y-protocols/awareness';
import { FEATURES } from '@shared/featureFlags';
import './CollaborativeCursors.css';

export interface CursorUser {
  id: string;
  name: string;
  color: string;
}

export interface CursorState {
  user: CursorUser;
  selection: { from: number; to: number };
}

const cursorColors = [
  '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', 
  '#2196f3', '#00bcd4', '#009688', '#4caf50',
  '#ff9800', '#ff5722', '#795548', '#607d8b'
];

export const CollaborativeCursor = Extension.create({
  name: 'collaborativeCursor',

  addOptions() {
    return {
      provider: null,
      user: {
        id: 'anonymous',
        name: 'Anonymous',
        color: cursorColors[Math.floor(Math.random() * cursorColors.length)]
      },
    };
  },

  addProseMirrorPlugins() {
    if (!FEATURES.LIVE_CURSORS) return [];

    const { provider, user } = this.options;
    if (!provider) return [];

    return [
      new Plugin({
        key: new PluginKey('collaborativeCursor'),
        
        state: {
          init: () => DecorationSet.empty,
          
          apply: (_tr, _decorationSet, _oldState, newState) => {
            const awareness: Awareness = provider.awareness;
            const states = awareness.getStates();
            const clientId = awareness.clientID;
            
            const decorations: Decoration[] = [];
            
            states.forEach((state, stateClientId) => {
              if (stateClientId === clientId) return;
              
              const cursor = (state as any)?.cursor;
              if (!cursor || !cursor.selection) return;
              
              const { from, to } = cursor.selection;
              const cursorUser = cursor.user || { 
                name: 'Unknown', 
                color: '#666',
                id: stateClientId.toString()
              };
              
              // Add cursor decoration
              if (from === to) {
                const cursorDeco = Decoration.widget(from, () => {
                  const cursor = document.createElement('span');
                  cursor.className = 'collaboration-cursor';
                  cursor.style.borderColor = cursorUser.color;
                  
                  const label = document.createElement('span');
                  label.className = 'collaboration-cursor-label';
                  label.style.backgroundColor = cursorUser.color;
                  label.textContent = cursorUser.name;
                  
                  cursor.appendChild(label);
                  return cursor;
                });
                decorations.push(cursorDeco);
              } else {
                // Add selection decoration
                const selectionDeco = Decoration.inline(from, to, {
                  class: 'collaboration-selection',
                  style: `background-color: ${cursorUser.color}20;`
                });
                decorations.push(selectionDeco);
              }
            });
            
            return DecorationSet.create(newState.doc, decorations);
          }
        },
        
        props: {
          decorations(state) {
            return this.getState(state);
          }
        },
        
        view: (view) => {
          const awareness: Awareness = provider.awareness;
          
          const updateCursor = () => {
            const state = view.state;
            const { from, to } = state.selection;
            
            awareness.setLocalStateField('cursor', {
              user,
              selection: { from, to }
            });
          };
          
          // Update cursor on selection change
          updateCursor();
          
          const handleChange = () => {
            updateCursor();
            // Force re-render of decorations
            view.dispatch(view.state.tr);
          };
          
          // Listen to awareness changes
          awareness.on('change', handleChange);
          
          return {
            update: updateCursor,
            destroy: () => {
              awareness.off('change', handleChange);
              awareness.setLocalStateField('cursor', null);
            }
          };
        }
      })
    ];
  }
});

// Typing indicator component
export function TypingIndicator({ provider }: { provider: any }) {
  if (!FEATURES.TYPING_INDICATORS || !provider) return null;
  
  const awareness: Awareness = provider.awareness;
  const states = awareness.getStates();
  const clientId = awareness.clientID;
  
  const typingUsers: CursorUser[] = [];
  
  states.forEach((state, stateClientId) => {
    if (stateClientId === clientId) return;
    
    const cursor = (state as any)?.cursor;
    if (cursor && cursor.user && cursor.isTyping) {
      typingUsers.push(cursor.user);
    }
  });
  
  if (typingUsers.length === 0) return null;
  
  return (
    <div className="typing-indicator">
      <span className="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </span>
      <span className="typing-text">
        {typingUsers.map(u => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
      </span>
    </div>
  );
}
