import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AuthPanel, type AuthUser } from './AuthPanel';
import { RizzomaTopicDetail } from './RizzomaTopicDetail';
import './AnonymousTopicRoute.css';

type AccessState = 'checking' | 'readable' | 'signin-required' | 'missing' | 'error';

export function AnonymousTopicRoute({
  topicId,
  blipPath,
  onSignedIn,
}: {
  topicId: string;
  blipPath?: string | null;
  onSignedIn: (user: AuthUser) => void;
}): JSX.Element {
  const [accessState, setAccessState] = useState<AccessState>('checking');
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAccessState('checking');
    void api(`/api/topics/${encodeURIComponent(topicId)}`).then((response) => {
      if (cancelled) return;
      if (response.ok) setAccessState('readable');
      else if (response.status === 401 || response.status === 403) setAccessState('signin-required');
      else if (response.status === 404 || response.status === 410) setAccessState('missing');
      else setAccessState('error');
    }).catch(() => {
      if (!cancelled) setAccessState('error');
    });
    return () => { cancelled = true; };
  }, [topicId]);

  if (accessState === 'checking') {
    return <div className="anonymous-topic-status">Checking topic access…</div>;
  }

  if (accessState === 'signin-required') {
    return (
      <main className="anonymous-topic-access" aria-label="Private topic sign in">
        <h1>Sign in to open this topic</h1>
        <p>This topic is private or shared with specific collaborators.</p>
        <AuthPanel onSignedIn={onSignedIn} />
      </main>
    );
  }

  if (accessState === 'missing' || accessState === 'error') {
    return (
      <main className="anonymous-topic-access" role="alert">
        <h1>{accessState === 'missing' ? 'Topic not found' : 'Topic unavailable'}</h1>
        <p>{accessState === 'missing' ? 'This link may be invalid or the topic was deleted.' : 'Please retry in a moment.'}</p>
      </main>
    );
  }

  return (
    <div className="anonymous-topic-route">
      <header className="anonymous-topic-header">
        <span className="anonymous-topic-brand">Rizzoma</span>
        <button type="button" onClick={() => setShowSignIn((visible) => !visible)}>
          Sign in
        </button>
      </header>
      {showSignIn && (
        <aside className="anonymous-topic-signin" aria-label="Sign in to collaborate">
          <AuthPanel onSignedIn={onSignedIn} />
        </aside>
      )}
      <main className="anonymous-topic-content">
        <RizzomaTopicDetail id={topicId} blipPath={blipPath} isAuthed={false} />
      </main>
    </div>
  );
}
