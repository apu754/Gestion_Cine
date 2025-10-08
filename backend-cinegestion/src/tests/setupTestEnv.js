// src/tests/setupTestEnv.js
import 'dotenv/config';
import { query, pool } from '../config/db.js';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const TEST_SCHEMA = process.env.PGSCHEMA || 'cinegestion';
const LOAD_SCHEMA = process.env.TEST_LOAD_SCHEMA === '1'; // <-- bandera

const readSql = rel => {
  const abs = path.resolve(root, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
};

beforeAll(async () => {
  if (!LOAD_SCHEMA) return; // <-- no toques la BD para tests unitarios

  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
  await query(`SET search_path TO ${TEST_SCHEMA}, public`);

  // Evita conflictos con vistas
  await query(`DROP VIEW IF EXISTS ${TEST_SCHEMA}.v_movies_with_ratings CASCADE`);
  await query(`DROP VIEW IF EXISTS ${TEST_SCHEMA}.v_showtime_occupancy CASCADE`);

  const schemaSql = readSql('sql/00_schema_cinegestion.sql');
  if (!schemaSql) throw new Error('Falta sql/00_schema_cinegestion.sql');

  // Ejecuta por sentencias para debugear mejor
  await runSqlStatements(schemaSql);

  const seedSql = readSql('sql/02_seed_dev.sql');
  if (seedSql) await runSqlStatements(seedSql);
});

afterAll(async () => {
  await pool.end();
});

async function runSqlStatements(sql) {
  // divide por ; (muy simple, suficiente para casos comunes; evita ; dentro de $$...$$ si los tienes)
  const stmts = sql
    .split(/;\s*$/m).join(';\n') // normaliza fin de archivo
    .split(/;\s*\n/g)            // separa por ; al final de línea
    .map(s => s.trim())
    .filter(Boolean);

  for (const s of stmts) {
    try {
      await query(s);
    } catch (err) {
      console.error('\n✗ Falló esta sentencia SQL:\n', s, '\n');
      throw err;
    }
  }
}
