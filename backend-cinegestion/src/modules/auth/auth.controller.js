import { registerSchema, loginSchema } from "./auth.validatos.js";
import * as service from "./auth.service.js";
import { query, schema } from "../../config/db.js";
import jwt from "jsonwebtoken";

//Registra un nuevo usuario /register

export async function postRegister( req, res, next ) {
    try {
        const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
        
        if( error ) return res.status(400).json({ error: "validation error", details: error.details.map(e => e.message) });
        const out = await service.register(value);
        return res.status(201).json({ message: 'Usuario registrado correctamente', user: out });
    } catch (err) {
        next(err);
    }
}

//Verifica el email del usuario /verify

export async function postVerify(req, res, next){
  try {
    const { email, code } = req.body;
    if(!email || !code) return res.status(400).json({ error: "Faltan email y/o código de verificación" });
    const out = await service.verifyEmail({ email, code });
    return res.status(200).json({ message: 'Email verificado correctamente', ...out });
  } catch (err) {
    next(err);
  }
}

//Reenvia el codigo de verificacion al email del usuario /resend

export async function postResend(req , res, next){
  try {
    const { email } = req.body;
    if(!email) return res.status(400).json({ error: "Falta email" });
    const out = await service.resendVerificationCode({ email });
    return res.status(200).json({ message: 'Código de verificación reenviado', ...out });
  } catch (err) {
    next(err);
  }
}

//Inicia sesion un usuario existente /login

export async function postLogin( req, res, next ) {
    try {
        const { error, value } =loginSchema.validate(req.body, { abortEarly: false });
        if( error ) return res.status(400).json({ error: "validation error", details: error.details.map(e => e.message) });

        // Obtener información del dispositivo y dirección IP

        const device_info = req.get('user-agent') || 'unknown';
        const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
        // Llamar al servicio de login
        const out = await service.login({ ...value, device_info, ip_address });
        // Retornar el token y tiempo de expiración
        return res.status(200).json({ message: 'Inicio de sesion exitoso', ...out });
    } catch (err) {
        next(err);
    }
}

// Cerrar sesión /logout
export async function postLogout(req, res) {
  try {
    const auth = req.get('authorization') || '';
    const m = auth.match(/^Bearer\s+([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)$/);
    if (!m) return res.status(400).json({ error: 'TOKEN_MISSING' });

    const token = m[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISS || 'cinegestion.api',
    });

    await query(
      `DELETE FROM ${schema}.user_sessions WHERE jwt_id = $1 AND user_id = $2`,
      [payload.jti, payload.sub]
    );

    // Idempotente: 204 aunque ya no exista
    return res.status(204).end();
  } catch (err) {
    return res.status(401).json({ error: 'TOKEN_INVALIDO', details: err.message });
  }
}

// Obtener información del usuario autenticado /me

export async function getMe(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, email, first_name, last_name, role, phone, document_type, document_number, birth_date, created_at, last_login_at
       FROM ${schema}.users
       WHERE id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'user not found' });
    return res.json({ user: rows[0] });
  } catch (e) {
    next(e);
  }
}

/// Cerrar todas las sesiones de un usuario /logout-all

export async function postLogoutAll(req, res) {
  try {
    const auth = req.get('authorization') || '';
    const m = auth.match(/^Bearer\s+([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)$/);
    if (!m) return res.status(400).json({ error: 'TOKEN_MISSING' });

    const token = m[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISS || 'cinegestion.api',
    });

    await query(`DELETE FROM ${schema}.user_sessions WHERE user_id = $1`, [payload.sub]);
    return res.status(204).end();
  } catch (err) {
    return res.status(401).json({ error: 'TOKEN_INVALIDO', details: err.message });
  }
}

