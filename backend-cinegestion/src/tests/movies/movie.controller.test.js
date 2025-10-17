// tests/movies/movie.controller.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../modules/movies/movie.service.js', () => ({
  listPopular: jest.fn(),
  listNowPlaying: jest.fn(),
  listUpcoming: jest.fn(),
  listTopRated: jest.fn(),
}));

const service = await import('../../modules/movies/movie.service.js');
const ctrl = await import('../../modules/movies/movie.controller.js');

const resMock = () => {
  const r = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};

describe('movie.controller', () => {
  test.each([
    ['getPopular', 'listPopular', { query: {} }, { results: [{ title: 'Popular' }] }],
    ['getNowPlaying', 'listNowPlaying', { query: {} }, { results: [{ title: 'Now Playing' }] }],
    ['getUpcoming', 'listUpcoming', { query: {} }, { results: [{ title: 'Upcoming' }] }],
    ['getTopRated', 'listTopRated', { query: {} }, { results: [{ title: 'Top Rated' }] }],
  ])('%s retorna JSON 200', async (ctrlFn, svcFn, req, data) => {
    service[svcFn].mockResolvedValue(data);
    const res = resMock();
    await ctrl[ctrlFn](req, res);
    expect(res.json).toHaveBeenCalledWith(data);
  });

  test('maneja errores TMDB', async () => {
    service.listPopular.mockRejectedValue({ status: 401, data: { status_message: 'Invalid token' } });
    const res = resMock();
    await ctrl.getPopular({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });
});
