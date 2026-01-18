const env = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : process.env;
export const FEATURES = {
    INLINE_COMMENTS: env['FEAT_INLINE_COMMENTS'] === '1' || env['FEAT_ALL'] === '1',
    RICH_TOOLBAR: env['FEAT_RICH_TOOLBAR'] === '1' || env['FEAT_ALL'] === '1',
    MENTIONS: env['FEAT_MENTIONS'] === '1' || env['FEAT_ALL'] === '1',
    TASK_LISTS: env['FEAT_TASK_LISTS'] === '1' || env['FEAT_ALL'] === '1',
    FOLLOW_GREEN: env['FEAT_FOLLOW_GREEN'] === '1' || env['FEAT_ALL'] === '1',
    VISUAL_DIFF: env['FEAT_VISUAL_DIFF'] === '1' || env['FEAT_ALL'] === '1',
    LIVE_CURSORS: env['FEAT_LIVE_CURSORS'] === '1' || env['FEAT_ALL'] === '1',
    TYPING_INDICATORS: env['FEAT_TYPING_INDICATORS'] === '1' || env['FEAT_ALL'] === '1',
    TASKS: env['FEAT_TASKS'] === '1' || env['FEAT_ALL'] === '1' || env['BUSINESS_ACCOUNT'] === '1',
};
export const hasAnyFeature = () => Object.values(FEATURES).some(v => v);
export const getEnabledFeatures = () => Object.entries(FEATURES)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);
//# sourceMappingURL=featureFlags.js.map