-- CineGestión - Esquema PostgreSQL (v1 - Actualizado para TypeORM)
-- Postgres 14+ recomendado

-- Extensiones útiles
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS citext;         -- case-insensitive text

-- Esquema lógico
CREATE SCHEMA IF NOT EXISTS cinegestion;
SET search_path TO cinegestion, public;

-- Tipos ENUM
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE cinegestion.user_role AS ENUM ('ADMIN', 'USER', 'CINEFILO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE cinegestion.order_status AS ENUM ('PENDING','CONFIRMED','CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE cinegestion.ticket_status AS ENUM ('RESERVED','CONFIRMED','CANCELLED','EXPIRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE cinegestion.payment_status AS ENUM ('INITIATED','APPROVED','REJECTED','PENDING');
  END IF;
END $$;

-- =====================================================
-- USUARIOS Y AUTENTICACIÓN (versión extendida)
-- =====================================================
SET search_path TO cinegestion, public;

-- ENUM para tipo de documento
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    CREATE TYPE cinegestion.document_type AS ENUM ('CC','CE','PP'); -- Cédula, Extranjería, Pasaporte
  END IF;
END $$;

-- RF-01 y RF-02: Tabla de usuarios (extendida)
CREATE TABLE IF NOT EXISTS cinegestion.users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            CITEXT UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,                       -- bcrypt
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  role             cinegestion.user_role NOT NULL DEFAULT 'USER',

  -- Campos nuevos
  phone            TEXT,                                -- E.164 recomendado (+57...)
  document_type    cinegestion.document_type,
  document_number  TEXT,
  birth_date       DATE,                                -- para control +18 en negocio

  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Validaciones
  CONSTRAINT email_format CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$'),
  CONSTRAINT chk_birth_date_not_future CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE),
  -- Si uno de document_type/document_number viene, deben venir ambos
  CONSTRAINT chk_document_by_age
    CHECK (
      (birth_date IS NULL AND document_type IS NULL AND document_number IS NULL)
      OR
      (birth_date > (CURRENT_DATE - INTERVAL '18 years') AND document_type IS NULL AND document_number IS NULL)
      OR
      (birth_date <= (CURRENT_DATE - INTERVAL '18 years') AND document_type IS NOT NULL AND document_number IS NOT NULL)
    ),

  -- Teléfono con patrón E.164 básico (opcional)
  CONSTRAINT chk_phone_e164
    CHECK (phone IS NULL OR phone ~ '^\+?[1-9][0-9]{7,14}$')
);

-- Índices / Únicos
CREATE INDEX IF NOT EXISTS idx_users_email ON cinegestion.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON cinegestion.users(role);

-- Único para (tipo, número) cuando ambos existen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'cinegestion' AND indexname = 'uq_users_document_pair'
  ) THEN
    CREATE UNIQUE INDEX uq_users_document_pair
      ON cinegestion.users (document_type, document_number)
      WHERE document_type IS NOT NULL AND document_number IS NOT NULL;
  END IF;
END $$;

-- (Opcional) Único para phone cuando exista
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone
--   ON cinegestion.users(phone) WHERE phone IS NOT NULL;

-- =====================================================
-- RF-02: Sesiones JWT para auditoría y revocación (igual)
-- =====================================================
CREATE TABLE IF NOT EXISTS cinegestion.user_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES cinegestion.users(id) ON DELETE CASCADE,
  jwt_id        UUID NOT NULL,               -- jti del token JWT
  expires_at    TIMESTAMPTZ NOT NULL,        -- expiración del token (app)
  device_info   TEXT,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, jwt_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires
  ON cinegestion.user_sessions(user_id, expires_at);

ALTER TABLE cinegestion.users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verify_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS verify_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verify_attempts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resend_after TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON cinegestion.users(email_verified_at);


-- =====================================================
-- PELÍCULAS Y CONTENIDO
-- =====================================================

