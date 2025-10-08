import request from 'supertest';
import app from '../../app.js';
import { query } from '../../config/db.js';

const register = (payload) => request(app).post('/api/auth/register').send(payload);
const login = (payload) => request(app).post('/api/auth/login').send(payload);

describe('Auth E2E', () => {
  beforeEach(async () => {
    await query('TRUNCATE cinegestion.user_sessions RESTART IDENTITY CASCADE');
    await query('TRUNCATE cinegestion.users RESTART IDENTITY CASCADE');
  });

  test('RF-01 registro exitoso', async () => {
    const res = await register({
      email: 'test@example.com', password: 'UnaContraseñaLarga#2025', first_name: 'Juan', last_name: 'Pérez', document_type: 'CC', document_number: '12345678', birth_date: '1990-01-01'
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test@example.com');
  });

  test('RF-01 evita duplicado (mensaje específico)', async () => {
    await register({ email: 'dup@example.com', password: 'UnaContraseñaLarga#2025', first_name:'Duplicado', last_name:'Jose', document_type: 'CC', document_number: '12345678', birth_date: '1990-01-01' });
    const res = await register({ email: 'dup@example.com', password: 'UnaContraseñaLarga#2025', first_name:'Duplicado', last_name:'Jose', document_type: 'CC', document_number: '12345678', birth_date: '1990-01-01' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Este usuario ya está registrado, ¿Desea iniciar sesión?/);
  });

  test('RF-02 login ok genera JWT y registra sesión/ultimo login', async () => {
    await register({ email: 'juandiego@example.com', password: 'Contraseñalarga#2025', first_name:'Juan Diego', last_name:'Carmona', document_type: 'CC', document_number: '12345678', birth_date: '2000-01-01' });
    const res = await login({ email: 'juandiego@example.com', password: 'Contraseñalarga#2025' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  
//   test('RF-02 3 intentos fallidos (simulación de feedback)', async () => {
//     await register({ email: 'fail@example.com', password: 'UnaContraseñaLarga#2025', first_name: 'Juan', last_name: 'Pérez', document_type: 'CC', document_number: '12345678', birth_date: '1990-01-01' });
//     const try1 = await login({ email: 'fail@example.com', password: 'x' });
//     const try2 = await login({ email: 'fail@example.com', password: 'x' });
//     const try3 = await login({ email: 'fail@example.com', password: 'x' });
//     expect(try3.status).toBe(401);
//      En esta primera versión devolvemos el mismo 401; el cliente mostrará sugerencia de reset
//   });
});
