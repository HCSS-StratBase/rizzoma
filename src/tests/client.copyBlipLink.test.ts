import { describe, it, expect, vi } from 'vitest';
import { buildBlipLink, copyBlipLink, type LocationLike } from '../client/components/blip/copyBlipLink';

describe('client: copyBlipLink helpers', () => {
  const fakeLocation = (url: string): LocationLike => {
    const parsed = new URL(url);
    return {
      origin: parsed.origin,
      pathname: parsed.pathname,
      search: parsed.search,
    };
  };

  it('builds topic hash links for nested blips', () => {
    const loc = fakeLocation('https://app.example/rizzoma?layout=rizzoma');
    const link = buildBlipLink('wave123:b9', loc);
    expect(link).toBe('https://app.example/rizzoma?layout=rizzoma#/topic/wave123?focus=wave123%3Ab9');
  });

  it('builds links for root topic blips', () => {
    const loc = fakeLocation('https://demo.example/app');
    const link = buildBlipLink('wave123', loc);
    expect(link).toBe('https://demo.example/app#/topic/wave123?focus=wave123');
  });

  it('writes link text to clipboard when available', async () => {
    const loc = fakeLocation('https://app.example/rizzoma?layout=rizzoma');
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = { writeText };
    const link = await copyBlipLink('wave123:b9', { location: loc, clipboard });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(link);
  });
});
