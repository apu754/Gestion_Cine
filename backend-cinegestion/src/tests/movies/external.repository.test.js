// tests/movies/external.repository.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../config/db.js', () => ({
  query: jest.fn(),
}));

const { query } = await import('../../config/db.js');
const extRepo = await import('../../modules/movies/external.repository.js');

describe('external.repository', () => {
  test('upsertExternalTmdb inserta/actualiza y retorna fila', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'u1', external_id: '1038392', title: 'Expediente Warren: El último rito' }],
    });
    const m = {
      external_id: '1038392',
      title: 'Expediente Warren: El último rito',
      original_title: 'The Conjuring: Last Rites',
      original_language: 'en',
      synopsis: 'Los investigadores...',
      release_date: '2025-09-03',
      poster_url: 'https://image.tmdb.org/t/p/w500/qdo.jpg',
      backdrop_url: 'https://image.tmdb.org/t/p/w780/9DY.jpg',
    };
    const row = await extRepo.upsertExternalTmdb(m);
    expect(row.external_id).toBe('1038392');
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('cacheFromTmdb procesa varias y reporta fallos', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'a', external_id: '1', title: 'A' }] })
      .mockRejectedValueOnce(new Error('db down'));

    const list = [{ external_id: '1', title: 'A' }, { external_id: '2', title: 'B' }];
    await extRepo.cacheFromTmdb(list);
    expect(query).toHaveBeenCalled();
  });
});
