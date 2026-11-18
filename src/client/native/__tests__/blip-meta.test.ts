import { describe, expect, it } from 'vitest';
import { BlipView } from '../blip-view';
import { WaveView } from '../wave-view';

describe('native blip author and date', () => {
  it('shows avatar initial and date, and removes them again', () => {
    const view = new BlipView('b1');
    view.setMeta({ authorName: 'Liliia', dateText: '2:39 PM' });
    const meta = view.getContainer().querySelector('.native-blip-meta')!;
    expect(meta.querySelector('.blip-author-date')!.textContent).toBe('2:39 PM');
    expect(meta.querySelector('.blip-author-avatar')!.textContent).toBe('L');
    // outside the editable body: the content array and the editor never see it
    expect(view.getInner().contains(meta)).toBe(false);
    view.setMeta(null);
    expect(view.getContainer().querySelector('.native-blip-meta')).toBeNull();
  });

  it('uses the avatar image when there is one and replaces, not duplicates, on update', () => {
    const view = new BlipView('b2');
    view.setMeta({ authorName: 'A', authorAvatar: 'https://example.test/a.png', dateText: '1 Nov' });
    view.setMeta({ authorName: 'A', authorAvatar: 'https://example.test/a.png', dateText: '2 Nov' });
    const c = view.getContainer();
    expect(c.querySelectorAll('.native-blip-meta').length).toBe(1);
    expect(c.querySelector('.blip-author-avatar img')!.getAttribute('src')).toBe('https://example.test/a.png');
    expect(c.querySelector('.blip-author-date')!.textContent).toBe('2 Nov');
  });

  it('WaveView applies the lookup to new views and to refreshMeta', () => {
    let date = '10:00 AM';
    const wv = new WaveView({
      contentByBlipId: () => null,
      metaByBlipId: (id) => (id === 'x' ? { authorName: 'Hryhorii', dateText: date } : null),
    });
    const x = wv.getOrCreateView('x');
    const y = wv.getOrCreateView('y');
    expect(x.getContainer().querySelector('.blip-author-date')!.textContent).toBe('10:00 AM');
    expect(y.getContainer().querySelector('.native-blip-meta')).toBeNull();
    date = '11:00 AM';
    wv.refreshMeta();
    expect(x.getContainer().querySelector('.blip-author-date')!.textContent).toBe('11:00 AM');
    wv.destroy();
  });
});
