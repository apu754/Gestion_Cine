-- =====================================================
-- 02_seed_dev.sql
-- Semillas para desarrollo y pruebas
-- =====================================================
SET search_path TO cinegestion, public;

-- Usuario administrador
-- Contraseña hasheada de: AdminCineGestion123!@
INSERT INTO cinegestion.users (
  id, email, password_hash, first_name, last_name, role,
  phone, document_type, document_number, birth_date
)
VALUES (
  gen_random_uuid(),
  'admin@cinegestion.local',
  '$2b$12$Y9TnLXqW7CkJS8Z9cz7qBuZgLCEp5IYzBzJ2HLzyZq6y7UpZsUfaS',
  'Admin',
  'Sistema',
  'ADMIN',
  '+573001112233',
  'CC',
  '1001234567',
  '1985-04-12'
)
ON CONFLICT (email) DO NOTHING;

-- Usuario normal de prueba
-- Contraseña hasheada de: TestUser123456!@#
INSERT INTO cinegestion.users (
  id, email, password_hash, first_name, last_name, role,
  phone, document_type, document_number, birth_date
)
VALUES (
  gen_random_uuid(),
  'test1@example.com',
  '$2b$10$testHashExample123456789012345678901234567890',
  'Juan',
  'Pérez',
  'USER',
  '+573008887766',
  'CC',
  '1023456789',
  '2000-09-15'
)
ON CONFLICT (email) DO NOTHING;
