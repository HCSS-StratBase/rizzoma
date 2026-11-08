import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('owner recovery script security contract', () => {
  it('uses canonical production URL validation and keeps the raw recovery URL out of stdout', async () => {
    const source = await readFile(new URL('../../scripts/create-owner-recovery-token.mjs', import.meta.url), 'utf8');

    expect(source).toContain("process.env.APP_URL || process.env.APP_BASE_URL");
    expect(source).toContain("APP_URL must use HTTPS in production");
    expect(source).toContain("APP_URL must not contain credentials");
    const stdoutSummary = source.slice(source.lastIndexOf('console.log(JSON.stringify({'));
    expect(stdoutSummary).not.toContain('recoveryUrl:');
    expect(stdoutSummary).not.toContain('tokenHash:');
    expect(stdoutSummary).toContain('oneTimeHandoffPath');
  });
});
