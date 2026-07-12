import * as Y from 'yjs';
import { hasPendingCollaborationChangesFor } from '../../lib/collaborationPending';

export class YjsDocumentManager {
  private documents: Map<string, Y.Doc> = new Map();
  private quarantinedDocuments: Map<string, Uint8Array> = new Map();

  private ownerKey(ownerId?: string | null): string {
    return ownerId?.trim() || 'guest';
  }

  private documentKey(blipId: string, ownerId?: string | null): string {
    return `${encodeURIComponent(this.ownerKey(ownerId))}:${encodeURIComponent(blipId)}`;
  }
  
  getDocument(blipId: string, ownerId?: string | null): Y.Doc {
    const key = this.documentKey(blipId, ownerId);
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
  
  removeDocument(blipId: string, ownerId?: string | null): void {
    const key = this.documentKey(blipId, ownerId);
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
      const encodedBlip = key.slice(ownerPrefix.length);
      const blipId = decodeURIComponent(encodedBlip);
      if (hasPendingCollaborationChangesFor(ownerId, blipId)) {
        this.quarantinedDocuments.set(key, Y.encodeStateAsUpdate(doc));
      }
      doc.destroy();
      this.documents.delete(key);
    }
  }

  hasLiveDocument(blipId: string, ownerId?: string | null): boolean {
    return this.documents.has(this.documentKey(blipId, ownerId));
  }

  hasQuarantinedDocument(blipId: string, ownerId?: string | null): boolean {
    return this.quarantinedDocuments.has(this.documentKey(blipId, ownerId));
  }
  
  syncDocument(blipId: string, ownerId?: string | null): void {
    const doc = this.getDocument(blipId, ownerId);
    doc.transact(() => {
      const xmlFragment = doc.getXmlFragment('prosemirror');
      xmlFragment.delete(0, xmlFragment.length);
    });
  }
  
  getDocumentState(blipId: string, ownerId?: string | null): Uint8Array {
    const doc = this.getDocument(blipId, ownerId);
    return Y.encodeStateAsUpdate(doc);
  }
  
  applyUpdate(blipId: string, update: Uint8Array, ownerId?: string | null): void {
    const doc = this.getDocument(blipId, ownerId);
    Y.applyUpdate(doc, update);
  }
  
  destroy(): void {
    this.documents.forEach(doc => doc.destroy());
    this.documents.clear();
    this.quarantinedDocuments.clear();
  }
}

export const yjsDocManager = new YjsDocumentManager();
