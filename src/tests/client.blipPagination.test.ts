import { collectBlipPages } from '../client/lib/blipPagination';

describe('topic blip pagination', () => {
  it('collects more than 500 blips without dropping a child page', async () => {
    const first = Array.from({ length: 500 }, (_, index) => ({ id: `b${index}` }));
    const fetchNext = vi.fn().mockResolvedValue({
      blips: [{ id: 'child-after-500', parentId: 'b499' }],
      nextBookmark: null,
    });

    const all = await collectBlipPages({ blips: first, nextBookmark: 'page-2' }, fetchNext);

    expect(all).toHaveLength(501);
    expect(all[500]).toEqual({ id: 'child-after-500', parentId: 'b499' });
    expect(fetchNext).toHaveBeenCalledWith('page-2');
  });

  it('fails visibly if CouchDB repeats a bookmark', async () => {
    await expect(collectBlipPages(
      { blips: [], nextBookmark: 'same' },
      async () => ({ blips: [], nextBookmark: 'same' }),
    )).rejects.toThrow('blip_pagination_repeated_bookmark');
  });
});
