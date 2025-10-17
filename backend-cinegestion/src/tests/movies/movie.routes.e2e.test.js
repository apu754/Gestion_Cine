// tests/movies/movie.routes.e2e.test.js
import request from 'supertest';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../modules/movies/tmdb/tmdb.client.js', () => ({
  tmdb: {
    get: jest.fn(async (path) => {
      const movie = {
        id: 1038392,
        title: 'Expediente Warren: El último rito',
        overview: 'Los investigadores de lo paranormal...',
        release_date: '2025-09-03',
        poster_path: '/qdoqogLNR6myoRrxYFxF4UTkFne.jpg',
        release_date: '2025-09-03',
        poster_path: '/qdoqogLNR6myoRrxYFxF4UTkFne.jpg',
        backdrop_path: '/9DYFYhmbXRGsMhfUgXM3VSP9uLX.jpg',
        genre_ids: [27],
        vote_average: 6.9
      };
      return { data: { page: 1, results: [movie] } };
    }),
  },
}));

jest.mock('../../modules/movies/external.repository.js', () => ({
  cacheFromTmdb: jest.fn(async () => {}),
}));

const { default: app } = await import('../../app.js');

describe('E2E /api/movies', () => {
  test.each([
    ['/api/movies/popular', 'popular'],
    ['/api/movies/now-playing', 'now-playing'],
    ['/api/movies/upcoming', 'upcoming'],
    ['/api/movies/top-rated', 'top-rated'],
  ])('GET %s devuelve 200 y resultados', async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.body.results[0].title).toMatch(/Expediente Warren/);
    expect(res.body.results[0].poster_url).toMatch(/^https:\/\/image\.tmdb\.org/);
  });
});
