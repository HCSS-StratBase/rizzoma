import { describe, it, expect } from 'vitest';
import { EditorState, Plugin } from '@tiptap/pm/state';
import { Schema } from '@tiptap/pm/model';
import {
  commentDecorationsKey,
  withCommentDecorations,
  withoutCommentDecorations,
} from '../client/components/editor/InlineComments';

/**
 * Tester feedback 2026-11-18: after the first Ctrl+Enter child blip the second one
 * crashed the editor with "RangeError: Adding different instances of a keyed plugin
 * (commentDecorations$)". The InlineComments effect filtered plugins by comparing the
 * derived STRING `plugin.key` with the PluginKey OBJECT, so the previous plugin was
 * never removed. These tests use real ProseMirror state, as the crash did.
 */
const schema = new Schema({ nodes: { doc: { content: 'text*' }, text: {} } });
const makePlugin = () => new Plugin({ key: commentDecorationsKey });

describe('InlineComments comment-decoration plugin bookkeeping', () => {
  it('the previous behaviour (string key vs PluginKey object) really crashes on the second add', () => {
    let state = EditorState.create({ schema });
    const oldFilter = (plugins: readonly Plugin[]) => plugins.filter((p: any) => p.key !== commentDecorationsKey);
    state = state.reconfigure({ plugins: [...oldFilter(state.plugins), makePlugin()] });
    expect(() => state.reconfigure({ plugins: [...oldFilter(state.plugins), makePlugin()] }))
      .toThrow(/keyed plugin/);
  });

  it('withCommentDecorations replaces the previous plugin, so repeated adds never throw', () => {
    let state = EditorState.create({ schema });
    for (let i = 0; i < 4; i += 1) {
      state = state.reconfigure({ plugins: withCommentDecorations(state.plugins as Plugin[], makePlugin()) });
    }
    expect(state.plugins.length).toBe(1);
  });

  it('withoutCommentDecorations removes only the comment plugin', () => {
    const other = new Plugin({});
    const state = EditorState.create({ schema, plugins: [other, makePlugin()] });
    const rest = withoutCommentDecorations(state.plugins as Plugin[]);
    expect(rest).toEqual([other]);
  });
});
