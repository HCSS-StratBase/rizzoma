import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TopicAvatar, type Participant } from '../client/components/RizzomaTopicDetail';

describe('accepted participant roster identity', () => {
  it('renders the safe server-provided name/avatar without needing an email', () => {
    const participant: Participant = {
      id: 'participant-viewer',
      userId: 'viewer',
      name: 'Visible Collaborator',
      avatar: 'https://images.example.test/avatar.png',
      role: 'viewer',
      status: 'accepted',
      invitedAt: 1,
    };
    const markup = renderToStaticMarkup(createElement(TopicAvatar, { participant }));
    expect(markup).toContain('aria-label="Visible Collaborator"');
    expect(markup).toContain('src="https://images.example.test/avatar.png"');
    expect(markup).toContain('VC');
    expect(markup).not.toContain('@');
  });

  it('falls back to initials for an unsafe avatar URL', () => {
    const participant: Participant = {
      id: 'participant-viewer', userId: 'viewer', name: 'Safe Name', avatar: 'javascript:alert(1)',
      role: 'viewer', status: 'accepted', invitedAt: 1,
    };
    const markup = renderToStaticMarkup(createElement(TopicAvatar, { participant }));
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('javascript:');
    expect(markup).toContain('SN');
  });
});