-- RF-03: Géneros de películas
CREATE TABLE IF NOT EXISTS cinegestion.genres (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RF-03, RF-08: Películas (CA-1 de RF-08: campos obligatorios)
CREATE TABLE IF NOT EXISTS cinegestion.movies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Datos locales (tu app)
  title            TEXT NOT NULL,                      -- CA-1 RF-08: obligatorio
  synopsis         TEXT NOT NULL,                      -- CA-1 RF-08: obligatorio
  year             INT  NOT NULL,                      -- CA-1 RF-08: año estreno
  duration_min     INT  NOT NULL CHECK (duration_min > 0), -- CA-1 RF-08: duración
  classification   TEXT NOT NULL,                      -- CA-1 RF-08: +7, +12, +18, TP
  poster_url       TEXT NOT NULL,                      -- CA-1 RF-08: póster
  trailer_url      TEXT,                               -- CA-1 RF-08: trailer (opcional)
  producer         TEXT NOT NULL,                      -- CA-1 RF-08: productora

  -- 🔗 Enlace a proveedor externo (TMDB)
  external_source  TEXT,                               -- p.ej. 'TMDB'
  external_id      TEXT,                               -- id del proveedor
  original_title   TEXT,
  original_language TEXT,
  metadata         JSONB,                              -- cache compacto (ids de géneros, paths, etc.)
  last_synced_at   TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Validaciones
  CONSTRAINT valid_year CHECK (year >= 1900 AND year <= EXTRACT(YEAR FROM now()) + 2),
  CONSTRAINT valid_classification CHECK (classification IN ('+7', '+12', '+18', 'TP'))
);

-- 🔧 Parche: si la tabla ya existía sin columnas nuevas, agrégalas
ALTER TABLE cinegestion.movies
  ADD COLUMN IF NOT EXISTS external_source     TEXT,
  ADD COLUMN IF NOT EXISTS external_id         TEXT,
  ADD COLUMN IF NOT EXISTS original_title      TEXT,
  ADD COLUMN IF NOT EXISTS original_language   TEXT,
  ADD COLUMN IF NOT EXISTS metadata            JSONB,
  ADD COLUMN IF NOT EXISTS last_synced_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT now();

-- Índices
CREATE INDEX IF NOT EXISTS idx_movies_title_fts ON cinegestion.movies 
  USING GIN (to_tsvector('spanish', title));
CREATE INDEX IF NOT EXISTS idx_movies_year ON cinegestion.movies(year DESC);

-- Unicidad por proveedor+id (cuando existan)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='cinegestion' AND indexname='uq_movies_external'
  ) THEN
    CREATE UNIQUE INDEX uq_movies_external
      ON cinegestion.movies (external_source, external_id)
      WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
  END IF;
END $$;

-- RF-06: Personas (actores/directores) para recomendaciones
CREATE TABLE IF NOT EXISTS cinegestion.people (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  bio            TEXT,

  -- 🔗 Enlace a proveedor externo (TMDB)
  external_source TEXT,          -- p.ej. 'TMDB'
  external_id     TEXT,          -- id TMDB
  metadata        JSONB,         -- cache (profile_path, popularidad, etc.)
  last_synced_at  TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 🔧 Parche: si la tabla ya existía sin columnas nuevas, agrégalas
ALTER TABLE cinegestion.people
  ADD COLUMN IF NOT EXISTS external_source   TEXT,
  ADD COLUMN IF NOT EXISTS external_id       TEXT,
  ADD COLUMN IF NOT EXISTS metadata          JSONB,
  ADD COLUMN IF NOT EXISTS last_synced_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_people_name ON cinegestion.people(name);

-- Unicidad por proveedor+id (cuando existan)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='cinegestion' AND indexname='uq_people_external'
  ) THEN
    CREATE UNIQUE INDEX uq_people_external
      ON cinegestion.people (external_source, external_id)
      WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
  END IF;
END $$;



-- Roles en producción
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crew_role') THEN
    CREATE TYPE cinegestion.crew_role AS ENUM ('ACTOR','DIRECTOR','PRODUCER');
  END IF;
END $$;

-- Créditos de película (cast & crew)
CREATE TABLE IF NOT EXISTS cinegestion.movie_credits (
  movie_id   UUID NOT NULL REFERENCES cinegestion.movies(id) ON DELETE CASCADE,
  person_id  UUID NOT NULL REFERENCES cinegestion.people(id) ON DELETE RESTRICT,
  role       cinegestion.crew_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  PRIMARY KEY (movie_id, person_id, role)
);

