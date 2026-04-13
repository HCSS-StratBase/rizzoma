export type GadgetType =
  | 'youtube'
  | 'code'
  | 'poll'
  | 'latex'
  | 'iframe'
  | 'spreadsheet'
  | 'image'
  | 'kanbanApp'
  | 'calendarApp'
  | 'focusApp'
  | 'notesApp';

export type GadgetKind = 'native' | 'embed' | 'app';
export type GadgetCatalogCategory =
  | 'productivity'
  | 'collaboration'
  | 'visualization'
  | 'integration';
export type GadgetAvailability = 'built-in' | 'trusted' | 'preview' | 'planned';

export interface GadgetInsertDetail {
  type?: GadgetType;
  url?: string;
}

export interface GadgetUrlResolution {
  normalizedUrl: string;
  html: string;
}

export interface GadgetManifest {
  type: GadgetType;
  label: string;
  icon: string;
  accent: string;
  appId?: string;
  kind?: GadgetKind;
  category?: GadgetCatalogCategory;
  availability?: GadgetAvailability;
  needsUrl?: boolean;
  placeholder?: string;
  description: string;
  urlHint?: string;
}

export interface GadgetAppManifest {
  id: string;
  label: string;
  icon: string;
  accent: string;
  category: GadgetCatalogCategory;
  version: string;
  description: string;
  runtime: 'iframe';
  entry: string;
  permissions: Array<'node.read' | 'node.write' | 'user.context' | 'file.open' | 'viewport.resize'>;
  availability: Extract<GadgetAvailability, 'preview' | 'planned'>;
  defaultHeight: string;
  initialData: Record<string, unknown>;
}

export interface GadgetHostUserContext {
  userId: string;
  canEdit: boolean;
}

export interface GadgetHostApi {
  getNodeData: () => Promise<unknown>;
  updateNodeData: (patch: unknown) => Promise<void>;
  getUserContext: () => Promise<GadgetHostUserContext>;
  requestFileUpload: () => Promise<{ url: string; name: string }>;
  openUrl: (url: string) => void;
  resize: (height: number) => void;
}
