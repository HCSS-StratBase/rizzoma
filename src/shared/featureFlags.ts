/**
 * Feature flags for progressive rollout of Rizzoma core features
 */

export const FEATURES = {
  // Track A: Inline comments
  INLINE_COMMENTS: process.env.FEAT_INLINE_COMMENTS === '1' || process.env.FEAT_ALL === '1',
  
  // Track B: Rich editor features
  RICH_TOOLBAR: process.env.FEAT_RICH_TOOLBAR === '1' || process.env.FEAT_ALL === '1',
  MENTIONS: process.env.FEAT_MENTIONS === '1' || process.env.FEAT_ALL === '1',
  TASK_LISTS: process.env.FEAT_TASK_LISTS === '1' || process.env.FEAT_ALL === '1',
  
  // Track C: Visual feedback
  FOLLOW_GREEN: process.env.FEAT_FOLLOW_GREEN === '1' || process.env.FEAT_ALL === '1',
  VISUAL_DIFF: process.env.FEAT_VISUAL_DIFF === '1' || process.env.FEAT_ALL === '1',
  
  // Track D: Real-time enhancements
  LIVE_CURSORS: process.env.FEAT_LIVE_CURSORS === '1' || process.env.FEAT_ALL === '1',
  TYPING_INDICATORS: process.env.FEAT_TYPING_INDICATORS === '1' || process.env.FEAT_ALL === '1',
} as const;

// Helper to check if any feature is enabled
export const hasAnyFeature = () => Object.values(FEATURES).some(v => v);

// Helper to get enabled features
export const getEnabledFeatures = () => 
  Object.entries(FEATURES)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);