CREATE INDEX IF NOT EXISTS idx_credits_movie ON cinegestion.movie_credits(movie_id);
CREATE INDEX IF NOT EXISTS idx_credits_person ON cinegestion.movie_credits(person_id);

-- =====================================================
-- CINES, SALAS Y ASIENTOS
-- =====================================================

-- Cines
CREATE TABLE IF NOT EXISTS cinegestion.cinemas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  location   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Salas de cine
CREATE TABLE IF NOT EXISTS cinegestion.rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cinema_id  UUID NOT NULL REFERENCES cinegestion.cinemas(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  capacity   INT NOT NULL CHECK (capacity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (cinema_id, name)
);

-- Tipo de asiento
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seat_type') THEN
    CREATE TYPE cinegestion.seat_type AS ENUM ('GENERAL','PREFERENCIAL','VIP');
  END IF;
END $$;

-- RF-04: Asientos (CA-2: localidades General/Preferencial)
CREATE TABLE IF NOT EXISTS cinegestion.seats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES cinegestion.rooms(id) ON DELETE CASCADE,
  seat_row    TEXT NOT NULL,                    -- A, B, C...
  seat_col    INT  NOT NULL CHECK (seat_col > 0), -- 1, 2, 3...
  seat_label  TEXT GENERATED ALWAYS AS (seat_row || seat_col) STORED, -- A1, B5
  seat_type   cinegestion.seat_type NOT NULL DEFAULT 'GENERAL', -- RF-04 CA-2
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (room_id, seat_row, seat_col)
);

CREATE INDEX IF NOT EXISTS idx_seats_room ON cinegestion.seats(room_id);

-- =====================================================
-- FUNCIONES (SHOWTIMES) Y PRECIOS
-- =====================================================

-- RF-03, RF-08, RF-09: Funciones de cine
CREATE TABLE IF NOT EXISTS cinegestion.showtimes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id     UUID NOT NULL REFERENCES cinegestion.movies(id) ON DELETE CASCADE,
  room_id      UUID NOT NULL REFERENCES cinegestion.rooms(id) ON DELETE RESTRICT,
  starts_at    TIMESTAMPTZ NOT NULL,            -- RF-03 CA-9: día y hora
  language     TEXT NOT NULL DEFAULT 'ES',       -- RF-03 CA-3: idioma
  subtitles    TEXT,                             -- RF-03 CA-3: subtítulos
  format       TEXT NOT NULL DEFAULT '2D',       -- RF-09 CA-1: 2D, 3D, IMAX, VIP
  base_price   NUMERIC(12,2) NOT NULL CHECK (base_price >= 0), -- RF-09 CA-1
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- RF-08 CA-4: No puede haber dos funciones en la misma sala al mismo tiempo
  UNIQUE (room_id, starts_at),
  
  CONSTRAINT valid_language CHECK (language IN ('ES', 'EN', 'FR', 'PT')),
  CONSTRAINT valid_format CHECK (format IN ('2D', '3D', 'IMAX', 'VIP'))
);

CREATE INDEX IF NOT EXISTS idx_showtimes_movie_starts ON cinegestion.showtimes(movie_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_showtimes_starts_at ON cinegestion.showtimes(starts_at);

-- RF-09: Promociones
CREATE TABLE IF NOT EXISTS cinegestion.promotions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  starts_at    TIMESTAMPTZ NOT NULL,            -- RF-09 CA-4: inicio
  ends_at      TIMESTAMPTZ NOT NULL,            -- RF-09 CA-4: fin
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,   -- RF-09 CA-6: activar/desactivar
  discount_pct NUMERIC(5,2) CHECK (discount_pct >= 0 AND discount_pct <= 100),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_promotions_active_dates ON cinegestion.promotions(is_active, starts_at, ends_at);

-- RF-09: Reglas dinámicas de precio
CREATE TABLE IF NOT EXISTS cinegestion.price_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type        TEXT NOT NULL,                           -- 'DIA_SEMANA' | 'ESTRENO' | 'DEMANDA'
  day_of_week      INT CHECK (day_of_week BETWEEN 0 AND 6), -- RF-09 CA-2: día semana
  occupancy_gt_pct INT CHECK (occupancy_gt_pct BETWEEN 0 AND 100), -- RF-09 CA-2: demanda
  price_delta_pct  NUMERIC(5,2) NOT NULL,                   -- +/- porcentaje
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_rule_type CHECK (rule_type IN ('DIA_SEMANA', 'ESTRENO', 'DEMANDA'))
);

