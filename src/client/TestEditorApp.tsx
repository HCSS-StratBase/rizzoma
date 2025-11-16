import React, { useState } from 'react';
import { BlipEditor } from './components/editor/BlipEditor';
import { FEATURES, getEnabledFeatures } from '../shared/featureFlags';
import './components/editor/BlipEditor.css';

export function TestEditorApp() {
  const [content1, setContent1] = useState('<p>This is the first editor for testing rich text features.</p>');
  const [content2, setContent2] = useState('<p>This is the second editor for testing real-time collaboration.</p>');
  const [selectedText, setSelectedText] = useState('');
  
  // Show feature flags status
  console.log('Feature flags:', FEATURES);
  console.log('Enabled features:', getEnabledFeatures());

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Rizzoma Editor Test</h1>
      
      <div style={{ marginBottom: '20px', padding: '10px', background: '#f5f5f5', borderRadius: '5px' }}>
        <h3>Active Features:</h3>
        <ul>
          {getEnabledFeatures().map(feature => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>Test Instructions:</h2>
        <ol>
          <li><strong>Rich Text Toolbar:</strong> Select text to see formatting options</li>
          <li><strong>@Mentions:</strong> Type @ to trigger user mentions</li>
          <li><strong>Inline Comments:</strong> Select text and click comment icon</li>
          <li><strong>Real-time Cursors:</strong> Open in two tabs to see collaborative cursors</li>
          <li><strong>Follow the Green:</strong> Navigate between unread content</li>
        </ol>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div>
          <h3>Editor 1</h3>
          <div style={{ border: '1px solid #ddd', padding: '10px', minHeight: '200px' }}>
            <BlipEditor
              content={content1}
              blipId="test-blip-1"
              isReadOnly={false}
              onUpdate={setContent1}
              enableCollaboration={true}
            />
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
            <strong>HTML Output:</strong>
            <pre style={{ background: '#f5f5f5', padding: '5px', overflow: 'auto' }}>
              {content1}
            </pre>
          </div>
        </div>

        <div>
          <h3>Editor 2</h3>
          <div style={{ border: '1px solid #ddd', padding: '10px', minHeight: '200px' }}>
            <BlipEditor
              content={content2}
              blipId="test-blip-2"
              isReadOnly={false}
              onUpdate={setContent2}
              enableCollaboration={true}
            />
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
            <strong>HTML Output:</strong>
            <pre style={{ background: '#f5f5f5', padding: '5px', overflow: 'auto' }}>
              {content2}
            </pre>
          </div>
        </div>
      </div>

      {selectedText && (
        <div style={{ marginTop: '20px', padding: '10px', background: '#e8f4f8', borderRadius: '5px' }}>
          <strong>Selected Text:</strong> "{selectedText}"
        </div>
      )}
    </div>
  );
}