// movies/movie.controller.js
import { listQuerySchema } from './movie.validators.js';
import * as service from './movie.service.js';

function handleError(res, err) {
  const status = err?.status || 500;
  const msg = err?.data?.status_message || err?.message || 'Error interno';
  return res.status(status).json({ error: msg });
}

// GET /api/movies/popular
export async function getPopular(req, res) {
  try {
    const { value } = listQuerySchema.validate(req.query, { abortEarly: false });
    const data = await service.listPopular(value);
    return res.json(data);
  } catch (err) { return handleError(res, err); }
}

// GET /api/movies/now-playing
export async function getNowPlaying(req, res) {
  try {
    const { value } = listQuerySchema.validate(req.query, { abortEarly: false });
    const data = await service.listNowPlaying(value);
    return res.json(data);
  } catch (err) { return handleError(res, err); }
}

// GET /api/movies/upcoming
export async function getUpcoming(req, res) {
  try {
    const { value } = listQuerySchema.validate(req.query, { abortEarly: false });
    const data = await service.listUpcoming(value);
    return res.json(data);
  } catch (err) { return handleError(res, err); }
}

// GET /api/movies/top-rated
export async function getTopRated(req, res) {
  try {
    const { value } = listQuerySchema.validate(req.query, { abortEarly: false });
    const data = await service.listTopRated(value);
    return res.json(data);
  } catch (err) { return handleError(res, err); }
}