-- Vincular promociones a funciones específicas
CREATE TABLE IF NOT EXISTS cinegestion.promotion_showtimes (
  promotion_id UUID NOT NULL REFERENCES cinegestion.promotions(id) ON DELETE CASCADE,
  showtime_id  UUID NOT NULL REFERENCES cinegestion.showtimes(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, showtime_id)
);

-- =====================================================
-- ÓRDENES, TICKETS Y PAGOS
-- =====================================================

-- RF-04: Órdenes de compra
CREATE TABLE IF NOT EXISTS cinegestion.orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES cinegestion.users(id) ON DELETE RESTRICT,
  status         cinegestion.order_status NOT NULL DEFAULT 'PENDING',
  currency       TEXT NOT NULL DEFAULT 'COP',
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  expires_at     TIMESTAMPTZ,                    -- RF-04 CA-3: 10 min para completar
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON cinegestion.orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON cinegestion.orders(status);

-- RF-04: Tickets (boletas)
CREATE TABLE IF NOT EXISTS cinegestion.tickets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES cinegestion.orders(id) ON DELETE CASCADE,
  showtime_id    UUID NOT NULL REFERENCES cinegestion.showtimes(id) ON DELETE RESTRICT,
  seat_id        UUID NOT NULL REFERENCES cinegestion.seats(id) ON DELETE RESTRICT,
  unit_price     NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  status         cinegestion.ticket_status NOT NULL DEFAULT 'RESERVED',
  reserved_until TIMESTAMPTZ,                    -- RF-04 CA-3: ventana de reserva
  qr_code        TEXT,                           -- RF-04 CA-11: código QR
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- RF-04 CA-1: un usuario puede tener múltiples tickets en la misma orden
  UNIQUE (order_id, showtime_id, seat_id)
);

-- CRÍTICO: Evitar oversell - RF-04 CA-9.e
-- Un asiento solo puede tener UN ticket activo por función
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_ticket_per_seat
ON cinegestion.tickets (showtime_id, seat_id)
WHERE status IN ('RESERVED','CONFIRMED');

