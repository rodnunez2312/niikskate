-- =============================================================================
-- Sync skater roster: first_name, last_name, full_name, date_of_birth, age,
-- skill_level (from Grupo), city — matched by profiles.email (case-insensitive).
--
-- Prerequisite: migration add_profiles_name_dob_age.sql applied.
-- Safe to re-run (idempotent for this roster).
--
-- DOB parsing: Jose row uses DD/MM/YY (15/02/15 → 2015-02-15). Others MM/DD/YY.
-- Ages 126 / missing DOB → NULL age or NULL DOB as noted per row.
-- =============================================================================

WITH roster AS (
  SELECT * FROM (VALUES
    -- email_lower, first_name, last_name, date_of_birth, age, skill_level
    (lower('rodrigo.sanchez@niikskate.co'), 'Rodrigo', 'Sanchez Reyes', DATE '2012-06-08', 13, 'intermediate'),
    (lower('rodrigo.sanchez@niikskate.com'), 'Rodrigo', 'Sanchez Reyes', DATE '2012-06-08', 13, 'intermediate'),
    (lower('itza.sanchez@niikskate.com'), 'Itza', 'Sanchez Reyes', DATE '2009-12-23', 16, 'intermediate'),
    (lower('kyan.bell@niikskate.com'), 'Kyan', 'Bell', DATE '2012-05-22', 13, 'beginner'),
    (lower('brooklyn.haapamaki@niikskate.com'), 'Brooklyn', 'Haapamaki', DATE '2019-02-19', 7, 'beginner'),
    (lower('edward.hill@niikskate.com'), 'Edward', 'Hill Gomez', DATE '2018-03-19', 8, 'beginner'),
    (lower('bruno.cutz@niikskate.com'), 'Bruno', 'Zamudio Cutz', DATE '2016-06-09', 9, 'beginner'),
    (lower('derek@niikskate.com'), 'Derek', 'Salinas', NULL::date, NULL::int, 'intermediate'),
    (lower('isaac.gonzalez@niikskate.com'), 'Isaac', 'Gonzalez Caro', DATE '2018-05-26', 7, 'beginner'),
    (lower('fabrizio@niikskate.com'), 'Fabrizio', NULL::text, NULL::date, NULL::int, 'beginner'),
    (lower('valentina.orozco@niikskate.com'), 'Valentina', 'Orozco Gamboa', DATE '2016-09-18', 9, 'beginner'),
    (lower('fernanda@niikskate.com'), 'Valentina', 'Orozco Gamboa', DATE '2016-09-18', 9, 'beginner'),
    (lower('alaia.dominguez@niikskate.co'), 'Alaia Rose', 'Domínguez Martin', DATE '2017-04-08', 9, 'beginner'),
    (lower('alaia.dominguez@niikskate.com'), 'Alaia Rose', 'Domínguez Martin', DATE '2017-04-08', 9, 'beginner'),
    (lower('jose.acevedo@niikskate.com'), 'Jose Maria', 'Acevedo Cardos', DATE '2015-02-15', 11, 'beginner'),
    (lower('antoine.lopez@niikskate.com'), 'Luis Antoine', 'Lopez Menchaca', DATE '2009-10-05', 16, 'beginner'),
    (lower('mateo.brito@niikskate.com'), 'Mateo', 'Brito Chi', DATE '2015-03-21', 11, 'beginner'),
    (lower('elina.ortiz@niikskate.com'), 'Katerin Elina', 'Ortiz Luna', NULL::date, NULL::int, 'beginner')
  ) AS t(email_lower, first_name, last_name, date_of_birth, age, skill_level)
)
UPDATE profiles p
SET
  first_name = r.first_name,
  last_name = r.last_name,
  full_name = NULLIF(
    trim(both ' ' FROM concat_ws(' ', nullif(trim(both ' ' FROM coalesce(r.first_name, '')), ''), nullif(trim(both ' ' FROM coalesce(r.last_name, '')), ''))),
    ''
  ),
  date_of_birth = r.date_of_birth,
  age = r.age,
  skill_level = r.skill_level,
  city = coalesce(nullif(trim(both ' ' FROM coalesce(p.city, '')), ''), 'Merida'),
  updated_at = now()
FROM roster r
WHERE lower(p.email) = r.email_lower;
