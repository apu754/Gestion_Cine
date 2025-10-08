export function notFound(req, res) {
  res.status(404).json({ error: 'Not Found' });
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const payload = {
    error: err.code || 'SERVER_ERROR',
    message: status >= 500 ? 'Ocurrió un problema. Intenta más tarde.' : err.message
  };
  res.status(status).json(payload);
}
