// tmdb/tmdb.client.js
import axios from 'axios';

const baseURL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const readToken = process.env.TMDB_READ_TOKEN;

if (!readToken) {
  // Falla rápido si falta el token (mejor que ir a producción sin auth)
  throw new Error('Falta TMDB_READ_TOKEN en el .env');
}

export const tmdb = axios.create({
  baseURL,
  timeout: 8000,
  headers: {
    Authorization: `Bearer ${readToken}`, // NO usar api_key en query
    'Content-Type': 'application/json;charset=utf-8',
  },
});

// Interceptor opcional para logs/errores
tmdb.interceptors.response.use(
  (res) => res,
  (err) => {
    // Normaliza error
    const status = err?.response?.status || 500;
    const data = err?.response?.data || { status_message: err.message };
    return Promise.reject({ status, data });
  }
);
