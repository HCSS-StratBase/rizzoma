import { describe, it, expect } from 'vitest';
import { generateTopicHtmlExport } from '../client/lib/topicExport';

describe('export author display', () => {
  it('uses the contributor name or e-mail instead of "User <id>" when the stored author name is Anonymous', () => {
    const html = generateTopicHtmlExport({
      topicTitle: 'T', topicId: 't1',
      blips: [{ id: 'b1', content: '<p>x</p>', authorId: 'user:email:abc', authorName: 'Anonymous', contributors: [{ id: 'user:email:abc', name: '', email: 'p@example.com' }] } as never],
    });
    expect(html).toContain('p@example.com');
    expect(html).not.toContain('User ');
  });
});
