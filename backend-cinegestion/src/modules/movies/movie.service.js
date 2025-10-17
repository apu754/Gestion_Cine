import * as tmdbSvc from './tmdb/tmdb.service.js';
import * as extRepo from './external.repository.js'; 

export async function listPopular(opts = {}) {
  const data = await tmdbSvc.getPopular(opts);
  // cache asíncrono (no bloquea la respuesta)
  extRepo.cacheFromTmdb(data.results).catch((err) => {
    // Log silencioso en desarrollo: no afecta la respuesta al cliente
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Cache failed (listPopular):', err.message);
    }
  });
  return data;
}

export async function listNowPlaying(opts = {}) {
  const data = await tmdbSvc.getNowPlaying(opts);
  extRepo.cacheFromTmdb(data.results).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Cache failed (listNowPlaying):', err.message);
    }
  });
  return data;
}

export async function listUpcoming(opts = {}) {
  const data = await tmdbSvc.getUpcoming(opts);
  extRepo.cacheFromTmdb(data.results).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Cache failed (listUpcoming):', err.message);
    }
  });
  return data;
}

export async function listTopRated(opts = {}) {
  const data = await tmdbSvc.getTopRated(opts);
  extRepo.cacheFromTmdb(data.results).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Cache failed (listTopRated):', err.message);
    }
  });
  return data;
}

// (futuro) promoción al catálogo oficial
export async function promoteExternalToMovie(externalId, curatedData) {
  return extRepo.promoteToMovie(externalId, curatedData);
}