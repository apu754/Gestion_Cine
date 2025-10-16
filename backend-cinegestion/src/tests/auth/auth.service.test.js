// src/modules/auth/__tests__/auth.service.test.js
// @jest-environment node
import { jest } from '@jest/globals';
import crypto from 'crypto';

// =======================
// 1) Mocks de dependencias
// =======================
jest.unstable_mockModule('../../modules/auth/user.repository.js', () => ({
  findByEmail: jest.fn(),
  createSession: jest.fn(),
  updateLastLogin: jest.fn(),
  createUser: jest.fn(),
  setVerifyCode: jest.fn(),
  markEmailVerified: jest.fn(),
  incrementVerifyAttempts: jest.fn(),
}));

jest.unstable_mockModule('../../config/mailer.js', () => ({
  sendMail: jest.fn(),
}));

jest.unstable_mockModule('bcrypt', () => ({
  default: {
    compare: jest.fn(),
    hash: jest.fn(),
  },
}));

jest.unstable_mockModule('../../modules/auth/jwt.js', () => ({
  signFor: jest.fn(),
}));

// =======================
// 2) Importar después de mockear
// =======================
const repo = await import('../../modules/auth/user.repository.js');
const { sendMail } = await import('../../config/mailer.js');
const bcrypt = (await import('bcrypt')).default;
const { signFor } = await import('../../modules/auth/jwt.js');
const service = await import('../../modules/auth/auth.service.js');

// =======================
// 3) Helpers & setup
// =======================
const NOW = new Date('2025-10-10T12:00:00Z');
const advanceMs = (ms) => new Date(NOW.getTime() + ms);

const makeUser = (overrides = {}) => ({
  id: overrides.id ?? 'u1',
  email: overrides.email ?? 'user@example.com',
  first_name: overrides.first_name ?? 'Juan',
  last_name: overrides.last_name ?? 'Pérez',
  role: overrides.role ?? 'USER',
  password_hash: overrides.password_hash ?? 'hash',
  email_verified_at: overrides.email_verified_at ?? null,
  verify_code_hash: overrides.verify_code_hash ?? null,
  verify_expires_at: overrides.verify_expires_at ?? null,
  resend_after: overrides.resend_after ?? null,
  verify_attempts: overrides.verify_attempts ?? 0,
});

const setEnv = (vars = {}) => {
  process.env.BCRYPT_ROUNDS = vars.BCRYPT_ROUNDS ?? '12';
  process.env.RESEND_COOLDOWN_MIN = vars.RESEND_COOLDOWN_MIN ?? '2';
  process.env.MAX_VERIFY_ATTEMPTS = vars.MAX_VERIFY_ATTEMPTS ?? '6';
  process.env.VERIFY_CODE_TTL_MIN = vars.VERIFY_CODE_TTL_MIN ?? '15';
  process.env.APP_URL = vars.APP_URL ?? 'http://localhost:3000';
  process.env.ENFORCE_EMAIL_VERIFIED = vars.ENFORCE_EMAIL_VERIFIED ?? 'false';
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  jest.clearAllMocks();
  setEnv(); // valores por defecto
});

afterAll(() => {
  jest.useRealTimers();
});

// =====================================
// 4) TESTS - REGISTER
// =====================================
describe('auth.service :: register', () => {
  test('lanza 409 si el email ya existe', async () => {
    repo.findByEmail.mockResolvedValue(makeUser({ email: 'a@a.com' }));

    await expect(
      service.register({
        email: 'a@a.com',
        password: 'UnaContraseñaLarga#2025',
        first_name: 'A',
        last_name: 'B',
      })
    ).rejects.toMatchObject({ status: 409 });

    expect(repo.createUser).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('crea usuario, setea verify code y envía correo', async () => {
    repo.findByEmail.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed-pass');
    // user recién creado
    repo.createUser.mockResolvedValue(
      makeUser({ id: 'u100', email: 'nuevo@correo.com', password_hash: 'hashed-pass' })
    );
    repo.setVerifyCode.mockResolvedValue();

    await service.register({
      email: 'nuevo@correo.com',
      password: 'contraseña-larga-123',
      first_name: 'Nuevo',
      last_name: 'Usuario',
    });

    expect(repo.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'nuevo@correo.com',
        password_hash: 'hashed-pass',
        first_name: 'Nuevo',
        last_name: 'Usuario',
      })
    );

    // Se guardó el hash y expiraciones
    expect(repo.setVerifyCode).toHaveBeenCalledWith(
      'u100',
      expect.objectContaining({
        codeHash: expect.any(String),
        expires_at: expect.any(Date),
        resend_after: expect.any(Date),
      })
    );

    // Correo enviado
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'nuevo@correo.com',
        subject: expect.stringContaining('Verifica tu correo'),
        html: expect.any(String),
        text: expect.any(String),
      })
    );
  });
});

