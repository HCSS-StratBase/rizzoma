import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const sweepDir = process.env.RIZZOMA_SWEEP_DIR || process.argv[2] || path.resolve('screenshots', '260424-003739-feature-sweep');
const manifestPath = path.join(sweepDir, 'manifest.json');
let manifestCaptureFilesById = new Map();

const nonScreenshotRules = [
  [/Authentication & Security/, /\b(SAML|Twitter|Session management|CSRF|Permission guards|Zod|Rate limiting)\b/i, 'Internal/auth backend behavior; verify with API/unit/security tests, not a screenshot.'],
  [/Waves & Blips/, /\b(schema|typed interface|CRUD API|Mango|soft-delete|cascade|participants API)\b/i, 'Data model/API behavior; verify with route/unit tests and DB state.'],
  [/Real-time Collaboration/, /\b(Transport layer|CRDT engine|Event broadcasting)\b/i, 'Protocol behavior; verify with multi-client tests/logs rather than a static screenshot.'],
  [/Unread Tracking/, /\b(CouchDB|API|aggregation|server-computed)\b/i, 'Unread persistence/API behavior; verify with route tests and follow-green smoke logs.'],
  [/Inline Comments System/, /\b(structure|CRUD APIs|threading|Visibility preference|Keyboard shortcuts)\b/i, 'Comment data/API/shortcut behavior; verify with tests plus comment UI screenshot.'],
  [/File Uploads/, /\b(endpoint|MIME|Executable|ClamAV|Storage backends|library)\b/i, 'Upload/storage/security behavior; verify with route tests and upload smoke, not static screenshots.'],
  [/Search & Recovery/, /\b(Mango|Yjs|materialization|status polling)\b/i, 'Search/rebuild backend behavior; verify with API/UI tests and logs.'],
  [/History & Playback/, /\b(storage|API)\b/i, 'History API/storage behavior; verify with API tests plus playback UI screenshots.'],
  [/Email Notifications/, /\b(service|Activity notifications|Digest emails|preferences API|SMTP templates)\b/i, 'Email backend/template behavior; verify with mailer tests or captured emails.'],
  [/Mobile & PWA/, /\b(breakpoints|hooks|manifest|Service worker|Offline mutation queue|real devices)\b/i, 'Platform/runtime behavior; verify with tests/device runs, not a static screenshot.'],
  [/Mobile & PWA/, /\b(View Transitions API)\b/i, 'Runtime/browser API behavior; verify with reduced-motion and transition tests, not a static screenshot.'],
  [/BLB/, /\b(Persistence|Auth-gated|Ctrl\+Enter|editing.*persists|orphaned)\b/i, 'Persistence/auth/keyboard behavior; verify with tests plus BLB screenshots.'],
];

