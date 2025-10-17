// tmdb/tmdb.service.js
import { tmdb } from './tmdb.client.js';

const DEF_LANG = process.env.TMDB_DEFAULT_LANG || 'es-ES';
const DEF_REGION = process.env.TMDB_DEFAULT_REGION || 'CO';

/**
 * Mapea un objeto de TMDB Movie a un shape compacto para tu app/api.
 */
export function mapMovie(m) {
  return {
    external_source: 'TMDB',
    external_id: String(m.id),
    title: m.title,
    original_title: m.original_title,
    original_language: m.original_language,
    synopsis: m.overview,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    backdrop_url: m.backdrop_path ? `https://image.tmdb.org/t/p/w780${m.backdrop_path}` : null,
    popularity: m.popularity,
    vote_average: m.vote_average,
    vote_count: m.vote_count,
    genre_ids: m.genre_ids ?? [],
    release_date: m.release_date ?? null,
    adult: m.adult ?? false, // true si es +18
  };
}

async function paged(path, { page = 1, language = DEF_LANG, region } = {}) {
  const params = { page, language };
  if (region) params.region = region;
  const { data } = await tmdb.get(path, { params });
  return {
    page: data.page,
    total_pages: data.total_pages,
    total_results: data.total_results,
    results: (data.results || []).map(mapMovie),
  };
}

export const getPopular = (opts = {}) => paged('/movie/popular', opts);
export const getNowPlaying = (opts = {}) =>
  paged('/movie/now_playing', { region: DEF_REGION, ...opts });
export const getUpcoming = (opts = {}) =>
  paged('/movie/upcoming', { region: DEF_REGION, ...opts });
export const getTopRated = (opts = {}) => paged('/movie/top_rated', opts);
