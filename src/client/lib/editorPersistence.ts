import * as Y from 'yjs';

export const REMOTE_EDITOR_UPDATE = Symbol('remote-editor-update');

export function shouldPersistEditorUpdate(origin: unknown): boolean {
  return origin !== REMOTE_EDITOR_UPDATE;
}

export function applyRemoteEditorUpdate(document: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(document, update, REMOTE_EDITOR_UPDATE);
}

export type SerializedUpdateQueue = {
  enqueue(task: () => Promise<void>): void;
  drain(): Promise<void>;
};

/**
 * Serialize durable editor writes. Yjs may emit several local updates in the
 * same tick; releasing them one at a time prevents request reordering and also
 * lets the server-authoritative sequence allocator remain the sole source of
 * update order.
 */
export function createSerializedUpdateQueue(
  onError: (error: unknown) => void,
): SerializedUpdateQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue(task) {
      tail = tail
        .catch(() => undefined)
        .then(task)
        .catch((error) => {
          onError(error);
        });
    },
    drain() {
      return tail;
    },
  };
}
