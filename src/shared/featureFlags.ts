/**
 * Feature flags for progressive rollout of Rizzoma core features
 */

// Use import.meta.env for Vite, fallback to process.env for Node
const env = typeof import.meta !== 'undefined' && import.meta.env 
  ? import.meta.env 
  : process.env;

export const FEATURES = {
  // Track A: Inline comments
  INLINE_COMMENTS: env['FEAT_INLINE_COMMENTS'] === '1' || env['FEAT_ALL'] === '1',
  
  // Track B: Rich editor features
  RICH_TOOLBAR: env['FEAT_RICH_TOOLBAR'] === '1' || env['FEAT_ALL'] === '1',
  MENTIONS: env['FEAT_MENTIONS'] === '1' || env['FEAT_ALL'] === '1',
  TASK_LISTS: env['FEAT_TASK_LISTS'] === '1' || env['FEAT_ALL'] === '1',
  
  // Track C: Visual feedback
  FOLLOW_GREEN: env['FEAT_FOLLOW_GREEN'] === '1' || env['FEAT_ALL'] === '1',
  VISUAL_DIFF: env['FEAT_VISUAL_DIFF'] === '1' || env['FEAT_ALL'] === '1',
  
  // Track D: Real-time enhancements
  LIVE_CURSORS: env['FEAT_LIVE_CURSORS'] === '1' || env['FEAT_ALL'] === '1',
  TYPING_INDICATORS: env['FEAT_TYPING_INDICATORS'] === '1' || env['FEAT_ALL'] === '1',
  REALTIME_COLLAB: env['FEAT_REALTIME_COLLAB'] === '1' || env['FEAT_ALL'] === '1',
  
  // Track E: Playback
  WAVE_PLAYBACK: env['FEAT_WAVE_PLAYBACK'] === '1' || env['FEAT_ALL'] === '1',

  // Navigation features
  TASKS: env['FEAT_TASKS'] === '1' || env['FEAT_ALL'] === '1' || env['BUSINESS_ACCOUNT'] === '1',

  // Track F: Visual parity with original rizzoma.com (B1 reskin + B2 inline render)
  // Off by default — opt in by setting FEAT_RIZZOMA_PARITY_RENDER=1.
  // FEAT_ALL does NOT enable this yet (still iterating on visual fidelity).
  RIZZOMA_PARITY_RENDER: env['FEAT_RIZZOMA_PARITY_RENDER'] === '1',

  // Track G: Native fractal-render port (replace React/TipTap hybrid for the
  // parent-of-blips render layer with a direct TS port of original Rizzoma's
  // content-array + linear-walk model). See docs/NATIVE_RENDER_PORT_PLAN.md.
  // Off by default; opt in via FEAT_RIZZOMA_NATIVE_RENDER=1. Phase-by-phase
  // rollout — phases 1..4 leave both paths side-by-side; phase 5 deletes
  // the React path. FEAT_ALL does NOT enable this.
  RIZZOMA_NATIVE_RENDER: env['FEAT_RIZZOMA_NATIVE_RENDER'] === '1',
} as const;

// Helper to check if any feature is enabled
export const hasAnyFeature = () => Object.values(FEATURES).some(v => v);

// Helper to get enabled features
export const getEnabledFeatures = () => 
  Object.entries(FEATURES)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);