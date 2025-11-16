import * as Y from 'yjs';

export class YjsDocumentManager {
  private documents: Map<string, Y.Doc> = new Map();
  
  getDocument(blipId: string): Y.Doc {
    if (!this.documents.has(blipId)) {
      const doc = new Y.Doc();
      this.documents.set(blipId, doc);
    }
    return this.documents.get(blipId)!;
  }
  
  removeDocument(blipId: string): void {
    const doc = this.documents.get(blipId);
    if (doc) {
      doc.destroy();
      this.documents.delete(blipId);
    }
  }
  
  syncDocument(blipId: string): void {
    const doc = this.getDocument(blipId);
    doc.transact(() => {
      const xmlFragment = doc.getXmlFragment('prosemirror');
      xmlFragment.delete(0, xmlFragment.length);
    });
  }
  
  getDocumentState(blipId: string): Uint8Array {
    const doc = this.getDocument(blipId);
    return Y.encodeStateAsUpdate(doc);
  }
  
  applyUpdate(blipId: string, update: Uint8Array): void {
    const doc = this.getDocument(blipId);
    Y.applyUpdate(doc, update);
  }
  
  destroy(): void {
    this.documents.forEach(doc => doc.destroy());
    this.documents.clear();
  }
}

export const yjsDocManager = new YjsDocumentManager();