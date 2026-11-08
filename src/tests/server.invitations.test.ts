import { afterEach, describe, expect, it } from 'vitest';
import { buildInviteUrl, resolveInviteBaseUrl } from '../server/lib/invitations';

describe('invitation public URLs', () => {
  const priorNodeEnv = process.env['NODE_ENV'];
  const priorAppUrl = process.env['APP_URL'];

  afterEach(() => {
    if (priorNodeEnv === undefined) delete process.env['NODE_ENV']; else process.env['NODE_ENV'] = priorNodeEnv;
    if (priorAppUrl === undefined) delete process.env['APP_URL']; else process.env['APP_URL'] = priorAppUrl;
  });

  it('uses the validated production APP_URL and keeps the token in the fragment', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['APP_URL'] = 'https://rizzoma.example.test/some/internal/path';
    const origin = resolveInviteBaseUrl({});
    const link = buildInviteUrl(origin, 'topic-1', 'secret-token');
    expect(link).toBe('https://rizzoma.example.test/?layout=rizzoma#/topic/topic-1?invite=secret-token');
    expect(link).not.toContain('localhost');
  });

  it('refuses missing, insecure, or credential-bearing production origins', () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['APP_URL'];
    expect(() => resolveInviteBaseUrl({})).toThrow('app_url_required');
    process.env['APP_URL'] = 'http://rizzoma.example.test';
    expect(() => resolveInviteBaseUrl({})).toThrow('production_app_url_must_be_https');
    process.env['APP_URL'] = 'https://user:pass@rizzoma.example.test';
    expect(() => resolveInviteBaseUrl({})).toThrow('invalid_app_url');
  });

  it('uses a validated forwarded request origin outside production', () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['APP_URL'];
    const headers: Record<string, string> = {
      'x-forwarded-host': 'lan.example.test:3000',
      'x-forwarded-proto': 'https',
    };
    expect(resolveInviteBaseUrl({ get: (name) => headers[name.toLowerCase()] })).toBe('https://lan.example.test:3000');
  });
});
