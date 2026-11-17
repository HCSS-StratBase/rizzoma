// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Blip body text (paragraphs, list items, nested list items, .blip-text, every ProseMirror
 * editor) has ONE size/line-height/family, defined once as CSS variables in RizzomaApp.css.
 * The original Rizzoma gives every text run `default-text` = 14px (static/css/blip.css:860-863).
 * Regression (2026-11-17, measured on the live editor): list text rendered 15px while
 * paragraphs rendered 14px (`.root-blip .blip-text { font-size: 15px }` against
 * `.topic-content-view p { font-size: 14px }`), and the edit surface used the app shell's
 * -apple-system stack instead of Arial.
 */
const CLIENT = path.resolve(__dirname, '../client');
const CSS_FILES = [
  'RizzomaApp.css',
  'components/RizzomaTopicDetail.css',
  'components/blip/RizzomaBlip.css',
  'components/editor/BlipEditor.css',
  'components/native/NativeWaveView.css',
];

type Rule = { file: string; selector: string; body: string };

function rules(): Rule[] {
  const out: Rule[] = [];
  for (const file of CSS_FILES) {
    const css = fs.readFileSync(path.join(CLIENT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ file, selector: match[1]!.replace(/\s+/g, ' ').trim(), body: match[2]! });
    }
  }
  return out;
}

// Selectors that style BODY text of a blip (not headings, chrome, previews or metadata).
const BODY_SELECTOR = /(^|[ ,>])(\.blip-text|\.topic-content-view|\.topic-blip-content|\.tiptap\.ProseMirror|\.ProseMirror|\.rizzoma-native-mode)(\s|,|$)|(\.blip-text|\.topic-content-view|\.ProseMirror)\s+(p|li|ul|ol)\b|\b(li|p)$/;
const NOT_BODY = /\bh[1-6]\b|\.gadget|code|pre\b|blockquote|author|contributors|subblip-parent-context|placeholder|mention|\.tag\b|task|::|:empty|collaboration|cursor|\.hidden|thread-marker|toolbar|gear|btn|button/i;

describe('client: one body-text rule for every blip', () => {
  const all = rules();

  it('defines the shared typography variables once, on :root, with the original values', () => {
    const root = all.find((rule) => rule.file === 'RizzomaApp.css' && rule.selector === ':root');
    expect(root, ':root block in RizzomaApp.css').toBeTruthy();
    expect(root!.body).toMatch(/--blip-body-font-size:\s*14px/);
    expect(root!.body).toMatch(/--blip-body-line-height:\s*22px/);
    expect(root!.body).toMatch(/--blip-body-font-family:\s*Arial/);
  });

  it('no body-text rule sets a literal font-size other than the shared variable', () => {
    const offenders = all.filter((rule) => {
      if (rule.file === 'RizzomaApp.css') return false;
      if (!BODY_SELECTOR.test(rule.selector) || NOT_BODY.test(rule.selector)) return false;
      const size = rule.body.match(/(^|;|\s)font-size\s*:\s*([^;]+)/);
      return !!size && size[2]!.trim() !== 'var(--blip-body-font-size)' && size[2]!.trim() !== 'inherit';
    });
    expect(offenders.map((rule) => `${rule.file}: ${rule.selector} -> ${rule.body.match(/font-size\s*:\s*[^;]+/)![0]}`)).toEqual([]);
  });

  it('no list or paragraph rule sets a literal line-height (22px comes from the variable)', () => {
    const offenders = all.filter((rule) => {
      if (rule.file === 'RizzomaApp.css') return false;
      if (!BODY_SELECTOR.test(rule.selector) || NOT_BODY.test(rule.selector)) return false;
      if (!/(\bli\b|\bp\b|\.blip-text$|\.ProseMirror$|\.topic-content-view$)/.test(rule.selector)) return false;
      const lineHeight = rule.body.match(/(^|;|\s)line-height\s*:\s*([^;]+)/);
      if (!lineHeight) return false;
      const value = lineHeight[2]!.trim();
      return value !== 'var(--blip-body-line-height)' && value !== '22px' && value !== 'inherit';
    });
    expect(offenders.map((rule) => `${rule.file}: ${rule.selector} -> ${rule.body.match(/line-height\s*:\s*[^;]+/)![0]}`)).toEqual([]);
  });

  it('the root blip no longer enlarges its text (was 15px against 14px paragraphs)', () => {
    const rootBlip = all.filter((rule) => rule.selector === '.root-blip .blip-text');
    expect(rootBlip.length).toBeGreaterThan(0);
    for (const rule of rootBlip) expect(rule.body).not.toMatch(/font-size/);
  });

  it('every editor surface gets the same family, size and line-height as read mode', () => {
    const edit = all.find((rule) => rule.file === 'components/blip/RizzomaBlip.css' && /\.blip-editor-container \.ProseMirror,\s*\.tiptap\.ProseMirror/.test(rule.selector));
    expect(edit, 'shared edit-surface rule').toBeTruthy();
    expect(edit!.selector).toContain('.topic-content-edit .ProseMirror');
    expect(edit!.body).toContain('font-family: var(--blip-body-font-family)');
    expect(edit!.body).toContain('font-size: var(--blip-body-font-size)');
    expect(edit!.body).toContain('line-height: var(--blip-body-line-height)');
  });
});
