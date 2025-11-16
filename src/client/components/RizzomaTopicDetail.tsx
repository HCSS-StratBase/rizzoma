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
    const r = await api(`/api/topics/${encodeURIComponent(id)}`);
    if (r.ok) { 
      const topicData = r.data as TopicFull;
      setTopic(topicData); 
      
      // Create root blip from topic
      const rootBlipData: BlipData = {
        id: topicData.id,
        content: topicData.content || '<p>Click here to start editing your topic...</p>',
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
        childBlips: generateMockChildBlips(topicData.id) // In production, load from API
      };
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
      // Update child blip - in production this would be an API call
      console.log('Update blip:', blipId, content);
      toast('Reply updated');
    }
  };

  const handleAddReply = async (parentBlipId: string, content: string): Promise<void> => {
    if (!content.trim()) return;
    
    await ensureCsrf();
    setBusy(true);
    
    // In production, this would be an API call to create a nested blip
    console.log('Add reply to:', parentBlipId, content);
    
    // Mock: add new blip to tree
    const newBlip: BlipData = {
      id: `${parentBlipId}-reply-${Date.now()}`,
      content,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isRead: true,
      parentBlipId,
      permissions: {
        canEdit: true,
        canComment: true,
        canRead: true
      }
    };
    
    // Update the tree structure (in production, reload from server)
    const updateBlipTree = (blip: BlipData): BlipData => {
      if (blip.id === parentBlipId) {
        return {
          ...blip,
          childBlips: [...(blip.childBlips || []), newBlip]
        };
      }
      if (blip.childBlips) {
        return {
          ...blip,
          childBlips: blip.childBlips.map(updateBlipTree)
        };
      }
      return blip;
    };
    
    if (rootBlip) {
      setRootBlip(updateBlipTree(rootBlip));
    }
    
    setBusy(false);
    toast('Reply added');
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
        <RizzomaBlip
          blip={rootBlip}
          isRoot={true}
          onBlipUpdate={handleBlipUpdate}
          onAddReply={handleAddReply}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>
    </div>
  );
}