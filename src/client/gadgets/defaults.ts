import { createDefaultPollOptions } from '../components/editor/extensions/GadgetNodes';

export function createDefaultPollAttrs() {
  return {
    question: 'Vote',
    options: createDefaultPollOptions(),
    allowMultiple: false,
  };
}
