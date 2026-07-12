import {
  createSerializedUpdateQueue,
  REMOTE_EDITOR_UPDATE,
  shouldPersistEditorUpdate,
} from '../client/lib/editorPersistence';

describe('editor persistence ordering', () => {
  it('releases rapid writes one at a time in enqueue order', async () => {
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const queue = createSerializedUpdateQueue(() => undefined);

    queue.enqueue(async () => {
      events.push('first-start');
      await firstGate;
      events.push('first-end');
    });
    queue.enqueue(async () => {
      events.push('second-start');
      events.push('second-end');
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(['first-start']);
    releaseFirst?.();
    await queue.drain();
    expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('reports a failed write and continues with the next queued write', async () => {
    const errors: unknown[] = [];
    const events: string[] = [];
    const queue = createSerializedUpdateQueue((error) => errors.push(error));

    queue.enqueue(async () => { throw new Error('save_failed'); });
    queue.enqueue(async () => { events.push('second'); });
    await queue.drain();

    expect((errors[0] as Error).message).toBe('save_failed');
    expect(events).toEqual(['second']);
  });

  it('never persists a remote socket echo', () => {
    expect(shouldPersistEditorUpdate(REMOTE_EDITOR_UPDATE)).toBe(false);
    expect(shouldPersistEditorUpdate(undefined)).toBe(true);
    expect(shouldPersistEditorUpdate({ local: true })).toBe(true);
  });
});
