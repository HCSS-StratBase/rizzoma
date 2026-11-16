import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shared/featureFlags', () => ({
  FEATURES: {
    RIZZOMA_NATIVE_RENDER: true,
  },
}));

import { WaveView } from '../client/native/wave-view';
import { NativeWaveView } from '../client/components/native/NativeWaveView';
import { parseHtmlToContentArray } from '../client/native/parser';

describe('Milestone 2 native wave wiring', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('wires onEditBlip and onReplyBlip through WaveView to BlipView gear buttons', () => {
    const onEditBlip = vi.fn();
    const onReplyBlip = vi.fn();
    const wv = new WaveView({
      contentByBlipId: () => parseHtmlToContentArray('<p>Hello</p>'),
      onEditBlip,
      onReplyBlip,
    });
    wv.setRoot('root-1');

    const rootView = wv.getView('root-1')!;
    const editBtn = rootView.getContainer().querySelector('.blip-gear-edit') as HTMLButtonElement;
    const replyBtn = rootView.getContainer().querySelector('.blip-gear-reply') as HTMLButtonElement;

    expect(editBtn).not.toBeNull();
    expect(replyBtn).not.toBeNull();
    expect(editBtn.style.display).toBe('');
    expect(replyBtn.style.display).toBe('');

    editBtn.click();
    replyBtn.click();

    expect(onEditBlip).toHaveBeenCalledWith('root-1', rootView);
    expect(onReplyBlip).toHaveBeenCalledWith('root-1', rootView);
    wv.destroy();
  });

  it('hides Edit and + Reply in NativeWaveView when canEdit is false and preserves WaveView across re-renders', async () => {
    const onWaveViewReady = vi.fn();
    const lookup1 = () => parseHtmlToContentArray('<p>Topic</p>');
    const lookup2 = () => parseHtmlToContentArray('<p>Topic</p>');

    await act(async () => {
      root.render(
        <NativeWaveView
          rootBlipId="wave-1"
          contentByBlipId={lookup1}
          canEdit={false}
          onWaveViewReady={onWaveViewReady}
        />,
      );
    });

    expect(host.textContent).not.toContain('Edit');
    expect(host.textContent).not.toContain('+ Reply');
    expect(onWaveViewReady).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <NativeWaveView
          rootBlipId="wave-1"
          contentByBlipId={lookup2}
          canEdit={true}
          onWaveViewReady={onWaveViewReady}
        />,
      );
    });

    expect(host.textContent).toContain('Edit');
    expect(host.textContent).toContain('+ Reply');
    expect(onWaveViewReady).toHaveBeenCalledTimes(1);
  });
});
