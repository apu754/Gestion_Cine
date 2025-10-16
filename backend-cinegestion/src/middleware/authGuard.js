// src/middleware/authGuard.js
import jwt from 'jsonwebtoken';
import { query, schema } from '../config/db.js';

export async function authGuarda(req, res, next) {
  try {
    const auth = req.get('authorization') || '';
    const m = auth.match(/^Bearer\s+([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)$/);
    if (!m) {
      return res.status(401).json({
        error: 'invalid token',
        details: 'Missing or malformed Authorization header (use: Bearer <token>)',
      });
    }

    const token = m[1];

    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISS || 'cinegestion.api',
    });

    //Verificar que la sesión exista y NO esté expirada
    const { rows } = await query(
      `SELECT id FROM ${schema}.user_sessions
       WHERE jwt_id = $1 AND user_id = $2 AND expires_at > now()`,
      [payload.jti, payload.sub]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        error: 'invalid token',
        details: 'session revoked or expired',
      });
    }

    req.user = { id: payload.sub, role: payload.role, jti: payload.jti };

    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token', details: e.message });
  }
}
