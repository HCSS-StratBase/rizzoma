import type { GadgetAppManifest, GadgetHostApi } from '../types';

export interface GadgetSandboxDescriptor {
  manifest: GadgetAppManifest;
  sandbox: string;
  allow: string;
}

const DEFAULT_SANDBOX_FLAGS = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
].join(' ');

const DEFAULT_ALLOW_FLAGS = [
  'clipboard-read',
  'clipboard-write',
  'fullscreen',
].join('; ');

export function describeSandboxedApp(manifest: GadgetAppManifest): GadgetSandboxDescriptor {
  return {
    manifest,
    sandbox: DEFAULT_SANDBOX_FLAGS,
    allow: DEFAULT_ALLOW_FLAGS,
  };
}

export function createNoopHostApi(): GadgetHostApi {
  return {
    async getNodeData() {
      return null;
    },
    async updateNodeData() {
      return;
    },
    async getUserContext() {
      return { userId: 'unknown', canEdit: false };
    },
    async requestFileUpload() {
      return { url: '', name: '' };
    },
    openUrl() {
      return;
    },
    resize() {
      return;
    },
  };
}
