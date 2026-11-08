import * as Y from 'yjs';
import { hasPendingCollaborationChangesFor } from '../../lib/collaborationPending';

export class YjsDocumentManager {
  private documents: Map<string, Y.Doc> = new Map();
  private quarantinedDocuments: Map<string, Uint8Array> = new Map();

  private ownerKey(ownerId?: string | null): string {
    return ownerId?.trim() || 'guest';
  }

  private documentKey(blipId: string, ownerId?: string | null, generation = 0): string {
    return `${encodeURIComponent(this.ownerKey(ownerId))}:${generation}:${encodeURIComponent(blipId)}`;
  }
  
  getDocument(blipId: string, ownerId?: string | null, generation = 0): Y.Doc {
    const key = this.documentKey(blipId, ownerId, generation);
    if (!this.documents.has(key)) {
      const doc = new Y.Doc();
      const quarantined = this.quarantinedDocuments.get(key);
      if (quarantined) {
        Y.applyUpdate(doc, quarantined);
        this.quarantinedDocuments.delete(key);
      }
      this.documents.set(key, doc);
    }
    return this.documents.get(key)!;
  }
  
  removeDocument(blipId: string, ownerId?: string | null, generation = 0): void {
    const key = this.documentKey(blipId, ownerId, generation);
    const doc = this.documents.get(key);
    if (doc) {
      if (hasPendingCollaborationChangesFor(ownerId ?? null, blipId)) {
        this.quarantinedDocuments.set(key, Y.encodeStateAsUpdate(doc));
      }
      doc.destroy();
      this.documents.delete(key);
    }
  }

  /**
   * End one authenticated session. Live docs are destroyed so another user
   * cannot inherit them. Only unresolved state is retained, encoded in an
   * owner-keyed in-memory quarantine that is restored exclusively to the same
   * owner on a later sign-in.
   */
  deactivateOwner(ownerId: string): void {
    const ownerPrefix = `${encodeURIComponent(this.ownerKey(ownerId))}:`;
    for (const [key, doc] of this.documents) {
      if (!key.startsWith(ownerPrefix)) continue;
      const generationSeparator = key.indexOf(':', ownerPrefix.length);
      if (generationSeparator < 0) continue;
      const encodedBlip = key.slice(generationSeparator + 1);
      const blipId = decodeURIComponent(encodedBlip);
      if (hasPendingCollaborationChangesFor(ownerId, blipId)) {
        this.quarantinedDocuments.set(key, Y.encodeStateAsUpdate(doc));
      }
      doc.destroy();
      this.documents.delete(key);
    }
  }

  hasLiveDocument(blipId: string, ownerId?: string | null, generation = 0): boolean {
    return this.documents.has(this.documentKey(blipId, ownerId, generation));
  }

  hasQuarantinedDocument(blipId: string, ownerId?: string | null, generation = 0): boolean {
    return this.quarantinedDocuments.has(this.documentKey(blipId, ownerId, generation));
  }
  
  syncDocument(blipId: string, ownerId?: string | null, generation = 0): void {
    const doc = this.getDocument(blipId, ownerId, generation);
    doc.transact(() => {
      const xmlFragment = doc.getXmlFragment('prosemirror');
      xmlFragment.delete(0, xmlFragment.length);
    });
  }
  
  getDocumentState(blipId: string, ownerId?: string | null, generation = 0): Uint8Array {
    const doc = this.getDocument(blipId, ownerId, generation);
    return Y.encodeStateAsUpdate(doc);
  }
  
  applyUpdate(blipId: string, update: Uint8Array, ownerId?: string | null, generation = 0): void {
    const doc = this.getDocument(blipId, ownerId, generation);
    Y.applyUpdate(doc, update);
  }
  
  destroy(): void {
    this.documents.forEach(doc => doc.destroy());
    this.documents.clear();
    this.quarantinedDocuments.clear();
  }
}

export const yjsDocManager = new YjsDocumentManager();
