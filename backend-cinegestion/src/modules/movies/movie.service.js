// movies/movie.service.js
// Aquí puedes decidir cachear en Postgres después (tabla movies).
// Por ahora, es un pass-through al servicio TMDB.
import * as tmdbSvc from '../movies/tmdb/tmdb.service.js';

export const listPopular = (opts) => tmdbSvc.getPopular(opts);
export const listNowPlaying = (opts) => tmdbSvc.getNowPlaying(opts);
export const listUpcoming = (opts) => tmdbSvc.getUpcoming(opts);
export const listTopRated = (opts) => tmdbSvc.getTopRated(opts);
