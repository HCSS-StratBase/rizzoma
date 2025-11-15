import { useEffect, useState, useCallback, useRef } from 'react';
import { FEATURES } from '@shared/featureFlags';

interface ChangeInfo {
  blipId: string;
  lastRead: number;
  lastModified: number;
  hasUnreadChanges: boolean;
}

export function useChangeTracking(userId: string | null) {
  const [changes, setChanges] = useState<Map<string, ChangeInfo>>(new Map());
  const [currentHighlight, setCurrentHighlight] = useState<string | null>(null);
  const lastReadTimesRef = useRef<Map<string, number>>(new Map());

  // Load last read times from localStorage
  useEffect(() => {
    if (!userId || !FEATURES.FOLLOW_GREEN) return;
    
    const stored = localStorage.getItem(`rizzoma-read-times-${userId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        lastReadTimesRef.current = new Map(Object.entries(parsed));
      } catch (e) {
        console.error('Failed to load read times:', e);
      }
    }
  }, [userId]);

  // Save last read times to localStorage
  const saveReadTimes = useCallback(() => {
    if (!userId) return;
    
    const toStore = Object.fromEntries(lastReadTimesRef.current);
    localStorage.setItem(`rizzoma-read-times-${userId}`, JSON.stringify(toStore));
  }, [userId]);

  // Mark a blip as read
  const markAsRead = useCallback((blipId: string) => {
    if (!FEATURES.FOLLOW_GREEN) return;
    
    const now = Date.now();
    lastReadTimesRef.current.set(blipId, now);
    
    setChanges(prev => {
      const newChanges = new Map(prev);
      const existing = newChanges.get(blipId);
      if (existing) {
        newChanges.set(blipId, {
          ...existing,
          lastRead: now,
          hasUnreadChanges: false
        });
      }
      return newChanges;
    });
    
    saveReadTimes();
  }, [saveReadTimes]);

  // Track content changes
  const trackChange = useCallback((blipId: string, timestamp?: number) => {
    if (!FEATURES.FOLLOW_GREEN) return;
    
    const modifiedTime = timestamp || Date.now();
    const lastRead = lastReadTimesRef.current.get(blipId) || 0;
    
    setChanges(prev => {
      const newChanges = new Map(prev);
      newChanges.set(blipId, {
        blipId,
        lastRead,
        lastModified: modifiedTime,
        hasUnreadChanges: modifiedTime > lastRead
      });
      return newChanges;
    });
  }, []);

  // Navigate to next unread change
  const goToNextUnread = useCallback(() => {
    if (!FEATURES.FOLLOW_GREEN) return null;
    
    const unreadBlips = Array.from(changes.values())
      .filter(c => c.hasUnreadChanges)
      .sort((a, b) => a.lastModified - b.lastModified);
    
    if (unreadBlips.length === 0) return null;
    
    // Find the next one after current highlight
    let nextIndex = 0;
    if (currentHighlight) {
      const currentIndex = unreadBlips.findIndex(b => b.blipId === currentHighlight);
      if (currentIndex >= 0) {
        nextIndex = (currentIndex + 1) % unreadBlips.length;
      }
    }
    
    const nextBlip = unreadBlips[nextIndex];
    setCurrentHighlight(nextBlip.blipId);
    return nextBlip.blipId;
  }, [changes, currentHighlight]);

  // Check if a blip has unread changes
  const hasUnreadChanges = useCallback((blipId: string): boolean => {
    if (!FEATURES.FOLLOW_GREEN) return false;
    return changes.get(blipId)?.hasUnreadChanges || false;
  }, [changes]);

  // Get time since last change
  const getTimeSinceChange = useCallback((blipId: string): string => {
    const change = changes.get(blipId);
    if (!change) return '';
    
    const delta = Date.now() - change.lastModified;
    const minutes = Math.floor(delta / 60000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [changes]);

  return {
    markAsRead,
    trackChange,
    goToNextUnread,
    hasUnreadChanges,
    getTimeSinceChange,
    currentHighlight,
    unreadCount: Array.from(changes.values()).filter(c => c.hasUnreadChanges).length
  };
}