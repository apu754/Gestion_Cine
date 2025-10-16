import cors from 'cors';

const parseOrigins = (s) =>
  (s || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

/**
 * Lee orígenes permitidos desde ENV (coma-separados).
 * Ejemplo: CORS_ORIGINS="http://localhost:5173,https://app.cinegestion.com"
 */
const ALLOWED = new Set(parseOrigins(process.env.CORS_ORIGINS));

// Métodos y headers permitidos (ajusta si necesitas otros)
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const ALLOWED_HEADERS = ['Authorization', 'Content-Type', 'Idempotency-Key'];

export const corsMiddleware = cors({
  origin(origin, cb) {
    // Requests sin origin (curl/health) → permite
    if (!origin) return cb(null, true);

    // Dev: permite localhost si está en ENV; Prod: solo dominios listados
    if (ALLOWED.size > 0 && ALLOWED.has(origin)) return cb(null, true);

    // Rechaza lo demás
    cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ALLOWED_METHODS.join(','),
  allowedHeaders: ALLOWED_HEADERS.join(','),
  exposedHeaders: [],               // añade si necesitas exponer alguno
  credentials: false,               // pon true SOLO si usas cookies/sesiones
  maxAge: 600,                      // cachea el preflight 10 min
  optionsSuccessStatus: 204
});
