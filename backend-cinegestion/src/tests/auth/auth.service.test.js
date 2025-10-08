// @jest-environment node
import { jest } from '@jest/globals';

// 1) Define los mocks ANTES de importar los módulos bajo prueba
jest.unstable_mockModule('../../modules/auth/user.repository.js', () => ({
  findByEmail: jest.fn(),
  createSession: jest.fn(),
  updateLastLogin: jest.fn(),
  createUser: jest.fn(),
}));

jest.unstable_mockModule('bcrypt', () => ({
  // bcrypt se importa como default en el service
  default: { compare: jest.fn(), hash: jest.fn() },
}));

// 2) Importa los módulos DESPUÉS de los mocks
const repo = await import('../../modules/auth/user.repository.js');
const bcrypt = (await import('bcrypt')).default;
const service = await import('../../modules/auth/auth.service.js');

describe('auth.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('register lanza 409 si el email ya existe', async () => {
    repo.findByEmail.mockResolvedValue({ id: '1', email: 'a@a.com' });

    await expect(
      service.register({
        email: 'a@a.com',
        password: '1234567890123456',
        first_name: 'A',
        last_name: 'B',
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  test('login falla con credenciales inválidas (email no existe)', async () => {
    repo.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({ email: 'x@x.com', password: 'bad' })
    ).rejects.toMatchObject({ status: 401 });
  });

  test('login ok crea sesión y devuelve token', async () => {
    repo.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 't@t.com',
      password_hash: 'hash',
      role: 'USER',
    });
    bcrypt.compare.mockResolvedValue(true);
    repo.createSession.mockResolvedValue({ id: 's1' });
    repo.updateLastLogin.mockResolvedValue();

    const out = await service.login({ email: 't@t.com', password: 'ok' });

    expect(repo.createSession).toHaveBeenCalledTimes(1);
    expect(out.token).toBeTruthy();
  });
});
