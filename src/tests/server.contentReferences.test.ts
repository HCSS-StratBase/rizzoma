import { parseStoredContentReferences } from '../server/lib/contentReferences';

describe('stored content reference parser', () => {
  it('extracts real TipTap mention/task attrs and derives task text from the containing block', () => {
    const references = parseStoredContentReferences(
      '<ul><li>Prepare the weekly briefing <span data-task-widget="" data-task-id="task:11111111-1111-4111-8111-111111111111" data-assignee-id="viewer" data-assignee="Untrusted label"></span></li></ul><p><span class="mention" data-type="mention" data-id="viewer" data-label="Untrusted label">@Untrusted label</span></p>',
      'wave:b1',
    );

    expect(references.mentions).toEqual([{ userId: 'viewer', label: 'Untrusted label' }]);
    expect(references.tasks).toEqual([{
      taskId: 'task:11111111-1111-4111-8111-111111111111',
      assigneeId: 'viewer',
      taskText: 'Prepare the weekly briefing',
      dueDate: undefined,
    }]);
  });

  it('deduplicates repeated mentions for the same user', () => {
    const references = parseStoredContentReferences(
      '<p><span data-type="mention" data-id="viewer">@Viewer</span> and <span data-type="mention" data-id="viewer">@Viewer again</span></p>',
      'wave:b1',
    );
    expect(references.mentions).toHaveLength(1);
  });
});
