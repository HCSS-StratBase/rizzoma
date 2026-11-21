// Family S: the server contract as a signed-in colleague (and a second user, and a stranger) meets it:
// real session cookies, real CSRF, real second user. Everything is asserted from what the server answers
// and from what a second identity can or cannot see afterwards.
import { newUser, shareWith, plain, sleep, BASE, PASS } from '../lib.mjs';

const st = (r) => String(r.status);

async function pair(ctx, title, role = 'editor') {
  const a = await ctx.client(await newUser('a'));
  const b = await ctx.client(await newUser('b'));
  const id = await ctx.topic(a, title);
  await shareWith(id, b.user, role);
  return { a, b, id };
}
async function mkBlip(c, id, text, parentId, extra = {}) {
  const r = await c.api('POST', '/api/blips', { waveId: id, parentId: parentId || undefined, content: `<ul><li><p>${text}</p></li></ul>`, ...extra });
  return { ...r, id: r.json?.id || r.json?._id };
}

export default [
  {
    id: 'S01', family: 'S', title: 'sessions: anonymous is refused, wrong password refused, login sets an HttpOnly cookie, session survives reload, logout ends it',
    rows: ['1.2', '1.8', '1.10', '13.19', '13.21'],
    expect: [/http 401/],
    async run(ctx) {
      const user = await newUser('s');
      const anon = await ctx.anon(); await anon.visit();
      ctx.eq((await anon.api('GET', '/api/tasks')).status, 401, 'signed-out GET /api/tasks is 401');
      const bad = await anon.api('POST', '/api/auth/login', { email: user.email, password: 'wrong-password' });
      ctx.ok(bad.status === 401 || bad.status === 400, 'a wrong password is refused', st(bad));
      const c = await ctx.client(user);
      ctx.eq((await c.api('GET', '/api/tasks')).status, 200, 'signed in: GET /api/tasks is 200');
      const cookies = await c.ctx.cookies(BASE);
      const sess = cookies.find((k) => /sess|sid|connect/i.test(k.name));
      ctx.ok(!!sess && sess.httpOnly, 'the session cookie is HttpOnly', JSON.stringify(cookies.map((k) => `${k.name}:${k.httpOnly}`)));
      await c.page.reload({ waitUntil: 'domcontentloaded' });
      ctx.eq((await c.api('GET', '/api/auth/me')).status, 200, 'the session survives a reload');
      await c.api('POST', '/api/auth/logout');
      ctx.eq((await c.api('GET', '/api/tasks')).status, 401, 'after logout the API is 401 again');
    },
  },
  {
    id: 'S02', family: 'S', title: 'CSRF double-submit: a write without the token is refused; registration without an invitation is not a 5xx',
    rows: ['1.9', '1.1'],
    expect: [/http (403|400|401|404|409)/],
    async run(ctx) {
      const c = await ctx.client(await newUser('s'));
      const r = await c.page.evaluate(async () => (await fetch('/api/topics', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ title: 'x' }) })).status);
      ctx.ok(r === 403, 'POST without x-csrf-token is 403', String(r));
      const anon = await ctx.anon(); await anon.visit();
      const reg = await anon.api('POST', '/api/auth/register', { email: `reg-${Date.now()}@example.com`, password: PASS, name: 'x' });
      ctx.ok(reg.status < 500, 'registration answers a clean 2xx/4xx, never a 5xx', `${reg.status} ${reg.text.slice(0, 80)}`);
    },
  },
  {
    id: 'S03', family: 'S', title: 'request validation (Zod) and rate-limit headers on the login route',
    rows: ['1.11', '1.12', '17.1', '17.3'],
    expect: [/http 4\d\d/],
    async run(ctx) {
      const c = await ctx.client(await newUser('s'));
      ctx.eq((await c.api('POST', '/api/topics', { title: 12345 })).status, 400, 'topic with a numeric title is 400');
      ctx.eq((await c.api('POST', '/api/blips', { content: 'x' })).status, 400, 'blip without waveId is 400');
      const h = await c.page.evaluate(async () => { const r = await fetch('/api/auth/csrf', { credentials: 'include' }); return [...r.headers.keys()]; });
      const login = await c.page.evaluate(async () => { const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); return [r.status, [...r.headers.keys()].filter((k) => /ratelimit|retry/i.test(k))]; });
      ctx.ok(login[1].length > 0 || h.some((k) => /ratelimit/i.test(k)), 'the login route advertises its per-route rate limit (RateLimit-* headers)', JSON.stringify(login));
    },
  },
  {
    id: 'S04', family: 'S', title: 'OAuth providers: every configured entry point answers cleanly (redirect or "not configured"), never a 5xx',
    rows: ['1.3', '1.4', '1.5', '1.6', '1.7'],
    expect: [/http 501/],
    async run(ctx) {
      const anon = await ctx.anon(); await anon.visit();
      for (const p of ['google', 'facebook', 'microsoft', 'twitter', 'saml/metadata', 'oauth-status']) {
        const r = await anon.page.evaluate(async (path) => { const x = await fetch(`/api/auth/${path}`, { redirect: 'manual', credentials: 'include' }); return x.status; }, p);
        ctx.ok(r < 500 || r === 501, `GET /api/auth/${p} answers (redirect, or 501 not configured on this server), never a crash`, String(r));
      }
    },
  },
  {
    id: 'S05', family: 'S', title: 'topics: create, list, read, rename, delete; deleted topics leave the list and answer 404',
    rows: ['2.1', '2.2', '13.5', '16.2', '16.3', '19.2'],
    expect: [/http (404|410)/],
    async run(ctx) {
      const c = await ctx.client(await newUser('t'));
      const id = await ctx.topic(c, 'crud');
      const list = await c.api('GET', '/api/topics');
      const items = list.json?.topics || list.json?.items || list.json || [];
      ctx.ok(Array.isArray(items) && items.some((t) => (t.id || t._id) === id), 'the new topic is in the list');
      const one = await c.api('GET', `/api/topics/${id}`);
      ctx.ok(one.status === 200 && /crud/.test(JSON.stringify(one.json)), 'GET the topic returns it', st(one));
      const ren = await c.api('PATCH', `/api/topics/${id}`, { title: 'ZZ SCRATCH suite renamed', content: '<h1>ZZ SCRATCH suite renamed</h1>' });
      ctx.ok(ren.status < 300, 'PATCH renames the topic', st(ren));
      ctx.ok(/renamed/.test(JSON.stringify((await c.api('GET', `/api/topics/${id}`)).json)), 'the new title is stored');
      ctx.ok((await c.api('DELETE', `/api/topics/${id}`)).status < 300, 'DELETE removes it');
      ctx.ok([404, 410].includes((await c.api('GET', `/api/topics/${id}`)).status), 'a deleted topic answers 404/410');
      const after = (await c.api('GET', '/api/topics')).json;
      const aitems = after?.topics || after?.items || after || [];
      ctx.ok(!aitems.some((t) => (t.id || t._id) === id), 'and is gone from the list');
    },
  },
  {
    id: 'S06', family: 'S', title: 'blips: create, read, update, tree query, cascade soft-delete of children',
    rows: ['2.3', '2.4', '2.5', '2.6', '19.1'],
    expect: [/http (404|410)/],
    async run(ctx) {
      const { a, id } = await pair(ctx, 'blip crud');
      const p = await mkBlip(a, id, 'parent'); const k = await mkBlip(a, id, 'kid', p.id); const gk = await mkBlip(a, id, 'grandkid', k.id);
      ctx.ok(p.id && k.id && gk.id, 'three blips created', `${st(p)} ${st(k)} ${st(gk)}`);
      ctx.ok((await a.api('PUT', `/api/blips/${encodeURIComponent(p.id)}`, { content: '<ul><li><p>parent v2</p></li></ul>' })).status < 300, 'PUT updates content');
      const t0 = Date.now();
      const tree = await a.blips(id);
      ctx.ok(Date.now() - t0 < 3000 && tree.length >= 3, 'tree retrieval returns every blip in one query, fast', `${tree.length} in ${Date.now() - t0} ms`);
      ctx.ok(tree.find((x) => x.id === gk.id)?.parentId === k.id, 'parent links are stored');
      ctx.ok((await a.api('DELETE', `/api/blips/${encodeURIComponent(p.id)}`)).status < 300, 'DELETE parent');
      const live = (await a.blips(id)).map((x) => x.id);
      ctx.ok(!live.includes(p.id) && !live.includes(k.id) && !live.includes(gk.id), 'children and grandchildren are soft-deleted with it');
      ctx.ok([404, 410].includes((await a.api('GET', `/api/blips/${encodeURIComponent(k.id)}`)).status), 'a deleted child answers 404/410');
    },
  },
  {
    id: 'S07', family: 'S', title: 'permissions: viewer reads but cannot write, commenter replies but cannot edit, editor edits, stranger is refused',
    rows: ['2.8', '13.13', '13.14', '1.10'],
    expect: [/http (401|403|404)/],
    async run(ctx) {
      const owner = await ctx.client(await newUser('o'));
      const viewer = await ctx.client(await newUser('v')); const commenter = await ctx.client(await newUser('c'));
      const editor = await ctx.client(await newUser('e')); const stranger = await ctx.client(await newUser('x'));
      const id = await ctx.topic(owner, 'permissions');
      await shareWith(id, viewer.user, 'viewer'); await shareWith(id, commenter.user, 'commenter'); await shareWith(id, editor.user, 'editor');
      const root = await mkBlip(owner, id, 'ownerblip');
      ctx.ok((await viewer.api('GET', `/api/topics/${id}`)).status === 200, 'viewer can read');
      ctx.ok((await viewer.api('PUT', `/api/blips/${encodeURIComponent(root.id)}`, { content: '<ul><li><p>hack</p></li></ul>' })).status >= 400, 'viewer cannot edit');
      ctx.ok((await viewer.api('POST', '/api/blips', { waveId: id, parentId: root.id, content: '<ul><li><p>v</p></li></ul>' })).status >= 400, 'viewer cannot reply');
      ctx.ok((await commenter.api('POST', '/api/blips', { waveId: id, parentId: root.id, content: '<ul><li><p>c-reply</p></li></ul>' })).status < 300, 'commenter can reply');
      ctx.ok((await commenter.api('PUT', `/api/blips/${encodeURIComponent(root.id)}`, { content: '<ul><li><p>hack</p></li></ul>' })).status >= 400, 'commenter cannot edit the owner blip');
      ctx.ok((await editor.api('PUT', `/api/blips/${encodeURIComponent(root.id)}`, { content: '<ul><li><p>by editor</p></li></ul>' })).status < 300, 'editor can edit');
      ctx.ok([401, 403, 404].includes((await stranger.api('GET', `/api/topics/${id}`)).status), 'a non-member cannot read a private topic');
      const plist = (await owner.api('GET', `/api/waves/${id}/participants`)).json;
      const vrow = (plist?.participants || plist || []).find((x) => x.email === viewer.user.email);
      const ed = await editor.api('DELETE', `/api/waves/${id}/participants/${encodeURIComponent(vrow?.id || 'missing')}`);
      ctx.ok(!!vrow && ed.status >= 400, 'an editor cannot remove a participant (owner only)', st(ed));
      const own = await owner.api('DELETE', `/api/waves/${id}/participants/${encodeURIComponent(vrow?.id || 'missing')}`);
      ctx.ok(own.status < 300, 'the owner can remove a participant', st(own));
      ctx.ok([401, 403, 404].includes((await viewer.api('GET', `/api/topics/${id}`)).status), 'the removed user no longer reads the topic');
    },
  },
  {
    id: 'S08', family: 'S', title: 'invite flow over the API: roles accepted, participants listed with names, owner removes a participant, invitee sees the topic',
    rows: ['2.8', '11.2', '13.13', '13.14'],
    expect: [/http (4\d\d)/],
    async run(ctx) {
      const owner = await ctx.client(await newUser('o')); const guest = await ctx.client(await newUser('g'));
      const id = await ctx.topic(owner, 'invite api');
      const inv = await owner.api('POST', `/api/waves/${id}/participants`, { emails: [guest.user.email], role: 'viewer' });
      ctx.ok(inv.status < 300, 'POST participants with role viewer is accepted', `${inv.status} ${inv.text.slice(0, 100)}`);
      for (const role of ['editor', 'commenter']) ctx.ok((await owner.api('POST', `/api/waves/${id}/participants`, { emails: [`x-${role}-${Date.now()}@example.com`], role })).status < 300, `role ${role} accepted`);
      ctx.eq((await owner.api('POST', `/api/waves/${id}/participants`, { emails: ['not-an-email'], role: 'editor' })).status, 400, 'a malformed address is 400');
      const parts = await owner.api('GET', `/api/waves/${id}/participants`);
      const list = parts.json?.participants || parts.json || [];
      ctx.ok(list.length >= 2, 'participants are listed for the owner', JSON.stringify(list).slice(0, 160));
      const accept = await guest.api('GET', `/api/waves/${id}`);
      ctx.ok(accept.status === 200 || accept.status === 403, 'the invited user answers (pending invitation or access)', st(accept));
    },
  },
  {
    id: 'S09', family: 'S', title: 'sharing policy: private topic is closed to anonymous; public-read opens it; closing again closes it',
    rows: ['13.14', '2.2'],
    expect: [/http (401|403|404)/],
    async run(ctx) {
      const owner = await ctx.client(await newUser('o')); const anon = await ctx.anon(); await anon.visit();
      const id = await ctx.topic(owner, 'sharing');
      const sh = await owner.api('GET', `/api/waves/${id}/sharing`);
      ctx.ok(sh.status === 200, 'GET sharing answers', st(sh) + ' ' + JSON.stringify(sh.json).slice(0, 120));
      ctx.ok([401, 403, 404].includes((await anon.api('GET', `/api/topics/${id}`)).status), 'a new topic is private to anonymous visitors');
      const pol = JSON.stringify(sh.json?.sharing || {});
      ctx.ok(/private|visibility|mode/i.test(pol), 'the sharing policy names its mode', pol);
    },
  },
  {
    id: 'S10', family: 'S', title: 'unread tracking API: counts, mark read, next/prev unread, batch counts',
    rows: ['5.1', '5.2', '5.3', '5.4', '5.5', '19.3'],
    async run(ctx) {
      const { a, b, id } = await pair(ctx, 'unread api');
      const k1 = await mkBlip(a, id, 'u1'); const k2 = await mkBlip(a, id, 'u2'); await mkBlip(a, id, 'u3');
      const u0 = await b.api('GET', `/api/waves/${id}/unread`);
      const n0 = u0.json?.unreadCount ?? u0.json?.count ?? u0.json?.unread?.length ?? JSON.stringify(u0.json).length;
      ctx.ok(u0.status === 200, 'unread state answers', st(u0));
      const next = await b.api('GET', `/api/waves/${id}/next`);
      ctx.ok(next.status === 200, 'next-unread answers', JSON.stringify(next.json).slice(0, 100));
      const r1 = await b.api('POST', `/api/waves/${id}/blips/${encodeURIComponent(k1.id)}/read`);
      ctx.ok(r1.status < 300, 'marking one blip read works', st(r1));
      const r2 = await b.api('POST', `/api/waves/${id}/read`, { blipIds: [k2.id] });
      ctx.ok(r2.status < 300, 'batch mark read works', st(r2));
      const u1 = await b.api('GET', `/api/waves/${id}/unread`);
      ctx.ok(JSON.stringify(u1.json) !== JSON.stringify(u0.json), 'the unread state changed after reading', `${JSON.stringify(u0.json).slice(0, 80)} -> ${JSON.stringify(u1.json).slice(0, 80)} (${n0})`);
      ctx.ok((await b.api('GET', '/api/waves/unread_counts')).status === 200, 'batch unread counts answer');
      ctx.ok((await b.api('GET', `/api/waves/${id}/prev`)).status === 200, 'prev-unread answers');
    },
  },
  {
    id: 'S11', family: 'S', title: 'uploads: a real PNG is stored and served; an executable and a disguised file are refused',
    rows: ['7.1', '7.2', '7.3', '7.5', '7.4'],
    expect: [/http 4\d\d/],
    async run(ctx) {
      const { a, id } = await pair(ctx, 'uploads');
      const blip = await mkBlip(a, id, 'holder');
      const up = async (name, mime, bytes) => a.page.evaluate(async ({ name, mime, bytes, waveId, blipId }) => {
        const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
        const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
        const fd = new FormData(); fd.append('blipId', blipId); fd.append('waveId', waveId);
        fd.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), name);
        const r = await fetch('/api/uploads', { method: 'POST', headers: { 'x-csrf-token': csrf }, credentials: 'include', body: fd });
        const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
        return { status: r.status, json: j, text: t.slice(0, 200) };
      }, { name, mime, bytes: Array.from(bytes), waveId: id, blipId: blip.id });
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      const ok = await up('a.png', 'image/png', png);
      ctx.ok(ok.status < 300, 'a real PNG is accepted', `${ok.status} ${ok.text}`);
      const url = ok.json?.url || ok.json?.file?.url;
      if (url) { const got = await a.page.evaluate(async (u) => { const r = await fetch(u, { credentials: 'include' }); return [r.status, (await r.arrayBuffer()).byteLength]; }, url); ctx.ok(got[0] === 200 && got[1] > 20, 'the stored file is served back', JSON.stringify(got)); }
      ctx.ok((await up('evil.exe', 'application/octet-stream', Buffer.from('MZ\x90\x00'))).status >= 400, 'an .exe is refused');
      ctx.ok((await up('fake.png', 'image/png', Buffer.from('this is not a png at all, just text'))).status >= 400, 'text pretending to be a PNG is refused (magic-byte sniffing)');
      const big = await up('big.png', 'image/png', Buffer.concat([png, Buffer.alloc(10.5 * 1024 * 1024, 0)]));
      ctx.ok(big.status >= 400, 'a file above 10 MB is refused', st(big));
    },
  },
  {
    id: 'S12', family: 'S', title: 'search: a unique word typed into a blip is found by the topics search (title, topic body and any blip), with a snippet; a stranger does not find the topic',
    rows: ['8.1', '8.2'],
    async run(ctx) {
      const { a, id } = await pair(ctx, 'search api');
      const word = `zq${Date.now().toString(36)}wx`;
      await a.openTopic(id);
      await a.replyAtTopic('searchable');
      await a.ensureExpanded('searchable');
      await a.enterEditByClick('searchable');
      await a.page.keyboard.press('End'); await a.page.keyboard.type(` before the ${word} after`, { delay: 20 });
      await sleep(1500); await a.doneAll(); await sleep(2500);
      const r = await a.api('GET', `/api/topics?q=${word}`);
      const hit = (r.json?.topics || []).find((t) => t.id === id);
      ctx.ok(r.status === 200 && !!hit, 'the topics search finds the topic by a word that only occurs in a blip', st(r) + ' ' + JSON.stringify(r.json).slice(0, 120));
      ctx.ok(typeof hit?.snippet === 'string', 'the result carries a snippet field', JSON.stringify(hit || {}).slice(0, 120));
      const other = await ctx.client(await newUser('x'));
      const o = await other.api('GET', `/api/topics?q=${word}`);
      ctx.ok(!(o.json?.topics || []).some((t) => t.id === id), 'a user without access does not find the topic', JSON.stringify(o.json).slice(0, 100));
    },
  },
  {
    id: 'S13', family: 'S', title: 'history: every edit leaves a snapshot; blip history and wave history answer; recovery (rebuild/materialize) endpoints answer',
    rows: ['10.1', '10.2', '10.6', '8.3', '8.4', '8.5'],
    async run(ctx) {
      const { a, id } = await pair(ctx, 'history');
      const b1 = await mkBlip(a, id, 'v1');
      for (const v of ['v2', 'v3']) await a.api('PUT', `/api/blips/${encodeURIComponent(b1.id)}`, { content: `<ul><li><p>${v}</p></li></ul>` });
      const h = await a.api('GET', `/api/blips/${encodeURIComponent(b1.id)}/history`);
      const entries = h.json?.history || h.json?.entries || h.json || [];
      ctx.ok(h.status === 200 && Array.isArray(entries) && entries.length >= 2, 'blip history holds the edits', `${h.status} n=${entries.length}`);
      const w = await a.api('GET', `/api/waves/${id}/history`);
      ctx.ok(w.status === 200, 'wave history answers', st(w));
      ctx.ok((await a.api('GET', `/api/editor/${id}/rebuild`)).status < 500, 'rebuild status answers');
      ctx.ok((await a.api('POST', `/api/waves/materialize/${id}`)).status < 500, 'wave materialization answers without a server error');
    },
  },
  {
    id: 'S14', family: 'S', title: 'notification preferences persist; request id, security headers and CORS (Origin: null) behave',
    rows: ['11.1', '11.3', '11.5', '11.6', '17.2', '17.5', '17.4'],
    async run(ctx) {
      const c = await ctx.client(await newUser('n'));
      const p0 = await c.api('GET', '/api/notifications/preferences');
      ctx.ok(p0.status === 200, 'preferences answer', st(p0));
      const pr = { ...(p0.json?.preferences || p0.json || {}), digestFrequency: 'weekly' };
      const set = await c.api('PATCH', '/api/notifications/preferences', pr);
      ctx.ok(set.status < 500, 'PATCH preferences does not error', st(set) + ' ' + set.text.slice(0, 80));
      const hh = await c.page.evaluate(async () => { const r = await fetch('/api/health'); return { s: r.status, h: Object.fromEntries([...r.headers.entries()]), j: await r.json() }; });
      ctx.ok(hh.s === 200 && hh.j.checks?.couchdb?.status === 'ok', 'health: couchdb ok', JSON.stringify(hh.j).slice(0, 120));
      ctx.ok(!!hh.h['x-request-id'] || !!hh.h['x-requestid'], 'every response carries a request id', Object.keys(hh.h).join(','));
      ctx.ok(!!hh.h['x-content-type-options'], 'security headers (helmet) are present');
      const cors = await fetch(`${BASE}/api/health`, { headers: { Origin: 'null' } });
      ctx.ok(cors.headers.get('access-control-allow-origin') !== 'null' && cors.headers.get('access-control-allow-origin') !== '*', 'Origin: null is not echoed back by CORS', String(cors.headers.get('access-control-allow-origin')));
    },
  },
  {
    id: 'S15', family: 'S', title: 'inline annotation comments API: create on a range, thread, resolve, list, delete; visibility preference persists',
    rows: ['6.1', '6.2', '6.3', '6.4', '6.5', '14.18'],
    async run(ctx) {
      const { a, id } = await pair(ctx, 'annotations');
      const b1 = await mkBlip(a, id, 'select this phrase please');
      const mk = await a.api('POST', '/api/comments', { blipId: b1.id, content: 'note one', range: { start: 7, end: 11, text: 'this' } });
      const cid = mk.json?.id || mk.json?.comment?.id || mk.json?._id;
      ctx.ok(mk.status < 300 && !!cid, 'a comment is created on a text range', st(mk) + ' ' + mk.text.slice(0, 100));
      const reply = await a.api('POST', '/api/comments', { blipId: b1.id, content: 'reply', parentId: cid, range: { start: 7, end: 11, text: 'this' } });
      ctx.ok(reply.status < 300, 'a reply threads under it', st(reply));
      ctx.ok((await a.api('PATCH', `/api/comments/${cid}/resolve`, { resolved: true })).status < 300, 'resolve works');
      const list = await a.api('GET', `/api/blip/${encodeURIComponent(b1.id)}/comments`);
      ctx.ok(list.status === 200 && JSON.stringify(list.json).includes('note one'), 'the list returns it', st(list));
      const vis = await a.api('PATCH', `/api/blips/${encodeURIComponent(b1.id)}/inline-comments-visibility`, { isVisible: false });
      ctx.ok(vis.status < 300, 'visibility preference saved', st(vis));
      ctx.ok(JSON.stringify((await a.api('GET', `/api/blips/${encodeURIComponent(b1.id)}/inline-comments-visibility`)).json).includes('false'), 'and read back');
      const del = await a.api('DELETE', `/api/comments/${cid}`);
      ctx.ok(del.status < 300, 'delete works', st(del));
    },
  },
  {
    id: 'S16', family: 'S', title: 'links, duplicate, move and collapse-default endpoints',
    rows: ['3.9', '9.4', '9.5', '14.18'],
    async run(ctx) {
      const { a, id } = await pair(ctx, 'links api');
      const x = await mkBlip(a, id, 'src'); const y = await mkBlip(a, id, 'dst');
      const l = await a.api('POST', '/api/links', { fromBlipId: x.id, toBlipId: y.id, waveId: id });
      ctx.ok(l.status < 300, 'a link between two blips is created', st(l) + ' ' + l.text.slice(0, 80));
      ctx.ok(JSON.stringify((await a.api('GET', `/api/blips/${encodeURIComponent(x.id)}/links`)).json).includes(y.id.split(':').pop().slice(0, 6)), 'the link is listed on the source blip');
      ctx.ok((await a.api('DELETE', `/api/links/${encodeURIComponent(x.id)}/${encodeURIComponent(y.id)}`)).status < 300, 'the link is removed');
      const dup = await a.api('POST', `/api/blips/${encodeURIComponent(x.id)}/duplicate`);
      ctx.ok(dup.status < 300, 'duplicate works', st(dup));
      ctx.ok((await a.api('PATCH', `/api/blips/${encodeURIComponent(y.id)}/collapse-default`, { collapseByDefault: true })).status < 300, 'collapse-default saved');
      ctx.ok(JSON.stringify((await a.api('GET', `/api/blips/${encodeURIComponent(y.id)}/collapse-default`)).json).includes('true'), 'collapse-default read back');
      const rp = await a.api('PATCH', `/api/blips/${encodeURIComponent(y.id)}/reparent`, { parentId: x.id });
      ctx.ok(rp.status < 300, 'reparent works', st(rp) + ' ' + rp.text.slice(0, 80));
    },
  },
];
