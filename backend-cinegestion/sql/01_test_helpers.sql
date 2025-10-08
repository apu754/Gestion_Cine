SET search_path TO cinegestion, public;

TRUNCATE TABLE
  cinegestion.user_sessions,
  cinegestion.users
RESTART IDENTITY CASCADE;
