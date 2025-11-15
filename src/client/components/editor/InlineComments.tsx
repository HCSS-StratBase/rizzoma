import { useState, useCallback, useEffect } from 'react';
import { Editor } from '@tiptap/core';
import { InlineComment } from '../../shared/types/comments';
import { FEATURES } from '../../shared/featureFlags';
import './InlineComments.css';

interface InlineCommentsProps {
  editor: Editor | null;
  blipId: string;
  comments: InlineComment[];
  onAddComment: (comment: Omit<InlineComment, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onResolveComment: (commentId: string) => void;
}

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
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

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

  // Handle comment submission
  const handleSubmit = useCallback(() => {
    if (!selectedRange || !commentText.trim()) return;

    // Mock user data - in production, get from auth context
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

  // Highlight comment ranges in editor
  useEffect(() => {
    if (!editor || !FEATURES.INLINE_COMMENTS) return;

    comments.forEach(comment => {
      // Add decoration to highlight commented text
      // This would use ProseMirror decorations in a real implementation
      const { start, end } = comment.range;
      
      // For now, we'll add a class to the editor content
      // In production, use proper ProseMirror decorations
    });
  }, [editor, comments]);

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
            // Position near selection - in production, calculate proper position
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

      {/* Comments sidebar */}
      <div className="inline-comments-sidebar">
        {comments.map(comment => (
          <div 
            key={comment.id} 
            className={`inline-comment ${comment.resolved ? 'resolved' : ''}`}
            onClick={() => {
              // Highlight the commented text
              if (editor) {
                editor.chain()
                  .setTextSelection({ from: comment.range.start, to: comment.range.end })
                  .run();
              }
              setActiveCommentId(comment.id);
            }}
          >
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
        ))}
      </div>
    </>
  );
}