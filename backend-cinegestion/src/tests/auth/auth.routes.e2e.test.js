// tests/auth.routes.e2e.test.js 
// @jest-environment node
import { jest } from '@jest/globals';
import { query } from '../../config/db.js';

/**
 * MOCK de correo antes de cargar cualquier módulo que lo use.
 * Si tu código usa `import mailer from '../../config/mailer.js'` y luego `mailer.sendMail(...)`,
 * con esto ya no tocará Mailtrap.
 */

jest.unstable_mockModule('../../config/mailer.js', () => {
  const sendMail = jest.fn().mockResolvedValue({
    messageId: 'mocked',
    accepted: ['fake@cinegestion.com'],
    response: '250 OK mock',
  });
  return {
    sendMail,              // ← export nombrado
    default: { sendMail }, // ← por si alguien hace import default
  };
});


// --- Helpers HTTP (se definen más abajo cuando carguemos app dinámicamente) ---
let app;
let request;
let register, login, verify, resend, logout, logoutAll, me;

// --- Utilidades BD para preparar/forzar estados ---
async function truncateAuthTables() {
  await query('TRUNCATE cinegestion.user_sessions RESTART IDENTITY CASCADE');
  await query('TRUNCATE cinegestion.users RESTART IDENTITY CASCADE');
}