// =====================================
// 5) TESTS - VERIFY EMAIL
// =====================================
describe('auth.service :: verifyEmail', () => {
  test('404 si usuario no existe', async () => {
    repo.findByEmail.mockResolvedValue(null);

    await expect(
      service.verifyEmail({ email: 'x@x.com', code: '123456' })
    ).rejects.toMatchObject({ status: 404 });
  });

  test('early return si ya está verificado', async () => {
    repo.findByEmail.mockResolvedValue(
      makeUser({ email_verified_at: new Date().toISOString() })
    );

    const out = await service.verifyEmail({ email: 'ok@ok.com', code: '000000' });
    expect(out).toMatchObject({ alreadyVerified: true });
  });

  test('400 si no hay código pendiente', async () => {
    repo.findByEmail.mockResolvedValue(makeUser()); // sin verify_code_hash / verify_expires_at

    await expect(
      service.verifyEmail({ email: 'u@u.com', code: '123456' })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('410 si el código expiró', async () => {
    repo.findByEmail.mockResolvedValue(
      makeUser({
        verify_code_hash: 'algo',
        verify_expires_at: advanceMs(-1 * 60 * 1000).toISOString(), // ya expirado
      })
    );

    await expect(
      service.verifyEmail({ email: 'u@u.com', code: '123456' })
    ).rejects.toMatchObject({ status: 410 });
  });

  test('401 si el código es inválido (incrementa intentos)', async () => {
    // Hash distinto al entrante
    repo.findByEmail.mockResolvedValue(
      makeUser({
        id: 'uX',
        verify_code_hash: 'hash-guardado',
        verify_expires_at: advanceMs(10 * 60 * 1000).toISOString(),
        verify_attempts: 2,
      })
    );

    // hashCode se usa dentro del servicio; aquí no lo controlamos, así que
    // verificamos que, ante mismatch, incremente intentos y lance 401
    await expect(
      service.verifyEmail({ email: 'u@u.com', code: 'no-coincide' })
    ).rejects.toMatchObject({ status: 401 });

    expect(repo.incrementVerifyAttempts).toHaveBeenCalledWith('uX');
  });

  test('429 si superó MAX_VERIFY_ATTEMPTS', async () => {
    setEnv({ MAX_VERIFY_ATTEMPTS: '6' });
    repo.findByEmail.mockResolvedValue(
      makeUser({
        verify_attempts: 6,
        verify_code_hash: 'cualquiera',
        verify_expires_at: advanceMs(10 * 60 * 1000).toISOString(),
      })
    );

    await expect(
      service.verifyEmail({ email: 'u@u.com', code: '123456' })
    ).rejects.toMatchObject({ status: 429 });
  });


  test('marca como verificado si el código coincide', async () => {
  const code = 'CUALQUIERA'; // el que vas a pasar al servicio
  const hash = crypto.createHash('sha256').update(code).digest('hex');

  repo.findByEmail.mockResolvedValue(
    makeUser({
      id: 'uZ',
      verify_code_hash: hash,  // ← coincide con "code"
      verify_expires_at: advanceMs(5 * 60 * 1000).toISOString(),
    })
  );

  const out = await service.verifyEmail({ email: 'ok@ok.com', code });
  expect(out).toMatchObject({ verified: true });
  expect(repo.markEmailVerified).toHaveBeenCalledWith('uZ');
  });

  
});

// =====================================
// 6) TESTS - RESEND VERIFICATION CODE
// =====================================
describe('auth.service :: resendVerificationCode', () => {
  test('404 si usuario no existe', async () => {
    repo.findByEmail.mockResolvedValue(null);

    await expect(
      service.resendVerificationCode({ email: 'x@x.com' })
    ).rejects.toMatchObject({ status: 404 });
  });

  test('ya verificado => early return', async () => {
    repo.findByEmail.mockResolvedValue(
      makeUser({ email_verified_at: NOW.toISOString() })
    );

    const out = await service.resendVerificationCode({ email: 'ok@ok.com' });
    expect(out).toMatchObject({ alreadyVerified: true });
    expect(repo.setVerifyCode).not.toHaveBeenCalled();
  });

  test('respeta cooldown => 429', async () => {
    // resend_after en el futuro
    repo.findByEmail.mockResolvedValue(
      makeUser({ resend_after: advanceMs(60 * 1000).toISOString() })
    );

    await expect(
      service.resendVerificationCode({ email: 'cool@down.com' })
    ).rejects.toMatchObject({ status: 429 });
  });

  test('genera nuevo código, persiste y envía correo', async () => {
  repo.findByEmail.mockResolvedValue(makeUser());   // user válido sin verificar
  repo.setVerifyCode.mockResolvedValue();

  // Fijamos Math.random para que generateNumericCode sea determinístico
  const rndSpy = jest.spyOn(Math, 'random').mockReturnValue(0.42); 
  // con len=6 => min=100000, max=999999, rango=900000
  // code = floor(0.42 * 900000 + 100000) = floor(378000 + 100000) = 478000

  try {
    const out = await service.resendVerificationCode({ email: 'u@u.com' });
    expect(out).toMatchObject({ resent: true });

    expect(repo.setVerifyCode).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        codeHash: expect.any(String),  // no necesitamos el código exacto
        expires_at: expect.any(Date),
        resend_after: expect.any(Date),
      })
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'u@u.com',
        subject: expect.stringMatching(/c[oó]digo/i),
        html: expect.any(String),
        text: expect.any(String),
      })
    );
  } finally {
    rndSpy.mockRestore();
  }
});
  
});

