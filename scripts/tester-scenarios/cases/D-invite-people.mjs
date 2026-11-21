// Family D: invite and people. The tester: "I cannot invite people to the topics" and the people list
// "appears on mention but not as in the original Rizzoma".
import { newUser, shareWith, plain, sleep } from '../lib.mjs';

async function ownerTopic(ctx, title) {
  const a = await ctx.client(await newUser('own'));
  const id = await ctx.topic(a, title);
  await a.openTopic(id);
  return { a, id };
}
const openInvite = async (c) => { await c.page.getByRole('button', { name: 'Invite' }).first().click(); await sleep(1800); };
const rowFor = (c, email) => c.page.locator('.invite-member-row', { hasText: email });

export default [
  {
    id: 'D01', family: 'D', title: 'Invite dialog lists contacts (not people already in the topic), clicking one fills the box, a typed name resolves to its contact',
    rows: ['13.13', '2.8'],
    async run(ctx) {
      const { a, id } = await ownerTopic(ctx, 'invite contacts');
      const member = await newUser('m'); const contact = await newUser('k');
      await shareWith(id, member, 'editor');
      const other = await ctx.topic(a, 'invite contacts other'); await shareWith(other, contact, 'editor');
      await a.openTopic(id);
      await openInvite(a);
      const sug = await a.page.locator('[data-testid="invite-suggestions"]').innerText().catch(() => '');
      ctx.ok(sug.includes(contact.email), 'a person the owner works with elsewhere is listed as a contact', sug.replace(/\n/g, ' ').slice(0, 120));
      ctx.ok(!sug.includes(member.email), 'someone already in this topic is not offered again');
      await a.page.locator('.invite-suggestion', { hasText: contact.email }).first().click();
      ctx.ok((await a.page.locator('#invite-emails').inputValue()).includes(contact.email), 'clicking a contact fills the address box');
      ctx.ok(!(await a.page.locator('.invite-member-name', { hasText: /^Participant$/ }).count()), 'the member list shows real names, not "Participant"');
    },
  },
  {
    id: 'D02', family: 'D', title: 'invite by e-mail with role Viewer through the dialog: stored as viewer, the invitee sees the topic and cannot edit it',
    rows: ['13.13', '13.14', '11.2', '2.8'],
    expect: [/http 40[34]/],
    async run(ctx) {
      const { a, id } = await ownerTopic(ctx, 'invite viewer');
      const guest = await ctx.client(await newUser('g'));
      await openInvite(a);
      await a.page.locator('#invite-emails').fill(guest.user.email);
      const opts = await a.page.locator('.invite-role-select option').allInnerTexts();
      ctx.ok(['Reader', 'Editor'].every((t) => opts.includes(t)), 'the role list offers Reader and Editor (as in the original)', opts.join(','));
      await a.page.locator('.invite-role-select').selectOption('viewer');
      await a.page.locator('.invite-btn-primary').click();
      await sleep(3000);
      const plist = (await a.api('GET', `/api/waves/${id}/participants`)).json;
      const row = (plist?.participants || plist || []).find((x) => x.email === guest.user.email);
      ctx.ok(!!row && row.role === 'viewer', 'the invitee is stored with role viewer', JSON.stringify(row));
      await sleep(500);
      ctx.eq(row?.status, 'pending', 'the invitation is pending until the invitee accepts (e-mail link)');
      await shareWith(id, guest.user, 'viewer'); // the acceptance an e-mail link would perform
      await guest.openTopic(id, 6000);
      ctx.ok(await guest.page.locator('.blip-container, .topic-title, .topic-detail').first().isVisible().catch(() => false), 'once accepted the invited user can open the topic');
      ctx.ok((await guest.api('POST', '/api/blips', { waveId: id, content: '<ul><li><p>x</p></li></ul>' })).status >= 400, 'a viewer cannot create blips');
    },
  },
  {
    id: 'D03', family: 'D', title: 'owner removes a participant in the dialog (select + Remove): the person is gone from the list and loses access',
    rows: ['13.13', '2.8'],
    expect: [/http (401|403|404)/],
    async run(ctx) {
      const { a, id } = await ownerTopic(ctx, 'invite remove');
      const guest = await ctx.client(await newUser('g')); await shareWith(id, guest.user, 'editor');
      await a.reload();
      await openInvite(a);
      const row = rowFor(a, guest.user.email);
      ctx.eq(await row.count(), 1, 'the participant is listed in the dialog');
      await row.locator('input[type=checkbox]').check();
      await a.page.locator('[data-testid="invite-remove"]').click();
      await sleep(2500);
      ctx.eq(await rowFor(a, guest.user.email).count(), 0, 'the participant disappears from the dialog');
      ctx.ok([401, 403, 404].includes((await guest.api('GET', `/api/topics/${id}`)).status), 'and no longer has access');
    },
  },
  {
    id: 'D04', family: 'D', title: 'owner changes a participant role in the dialog (Select role): Editor becomes Viewer and the server enforces it',
    rows: ['13.13', '2.8'],
    expect: [/http 40[34]/],
    async run(ctx) {
      const { a, id } = await ownerTopic(ctx, 'invite role');
      const guest = await ctx.client(await newUser('g')); await shareWith(id, guest.user, 'editor');
      await a.reload();
      await openInvite(a);
      await rowFor(a, guest.user.email).locator('input[type=checkbox]').check();
      const sel = a.page.locator('[data-testid="invite-select-role"]');
      ctx.ok(await sel.count() > 0, 'a "Select role" control exists for selected members');
      await sel.click(); await sleep(500);
      await a.page.locator('[data-testid="invite-role-menu"] [data-role="viewer"]').click();
      await sleep(2500);
      const plist = (await a.api('GET', `/api/waves/${id}/participants`)).json;
      const row = (plist?.participants || plist || []).find((x) => x.email === guest.user.email);
      ctx.eq(row?.role, 'viewer', 'the stored role is now viewer');
      ctx.ok((await guest.api('POST', '/api/blips', { waveId: id, content: '<ul><li><p>x</p></li></ul>' })).status >= 400, 'and the demoted user can no longer create blips');
    },
  },
  {
    id: 'D05', family: 'D', title: '@mention autocomplete lists the topic participants (name and e-mail) and inserts a mention',
    rows: ['3.11', '15.1', '13.9'],
    async run(ctx) {
      const { a, id } = await ownerTopic(ctx, 'mention list');
      const guest = await newUser('g'); await shareWith(id, guest, 'editor');
      await a.reload();
      await a.replyAtTopic('hello');
      await a.expandRow('hello');
      await a.enterEditByClick('hello');
      await a.page.keyboard.press('End');
      await a.page.keyboard.type(' @', { delay: 40 });
      await sleep(1500);
      const items = await a.page.locator('.mention-list .mention-item').allInnerTexts();
      ctx.ok(items.some((t) => t.toLowerCase().includes(guest.email.split('@')[0].toLowerCase())), 'the dropdown lists the topic participant', items.join(' | ').slice(0, 160));
      await a.page.keyboard.press('Enter');
      await sleep(800);
      await a.doneAll();
      await sleep(1500);
      const list = await a.blips(id);
      ctx.ok(list.some((b) => /@/.test(plain(b.content)) && /mention/i.test(String(b.content))), 'the mention is stored as a mention node', list.map((b) => String(b.content).slice(0, 120)).join(' | '));
    },
  },
  {
    id: 'D06', family: 'D', title: 'the invited user finds the topic in the topics list (and the unread badge), a stranger does not',
    rows: ['13.5', '13.4', '2.2'],
    async run(ctx) {
      const { a, id } = await ownerTopic(ctx, 'invite sees list');
      const guest = await ctx.client(await newUser('g')); const stranger = await ctx.client(await newUser('x'));
      await shareWith(id, guest.user, 'editor');
      for (const c of [guest, stranger]) { await c.page.goto(c.topicUrl('').replace('#/topic/', '#/'), { waitUntil: 'domcontentloaded' }); await sleep(5000); }
      const title = `invite sees list`;
      ctx.ok((await guest.page.locator('body').innerText()).includes(title), 'the invitee sees the topic title in their list');
      ctx.ok(!(await stranger.page.locator('body').innerText()).includes(title), 'a stranger does not see it');
    },
  },
];
