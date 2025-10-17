// src/tests/tmdb/tmdb.client.test.js
import { jest } from '@jest/globals';

let captured = { onFulfilled: null, onRejected: null };

// Mock de axios (ESM) con instance e interceptores capturados
jest.unstable_mockModule('axios', () => {
  captured = { onFulfilled: null, onRejected: null };

  const use = jest.fn((ok, err) => {
    captured.onFulfilled = ok;
    captured.onRejected = err;
  });

  const instance = {
    interceptors: { response: { use } },
  };

  return {
    __esModule: true,
    default: {
      create: jest.fn(() => instance),
    },
  };
});

const importClient = async () =>
  await import('../../modules/movies/tmdb/tmdb.client.js'); 

describe('tmdb.client', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules(); // importante para re-evaluar el módulo con distintos env
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('falla rápido si falta TMDB_READ_TOKEN', async () => {
    delete process.env.TMDB_READ_TOKEN;

    await expect(importClient()).rejects.toThrow('Falta TMDB_READ_TOKEN');
  });

  test('registra interceptor y normaliza error con response (status y data)', async () => {
    process.env.TMDB_READ_TOKEN = 'test-token';

    const axios = (await import('axios')).default;
    await importClient(); // registra interceptor y crea instancia

    // Verifica que axios.create recibió el header con el token
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 8000,
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json;charset=utf-8',
        }),
      }),
    );

    // Simula error con response (como axios lo entrega)
    const err = {
      response: { status: 404, data: { msg: 'not found' } },
      message: 'Request failed',
    };

    await expect(captured.onRejected(err)).rejects.toEqual({
      status: 404,
      data: { msg: 'not found' },
    });
  });

  test('normaliza error sin response (network/timeout) a {status:500, data:{status_message}}', async () => {
    process.env.TMDB_READ_TOKEN = 'test-token';

    await importClient(); // registra interceptor
    const err = { message: 'ECONNREFUSED' };

    await expect(captured.onRejected(err)).rejects.toEqual({
      status: 500,
      data: { status_message: 'ECONNREFUSED' },
    });
  });
});