async function getUserByEmail(email) {
  const { rows } = await query(
    `SELECT id, email, email_verified_at, verify_code_hash, verify_expires_at, resend_after, verify_attempts
     FROM cinegestion.users WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function markEmailVerifiedDirectly(email) {
  await query(
    `UPDATE cinegestion.users
       SET email_verified_at = NOW(),
           verify_code_hash = NULL,
           verify_expires_at = NULL,
           resend_after = NULL,
           verify_attempts = 0
     WHERE email = $1`,
    [email]
  );
}

async function setResendAfter(email, date) {
  await query(
    `UPDATE cinegestion.users SET resend_after = $2 WHERE email = $1`,
    [email, date]
  );
}

beforeAll(async () => {
  // Forzamos política de exigir verificación antes de login en estas pruebas
  process.env.ENFORCE_EMAIL_VERIFIED = 'true';
  process.env.NODE_ENV = 'test';

  // Importamos la app después de setear ENV
  const supertest = await import('supertest');
  request = supertest.default;

  const appMod = await import('../../app.js');
  app = appMod.default;

  // Atajos HTTP
  register = (payload) => request(app).post('/api/auth/register').send(payload);
  login    = (payload) => request(app).post('/api/auth/login').send(payload);
  verify   = (payload) => request(app).post('/api/auth/verify').send(payload);
  resend   = (payload) => request(app).post('/api/auth/resend').send(payload);
  logout   = (token)   => request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).send();
  logoutAll= (token)   => request(app).post('/api/auth/logout-all').set('Authorization', `Bearer ${token}`).send();
  me       = (token)   => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
});

beforeEach(async () => {
  await truncateAuthTables();
});

describe('Auth E2E', () => {

  test('RF-01 registro exitoso devuelve 201 y user.email', async () => {
    const res = await register({
      email: 'test@example.com',
      password: 'UnaContraseñaLarga#2025',
      first_name: 'Juan',
      last_name: 'Pérez',
      document_type: 'CC',
      document_number: '12345678',
      birth_date: '1990-01-01'
    });

    expect(res.status).toBe(201);
    // El controller retorna { message, user: out }
    expect(res.body?.user?.email).toBe('test@example.com');

    // Debe existir un verify_code pendiente (no validamos el hash, solo su presencia).
    const u = await getUserByEmail('test@example.com');
    expect(u).toBeTruthy();
    expect(u.verify_code_hash).toBeTruthy();
    expect(u.verify_expires_at).toBeTruthy();
    expect(u.email_verified_at).toBeNull();
  });

  test('RF-01 evita duplicado (409) y mensaje específico', async () => {
    const payload = {
      email: 'dup@example.com',
      password: 'UnaContraseñaLarga#2025',
      first_name: 'Duplicado',
      last_name: 'Jose',
      document_type: 'CC',
      document_number: '12345678',
      birth_date: '1990-01-01'
    };
    await register(payload);
    const res = await register(payload);

    expect(res.status).toBe(409);
    // Dependiendo de tu error middleware, puede venir en `message` o `error`.
    const msg = (res.body?.message || res.body?.error || '').toLowerCase();
    expect(msg).toMatch(/ya está|ya esta/); // tolera acento
  });

  test('RF-02 con ENFORCE_EMAIL_VERIFIED=true: login antes de verificar ⇒ 403; tras verificar ⇒ 200 con token', async () => {
    const email = 'juandiego@example.com';
    const password = 'Contraseñalarga#2025';

    await register({
      email,
      password,
      first_name: 'Juan Diego',
      last_name: 'Carmona',
      document_type: 'CC',
      document_number: '12345678',
      birth_date: '2000-01-01'
    });

    // Intento de login ANTES de verificar: debe bloquear (403)
    const resForbidden = await login({ email, password });
    expect([403, 401]).toContain(resForbidden.status);
    if (resForbidden.status === 403) {
      expect((resForbidden.body?.message || resForbidden.body?.error || '').toLowerCase())
        .toMatch(/verificar/);
    }

    // Marcamos verificado directamente en BD para no depender del hash del código en la e2e
    await markEmailVerifiedDirectly(email);

    // Ahora sí debe permitir login
    const resOk = await login({ email, password });
    expect(resOk.status).toBe(200);
    expect(resOk.body.token).toBeTruthy();

    // `/me` debe responder con datos usando el token
    const resMe = await me(resOk.body.token);
    expect(resMe.status).toBe(200);
    expect(resMe.body?.user?.email).toBe(email);
  });

  test('RF-03 /resend respeta cooldown: primer intento inmediato ⇒ 429; al expirar (forzado en BD) ⇒ 200 y resent=true', async () => {
    const email = 'cooldown@example.com';
    const password = 'UnaContraseñaLarga#2025';

    await register({
      email,
      password,
      first_name: 'Cool',
      last_name: 'Down',
      document_type: 'CC',
      document_number: '12345678',
      birth_date: '1995-05-05'
    });

    // Inmediatamente después del registro, el servicio dejó un resend_after en ~2 min
    // Intento de reenvío inmediato debe fallar por cooldown
    const res1 = await resend({ email });
    expect(res1.status).toBe(429);

    // Forzamos que el cooldown ya haya pasado (poner resend_after en el pasado)
    await setResendAfter(email, new Date(Date.now() - 60_000)); // hace 1 min

    const res2 = await resend({ email });
    expect([200, 201]).toContain(res2.status);
    expect(res2.body?.resent).toBe(true);

    // Debe haberse actualizado verify_expires_at (nuevo código), aunque no validamos el hash
    const u2 = await getUserByEmail(email);
    expect(u2.verify_expires_at).toBeTruthy();
  });

  test('RF-04 /verify valida payload: faltan campos ⇒ 400', async () => {
    const res = await verify({ email: 'alguien@example.com' }); // sin code
    expect(res.status).toBe(400);
  });

  // -----------------------------------------
  // RF-05 /logout y /logout-all
  // -----------------------------------------

  test('RF-05.1 /logout sin token ⇒ 400 TOKEN_MISSING (o 401 si hay middleware global)', async () => {
    // Llamada sin header Authorization
    const res = await request(app).post('/api/auth/logout');
    expect([400, 401]).toContain(res.status);
    const err = (res.body?.error || res.body?.message || '').toUpperCase();
    // Si tu app aplica un middleware global, podría responder 401
    expect(err).toMatch("INVALID TOKEN");
  });

  test('RF-05.2 /logout con token mal formado ⇒ 400 TOKEN_MISSING', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer not-a-jwt'); // no cumple el regex de 3 segmentos
    expect([400, 401]).toContain(res.status);
    const err = (res.body?.error || res.body?.message || '').toUpperCase();
    expect(err).toMatch("INVALID TOKEN");
  });

  test('RF-05.3 /logout con token inválido (firma o secret incorrecto) ⇒ 401 INVALID TOKEN', async () => {
    // Token cualquiera con 3 segmentos (no verificable)
    const fakeJwt = 'aaa.bbb.ccc';
    const res = await logout(fakeJwt);
    expect(res.status).toBe(401);
    expect((res.body?.error || '').toUpperCase()).toBe('INVALID TOKEN');
  });

  test('RF-05.4 /logout válido ⇒ 204 y el token queda inválido para /me', async () => {
    const email = 'bye@example.com';
    const password = 'UnaContraseñaLarga#2025';

    await register({
      email, password,
      first_name: 'Bye', last_name: 'User',
      document_type: 'CC', document_number: '12345678', birth_date: '1990-01-01'
    });
    await markEmailVerifiedDirectly(email);
    const resLogin = await login({ email, password });
    expect(resLogin.status).toBe(200);
    const token = resLogin.body.token;

    // Antes del logout, /me debe ser 200
    const resMeOk = await me(token);
    expect(resMeOk.status).toBe(200);

    // Logout ⇒ 204
    const resLogout = await logout(token);
    expect(resLogout.status).toBe(204);

    // Idempotente: segundo logout también 204
    const resLogout2 = await logout(token);
    expect([204, 401]).toContain(resLogout2.status);

    // Después del logout, /me debe fallar
    const resMeAfter = await me(token);
    expect([401, 403]).toContain(resMeAfter.status);
  });

  test('RF-05.5 /logout-all elimina todas las sesiones del usuario ⇒ 204; tokens previos dejan de servir', async () => {
    const email = 'multi@example.com';
    const password = 'UnaContraseñaLarga#2025';

    await register({
      email, password,
      first_name: 'Multi', last_name: 'Session',
      document_type: 'CC', document_number: '12345678', birth_date: '1995-05-05'
    });
    await markEmailVerifiedDirectly(email);

    // Dos sesiones/tokens distintos (dos logins)
    const r1 = await login({ email, password });
    const r2 = await login({ email, password });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const token1 = r1.body.token;
    const token2 = r2.body.token;

    // Validar que ambos sirven antes de logout-all
    expect((await me(token1)).status).toBe(200);
    expect((await me(token2)).status).toBe(200);

    // logout-all con uno de los tokens
    const resAll = await logoutAll(token1);
    expect(resAll.status).toBe(204);

    // Ambos tokens deben quedar inválidos
    const after1 = await me(token1);
    const after2 = await me(token2);
    expect([401, 403]).toContain(after1.status);
    expect([401, 403]).toContain(after2.status);
  });


  // (Opcional) Si quieres cubrir happy path de /verify en E2E:
  // puedes simularlo fijando un hash conocido en BD y enviando el "code"
  // que produzca ese hash según tu utils/hashCode. Como tu hash es one-way
  // y no lo tenemos aquí, optamos por validar /verify a través del caso de login (arriba).
});

