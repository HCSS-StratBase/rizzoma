import { describe, expect, it } from 'vitest';
import { generateDigestEmail, generateInviteEmail, generateNotificationEmail } from '../server/services/email';

const payload = '<img src=x onerror="alert(1)">\r\nBcc: victim@example.test "quoted"';

describe('email template output encoding', () => {
  it('escapes invite text and attributes while keeping a bounded plain-text representation', () => {
    const template = generateInviteEmail({
      inviterName: payload,
      inviterEmail: `attacker@example.test\r\nBcc: victim@example.test`,
      topicTitle: payload,
      topicUrl: `https://rizzoma.example.test/?x=%22%20onmouseover=%22alert(1)#/topic/t?invite=secret`,
      recipientEmail: 'invitee@example.test',
      recipientName: payload,
      message: payload.repeat(200),
    });
    const rendered = document.createElement('div');
    rendered.innerHTML = template.html;
    expect(rendered.querySelector('img, script, [onerror], [onload]')).toBeNull();
    expect(template.html).toContain('&lt;img');
    expect(template.html).toContain('&quot;quoted&quot;');
    expect(template.html).not.toContain('\r');
    expect(template.subject).not.toMatch(/[\r\n]/);
    expect(template.text).toContain('<img src=x onerror="alert(1)"> Bcc:');
    expect(template.text.length).toBeLessThan(10_000);
  });

  it('encodes notification and digest fields and rejects active link schemes', () => {
    const notification = generateNotificationEmail({
      userName: payload,
      userEmail: 'user@example.test',
      authorName: payload,
      topicTitle: payload,
      topicUrl: 'javascript:alert(1)',
      blipPreview: payload,
    });
    const notificationDom = document.createElement('div');
    notificationDom.innerHTML = notification.html;
    expect(notificationDom.querySelector('img, script, [onerror], [onload]')).toBeNull();
    expect([...notificationDom.querySelectorAll('a')].every((anchor) => anchor.getAttribute('href') === '#')).toBe(true);
    expect(notification.html).toContain('href="#"');

    const digest = generateDigestEmail({
      userName: payload,
      userEmail: 'user@example.test',
      period: 'daily',
      topics: [{ title: payload, url: 'data:text/html,pwn', changes: 3, lastActivity: new Date('2026-07-12') }],
    });
    const digestDom = document.createElement('div');
    digestDom.innerHTML = digest.html;
    expect(digestDom.querySelector('img, script, [onerror], [onload]')).toBeNull();
    expect([...digestDom.querySelectorAll('a')].every((anchor) => !String(anchor.getAttribute('href')).startsWith('data:'))).toBe(true);
    expect(digest.html).toContain('href="#"');
    expect(digest.html).toContain('&lt;img');
  });
});