const screenshotRules = [
  [/Authentication & Security/, /registration/i, ['001-logged-out-sign-in-form.png', '002-logged-out-sign-up-form.png'], 'Sign-in and sign-up forms are captured.'],
  [/Authentication & Security/, /(login|Google|Facebook|Microsoft)/i, ['001-logged-out-sign-in-form.png'], 'Login/OAuth entry buttons are visible in the sign-in form.'],
  [/Waves & Blips/, /Topic view|full blip tree/i, ['018-topic-landing-collapsed-blb-toc.png', '019-expanded-blip-read-toolbar.png'], 'Topic tree and expanded blip states are visible.'],
  [/Rich Text Editor/, /(framework|Bold|Italic|Underline|Strikethrough|Headings|Bullet list|Ordered list|Task lists|Code|Highlight|Links|Images|Edit mode toolbar|Toolbar icons)/i, ['021-edit-toolbar-full-rich-text-controls.png'], 'Full edit toolbar shows the rich-text controls and current icon treatment.'],
  [/Rich Text Editor/, /mentions/i, ['024-mention-autocomplete-active.png'], 'Mention trigger/autocomplete state is captured.'],
  [/Rich Text Editor/, /Read mode toolbar/i, ['019-expanded-blip-read-toolbar.png'], 'Expanded read toolbar is captured.'],
  [/Rich Text Editor/, /(Gadget nodes|Gadget palette)/i, ['027-right-panel-gadget-palette-open.png'], 'Gadget palette and installed gadget tiles are captured.'],
  [/Real-time Collaboration/, /(Live cursors|Typing indicators)/i, ['041-real-time-cursor-and-typing-indicator-visible.png'], 'Two authenticated editors produce remote cursor/typing UI in the owner editor.', 'dynamic_screenshot_covered'],
  [/Real-time Collaboration/, /Presence indicator/i, ['003-nav-topics-tab-and-searchable-topic-list.png'], 'Authenticated navigation chrome provides presence/avatar evidence; live cursor and typing states need separate multi-client captures.'],
  [/Unread Tracking/, /(Green left border|Wave list badge|Follow the Green|Next\/Prev|Keyboard)/i, ['follow-green/1776984446760-desktop-all-read.png', 'follow-green/1776984446760-mobile-all-read.png', '003-nav-topics-tab-and-searchable-topic-list.png'], 'Follow-green desktop/mobile dynamic captures cover unread navigation end state and green markers.'],
  [/Inline Comments System/, /(Resolve|unresolve|sidebar|filters|comment)/i, ['029-inline-comments-nav-state.png'], 'Inline comment UI/filter state is captured.'],
  [/Search & Recovery/, /(Full-text search|Snippet)/i, ['004-topics-search-filter-typed.png'], 'Topic search input/filter state is captured; editor-search result details remain a gap.'],
  [/Blip Operations/, /(Reply|Edit|Duplicate|Cut|Paste|Copy link|Gear dropdown|copy\/paste|reply\/cursor)/i, ['020-read-gear-menu-open.png', '022-edit-overflow-menu-open.png'], 'Read gear and edit overflow menus expose core blip operations.'],
  [/Blip Operations/, /Delete/i, ['022-edit-overflow-menu-open.png'], 'Edit overflow includes destructive action affordance.'],
  [/Blip Operations/, /History|playback/i, ['030-per-blip-playback-history-modal.png'], 'Per-blip playback/history modal is captured.'],
  [/History & Playback/, /Per-blip/i, ['030-per-blip-playback-history-modal.png'], 'Per-blip timeline modal is captured.'],
  [/History & Playback/, /Wave-level|Wave playback/i, ['017-wave-timeline-playback-modal-open.png'], 'Wave playback modal and controls are captured.'],
  [/Email Notifications/, /Invite emails/i, ['011-invite-participants-modal-open.png', '012-invite-participants-modal-filled-email.png'], 'Invite email modal and filled recipient state are captured.'],
  [/Mobile & PWA/, /(Swipe|Pull|BottomSheet|Touch targets|Mobile layout|responsive)/i, ['039-mobile-authenticated-topic-navigation.png', 'follow-green/1776984446760-mobile-all-read.png'], 'Mobile topic list and mobile topic content are captured.'],
  [/User Interface Components/, /Three-panel layout/i, ['003-nav-topics-tab-and-searchable-topic-list.png'], 'Desktop three-panel layout is captured.'],
  [/User Interface Components/, /Navigation panel/i, ['003-nav-topics-tab-and-searchable-topic-list.png', '005-nav-mentions-tab.png', '006-nav-tasks-tab.png', '007-nav-publics-tab.png', '008-nav-store-tab.png', '009-nav-teams-tab.png'], 'Navigation tabs are captured.'],
  [/User Interface Components/, /(Topics list|badge|date|unread bar|filter)/i, ['003-nav-topics-tab-and-searchable-topic-list.png', '004-topics-search-filter-typed.png'], 'Topic cards/search and visible badges/bars are captured; filter dropdown remains a gap if no dropdown is open.'],
  [/User Interface Components/, /Mentions tab/i, ['005-nav-mentions-tab.png'], 'Mentions tab state is captured.'],
  [/User Interface Components/, /Tasks tab/i, ['006-nav-tasks-tab.png'], 'Tasks tab state is captured.'],
  [/User Interface Components/, /(Participants|invite)/i, ['011-invite-participants-modal-open.png', '012-invite-participants-modal-filled-email.png'], 'Participants invite modal is captured.'],
  [/User Interface Components/, /Share modal/i, ['013-share-settings-modal-open.png', '014-share-settings-option-selected.png'], 'Share modal and selected option state are captured.'],
  [/User Interface Components/, /(Right panel|Next button|mind map|hide\/show|folded view)/i, ['033-fold-all-after-hide-replies.png', '034-unfold-all-after-show-replies.png', '035-right-panel-text-view-selected.png', '036-right-panel-mind-map-selected.png', '037-right-panel-short-mode-selected.png', '038-right-panel-expanded-mode-selected.png'], 'Right panel buttons/toggles are captured.'],
  [/User Interface Components/, /(Login modal|Auth panel)/i, ['001-logged-out-sign-in-form.png', '002-logged-out-sign-up-form.png'], 'Auth panel states are captured.'],
  [/User Interface Components/, /Toast notifications/i, ['040-toast-notification-component-visible.png'], 'Toast component visible state is captured through the app toast event.'],
  [/User Interface Components/, /Keyboard shortcuts panel/i, ['003-nav-topics-tab-and-searchable-topic-list.png', '039-mobile-authenticated-topic-navigation.png'], 'Keyboard shortcut hints are visible in the navigation footer.'],
  [/BLB/, /(Collapsed TOC|Section expanded|All sections|Fold\/Unfold|Reply vs inline|mid-sentence|\[\+\]|marker|Portal|Three-state|Toolbar left|Click outside|Inline child)/i, ['018-topic-landing-collapsed-blb-toc.png', '019-expanded-blip-read-toolbar.png', '031-inline-marker-before-click.png', '032-inline-marker-after-click-expanded.png', '033-fold-all-after-hide-replies.png', '034-unfold-all-after-show-replies.png'], 'BLB collapsed, expanded, inline marker, and fold/unfold states are captured.'],
  [/BLB/, /\[−\] click = collapse back/i, ['031-inline-marker-before-click.png', '032-inline-marker-after-click-expanded.png', '033-fold-all-after-hide-replies.png'], 'Inline before/after and fold states provide collapse-back visual evidence.'],
  [/Inline Widgets/, /@mention/i, ['024-mention-autocomplete-active.png'], 'Mention widget trigger is captured.'],
  [/Inline Widgets/, /~task/i, ['025-task-trigger-typed.png'], 'Task trigger state is captured.'],
  [/Inline Widgets/, /#tag/i, ['026-tag-trigger-typed.png', '032-inline-marker-after-click-expanded.png'], 'Tag trigger and rendered tag text are captured.'],
  [/Inline Widgets/, /(Insert shortcuts|button styling|auto-enter|Toolbar decluttered|Gadget)/i, ['027-right-panel-gadget-palette-open.png', '020-read-gear-menu-open.png', '022-edit-overflow-menu-open.png'], 'Insert shortcuts, gadget palette, and decluttered overflow are captured.'],
];

const knownScreenshotGaps = [
  [/Real-time Collaboration/, /(Live cursors|Typing indicators)/i, 'Needs a two-client dynamic capture with remote cursor/typing indicator visible.'],
  [/File Uploads/, /Client upload/i, 'Needs an upload progress/cancel/retry screenshot or upload smoke artifact.'],
  [/Search & Recovery/, /(Snippet|rebuild|Recovery)/i, 'Needs editor-search results and rebuild/recovery status panel screenshots.'],
  [/Email Notifications/, /(Activity|Digest|SMTP)/i, 'Needs rendered email/template artifact if treated as visual.'],
  [/Mobile & PWA/, /(BottomSheet|Pull|Swipe)/i, 'Needs explicit mobile gesture/bottom-sheet screenshot if treated as visual.'],
  [/User Interface Components/, /(filter dropdown|populated content|filter buttons)/i, 'Needs the specific dropdown/populated/filter state captured.'],
  [/BLB/, /(multiple per paragraph|Nested inline expansion)/i, 'Needs a deeper BLB fixture with multiple/nested inline markers.'],
  [/Inline Widgets/, /iframe rendering/i, 'Known feature gap; screenshot should show placeholder vs expected iframe once implemented.'],
];

function matches([sectionPattern, rowPattern], row) {
  return sectionPattern.test(row.section) && rowPattern.test(row.functionality);
}

function evidencePaths(files) {
  return files.map((file) => `screenshots/${path.basename(sweepDir)}/${file}`);
}

function existingEvidenceFiles(files) {
  const existing = [];
  for (const file of files) {
    if (fsSync.existsSync(path.join(sweepDir, file))) {
      existing.push(file);
      continue;
    }
    const id = path.basename(file).replace(/^\d+-/, '').replace(/\.png$/, '');
    const manifestFile = manifestCaptureFilesById.get(id);
    if (manifestFile && fsSync.existsSync(path.join(sweepDir, manifestFile))) {
      existing.push(manifestFile);
    }
  }
  return existing;
}

function classify(row) {
  for (const rule of nonScreenshotRules) {
    if (matches(rule, row)) {
      return {
        status: 'non_screenshot_artifact',
        evidence: [],
        note: rule[2],
      };
    }
  }
  for (const rule of screenshotRules) {
    if (matches(rule, row)) {
      const files = existingEvidenceFiles(rule[2]);
      if (files.length === 0) {
        return {
          status: 'screenshot_gap',
          evidence: [],
          note: `Configured screenshot evidence was not present in this sweep: ${rule[2].join(', ')}. ${rule[3]}`,
        };
      }
      return {
        status: rule[4] || (files.some((file) => file.includes('/')) ? 'dynamic_screenshot_covered' : 'screenshot_covered'),
        evidence: evidencePaths(files),
        note: rule[3],
      };
    }
  }
  for (const rule of knownScreenshotGaps) {
    if (matches(rule, row)) {
      return {
        status: 'screenshot_gap',
        evidence: [],
        note: rule[2],
      };
    }
  }
  return {
    status: 'needs_review',
    evidence: [],
    note: 'No explicit coverage rule yet; review whether this needs screenshot evidence or test/log evidence.',
  };
}

function mdEscape(text) {
  return String(text).replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifestCaptureFilesById = new Map(
    (manifest.captures || []).map((capture) => [capture.id, path.relative(sweepDir, capture.file)])
  );
  const rows = manifest.visualRows.map((row, index) => ({
    id: `VF-${String(index + 1).padStart(3, '0')}`,
    ...row,
    ...classify(row),
  }));

  const stats = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  const coverage = {
    generatedAt: new Date().toISOString(),
    sweepDir: path.relative(process.cwd(), sweepDir),
    manifest: path.relative(process.cwd(), manifestPath),
    totalRows: rows.length,
    stats,
    rows,
  };

  await fs.writeFile(path.join(sweepDir, 'coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`);

  const lines = [
    '# Rizzoma Visual Feature Coverage Matrix',
    '',
    `- Generated: ${coverage.generatedAt}`,
    `- Sweep: ${coverage.sweepDir}`,
    `- Total screenshot-candidate rows: ${coverage.totalRows}`,
    `- Screenshot covered: ${stats.screenshot_covered || 0}`,
    `- Dynamic screenshot covered: ${stats.dynamic_screenshot_covered || 0}`,
    `- Non-screenshot artifact: ${stats.non_screenshot_artifact || 0}`,
    `- Screenshot gaps: ${stats.screenshot_gap || 0}`,
    `- Needs review: ${stats.needs_review || 0}`,
    '',
    '## Matrix',
    '',
    '| ID | Section | Functionality | Status | Evidence | Note |',
    '|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const evidence = row.evidence.length
      ? row.evidence.map((file) => `[${path.basename(file)}](${path.relative(sweepDir, file)})`).join('<br>')
      : '-';
    lines.push(`| ${row.id} | ${mdEscape(row.section)} | ${mdEscape(row.functionality)} | ${row.status} | ${evidence} | ${mdEscape(row.note)} |`);
  }

  await fs.writeFile(path.join(sweepDir, 'coverage.md'), `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ output: path.join(sweepDir, 'coverage.md'), stats }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
