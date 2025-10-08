// src/config/db.js
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  // ssl: { rejectUnauthorized: false } // <- si usas cloud que exige SSL
});

// fija el search_path en cada conexión al schema configurado
const schema = process.env.PGSCHEMA || 'public';
pool.on('connect', (client) => {
  client.query(`SET search_path TO ${schema}, public`);
});

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

export { pool, schema };
