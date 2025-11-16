import { useState } from 'react';
import { BlipEditor } from './BlipEditor';

interface EditableBlipContentProps {
  content: string;
  blipId: string;
  onSave?: (content: string) => void;
  enableCollaboration?: boolean;
}

export function EditableBlipContent({ 
  content, 
  blipId, 
  onSave,
  enableCollaboration = false 
}: EditableBlipContentProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [localContent, setLocalContent] = useState(content);

  const handleSave = (): void => {
    if (onSave) {
      onSave(localContent);
    }
    setIsEditing(false);
  };

  const handleCancel = (): void => {
    setLocalContent(content);
    setIsEditing(false);
  };

  return (
    <div className="editable-blip-content">
      <BlipEditor
        content={localContent}
        blipId={blipId}
        isReadOnly={!isEditing}
        onUpdate={setLocalContent}
        enableCollaboration={enableCollaboration && isEditing}
      />
      <div className="blip-actions">
        {!isEditing ? (
          <button 
            onClick={() => setIsEditing(true)}
            className="btn btn-sm btn-primary"
          >
            Edit
          </button>
        ) : (
          <>
            <button 
              onClick={handleSave}
              className="btn btn-sm btn-success"
            >
              Save
            </button>
            <button 
              onClick={handleCancel}
              className="btn btn-sm btn-secondary"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}