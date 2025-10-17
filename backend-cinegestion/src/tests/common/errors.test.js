// tests/common/errors.test.js
import { jest } from '@jest/globals';

import { AppError, ConflictError, AuthError, HttpError } from '../../common/errors.js';

describe('Custom Error Classes', () => {
  describe('AppError', () => {
    test('crea un error con status y code por defecto', () => {
      const err = new AppError('Algo salió mal');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
      expect(err.message).toBe('Algo salió mal');
      expect(err.status).toBe(400);
      expect(err.code).toBe('APP_ERROR');
      expect(err.name).toBe('Error');
    });

    test('permite personalizar status y code', () => {
      const err = new AppError('Error personalizado', 500, 'CUSTOM_CODE');
      expect(err.message).toBe('Error personalizado');
      expect(err.status).toBe(500);
      expect(err.code).toBe('CUSTOM_CODE');
    });

    test('mantiene el stack trace', () => {
      const err = new AppError('Test error');
      expect(err.stack).toBeDefined();
      expect(err.stack).toContain('Error');
    });
  });

  describe('ConflictError', () => {
    test('crea un error de conflicto con status 409', () => {
      const err = new ConflictError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.message).toBe('Recurso en conflicto');
      expect(err.status).toBe(409);
      expect(err.code).toBe('CONFLICT');
    });

    test('permite personalizar el mensaje', () => {
      const err = new ConflictError('El usuario ya existe');
      expect(err.message).toBe('El usuario ya existe');
      expect(err.status).toBe(409);
      expect(err.code).toBe('CONFLICT');
    });
  });

  describe('AuthError', () => {
    test('crea un error de autenticación con status 401', () => {
      const err = new AuthError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(AuthError);
      expect(err.message).toBe('Credenciales inválidas');
      expect(err.status).toBe(401);
      expect(err.code).toBe('AUTH_ERROR');
    });

    test('permite personalizar el mensaje', () => {
      const err = new AuthError('Token expirado');
      expect(err.message).toBe('Token expirado');
      expect(err.status).toBe(401);
      expect(err.code).toBe('AUTH_ERROR');
    });
  });

  describe('HttpError', () => {
    test('crea un error HTTP básico', () => {
      const err = new HttpError(404, 'Recurso no encontrado');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(HttpError);
      expect(err.message).toBe('Recurso no encontrado');
      expect(err.status).toBe(404);
      expect(err.name).toBe('HttpError');
      expect(err.code).toBeUndefined();
    });

    test('permite agregar código de negocio opcional', () => {
      const err = new HttpError(404, 'Usuario no encontrado', 'USER_NOT_FOUND');
      expect(err.message).toBe('Usuario no encontrado');
      expect(err.status).toBe(404);
      expect(err.code).toBe('USER_NOT_FOUND');
    });

    test('captura stack trace correctamente', () => {
      const err = new HttpError(500, 'Error interno');
      expect(err.stack).toBeDefined();
      expect(err.stack).toContain('HttpError');
    });

    test('verifica que Error.captureStackTrace fue llamado', () => {
      // Mock para verificar que se llama con los parámetros correctos
      const originalCapture = Error.captureStackTrace;
      Error.captureStackTrace = jest.fn();

      const err = new HttpError(403, 'Forbidden');
      
      expect(Error.captureStackTrace).toHaveBeenCalledWith(err, HttpError);
      
      // Restaurar la función original
      Error.captureStackTrace = originalCapture;
    });

    test('funciona sin código de negocio', () => {
      const err = new HttpError(503, 'Servicio no disponible');
      expect(err.code).toBeUndefined();
      expect(err.status).toBe(503);
      expect(err.message).toBe('Servicio no disponible');
    });
  });

  describe('Herencia y instanceof', () => {
    test('ConflictError es instancia de AppError y Error', () => {
      const err = new ConflictError();
      expect(err instanceof Error).toBe(true);
      expect(err instanceof AppError).toBe(true);
      expect(err instanceof ConflictError).toBe(true);
    });

    test('AuthError es instancia de AppError y Error', () => {
      const err = new AuthError();
      expect(err instanceof Error).toBe(true);
      expect(err instanceof AppError).toBe(true);
      expect(err instanceof AuthError).toBe(true);
    });

    test('HttpError es instancia de Error pero no de AppError', () => {
      const err = new HttpError(500, 'Error');
      expect(err instanceof Error).toBe(true);
      expect(err instanceof HttpError).toBe(true);
      expect(err instanceof AppError).toBe(false);
    });
  });

  describe('Serialización de errores', () => {
    test('los errores pueden convertirse a JSON', () => {
      const err = new ConflictError('Duplicado');
      const json = JSON.stringify({
        message: err.message,
        status: err.status,
        code: err.code,
      });
      
      const parsed = JSON.parse(json);
      expect(parsed.message).toBe('Duplicado');
      expect(parsed.status).toBe(409);
      expect(parsed.code).toBe('CONFLICT');
    });

    test('HttpError puede serializarse con código opcional', () => {
      const err = new HttpError(404, 'Not found', 'RESOURCE_MISSING');
      const json = JSON.stringify({
        message: err.message,
        status: err.status,
        code: err.code,
      });
      
      const parsed = JSON.parse(json);
      expect(parsed.code).toBe('RESOURCE_MISSING');
    });
  });

  describe('Manejo de errores en try-catch', () => {
    test('puede atrapar y verificar tipo de error', () => {
      try {
        throw new AuthError('Token inválido');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect(error.status).toBe(401);
        expect(error.message).toBe('Token inválido');
      }
    });

    test('puede diferenciar entre tipos de errores', () => {
      const errors = [
        new ConflictError('Conflicto'),
        new AuthError('No autorizado'),
        new HttpError(500, 'Error del servidor'),
      ];

      errors.forEach((err) => {
        if (err instanceof ConflictError) {
          expect(err.status).toBe(409);
        } else if (err instanceof AuthError) {
          expect(err.status).toBe(401);
        } else if (err instanceof HttpError) {
          expect(err.status).toBe(500);
        }
      });
    });
  });
});