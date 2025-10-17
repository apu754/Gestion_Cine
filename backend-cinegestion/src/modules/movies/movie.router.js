// movies/movie.routes.js
import { Router } from 'express';
import * as ctrl from './movie.controller.js';

const r = Router();

// GET /api/movies/popular?page=1&language=es-ES
r.get('/popular', ctrl.getPopular);

// GET /api/movies/now-playing?page=1&region=CO
r.get('/now-playing', ctrl.getNowPlaying);

// GET /api/movies/upcoming?page=1&region=CO
r.get('/upcoming', ctrl.getUpcoming);

// GET /api/movies/top-rated?page=1
r.get('/top-rated', ctrl.getTopRated);

export default r;
