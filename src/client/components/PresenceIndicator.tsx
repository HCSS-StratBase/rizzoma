import type { PresenceStatus, PresenceUser } from '../hooks/usePresence';
import './PresenceIndicator.css';

type PresenceIndicatorProps = {
  label?: string;
  status: PresenceStatus;
  users: PresenceUser[];
  maxVisible?: number;
};

function initialsFor(user: PresenceUser) {
  const source = user.name || user.userId || '?';
  const tokens = source.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return source.slice(0, 2).toUpperCase();
  if (tokens.length === 1) return tokens[0]!.slice(0, 2).toUpperCase();
  return `${tokens[0]![0] ?? ''}${tokens[1]![0] ?? ''}`.toUpperCase();
}

export function PresenceIndicator({ label, status, users, maxVisible = 4 }: PresenceIndicatorProps) {
  const tooltip = users.length > 0
    ? users.map((user) => user.name || user.userId || 'anon').join(', ')
    : status === 'error'
      ? 'Presence service unavailable'
      : 'No users present';

  return (
    <div className="presence-indicator" data-state={status}>
      {label ? <span className="presence-label">{label}</span> : null}
      {status === 'loading' ? <span className="presence-muted">Loading presence…</span> : null}
      {status === 'error' ? <span className="presence-error" title={tooltip}>Presence offline</span> : null}
      {status === 'ready' && users.length === 0 ? <span className="presence-muted">No one editing</span> : null}
      {status === 'ready' && users.length > 0 ? (
        <div className="presence-chip" title={tooltip}>
          <span className="presence-count">{users.length}</span>
          <div className="presence-avatars">
            {users.slice(0, maxVisible).map((user, index) => (
              <span
                className="presence-avatar"
                key={(user.userId || 'anon') + index}
                aria-label={user.name || user.userId || 'Anonymous'}
              >
                {initialsFor(user)}
              </span>
            ))}
            {users.length > maxVisible ? (
              <span className="presence-overflow">+{users.length - maxVisible}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
