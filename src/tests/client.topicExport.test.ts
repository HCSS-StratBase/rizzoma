import {
  buildExportTree,
  generateTopicHtmlExport,
  generateTopicJsonExport,
  generateTopicTextExport,
} from '../client/lib/topicExport';

const blips = [{
  id: 'root',
  content: '<p>Root <strong>answer</strong><script>pwn()</script></p>',
  authorId: 'u1',
  authorName: 'Owner',
  createdAt: 1,
  updatedAt: 1,
  childBlips: [{
    id: 'child',
    content: '<ul><li>Child label</li></ul>',
    authorId: 'u2',
    authorName: 'Editor',
    createdAt: 2,
    updatedAt: 2,
    childBlips: [{
      id: 'grandchild',
      content: '<p>Deep detail</p><iframe src="https://evil.example"></iframe>',
      authorId: 'u3',
      authorName: 'Viewer',
      createdAt: 3,
      updatedAt: 3,
    }],
  }],
}];

const input = {
  topicTitle: 'Export topic',
  topicId: 'wave-1',
  topicContent: '<p>Topic <em>body</em></p><img src="javascript:alert(1)">',
  blips,
  exportedAt: new Date('2026-07-12T10:00:00.000Z'),
};

describe('topic export', () => {
  it('preserves recursive childBlips in export order', () => {
    const tree = buildExportTree(blips);
    expect(tree[0]?.id).toBe('root');
    expect(tree[0]?.children[0]?.id).toBe('child');
    expect(tree[0]?.children[0]?.children[0]?.id).toBe('grandchild');
  });

  it('produces formatted but inert HTML including the topic body', () => {
    const html = generateTopicHtmlExport(input);
    expect(html).toContain('<p>Topic <em>body</em></p>');
    expect(html).toContain('<strong>answer</strong>');
    expect(html).toContain('Child label');
    expect(html).toContain('Deep detail');
    expect(html).toContain("Content-Security-Policy");
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('javascript:');
  });

  it('strips markup from text and reports the recursive count in JSON', () => {
    const text = generateTopicTextExport(input);
    expect(text).toContain('Topic body');
    expect(text).toContain('Root answer');
    expect(text).toContain('Child label');
    expect(text).toContain('Deep detail');
    expect(text).not.toMatch(/<\/?(?:p|strong|ul|li|iframe)\b/i);

    const json = JSON.parse(generateTopicJsonExport(input));
    expect(json.blipCount).toBe(3);
    expect(json.topicText).toBe('Topic body');
    expect(json.blips[0].children[0].children[0].id).toBe('grandchild');
  });
});
