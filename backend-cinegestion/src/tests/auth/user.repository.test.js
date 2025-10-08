// user.repository.int.test.js
import { pool } from '../../config/db.js';
import { createUser, findByEmail } from '../../modules/auth/user.repository.js';

beforeAll(async () => {
  process.env.PGSCHEMA = 'cinegestion_test';
  // Asegura el esquema y tablas mínimas (o corre tu migrador aquí)
  await pool.query(`CREATE SCHEMA IF NOT EXISTS cinegestion_test`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cinegestion_test.users (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      email CITEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      phone TEXT,
      document_type TEXT,
      document_number TEXT,
      birth_date DATE,
      last_login_at TIMESTAMPTZ
    );
  `);
});

beforeEach(async () => {
  await pool.query('BEGIN');
});

afterEach(async () => {
  await pool.query('ROLLBACK'); // limpia cada test
});


describe('user.repository (integration)', () => {
  test('create and findByEmail', async () => {
    const u = await createUser({
      email: 'test@example.com',
      password_hash: 'hash',
      first_name: 'Juan',
      last_name: 'Pérez',
    });
    expect(u.email).toBe('test@example.com');

    const found = await findByEmail('test@example.com');
    expect(found.id).toBe(u.id);
  });
});
