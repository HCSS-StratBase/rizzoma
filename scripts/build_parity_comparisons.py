#!/usr/bin/env python3
"""Build legacy/current side-by-side comparison sheets for the parity gate.

Pairs a legacy capture (260714-legacy-reference-archive or the Feb reference
set) with its counterpart in the newest current-app feature sweep, side by side
with labels. Output goes to <sweep>/legacy-current-comparisons/.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

REPO = Path('/mnt/c/Rizzoma')
LEGACY_NEW = REPO / 'screenshots/260714-legacy-reference-archive'
LEGACY_FEB = REPO / 'screenshots/260224-2343-rizzoma-live-reference/feature/rizzoma-core-features'
SWEEP = Path(sys.argv[1]) if len(sys.argv) > 1 else None
assert SWEEP and SWEEP.is_dir(), 'usage: build_parity_comparisons.py <sweep-dir>'
OUT = SWEEP / 'legacy-current-comparisons'
OUT.mkdir(exist_ok=True)

# (out-name, legacy file, current file, note)
PAIRS = [
    ('signin_vs_signin', LEGACY_NEW / '002-signin-form.png', SWEEP / '001-logged-out-sign-in-form.png',
     'Auth entry: legacy sign-in vs current sign-in form'),
    ('signup_vs_signup', LEGACY_NEW / '003-signup-form.png', SWEEP / '002-logged-out-sign-up-form.png',
     'Registration surfaces'),
    ('topics_list_vs_topics_list', LEGACY_NEW / '010-topics-list-default.png', SWEEP / '003-nav-topics-tab-and-searchable-topic-list.png',
     'Topics list: left rail, previews, unread badges'),
    ('search_vs_search', LEGACY_NEW / '012-topics-search-results.png', SWEEP / '004-topics-search-filter-typed.png',
     'Topic search'),
    ('mentions_vs_mentions', LEGACY_NEW / '014-nav-mentions.png', SWEEP / '005-nav-mentions-tab.png',
     'Mentions inbox'),
    ('tasks_vs_tasks', LEGACY_NEW / '015-nav-tasks.png', SWEEP / '006-nav-tasks-tab.png',
     'Tasks inbox'),
    ('publics_vs_publics', LEGACY_NEW / '016-nav-publics.png', SWEEP / '007-nav-publics-tab.png',
     'Publics directory'),
    ('store_vs_store', LEGACY_NEW / '017-nav-store.png', SWEEP / '008-nav-store-tab.png',
     'Gadget store'),
    ('teams_vs_teams', LEGACY_NEW / '018-nav-teams.png', SWEEP / '009-nav-teams-tab.png',
     'Teams'),
    ('topic_view_vs_topic_view', LEGACY_NEW / '030-topic-view-default.png', SWEEP / '018-topic-landing-collapsed-blb-toc.png',
     'Topic landing: BLB ToC with folded [+] markers'),
    ('share_vs_share', LEGACY_NEW / '032-share-modal.png', SWEEP / '013-share-settings-modal-open.png',
     'Share/access modal'),
    ('invite_vs_invite', LEGACY_NEW / '034-manage-members.png', SWEEP / '011-invite-participants-modal-open.png',
     'Participants / invite'),
    ('blip_menu_vs_read_toolbar', LEGACY_NEW / '060-blip-activated-menu.png', SWEEP / '019-expanded-blip-read-toolbar.png',
     'Active blip menu (single-blip chrome)'),
    ('edit_ribbon_vs_edit_toolbar', LEGACY_NEW / '063-root-edit-mode-ribbon.png', SWEEP / '021-edit-toolbar-full-rich-text-controls.png',
     'Edit-mode ribbon'),
    ('link_popup_vs_link', LEGACY_NEW / '064-edit-link-popup.png', SWEEP / '022-edit-overflow-menu-open.png',
     'Link/overflow editing affordances'),
    ('fractal1_vs_fractal', LEGACY_NEW / '051-fractal-unfold-level-1.png', SWEEP / '032-inline-marker-after-click-expanded.png',
     'One [+] expanded inline'),
    ('fractal_deep_vs_depth10', LEGACY_NEW / '055-fractal-unfold-level-5.png', SWEEP / '036-blb-fractal-spine-expanded-depth10.png',
     'Deep fractal indentation'),
    ('folded_toc_vs_folded_toc', LEGACY_NEW / '059-fractal-refolded.png', SWEEP / '035-blb-fractal-collapsed-toc.png',
     'Collapse-by-default ToC'),
    ('mindmap_vs_mindmap', LEGACY_NEW / '037-mindmap-view.png', SWEEP / '039-right-panel-mind-map-selected.png',
     'Mind-map view'),
    ('textview_vs_textview', LEGACY_NEW / '036-text-view.png', SWEEP / '038-right-panel-text-view-selected.png',
     'Text view'),
    ('gear_vs_gear', LEGACY_NEW / '061-blip-gear-menu.png', SWEEP / '020-read-gear-menu-open.png',
     'Per-blip gear menu'),
    ('playback_vs_playback', LEGACY_NEW / '069-playback-ui.png', SWEEP / '030-per-blip-playback-history-modal.png',
     'History / playback'),
    ('mobile_vs_mobile', LEGACY_NEW / '091-mobile-topic-view.png', SWEEP / '043-mobile-topic-content-view.png',
     'Mobile topic view'),
    ('legacy_blip_view_vs_read', LEGACY_FEB / 'rizzoma-blip-view.png', SWEEP / '019-expanded-blip-read-toolbar.png',
     'Feb reference: blip view vs current read toolbar'),
]

PANEL_W, PANEL_H, HDR = 880, 600, 40
made, missing = 0, []
for name, legacy, current, note_txt in PAIRS:
    if not legacy.exists() or not current.exists():
        missing.append((name, str(legacy if not legacy.exists() else current)))
        continue
    sheet = Image.new('RGB', (PANEL_W * 2 + 60, PANEL_H + HDR + 40), 'white')
    d = ImageDraw.Draw(sheet)
    d.text((20, 10), f'LEGACY rizzoma.com — {note_txt}', fill='black')
    d.text((PANEL_W + 60, 10), 'CURRENT 138-201-62-161.nip.io', fill='black')
    for i, src in enumerate((legacy, current)):
        img = Image.open(src).convert('RGB')
        img.thumbnail((PANEL_W, PANEL_H))
        sheet.paste(img, (20 + i * (PANEL_W + 40), HDR))
    out = OUT / f'{name}.png'
    sheet.save(out)
    made += 1
    print(f'✓ {out.name}')
print(f'\nmade={made} missing={len(missing)}')
for n, m in missing:
    print(f'  missing for {n}: {m}')
