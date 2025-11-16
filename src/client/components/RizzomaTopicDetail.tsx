import { useEffect, useState } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { subscribeTopicDetail } from '../lib/socket';
import { toast } from './Toast';
import { RizzomaBlip, BlipData } from './blip/RizzomaBlip';
import { FEATURES } from '@shared/featureFlags';
import './RizzomaTopicDetail.css';

type TopicFull = { 
  id: string; 
  title: string; 
  content?: string; 
  createdAt: number;
  updatedAt: number;
  authorId: string;
  authorName: string;
};

export function RizzomaTopicDetail({ id, isAuthed = false }: { id: string; isAuthed?: boolean }) {
  const [topic, setTopic] = useState<TopicFull | null>(null);
  const [rootBlip, setRootBlip] = useState<BlipData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mock data - in production this would come from API
  const currentUser = {
    id: 'current-user',
    name: 'Current User',
    avatar: 'https://via.placeholder.com/32'
  };

  const load = async (): Promise<void> => {
    console.log('RizzomaTopicDetail load() called for id:', id);
    const r = await api(`/api/topics/${encodeURIComponent(id)}`);
    if (r.ok) { 
      const topicData = r.data as TopicFull;
      setTopic(topicData); 
      
      // Create root blip from topic
      const rootBlipData: BlipData = {
        id: topicData.id,
        content: (topicData.content && topicData.content !== '<p></p>') 
          ? topicData.content 
          : '<p>Click Edit to add content to this topic...</p>',
        authorId: topicData.authorId || currentUser.id,
        authorName: topicData.authorName || currentUser.name,
        authorAvatar: currentUser.avatar,
        createdAt: topicData.createdAt,
        updatedAt: topicData.updatedAt || topicData.createdAt,
        isRead: true,
        permissions: {
          canEdit: true, // Root blip should always be editable for the owner
          canComment: isAuthed,
          canRead: true
        },
        childBlips: [] // Will be populated below
      };
      
      // Load child blips from API
      try {
        console.log('Loading blips for waveId:', id);
        const blipsResponse = await api(`/api/blips?waveId=${encodeURIComponent(id)}`);
        console.log('Blips response:', blipsResponse);
        if (blipsResponse.ok && blipsResponse.data?.blips) {
          const blips = blipsResponse.data.blips as Array<any>;
          
          // Build blip tree - convert flat list to nested structure
          const blipMap = new Map<string, BlipData>();
          
          // First pass: create all blips
          blips.forEach(blip => {
            blipMap.set(blip._id, {
              id: blip._id,
              content: blip.content || '<p></p>',
              authorId: blip.authorId,
              authorName: blip.authorName || 'Unknown User',
              authorAvatar: 'https://via.placeholder.com/32',
              createdAt: blip.createdAt,
              updatedAt: blip.updatedAt || blip.createdAt,
              isRead: true, // TODO: Track read status
              parentBlipId: blip.parentId,
              permissions: blip.permissions || {
                canEdit: blip.authorId === currentUser.id,
                canComment: isAuthed,
                canRead: true
              },
              childBlips: []
            });
          });
          
          // Second pass: build tree structure
          const rootChildBlips: BlipData[] = [];
          blipMap.forEach((blip) => {
            if (blip.parentBlipId) {
              const parent = blipMap.get(blip.parentBlipId);
              if (parent) {
                parent.childBlips = parent.childBlips || [];
                parent.childBlips.push(blip);
              }
            } else {
              // Top-level blips (direct replies to topic)
              rootChildBlips.push(blip);
            }
          });
          
          // Sort child blips by creation time
          const sortBlips = (blips: BlipData[]) => {
            blips.sort((a, b) => a.createdAt - b.createdAt);
            blips.forEach(blip => {
              if (blip.childBlips && blip.childBlips.length > 0) {
                sortBlips(blip.childBlips);
              }
            });
          };
          sortBlips(rootChildBlips);
          
          rootBlipData.childBlips = rootChildBlips;
        }
      } catch (error) {
        console.error('Failed to load blips:', error);
      }
      
      setRootBlip(rootBlipData);
      setError(null); 
    } else {
      setError('Failed to load topic');
    }
  };

  // Mock data generator - replace with actual API calls
  const generateMockChildBlips = (parentId: string): BlipData[] => {
    if (!FEATURES.INLINE_COMMENTS) return [];
    
    return [
      {
        id: `${parentId}-reply-1`,
        content: '<p>Great topic! I have some thoughts on this...</p>',
        authorId: 'user-2',
        authorName: 'Jane Doe',
        authorAvatar: 'https://via.placeholder.com/32/e91e63',
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now() - 3600000,
        isRead: true,
        parentBlipId: parentId,
        permissions: {
          canEdit: false,
          canComment: isAuthed,
          canRead: true
        },
        childBlips: [
          {
            id: `${parentId}-reply-1-1`,
            content: '<p>I agree with your point. Let me add...</p>',
            authorId: 'user-3',
            authorName: 'Bob Smith',
            authorAvatar: 'https://via.placeholder.com/32/3f51b5',
            createdAt: Date.now() - 1800000,
            updatedAt: Date.now() - 1800000,
            isRead: false,
            parentBlipId: `${parentId}-reply-1`,
            permissions: {
              canEdit: false,
              canComment: isAuthed,
              canRead: true
            }
          }
        ]
      },
      {
        id: `${parentId}-reply-2`,
        content: '<p>Another perspective to consider...</p>',
        authorId: currentUser.id,
        authorName: currentUser.name,
        authorAvatar: currentUser.avatar,
        createdAt: Date.now() - 7200000,
        updatedAt: Date.now() - 7200000,
        isRead: true,
        parentBlipId: parentId,
        permissions: {
          canEdit: true,
          canComment: isAuthed,
          canRead: true
        }
      }
    ];
  };

  useEffect(() => { 
    load(); 
  }, [id]);

  // Realtime updates
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeTopicDetail(id, () => {
      load();
    });
    return () => unsub();
  }, [id]);

  const handleBlipUpdate = async (blipId: string, content: string): Promise<void> => {
    if (blipId === topic?.id) {
      // Update root topic
      await ensureCsrf();
      setBusy(true);
      const r = await api(`/api/topics/${encodeURIComponent(id)}`, { 
        method: 'PATCH', 
        body: JSON.stringify({ title: topic.title, content }) 
      });
      setBusy(false);
      if (!r.ok) { 
        toast('Save failed', 'error'); 
      } else { 
        toast('Topic saved'); 
        load();
      }
    } else {
      // Update child blip via API
      setBusy(true);
      try {
        const response = await api(`/api/blips/${encodeURIComponent(blipId)}`, {
          method: 'PUT',
          body: JSON.stringify({ content })
        });
        if (response.ok) {
          toast('Reply updated');
          load(); // Reload to show updated content
        } else {
          toast('Failed to update reply', 'error');
        }
      } catch (error) {
        console.error('Error updating blip:', error);
        toast('Failed to update reply', 'error');
      }
      setBusy(false);
    }
  };

  const handleAddReply = async (parentBlipId: string, content: string): Promise<void> => {
    if (!content.trim()) return;
    
    await ensureCsrf();
    setBusy(true);
    
    try {
      // API call to create a nested blip
      const response = await api('/api/blips', {
        method: 'POST',
        body: JSON.stringify({
          waveId: id,
          parentId: parentBlipId === id ? null : parentBlipId,
          content,
          authorName: 'Demo User' // Add author name for demo mode
        })
      });
      
      if (response.ok) {
        // Reload to show new blip with proper nesting
        await load();
        toast('Reply added');
      } else {
        toast('Failed to add reply', 'error');
      }
    } catch (error) {
      console.error('Error adding reply:', error);
      toast('Failed to add reply', 'error');
    }
    
    setBusy(false);
  };

  const handleToggleCollapse = (blipId: string): void => {
    // In production, save collapse state to user preferences
    console.log('Toggle collapse:', blipId);
  };

  if (!topic || !rootBlip) return <div>Loading...</div>;

  return (
    <div className="rizzoma-topic-detail">
      <div className="topic-header">
        <div className="header-top">
          <a href="#/" className="back-link">← Back to Topics</a>
          {isAuthed && (
            <div className="header-actions">
              <button className="header-btn invite-btn">Invite</button>
              <button className="header-btn manage-btn">Manage members</button>
              <button className="header-btn share-btn">Share</button>
              <button className="header-btn settings-btn">⚙️</button>
            </div>
          )}
        </div>
        <h1 className="topic-title">{topic.title}</h1>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={load} disabled={busy}>Retry</button>
        </div>
      )}

      <div className="topic-content">
        {rootBlip ? (
          <RizzomaBlip
            blip={rootBlip}
            isRoot={true}
            onBlipUpdate={handleBlipUpdate}
            onAddReply={handleAddReply}
            onToggleCollapse={handleToggleCollapse}
          />
        ) : (
          <div>Loading topic content...</div>
        )}
      </div>
    </div>
  );
}