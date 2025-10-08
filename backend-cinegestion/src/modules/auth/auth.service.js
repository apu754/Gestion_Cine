// src/modules/auth/auth.service.js
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ConflictError, AuthError } from '../../common/errors.js';
import { createUser, findByEmail, createSession, updateLastLogin } from './user.repository.js';
import { signFor } from './jwt.js';

const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
const {
  JWT_EXPIRES = '15m',   // en tu .env tienes 15m
  JWT_ISS = 'cinegestion.api',
} = process.env;

function minutesFromExpiresString(str) {
  const m = String(str).match(/^(\d+)\s*([mhd])$/i);
  if (!m) return 15;
  const n = Number(m[1]); const u = m[2].toLowerCase();
  if (u === 'm') return n;
  if (u === 'h') return n * 60;
  if (u === 'd') return n * 24 * 60;
  return 15;
}

// ---------- REGISTER ----------
export async function register(input) {
  const existing = await findByEmail(input.email);
  if (existing) {
    // OJO con la tilde para que el test matchee su regex
    throw new ConflictError('Este usuario ya está registrado, ¿Desea iniciar sesión?');
  }

  const password_hash = await bcrypt.hash(input.password, rounds);
  const user = await createUser({
    email: input.email,
    password_hash,
    first_name: input.first_name,
    last_name: input.last_name,
    role: 'USER',
    phone: input.phone,
    document_type: input.document_type,
    document_number: input.document_number,
    birth_date: input.birth_date,
  });

  // devuelve lo que espera tu route (normalmente tu route lo envuelve como { user })
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
  };
}

// ---------- LOGIN ----------
export async function login({ email, password, device_info, ip_address }) {
  const user = await findByEmail(email);
  if (!user) throw new AuthError('Credenciales inválidas');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new AuthError('Credenciales inválidas');

  // genera token y OBTÉN el jti/exp que realmente van dentro del JWT
  const { token, jti, expMinutes, expUnix } = signFor(user);

  // usa la expiración REAL del token
  const expires_at = new Date(expUnix * 1000);

  await createSession({
    user_id: user.id,
    jwt_id: jti,                  // ← el MISMO jti del token
    expires_at,                   // ← alineado con el exp del token
    device_info: device_info ?? null,
    ip_address:  ip_address  ?? null,
  });

  await updateLastLogin(user.id);
  return { token, expires_in_minutes: expMinutes };
}

