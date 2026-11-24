import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const sendMail = vi.fn(async () => ({ messageId: 'real-id' }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) }, createTransport: () => ({ sendMail }) }));

const docs = new Map<string, any>();
vi.mock('../server/middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { id: 'u-sender', email: 'sender@example.com', name: 'Sender' }; next(); },
}));
vi.mock('../server/middleware/csrf.js', () => ({ csrfProtect: () => (_q: any, _s: any, n: any) => n() }));
vi.mock('../server/lib/couch.js', () => ({
  getDoc: async (id: string) => { if (!docs.has(id)) throw new Error('404'); return docs.get(id); },
  insertDoc: async (d: any) => { docs.set(d._id, d); return { ok: true, rev: '1-x' }; },
  find: async (selector: any) => ({ docs: [...docs.values()].filter((d) => Object.entries(selector).every(([k, v]) => d[k] === v)) }),
}));
vi.mock('../server/lib/access.js', () => ({
  identityFromRequest: (req: any) => ({ id: req.user.id, email: req.user.email, name: req.user.name }),
  resolveBlipAccess: async (blipId: string) => {
    const blip = docs.get(blipId);
    if (!blip) throw new Error('404 blip_not_found');
    return { blip, access: { canRead: true } };
  },
  resolveWaveAccess: async (_wave: string, identity: any) => ({ canRead: identity.id === 'u-member' || identity.id === 'u-test' }),
}));

async function call(server: Server, method: string, path: string, body?: unknown) {
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() as any };
}

describe('POST /api/blips/:id/send', () => {
  let server: Server;
  beforeEach(async () => {
    docs.clear(); sendMail.mockClear();
    process.env['NODE_ENV'] = 'test';
    process.env['INVITE_MAIL_SUPPRESS_PATTERN'] = '\\+fractal\\d@example\\.com$';
    docs.set('w1', { _id: 'w1', type: 'topic', title: 'Topic One' });
    docs.set('w1:b1', { _id: 'w1:b1', type: 'blip', waveId: 'w1', content: '<ul><li>Hello <b>world</b></li></ul>' });
    docs.set('u-member', { _id: 'u-member', type: 'user', name: 'Member', email: 'member@example.org' });
    docs.set('u-test', { _id: 'u-test', type: 'user', name: 'Tester', email: 'me+fractal2@example.com' });
    docs.set('u-sender', { _id: 'u-sender', type: 'user', name: 'Sender', email: 'sender@example.com' });
    docs.set('u-out', { _id: 'u-out', type: 'user', name: 'Outsider', email: 'out@example.org' });
    const { default: router } = await import('../server/routes/blipSend');
    const app = express();
    app.use(express.json());
    app.use('/api/blips', router);
    server = await new Promise<Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  });
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  it('delivers to a member: a Mentions entry, a link-to-the-blip email, and a record the sender can read back', async () => {
    const r = await call(server, 'POST', '/api/blips/w1%3Ab1/send', { to: [{ userId: 'u-member' }], message: 'Please read', sendEmail: true });
    expect(r.status).toBe(200);
    expect(r.json.results[0]).toMatchObject({ status: 'delivered', inApp: true, emailStatus: 'sent' });
    const mention = [...docs.values()].find((d) => d.type === 'mention');
    expect(mention).toMatchObject({ mentionedUserId: 'u-member', blipId: 'w1:b1', topicId: 'w1', source: 'send', isRead: false, authorName: 'Sender' });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0] as any;
    expect(mail.to).toBe('member@example.org');
    expect(mail.text).toContain('#/topic/w1/b1/');
    expect(mail.text).toContain('Hello world');
    const hist = await call(server, 'GET', '/api/blips/w1%3Ab1/sends');
    expect(hist.json.sends).toHaveLength(1);
    expect(hist.json.sends[0].recipients[0].emailStatus).toBe('sent');
  });

  it('never mails a test address, and says so', async () => {
    const r = await call(server, 'POST', '/api/blips/w1%3Ab1/send', { to: [{ userId: 'u-test' }], sendEmail: true });
    expect(r.json.results[0]).toMatchObject({ status: 'delivered', emailStatus: 'suppressed' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends nothing to someone who cannot open the topic, and to an unknown address', async () => {
    const r = await call(server, 'POST', '/api/blips/w1%3Ab1/send', { to: [{ userId: 'u-out' }, { email: 'nobody@example.org' }, { userId: 'u-sender' }], sendEmail: true });
    expect(r.json.results.map((x: any) => x.status)).toEqual(['no_access', 'no_account', 'error']);
    expect([...docs.values()].some((d) => d.type === 'mention')).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('records a failed email honestly', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    const r = await call(server, 'POST', '/api/blips/w1%3Ab1/send', { to: [{ userId: 'u-member' }], sendEmail: true });
    expect(r.json.results[0]).toMatchObject({ status: 'delivered', inApp: true, emailStatus: 'failed' });
  });

  it('in-app only when email is not requested; rejects an empty request', async () => {
    const ok = await call(server, 'POST', '/api/blips/w1%3Ab1/send', { to: [{ userId: 'u-member' }], sendEmail: false });
    expect(ok.json.results[0].emailStatus).toBe('not_requested');
    expect(sendMail).not.toHaveBeenCalled();
    const bad = await call(server, 'POST', '/api/blips/w1%3Ab1/send', { to: [] });
    expect(bad.status).toBe(400);
  });
});
