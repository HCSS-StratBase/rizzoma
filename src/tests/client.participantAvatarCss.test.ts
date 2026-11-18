import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A participant photo is `position: absolute; inset: 0`. Its box must be positioned, or the photo covers the
// whole collaboration toolbar and swallows the clicks on Invite and Share (found 18 Nov 2026 on the live host).
const css = readFileSync(join(process.cwd(), 'src/client/components/RizzomaTopicDetail.css'), 'utf8');

function ruleBody(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) return '';
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

describe('participant avatar css', () => {
  it('positions the avatar boxes that hold an absolutely positioned photo', () => {
    expect(ruleBody('.topic-avatar-image')).toMatch(/position:\s*absolute/);
    expect(ruleBody('.participant-avatar')).toMatch(/position:\s*relative/);
    expect(ruleBody('.topic-avatar-small')).toMatch(/position:\s*relative/);
  });
});
