// src/config/db.js
import pg from 'pg';
import format from 'pg-format';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  // ssl: { rejectUnauthorized: false }
});

const schema = process.env.PGSCHEMA || 'public';

// Maneja errores a nivel de pool (buena práctica)
pool.on('error', (err) => {
  console.error('PG pool error:', err);
});

// Fija el search_path escapando el identificador
pool.on('connect', (client) => {
  const sql = format('SET search_path TO %I, public', schema); // %I = identificador
  client.query(sql);
});

export async function query(text, params) {
  // Usa parámetros para VALORES siempre
  return pool.query(text, params);
}

export { pool, schema };