CREATE INDEX IF NOT EXISTS idx_tickets_showtime ON cinegestion.tickets(showtime_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON cinegestion.tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_reserved_until ON cinegestion.tickets(reserved_until) 
WHERE status = 'RESERVED';

-- RF-04: Pagos (CA-8: PCI DSS, PSE)
CREATE TABLE IF NOT EXISTS cinegestion.payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES cinegestion.orders(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,                   -- PayU, PlacetoPay, MercadoPago
  provider_tx_id    TEXT NOT NULL,
  status            cinegestion.payment_status NOT NULL DEFAULT 'INITIATED',
  amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency          TEXT NOT NULL DEFAULT 'COP',
  approved_at       TIMESTAMPTZ,
  raw_payload       JSONB,                          -- webhook completo
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (provider, provider_tx_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON cinegestion.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON cinegestion.payments(status);

-- RF-04 CA-9.d: Idempotencia para evitar duplicados
CREATE TABLE IF NOT EXISTS cinegestion.idempotency_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES cinegestion.users(id) ON DELETE SET NULL,
  key           TEXT UNIQUE NOT NULL,              -- UUID generado por cliente
  request_hash  TEXT,                              -- hash del request
  response_code INT,
  response_body JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL               -- 24 horas típicamente
);

CREATE INDEX IF NOT EXISTS idx_idempotency_key ON cinegestion.idempotency_keys(key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON cinegestion.idempotency_keys(expires_at);

-- =====================================================
-- RESEÑAS Y CALIFICACIONES
-- =====================================================

-- RF-05: Calificaciones y reseñas
CREATE TABLE IF NOT EXISTS cinegestion.ratings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES cinegestion.users(id) ON DELETE CASCADE,
  movie_id   UUID NOT NULL REFERENCES cinegestion.movies(id) ON DELETE CASCADE,
  stars      INT NOT NULL CHECK (stars BETWEEN 1 AND 5),     -- RF-05 CA-1
  review     TEXT,                                            -- RF-05 CA-3: opcional
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,                -- RF-05 CA-3: validación
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- RF-05 CA-6: un usuario solo puede calificar una vez por película
  UNIQUE (user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_movie ON cinegestion.ratings(movie_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user ON cinegestion.ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_approved ON cinegestion.ratings(is_approved);

-- =====================================================
-- LISTAS DE FAVORITOS (WATCHLISTS)
-- =====================================================

-- RF-07: Listas personalizadas
CREATE TABLE IF NOT EXISTS cinegestion.watchlists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES cinegestion.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                        -- RF-07 CA-1: nombre libre
  is_public  BOOLEAN NOT NULL DEFAULT FALSE,       -- RF-07 CA-1: pública/privada
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- RF-07: un usuario no puede tener listas con el mismo nombre
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user ON cinegestion.watchlists(user_id);

-- RF-07: Items de las listas
CREATE TABLE IF NOT EXISTS cinegestion.watchlist_items (
  watchlist_id UUID NOT NULL REFERENCES cinegestion.watchlists(id) ON DELETE CASCADE,
  movie_id     UUID NOT NULL REFERENCES cinegestion.movies(id) ON DELETE CASCADE,
  is_watched   BOOLEAN NOT NULL DEFAULT FALSE,     -- RF-07 CA-7: vista/no vista
  watch_date   DATE,                               -- RF-07 CA-7: fecha programada
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- RF-07 CA-9: una película no se puede duplicar en la misma lista
  PRIMARY KEY (watchlist_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_movie ON cinegestion.watchlist_items(movie_id);

-- =====================================================
-- NOTIFICACIONES
-- =====================================================

-- RF-10: Notificaciones
CREATE TABLE IF NOT EXISTS cinegestion.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES cinegestion.users(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL,                      -- 'EMAIL' | 'PUSH' | 'IN_APP'
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  meta         JSONB,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_channel CHECK (channel IN ('EMAIL', 'PUSH', 'IN_APP'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON cinegestion.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON cinegestion.notifications(created_at DESC);

-- RF-10: Preferencias de notificaciones
CREATE TABLE IF NOT EXISTS cinegestion.user_notification_prefs (
  user_id           UUID PRIMARY KEY REFERENCES cinegestion.users(id) ON DELETE CASCADE,
  premieres         BOOLEAN NOT NULL DEFAULT TRUE,    -- RF-10 CA-1: estrenos
  schedule_changes  BOOLEAN NOT NULL DEFAULT TRUE,    -- RF-10 CA-1: cambios horario
  promos            BOOLEAN NOT NULL DEFAULT TRUE,    -- RF-10 CA-1: promociones
  recommendations   BOOLEAN NOT NULL DEFAULT TRUE,    -- RF-10 CA-1: recomendaciones
  frequency         TEXT NOT NULL DEFAULT 'IMMEDIATE', -- RF-10 CA-3: IMMEDIATE/DAILY/WEEKLY
  
  CONSTRAINT valid_frequency CHECK (frequency IN ('IMMEDIATE', 'DAILY', 'WEEKLY'))
);

-- =====================================================
-- AUDITORÍA
-- =====================================================

-- RF-08 CA-5 y CA-6: Logs de auditoría
CREATE TABLE IF NOT EXISTS cinegestion.audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  UUID REFERENCES cinegestion.users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL,                    -- 'CREATE','UPDATE','DELETE'
  entity         TEXT NOT NULL,                    -- 'movie','showtime','price_rule'
  entity_id      UUID,
  previous_value JSONB,                            -- RF-08 CA-5: valor anterior
  new_value      JSONB,                            -- RF-08 CA-5: valor nuevo
  ip_address     INET,                             -- RF-08 CA-6: IP origen
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_action CHECK (action IN ('CREATE', 'UPDATE', 'DELETE'))
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON cinegestion.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON cinegestion.audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON cinegestion.audit_logs(created_at DESC);

-- =====================================================
-- TRIGGERS Y FUNCIONES
-- =====================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION cinegestion.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar triggers a tablas relevantes
DO $$
BEGIN
  -- Users
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
    CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON cinegestion.users
    FOR EACH ROW EXECUTE FUNCTION cinegestion.set_updated_at();
  END IF;
  
  -- Movies
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_movies_updated_at') THEN
    CREATE TRIGGER trg_movies_updated_at
    BEFORE UPDATE ON cinegestion.movies
    FOR EACH ROW EXECUTE FUNCTION cinegestion.set_updated_at();
  END IF;
  
  -- Showtimes
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_showtimes_updated_at') THEN
    CREATE TRIGGER trg_showtimes_updated_at
    BEFORE UPDATE ON cinegestion.showtimes
    FOR EACH ROW EXECUTE FUNCTION cinegestion.set_updated_at();
  END IF;
  
  -- Orders
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_orders_updated_at') THEN
    CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON cinegestion.orders
    FOR EACH ROW EXECUTE FUNCTION cinegestion.set_updated_at();
  END IF;
  
  -- Ratings
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ratings_updated_at') THEN
    CREATE TRIGGER trg_ratings_updated_at
    BEFORE UPDATE ON cinegestion.ratings
    FOR EACH ROW EXECUTE FUNCTION cinegestion.set_updated_at();
  END IF;
  
  -- Promotions
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_promotions_updated_at') THEN
    CREATE TRIGGER trg_promotions_updated_at
    BEFORE UPDATE ON cinegestion.promotions
    FOR EACH ROW EXECUTE FUNCTION cinegestion.set_updated_at();
  END IF;
END $$;

-- Función para limpiar reservas expiradas (job periódico)
CREATE OR REPLACE FUNCTION cinegestion.cleanup_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  -- Liberar tickets reservados que expiraron
  UPDATE cinegestion.tickets
  SET status = 'EXPIRED'
  WHERE status = 'RESERVED'
    AND reserved_until < now();
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- DATOS INICIALES (SEEDS)
-- =====================================================

-- Géneros básicos
INSERT INTO cinegestion.genres (id, name) VALUES
  (gen_random_uuid(), 'Acción'),
  (gen_random_uuid(), 'Aventura'),
  (gen_random_uuid(), 'Comedia'),
  (gen_random_uuid(), 'Drama'),
  (gen_random_uuid(), 'Ciencia Ficción'),
  (gen_random_uuid(), 'Terror'),
  (gen_random_uuid(), 'Romance'),
  (gen_random_uuid(), 'Thriller'),
  (gen_random_uuid(), 'Animación'),
  (gen_random_uuid(), 'Documental')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- NOTA:
-- Para mantener el esquema limpio en repositorios públicos,
-- no se insertan usuarios ni contraseñas aquí.
--
-- Si deseas crear usuarios de prueba o datos de desarrollo,
-- utiliza un archivo separado:  sql/02_seed_dev.sql
-- =====================================================

-- =====================================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- =====================================================

COMMENT ON SCHEMA cinegestion IS 'Esquema principal de CineGestión - Sistema de gestión de salas de cine';

-- Usuarios
COMMENT ON TABLE cinegestion.users IS 'RF-01, RF-02: Usuarios del sistema con roles diferenciados';
COMMENT ON COLUMN cinegestion.users.password_hash IS 'CA-8: Contraseña encriptada con bcrypt (nunca en texto plano)';
COMMENT ON COLUMN cinegestion.users.last_login_at IS 'RF-02 CA-4: Registro de auditoría del último acceso';

-- Películas y personas

COMMENT ON COLUMN cinegestion.movies.external_source IS 'Proveedor externo de catálogo (p.ej., TMDB)';
COMMENT ON COLUMN cinegestion.movies.external_id IS 'ID del título en el proveedor externo';
COMMENT ON COLUMN cinegestion.movies.metadata IS 'Cache resumido del proveedor (JSONB)';
COMMENT ON COLUMN cinegestion.movies.last_synced_at IS 'Última sincronización con proveedor externo';

COMMENT ON COLUMN cinegestion.people.external_source IS 'Proveedor externo (TMDB)';
COMMENT ON COLUMN cinegestion.people.external_id IS 'ID de la persona en el proveedor externo';
COMMENT ON COLUMN cinegestion.people.metadata IS 'Cache resumido del proveedor (JSONB)';
COMMENT ON COLUMN cinegestion.people.last_synced_at IS 'Última sincronización con proveedor externo';


-- Tickets y prevención de oversell
COMMENT ON TABLE cinegestion.tickets IS 'RF-04: Boletas de cine con sistema anti-oversell';
COMMENT ON INDEX cinegestion.uq_active_ticket_per_seat IS 'CRÍTICO: Previene oversell - solo un ticket activo por asiento/función';
COMMENT ON COLUMN cinegestion.tickets.reserved_until IS 'RF-04 CA-3: Ventana de 10 minutos para completar el pago';
COMMENT ON COLUMN cinegestion.tickets.qr_code IS 'RF-04 CA-11: Código QR único para validación en sala';

-- Idempotencia
COMMENT ON TABLE cinegestion.idempotency_keys IS 'RF-04 CA-9.d: Evita duplicados en reintentos de checkout y webhooks';

-- Auditoría
COMMENT ON TABLE cinegestion.audit_logs IS 'RF-08 CA-5,CA-6: Bitácora inmutable de cambios críticos';

-- Promociones
COMMENT ON TABLE cinegestion.promotions IS 'RF-09: Sistema de promociones dinámicas con vigencia temporal';
COMMENT ON TABLE cinegestion.price_rules IS 'RF-09 CA-2: Reglas automáticas de ajuste de precio';

-- Calificaciones
COMMENT ON TABLE cinegestion.ratings IS 'RF-05: Sistema de calificaciones con validación automática';
COMMENT ON COLUMN cinegestion.ratings.is_approved IS 'RF-05 CA-3: Moderación automática de reseñas';

-- Notificaciones
COMMENT ON TABLE cinegestion.user_notification_prefs IS 'RF-10 CA-1: Preferencias granulares de notificaciones por usuario';

-- =====================================================
-- VISTAS ÚTILES PARA REPORTES
-- =====================================================

-- Vista de ocupación de funciones
CREATE OR REPLACE VIEW cinegestion.v_showtime_occupancy AS
SELECT 
  s.id AS showtime_id,
  m.title AS movie_title,
  s.starts_at,
  r.capacity AS room_capacity,
  COUNT(t.id) FILTER (WHERE t.status IN ('RESERVED', 'CONFIRMED')) AS tickets_sold,
  ROUND(
    (COUNT(t.id) FILTER (WHERE t.status IN ('RESERVED', 'CONFIRMED'))::NUMERIC / r.capacity) * 100,
    2
  ) AS occupancy_percentage
FROM cinegestion.showtimes s
JOIN cinegestion.movies m ON s.movie_id = m.id
JOIN cinegestion.rooms r ON s.room_id = r.id
LEFT JOIN cinegestion.tickets t ON s.id = t.showtime_id
GROUP BY s.id, m.title, s.starts_at, r.capacity;

-- Vista de películas con calificación promedio
CREATE OR REPLACE VIEW cinegestion.v_movies_with_ratings AS
SELECT 
  m.*,
  COUNT(r.id) AS total_ratings,
  ROUND(AVG(r.stars), 2) AS avg_rating
FROM cinegestion.movies m
LEFT JOIN cinegestion.ratings r ON m.id = r.movie_id AND r.is_approved = TRUE
GROUP BY m.id;

-- =====================================================
-- PERMISOS (OPCIONAL - ajustar según deployment)
-- =====================================================

-- Crear roles de base de datos
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cinegest_app') THEN
--     CREATE ROLE cinegest_app WITH LOGIN PASSWORD 'cambiar_en_produccion';
--   END IF;
-- END $$;

-- GRANT USAGE ON SCHEMA cinegestion TO cinegest_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cinegestion TO cinegest_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA cinegestion TO cinegest_app;

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

-- Verificar que todas las tablas se crearon correctamente
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'cinegestion';
  
  RAISE NOTICE 'Schema cinegestion creado exitosamente con % tablas', table_count;
END $$;
