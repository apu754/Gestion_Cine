// movies/movie.validators.js
import Joi from 'joi';

export const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  language: Joi.string().trim().default(process.env.TMDB_DEFAULT_LANG || 'es-ES'),
  region: Joi.string().uppercase().length(2).optional(), // ISO 3166-1 (CO, AR, MX...)
});
