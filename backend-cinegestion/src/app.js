import express from 'express';
import { security } from './common/security.js';
import { errorHandler, notFound } from './common/http.js';
import authRoutes from './modules/auth/auth.routes.js'

const app = express();
security(app);
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ message });
});

app.use(notFound);
app.use(errorHandler);

export default app;