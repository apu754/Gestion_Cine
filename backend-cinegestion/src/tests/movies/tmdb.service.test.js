// tests/movies/tmdb.service.test.js
import { jest } from '@jest/globals';
jest.unstable_mockModule('../../modules/movies/tmdb/tmdb.client.js', () => {
  return {
    tmdb: {
      get: jest.fn(async (path, { params }) => {
        const mockpupular = await import('../fixtures/tmdb-popular.page1.json', { with: { type: 'json' } });
        const mocknowplaying = await import('../fixtures/tmdb-nowplaying.page1.json', { with: { type: 'json' } });
        const mocktoprated = await import('../fixtures/tmdb-toprated.page1.json', { with: { type: 'json' } });
        const mockupcoming = await import('../fixtures/tmdb-upcoming.page1.json', { with: { type: 'json' } });
        const mock = { popular: mockpupular, now_playing: mocknowplaying, top_rated: mocktoprated, upcoming: mockupcoming };

        if (path === '/movie/popular') {
          expect(params.language).toBeDefined();
          return { data: mock.popular.default };
        }
        if (path === '/movie/now_playing') {
          expect(params.region).toBe('CO'); // por defecto en tu svc
          return { data: mock.now_playing.default };
        }
        if (path === '/movie/upcoming') {
          return { data: mock.upcoming.default };
        }
        if (path === '/movie/top_rated') {
            return { data: mock.top_rated.default };
        }
        throw new Error('path inesperado: ' + path);
      }),
    },
  };
});

const tmdbSvc = await import('../../modules/movies/tmdb/tmdb.service.js');

describe('tmdb.service', () => {
  test('getPopular mapea correctamente', async () => {
    const out = await tmdbSvc.getPopular({ page: 1, language: 'es-ES' });
    const m = out.results[0];
    expect(m.title).toBeDefined();
    expect(m.synopsis).toBeDefined();
    expect(m.poster_url).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w500/);
    expect(m.backdrop_url).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w780/);
    expect(m.year).toBe(2025);
    expect(Array.isArray(m.genre_ids)).toBe(true);
  });

  test('getNowPlaying aplica region CO por defecto', async () => {
    const out = await tmdbSvc.getNowPlaying();
    const m = out.results[0];
    expect(m).toHaveProperty('external_id');
    expect(m).toHaveProperty('title');
    expect(m).toHaveProperty('poster_url');
    expect(Array.isArray(out.results)).toBe(true);
  });
});
