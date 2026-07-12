import type { Request, Response } from 'express';
import { find, getDoc } from './couch.js';
import { sortParticipantCandidates } from './invitations.js';

export type ShareLevel = 'private' | 'link' | 'public';
export type WaveRole = 'outsider' | 'viewer' | 'commenter' | 'editor' | 'owner';
export type WavePermission = 'read' | 'comment' | 'edit' | 'manage';

export type SharingPolicy = {
  shareLevel: ShareLevel;
  allowComments: boolean;
  allowEdits: boolean;
};

export type AccessIdentity = {
  id?: string;
  email?: string;
  name?: string;
};

export type AccessControlledWave = {
  _id?: string;
  type?: string;
  authorId?: string;
  deleted?: boolean;
  deletedAt?: number;
  shareLevel?: ShareLevel;
  allowComments?: boolean;
  allowEdits?: boolean;
  sharing?: Partial<SharingPolicy>;
};

function isCanonicalWaveMetadata(waveId: string, value: unknown): value is AccessControlledWave {
  const wave = value as AccessControlledWave | null;
  return Boolean(
    wave
      && wave._id === waveId
      && (wave.type === 'topic' || wave.type === 'wave' || wave.type === 'topic_tombstone'),
  );
}

export type WaveAccess = {
  waveId: string;
  identity: AccessIdentity;
  role: WaveRole;
  policy: SharingPolicy;
  participantId?: string;
  canRead: boolean;
  canComment: boolean;
  canEdit: boolean;
  canManage: boolean;
};

type ParticipantDoc = {
  _id?: string;
  type: 'participant';
  waveId: string;
  userId: string;
  email?: string;
  role: 'owner' | 'editor' | 'commenter' | 'viewer';
  status?: 'pending' | 'accepted' | 'declined';
  inviteTokenHash?: string;
  inviteExpiresAt?: number;
  invitedAt?: number;
  acceptedAt?: number;
  updatedAt?: number;
};

export const DEFAULT_SHARING_POLICY: SharingPolicy = {
  // Before sharing settings were persisted, every topic was publicly
  // readable. Keep those legacy documents discoverable/read-only; every new
  // topic now stores an explicit private policy at creation time.
  shareLevel: 'public',
  allowComments: false,
  allowEdits: false,
};

const ROLE_RANK: Record<WaveRole, number> = {
  outsider: 0,
  viewer: 1,
  commenter: 2,
  editor: 3,
  owner: 4,
};

