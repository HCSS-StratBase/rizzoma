import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-saml/node-saml', () => ({
  ValidateInResponseTo: { always: 'always', ifPresent: 'ifPresent', never: 'never' },
  SAML: class MockSaml {
    constructor(public config: Record<string, unknown>) {}
  },
}));

describe('SAML request correlation', () => {
  afterEach(() => {
    for (const name of ['SAML_ENABLED', 'SAML_ENTRY_POINT', 'SAML_ISSUER', 'SAML_CERT']) delete process.env[name];
    vi.resetModules();
  });

  it('requires InResponseTo and caches instances per callback URL', async () => {
    process.env['SAML_ENABLED'] = 'true';
    process.env['SAML_ENTRY_POINT'] = 'https://idp.example.test/login';
    process.env['SAML_ISSUER'] = 'rizzoma-test';
    process.env['SAML_CERT'] = 'test-certificate';
    const { getSamlConfig, getSamlInstance } = await import('../server/lib/saml');

    const config = getSamlConfig('https://app.example.test/api/auth/saml/callback');
    expect(config.validateInResponseTo).toBe('always');
    expect(config.requestIdExpirationPeriodMs).toBe(10 * 60 * 1000);

    const first = getSamlInstance('https://app.example.test/api/auth/saml/callback');
    const same = getSamlInstance('https://app.example.test/api/auth/saml/callback');
    const otherHost = getSamlInstance('https://lan.example.test/api/auth/saml/callback');
    expect(same).toBe(first);
    expect(otherHost).not.toBe(first);
  });
});
