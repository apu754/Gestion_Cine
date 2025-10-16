// tests/cors.test.js
import request from 'supertest';
import app from '../app.js';

test('preflight permitido para origen en whitelist', async () => {
  const res = await request(app)
    .options('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'POST');

  expect([200,204]).toContain(res.status);
  expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
});

test('bloquea origen no permitido', async () => {
  const res = await request(app)
    .options('/api/auth/login')
    .set('Origin', 'https://evil.example.com')
    .set('Access-Control-Request-Method', 'POST');

  // algunos middlewares devuelven 200 sin CORS headers; validamos ausencia
  expect(res.headers['access-control-allow-origin']).toBeUndefined();
});