function normalizeEmail(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeShareLevel(value: unknown): ShareLevel {
  return value === 'link' || value === 'public' ? value : 'private';
}

/**
 * Topic deletion is represented by a durable document rather than a CouchDB
 * `_deleted` revision.  A missing metadata document is deliberately treated
 * as a legacy public-read-only wave, so physically deleting the topic while
 * leaving any blip behind would otherwise make the deleted content public.
 */
export function isDeletedWave(wave?: AccessControlledWave | null): boolean {
  return Boolean(wave?.deleted || wave?.type === 'topic_tombstone');
}

export function normalizeSharingPolicy(wave?: AccessControlledWave | null): SharingPolicy {
  const nested = wave?.sharing || {};
  const rawShareLevel = wave?.shareLevel ?? nested.shareLevel;
  return {
    shareLevel: rawShareLevel === undefined
      ? DEFAULT_SHARING_POLICY.shareLevel
      : normalizeShareLevel(rawShareLevel),
    allowComments: Boolean(wave?.allowComments ?? nested.allowComments ?? false),
    allowEdits: Boolean(wave?.allowEdits ?? nested.allowEdits ?? false),
  };
}

export function identityFromRequest(req: Request): AccessIdentity {
  const session = req.session as any;
  return {
    id: req.user?.id || session?.userId || undefined,
    email: normalizeEmail(req.user?.email || session?.userEmail || undefined) || undefined,
    name: req.user?.name || session?.userName || undefined,
  };
}

export function identityFromSocketRequest(request: unknown): AccessIdentity {
  const session = (request as any)?.session;
  return {
    id: session?.userId || undefined,
    email: normalizeEmail(session?.userEmail || undefined) || undefined,
    name: session?.userName || undefined,
  };
}

function roleFromParticipant(participant?: ParticipantDoc | null): WaveRole | null {
  // Pending email invitations prove nothing about the current session's
  // control of that address. Only a redeemed/accepted participant grants
  // access; legacy records with no status remain accepted for compatibility.
  if (!participant || participant.status === 'pending' || participant.status === 'declined') return null;
  if (participant.role === 'owner') return 'owner';
  if (participant.role === 'editor') return 'editor';
  if (participant.role === 'commenter') return 'commenter';
  return 'viewer';
}

function publicRole(policy: SharingPolicy, identity: AccessIdentity): WaveRole {
  if (policy.shareLevel === 'private') return 'outsider';
  if (!identity.id) return 'viewer';
  if (policy.allowEdits) return 'editor';
  if (policy.allowComments) return 'commenter';
  return 'viewer';
}

function buildAccess(
  waveId: string,
  identity: AccessIdentity,
  policy: SharingPolicy,
  role: WaveRole,
  participantId?: string,
): WaveAccess {
  return {
    waveId,
    identity,
    role,
    policy,
    participantId,
    canRead: ROLE_RANK[role] >= ROLE_RANK.viewer,
    canComment: ROLE_RANK[role] >= ROLE_RANK.commenter,
    canEdit: ROLE_RANK[role] >= ROLE_RANK.editor,
    canManage: role === 'owner',
  };
}

async function findParticipant(waveId: string, identity: AccessIdentity): Promise<ParticipantDoc | null> {
  const candidates: ParticipantDoc[] = [];
  if (identity.id) {
    const selector = { type: 'participant', waveId, userId: identity.id };
    const result = await find<ParticipantDoc>(selector, { limit: 5, use_index: 'idx_participant_wave_user' })
      .catch(() => find<ParticipantDoc>(selector, { limit: 5 }))
      .catch(() => ({ docs: [] as ParticipantDoc[] }));
    candidates.push(...(result.docs || []));
  }
  return sortParticipantCandidates(
    candidates.filter((candidate) => candidate.status !== 'pending' && candidate.status !== 'declined'),
    identity.id,
  )[0] || null;
}

export async function resolveWaveAccess(
  waveId: string,
  identity: AccessIdentity,
  providedWave?: AccessControlledWave | null,
): Promise<WaveAccess> {
  let wave: AccessControlledWave;
  if (providedWave !== undefined) {
    // `null` is an explicit signal from legacy wave loaders that no modern
    // metadata document exists. Legacy waves were publicly readable.
    wave = providedWave ?? { _id: waveId, type: 'wave' };
  } else {
    try {
      wave = await getDoc<AccessControlledWave>(waveId);
    } catch (error: any) {
      if (!String(error?.message || '').startsWith('404')) throw error;
      // Bounded compatibility fallback: only absence of the metadata doc is
      // converted to legacy public-read-only. Database/transport failures
      // still fail closed by propagating the error.
      wave = { _id: waveId, type: 'wave' };
    }
  }
  if (!isCanonicalWaveMetadata(waveId, wave)) {
    // Compatibility applies only when metadata is genuinely absent (the
    // explicit synthetic wave above), never when another Couch document is
    // found at the requested id. This blocks blip/task authorId from being
    // misinterpreted as topic ownership.
    throw new Error('404 invalid_wave_metadata');
  }
  const policy = normalizeSharingPolicy(wave);

  // Deleted topics are never eligible for the legacy compatibility fallback,
  // including for their former owner or participants.  Keeping the tombstone
  // at the original wave id makes this decision durable across restarts.
  if (isDeletedWave(wave)) {
    return buildAccess(
      waveId,
      identity,
      { shareLevel: 'private', allowComments: false, allowEdits: false },
      'outsider',
    );
  }

  if (identity.id && wave?.authorId === identity.id) {
    return buildAccess(waveId, identity, policy, 'owner');
  }

  const participant = identity.id
    ? await findParticipant(waveId, identity)
    : null;
  const participantRole = roleFromParticipant(participant);
  if (participantRole) {
    return buildAccess(waveId, identity, policy, participantRole, participant?._id);
  }

  return buildAccess(waveId, identity, policy, publicRole(policy, identity));
}

export function hasWavePermission(access: WaveAccess, permission: WavePermission): boolean {
  if (permission === 'read') return access.canRead;
  if (permission === 'comment') return access.canComment;
  if (permission === 'edit') return access.canEdit;
  return access.canManage;
}

export function sendAccessDenied(
  res: Response,
  identity: AccessIdentity,
  permission: WavePermission,
  requestId?: string,
): void {
  const status = identity.id ? 403 : 401;
  res.status(status).json({
    error: status === 401 ? 'unauthenticated' : 'forbidden',
    permission,
    requestId,
  });
}

export async function requireWaveAccess(
  req: Request,
  res: Response,
  waveId: string,
  permission: WavePermission,
  providedWave?: AccessControlledWave | null,
): Promise<WaveAccess | null> {
  const identity = identityFromRequest(req);
  const access = await resolveWaveAccess(waveId, identity, providedWave);
  if (hasWavePermission(access, permission)) return access;
  sendAccessDenied(res, identity, permission, (req as any)?.id);
  return null;
}

export async function resolveBlipAccess(
  blipId: string,
  identity: AccessIdentity,
): Promise<{ blip: any; access: WaveAccess }> {
  const blip = await getDoc<any>(blipId);
  if (blip?.deleted) {
    throw new Error('410 blip_deleted');
  }
  if (blip?.type === 'topic') {
    const waveId = String(blip._id || blipId);
    const access = await resolveWaveAccess(waveId, identity, blip);
    return { blip: { ...blip, waveId }, access };
  }
  if (!blip || blip.type !== 'blip' || !blip.waveId) {
    throw new Error('404 blip_not_found');
  }
  const access = await resolveWaveAccess(String(blip.waveId), identity);
  return { blip, access };
}

export async function listParticipantWaveIds(identity: AccessIdentity): Promise<string[]> {
  const waveIds = new Set<string>();
  if (identity.id) {
    const selector = { type: 'participant', userId: identity.id };
    const result = await find<ParticipantDoc>(selector, { limit: 5000, use_index: 'idx_participant_user_wave' })
      .catch(() => find<ParticipantDoc>(selector, { limit: 5000 }))
      .catch(() => ({ docs: [] as ParticipantDoc[] }));
    for (const doc of result.docs || []) {
      if (doc.status !== 'pending' && doc.status !== 'declined' && doc.waveId) waveIds.add(doc.waveId);
    }
  }
  return [...waveIds];
}

export async function buildAccessibleTopicSelector(
  identity: AccessIdentity,
  myOnly = false,
  documentType: 'topic' | 'wave' = 'topic',
): Promise<Record<string, unknown>> {
  if (myOnly) {
    return identity.id
      ? { type: documentType, authorId: identity.id }
      : { type: documentType, _id: { $in: [] } };
  }

  const visible: Record<string, unknown>[] = [
    { shareLevel: 'public' },
    {
      $and: [
        { shareLevel: { $exists: false } },
        { 'sharing.shareLevel': 'public' },
      ],
    },
    // Legacy topics predate persisted sharing. They were public before this
    // patch and remain public-read-only until an owner saves a policy.
    {
      $and: [
        { shareLevel: { $exists: false } },
        { 'sharing.shareLevel': { $exists: false } },
      ],
    },
  ];
  if (identity.id) visible.push({ authorId: identity.id });
  const participantWaveIds = await listParticipantWaveIds(identity);
  if (participantWaveIds.length > 0) visible.push({ _id: { $in: participantWaveIds } });

  return {
    $and: [
      { type: documentType },
      { $or: visible },
    ],
  };
}
