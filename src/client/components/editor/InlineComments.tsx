import { useState, useCallback, useEffect, useRef } from 'react';
import { Editor } from '@tiptap/core';
import { Mark } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { InlineComment } from '@shared/types/comments';
import { FEATURES } from '@shared/featureFlags';
import './InlineComments.css';

interface InlineCommentsProps {
  editor: Editor | null;
  blipId: string;
  comments: InlineComment[];
  onAddComment: (comment: Omit<InlineComment, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onResolveComment: (commentId: string) => void;
}

// Plugin key for decorations
const commentDecorationsKey = new PluginKey('commentDecorations');

export function InlineComments({ 
  editor, 
  blipId, 
  comments, 
  onAddComment, 
  onResolveComment 
}: InlineCommentsProps) {
  const [selectedRange, setSelectedRange] = useState<{start: number; end: number; text: string} | null>(null);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [clickedCommentId, setClickedCommentId] = useState<string | null>(null);

  // Add comment button when text is selected
  useEffect(() => {
    if (!editor || !FEATURES.INLINE_COMMENTS) return;

    const handleSelectionChange = () => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');
      
      if (text.length > 0 && from !== to) {
        setSelectedRange({ start: from, end: to, text });
      } else {
        setSelectedRange(null);
        setShowCommentForm(false);
      }
    };

    editor.on('selectionUpdate', handleSelectionChange);
    return () => {
      editor.off('selectionUpdate', handleSelectionChange);
    };
  }, [editor]);

  // Create comment decorations plugin
  useEffect(() => {
    if (!editor || !FEATURES.INLINE_COMMENTS) return;

    const plugin = new Plugin({
      key: commentDecorationsKey,
      state: {
        init() {
          return DecorationSet.empty;
        },
        apply(tr, set) {
          // Create decorations for each comment
          const decorations: Decoration[] = [];
          
          comments.forEach(comment => {
            const decoration = Decoration.inline(
              comment.range.start,
              comment.range.end,
              {
                class: 'commented-text',
                'data-comment-id': comment.id,
                'data-comment-count': '1'
              },
              { inclusiveStart: true, inclusiveEnd: true }
            );
            decorations.push(decoration);
          });

          return DecorationSet.create(tr.doc, decorations);
        }
      },
      props: {
        decorations(state) {
          return this.getState(state);
        }
      }
    });

    // Add the plugin to the editor
    const state = editor.state;
    const newState = state.reconfigure({
      plugins: [...state.plugins.filter(p => p.key !== commentDecorationsKey), plugin]
    });
    editor.view.updateState(newState);

    return () => {
      // Remove plugin on cleanup
      const state = editor.state;
      const newState = state.reconfigure({
        plugins: state.plugins.filter(p => p.key !== commentDecorationsKey)
      });
      editor.view.updateState(newState);
    };
  }, [editor, comments]);

  // Handle comment submission
  const handleSubmit = useCallback(() => {
    if (!selectedRange || !commentText.trim()) return;

    onAddComment({
      blipId,
      userId: 'current-user',
      userName: 'Current User',
      content: commentText.trim(),
      resolved: false,
      range: selectedRange,
    });

    // Reset form
    setCommentText('');
    setShowCommentForm(false);
    setSelectedRange(null);
    
    // Clear editor selection
    editor?.commands.setTextSelection(selectedRange.end);
  }, [selectedRange, commentText, blipId, onAddComment, editor]);

  // Get comments for a specific range
  const getCommentsAtPosition = (pos: number) => {
    return comments.filter(comment => 
      pos >= comment.range.start && pos <= comment.range.end
    );
  };

  if (!FEATURES.INLINE_COMMENTS) return null;

  return (
    <>
      {/* Comment button for selected text */}
      {selectedRange && !showCommentForm && (
        <button
          className="add-comment-button"
          onClick={() => setShowCommentForm(true)}
          style={{
            position: 'absolute',
            top: '0',
            right: '-40px',
          }}
          title="Add comment to selection"
        >
          💬
        </button>
      )}

      {/* Comment form */}
      {showCommentForm && selectedRange && (
        <div className="inline-comment-form">
          <div className="comment-form-header">
            <span>Comment on: "{selectedRange.text.substring(0, 30)}..."</span>
            <button onClick={() => setShowCommentForm(false)}>✕</button>
          </div>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add your comment..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                handleSubmit();
              }
            }}
          />
          <div className="comment-form-actions">
            <button onClick={() => setShowCommentForm(false)}>Cancel</button>
            <button 
              onClick={handleSubmit}
              disabled={!commentText.trim()}
              className="primary"
            >
              Add Comment
            </button>
          </div>
        </div>
      )}

      {/* Inline comment indicators and popovers */}
      {comments.map(comment => {
        const showPopover = hoveredCommentId === comment.id || clickedCommentId === comment.id;
        
        return (
          <div key={comment.id} className="inline-comment-wrapper">
            <span
              className="inline-comment-indicator"
              onMouseEnter={() => setHoveredCommentId(comment.id)}
              onMouseLeave={() => setHoveredCommentId(null)}
              onClick={() => setClickedCommentId(clickedCommentId === comment.id ? null : comment.id)}
            >
              {comments.filter(c => 
                c.range.start === comment.range.start && 
                c.range.end === comment.range.end
              ).length}
            </span>
            
            {showPopover && (
              <div className="inline-comment-popover">
                <div className={`inline-comment ${comment.resolved ? 'resolved' : ''}`}>
                  <div className="comment-header">
                    <strong>{comment.userName}</strong>
                    <span className="comment-time">
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="comment-text-preview">
                    "{comment.range.text.substring(0, 30)}..."
                  </div>
                  <div className="comment-content">{comment.content}</div>
                  {!comment.resolved && (
                    <button 
                      className="resolve-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onResolveComment(comment.id);
                      }}
                    >
                      ✓ Resolve
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}