// =====================================
// 7) TESTS - LOGIN
// =====================================
describe('auth.service :: login', () => {
  test('401 si email no existe', async () => {
    repo.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({ email: 'no@existe.com', password: 'x' })
    ).rejects.toMatchObject({ status: 401 });
  });

  test('403 si ENFORCE_EMAIL_VERIFIED=true y no verificado', async () => {
    setEnv({ ENFORCE_EMAIL_VERIFIED: 'true' });

    repo.findByEmail.mockResolvedValue(makeUser({ email_verified_at: null }));
    bcrypt.compare.mockResolvedValue(true); // aunque la pass coincida

    await expect(
      service.login({ email: 'u@u.com', password: 'ok' })
    ).rejects.toMatchObject({ status: 403 });
  });

  test('401 si password incorrecto', async () => {
    repo.findByEmail.mockResolvedValue(makeUser({ password_hash: 'hash' }));
    bcrypt.compare.mockResolvedValue(false);

    await expect(
      service.login({ email: 'u@u.com', password: 'bad' })
    ).rejects.toMatchObject({ status: 401 });
  });

  test('login ok: crea sesión y devuelve token', async () => {
    repo.findByEmail.mockResolvedValue(
      makeUser({ id: 'u42', email_verified_at: NOW.toISOString(), password_hash: 'hash' })
    );
    bcrypt.compare.mockResolvedValue(true);
    signFor.mockReturnValue({
      token: 'jwt-token',
      jti: 'jti-123',
      expMinutes: 60,
      expUnix: Math.floor(advanceMs(60 * 60 * 1000).getTime() / 1000),
    });
    repo.createSession.mockResolvedValue({ id: 'sess-1' });
    repo.updateLastLogin.mockResolvedValue();

    const out = await service.login({
      email: 'u@u.com',
      password: 'ok',
      device_info: 'Chrome on Win',
      ip_address: '127.0.0.1',
    });

    expect(signFor).toHaveBeenCalledWith(expect.objectContaining({ id: 'u42' }));
    expect(repo.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u42',
        jwt_id: 'jti-123',
        expires_at: expect.any(Date),
        device_info: 'Chrome on Win',
        ip_address: '127.0.0.1',
      })
    );
    expect(repo.updateLastLogin).toHaveBeenCalledWith('u42');
    expect(out).toEqual({ token: 'jwt-token', expires_in_minutes: 60 });
  });
});
