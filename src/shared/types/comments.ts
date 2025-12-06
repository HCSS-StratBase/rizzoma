export interface InlineComment {
  id: string;
  blipId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userAvatar?: string;
  isAuthenticated?: boolean;
  content: string;
  createdAt: number;
  updatedAt: number;
  resolved: boolean;
  parentId?: string;
  rootId?: string;
  resolvedAt?: number | null;
  
  // Text range the comment is anchored to
  range: {
    start: number;
    end: number;
    text: string; // Store the original text for resilience
  };
  
  // Thread replies
  replies?: InlineComment[];
}

export interface CommentThread {
  id: string;
  comments: InlineComment[];
  participants: string[];
  lastActivity: number;
}
