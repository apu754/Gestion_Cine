// tests/movies/movie.service.test.js
import { jest } from '@jest/globals';

// --- Mock de dependencias TMDB y cache ---
jest.unstable_mockModule('../../modules/movies/tmdb/tmdb.service.js', () => ({
  getPopular: jest.fn(async () => ({ page: 1, results: [{ external_id: 'p1', title: 'Popular' }] })),
  getNowPlaying: jest.fn(async () => ({ page: 1, results: [{ external_id: 'n1', title: 'Now Playing' }] })),
  getUpcoming: jest.fn(async () => ({ page: 1, results: [{ external_id: 'u1', title: 'Upcoming' }] })),
  getTopRated: jest.fn(async () => ({ page: 1, results: [{ external_id: 't1', title: 'Top Rated' }] })),
}));

jest.unstable_mockModule('../../modules/movies/external.repository.js', () => ({
  cacheFromTmdb: jest.fn(async () => {}),
}));

// --- Imports dinámicos (luego del mock) ---
const svc = await import('../../modules/movies/movie.service.js');
const tmdbSvc = await import('../../modules/movies/tmdb/tmdb.service.js');
const cacheRepo = await import('../../modules/movies/external.repository.js');

// --- Tests ---
describe('movie.service (TMDB + cache)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('listPopular llama a getPopular y cachea', async () => {
    const data = await svc.listPopular({});
    expect(data.results[0].title).toBe('Popular');
    expect(tmdbSvc.getPopular).toHaveBeenCalled();
    expect(cacheRepo.cacheFromTmdb).toHaveBeenCalled();
  });

  test('listNowPlaying llama a getNowPlaying y cachea', async () => {
    const data = await svc.listNowPlaying({});
    expect(data.results[0].title).toBe('Now Playing');
    expect(tmdbSvc.getNowPlaying).toHaveBeenCalled();
    expect(cacheRepo.cacheFromTmdb).toHaveBeenCalled();
  });

  test('listUpcoming llama a getUpcoming y cachea', async () => {
    const data = await svc.listUpcoming({});
    expect(data.results[0].title).toBe('Upcoming');
    expect(tmdbSvc.getUpcoming).toHaveBeenCalled();
    expect(cacheRepo.cacheFromTmdb).toHaveBeenCalled();
  });

  test('listTopRated llama a getTopRated y cachea', async () => {
    const data = await svc.listTopRated({});
    expect(data.results[0].title).toBe('Top Rated');
    expect(tmdbSvc.getTopRated).toHaveBeenCalled();
    expect(cacheRepo.cacheFromTmdb).toHaveBeenCalled();
  });

  // --- Cubre las ramas .catch(() => {}) en todas las funciones ---
  describe('manejo de error al cachear (rama .catch)', () => {
    const cases = [
      ['listPopular', 'getPopular', (opts) => svc.listPopular(opts)],
      ['listNowPlaying', 'getNowPlaying', (opts) => svc.listNowPlaying(opts)],
      ['listUpcoming', 'getUpcoming', (opts) => svc.listUpcoming(opts)],
      ['listTopRated', 'getTopRated', (opts) => svc.listTopRated(opts)],
    ];

    test.each(cases)(
      '%s: si el cache falla, no rompe y TMDB se llama',
      async (_name, tmdbMethod, callFn) => {
        cacheRepo.cacheFromTmdb.mockRejectedValueOnce(new Error('cache down'));

        const opts = { region: 'CO' };
        const data = await callFn(opts);

        expect(tmdbSvc[tmdbMethod]).toHaveBeenCalledWith(opts);
        expect(cacheRepo.cacheFromTmdb).toHaveBeenCalled();
        expect(Array.isArray(data.results)).toBe(true);
      }
    );
  });
});
