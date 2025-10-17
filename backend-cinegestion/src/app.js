import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { security } from './common/security.js';
import { errorHandler, notFound } from './common/http.js';
import authRoutes from './modules/auth/auth.routes.js'
import { corsMiddleware } from './common/cors.js';
import movieRoutes from './modules/movies/movie.router.js';



const app = express();

// ---------- Seguridad base ----------
app.use(helmet());
app.use(corsMiddleware);
app.use(express.json({ limit: '10kb' })); // evita payloads excesivos

// Configuración extra de seguridad personalizada (por ejemplo headers)
security(app);

// ---------- Rate limiting global ----------
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 100, // máx 100 requests
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ---------- Rutas ----------
app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);

// ---------- Manejo de errores ----------

// app.use((err, req, res, next) => {
//   console.error('ERROR:', err);
//   const status = err.status || 500;
//   const message = err.message || 'Internal Server Error';
//   res.status(status).json({ error: message });
// });

app.use(notFound);
app.use(errorHandler);

// ---------- Export ----------
export default app;