// tests/utils/email-mx-check.test.js
import { jest } from '@jest/globals';

// Mock del módulo dns.promises
jest.unstable_mockModule('node:dns/promises', () => ({
  default: {
    resolveMx: jest.fn(),
  },
}));

// Importamos después del mock
const { default: dns } = await import('node:dns/promises');
const { hasMxRecord } = await import('../../utils/email-mx-check.js');

describe('hasMxRecord', () => {
  beforeEach(() => jest.clearAllMocks());

  test('retorna true cuando hay registros MX válidos', async () => {
    dns.resolveMx.mockResolvedValue([{ exchange: 'mail.example.com' }]);

    const result = await hasMxRecord('user@example.com');

    expect(result).toBe(true);
    expect(dns.resolveMx).toHaveBeenCalledWith('example.com');
  });

  test('retorna false si el email no tiene dominio', async () => {
    const result = await hasMxRecord('correoSinArroba');
    expect(result).toBe(false);
    expect(dns.resolveMx).not.toHaveBeenCalled();
  });

  test('retorna false si no hay registros MX', async () => {
    dns.resolveMx.mockResolvedValue([]);
    const result = await hasMxRecord('user@nodns.com');
    expect(result).toBe(false);
  });

  test('retorna false si ocurre un error en la resolución', async () => {
    dns.resolveMx.mockRejectedValue(new Error('DNS fail'));
    const result = await hasMxRecord('user@fail.com');
    expect(result).toBe(false);
  });
});
