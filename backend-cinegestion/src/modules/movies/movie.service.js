import * as tmdbSvc from './tmdb/tmdb.service.js';
import * as extRepo from './external.repository.js'; // <- ruta correcta

export async function listPopular(opts = {}) {
  const data = await tmdbSvc.getPopular(opts);
  // cache asíncrono (no bloquea la respuesta)
  extRepo.cacheFromTmdb(data.results).catch(() => {});
  return data;
}

export async function listNowPlaying(opts = {}) {
  const data = await tmdbSvc.getNowPlaying(opts);
  extRepo.cacheFromTmdb(data.results).catch(() => {});
  return data;
}

export async function listUpcoming(opts = {}) {
  const data = await tmdbSvc.getUpcoming(opts);
  extRepo.cacheFromTmdb(data.results).catch(() => {});
  return data;
}

export async function listTopRated(opts = {}) {
  const data = await tmdbSvc.getTopRated(opts);
  extRepo.cacheFromTmdb(data.results).catch(() => {});
  return data;
}

// (futuro) promoción al catálogo oficial
export async function promoteExternalToMovie(externalId, curatedData) {
  return extRepo.promoteToMovie(externalId, curatedData);
}
