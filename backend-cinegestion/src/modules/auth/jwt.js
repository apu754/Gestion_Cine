// src/modules/auth/jwt.js
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

export function signFor(user) {
  const jti = randomUUID();
  const payload = { sub: user.id, email: user.email, role: user.role, jti };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '15m',     // usa el nombre que tengas en .env
    issuer:    process.env.JWT_ISS    || 'cinegestion.api',
  });

  // decodificar exp para persistir la expiración exacta
  const [, body] = token.split('.');
  const { exp } = JSON.parse(Buffer.from(body, 'base64').toString('utf-8'));
  const ttlSec = Math.max(0, exp - Math.floor(Date.now() / 1000));
  const expMinutes = Math.floor(ttlSec / 60);

  return { token, jti, expMinutes, expUnix: exp };
}
