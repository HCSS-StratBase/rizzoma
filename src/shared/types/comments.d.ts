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
    range: {
        start: number;
        end: number;
        text: string;
    };
    replies?: InlineComment[];
}
export interface CommentThread {
    id: string;
    comments: InlineComment[];
    participants: string[];
    lastActivity: number;
}
//# sourceMappingURL=comments.d.ts.map