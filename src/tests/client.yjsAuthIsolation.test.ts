import { afterEach, describe, expect, it } from 'vitest';
import { YjsDocumentManager } from '../client/components/editor/YjsDocumentManager';
import {
  acknowledgeCollaborationSnapshot,
  getPendingCollaborationCount,
  markCollaborationUpdatePending,
  resetPendingCollaborationChanges,
} from '../client/lib/collaborationPending';

describe('client: authenticated Yjs isolation', () => {
  const managers: YjsDocumentManager[] = [];

  afterEach(() => {
    managers.forEach((manager) => manager.destroy());
    managers.length = 0;
    resetPendingCollaborationChanges();
  });

  it('never exposes one account document to another account for the same blip', () => {
    const manager = new YjsDocumentManager();
    managers.push(manager);
    manager.getDocument('shared-blip', 'alice').getText('default').insert(0, 'Alice only');

    expect(manager.getDocument('shared-blip', 'bob').getText('default').toString()).toBe('');
    expect(manager.getDocument('shared-blip', 'alice').getText('default').toString()).toBe('Alice only');
  });

  it('quarantines an active unacknowledged A edit across logout and B login', () => {
    const manager = new YjsDocumentManager();
    managers.push(manager);
    const aliceDoc = manager.getDocument('same-blip', 'alice');
    aliceDoc.getText('default').insert(0, 'unacknowledged A edit');
    markCollaborationUpdatePending('alice', 'same-blip');

    manager.deactivateOwner('alice');
    expect(manager.hasLiveDocument('same-blip', 'alice')).toBe(false);
    expect(manager.hasQuarantinedDocument('same-blip', 'alice')).toBe(true);

    const bobDoc = manager.getDocument('same-blip', 'bob');
    expect(bobDoc.getText('default').toString()).toBe('');
    // A server acknowledgement scoped to B can never consume A's pending
    // record or release A's quarantined snapshot.
    acknowledgeCollaborationSnapshot('bob', 'same-blip');
    expect(getPendingCollaborationCount()).toBe(1);

    const restoredAliceDoc = manager.getDocument('same-blip', 'alice');
    expect(restoredAliceDoc.getText('default').toString()).toBe('unacknowledged A edit');
    expect(manager.hasQuarantinedDocument('same-blip', 'alice')).toBe(false);
    acknowledgeCollaborationSnapshot('alice', 'same-blip');
    expect(getPendingCollaborationCount()).toBe(0);
  });

  it('uses the same owner quarantine when an active editor unmounts', () => {
    const manager = new YjsDocumentManager();
    managers.push(manager);
    manager.getDocument('unmounted-blip', 'alice').getText('default').insert(0, 'retain on unmount');
    markCollaborationUpdatePending('alice', 'unmounted-blip');

    manager.removeDocument('unmounted-blip', 'alice');
    expect(manager.hasLiveDocument('unmounted-blip', 'alice')).toBe(false);
    expect(manager.hasQuarantinedDocument('unmounted-blip', 'alice')).toBe(true);
    expect(manager.getDocument('unmounted-blip', 'bob').getText('default').toString()).toBe('');
    expect(manager.getDocument('unmounted-blip', 'alice').getText('default').toString()).toBe('retain on unmount');
  });

  it('never merges a retained old generation into an externally replaced document', () => {
    const manager = new YjsDocumentManager();
    managers.push(manager);
    const getGenerationDocument = manager.getDocument.bind(manager) as unknown as (
      blipId: string,
      ownerId: string,
      yjsGeneration: number,
    ) => import('yjs').Doc;

    const generationOne = getGenerationDocument('generation-blip', 'alice', 1);
    generationOne.getText('default').insert(0, 'superseded task history');

    const generationTwo = getGenerationDocument('generation-blip', 'alice', 2);
    expect(generationTwo).not.toBe(generationOne);
    expect(generationTwo.getText('default').toString()).toBe('');
  });

  it('keys pending quarantines by generation as well as owner and blip', () => {
    const manager = new YjsDocumentManager();
    managers.push(manager);
    const getGenerationDocument = manager.getDocument.bind(manager) as unknown as (
      blipId: string,
      ownerId: string,
      yjsGeneration: number,
    ) => import('yjs').Doc;
    const removeGenerationDocument = manager.removeDocument.bind(manager) as unknown as (
      blipId: string,
      ownerId: string,
      yjsGeneration: number,
    ) => void;

    getGenerationDocument('quarantined-generation', 'alice', 1)
      .getText('default')
      .insert(0, 'generation one pending');
    markCollaborationUpdatePending('alice', 'quarantined-generation');
    removeGenerationDocument('quarantined-generation', 'alice', 1);

    expect(getGenerationDocument('quarantined-generation', 'alice', 2)
      .getText('default').toString()).toBe('');
    expect(getGenerationDocument('quarantined-generation', 'alice', 1)
      .getText('default').toString()).toBe('generation one pending');
  });
});
