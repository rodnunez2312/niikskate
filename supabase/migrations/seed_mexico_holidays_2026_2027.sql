-- Seed Mexican national holidays (LFT Art. 74) for 2026–2027 into school calendar.
-- Safe to re-run: skips dates that already have a holiday event with the same title.

INSERT INTO school_calendar_events (
  title,
  event_type,
  start_date,
  end_date,
  all_day,
  visible_to_parents,
  description
)
SELECT v.title, 'holiday', v.d::date, NULL, true, true, v.descr
FROM (
  VALUES
    ('2026-01-01', 'Año Nuevo', 'Descanso obligatorio (LFT)'),
    ('2026-02-02', 'Día de la Constitución', 'Descanso obligatorio — primer lunes de febrero (LFT)'),
    ('2026-03-16', 'Natalicio de Benito Juárez', 'Descanso obligatorio — tercer lunes de marzo (LFT)'),
    ('2026-05-01', 'Día del Trabajo', 'Descanso obligatorio (LFT)'),
    ('2026-09-16', 'Día de la Independencia', 'Descanso obligatorio (LFT)'),
    ('2026-11-16', 'Día de la Revolución', 'Descanso obligatorio — tercer lunes de noviembre (LFT)'),
    ('2026-12-25', 'Navidad', 'Descanso obligatorio (LFT)'),
    ('2027-01-01', 'Año Nuevo', 'Descanso obligatorio (LFT)'),
    ('2027-02-01', 'Día de la Constitución', 'Descanso obligatorio — primer lunes de febrero (LFT)'),
    ('2027-03-15', 'Natalicio de Benito Juárez', 'Descanso obligatorio — tercer lunes de marzo (LFT)'),
    ('2027-05-01', 'Día del Trabajo', 'Descanso obligatorio (LFT)'),
    ('2027-09-16', 'Día de la Independencia', 'Descanso obligatorio (LFT)'),
    ('2027-11-15', 'Día de la Revolución', 'Descanso obligatorio — tercer lunes de noviembre (LFT)'),
    ('2027-12-25', 'Navidad', 'Descanso obligatorio (LFT)')
) AS v(d, title, descr)
WHERE NOT EXISTS (
  SELECT 1
  FROM school_calendar_events e
  WHERE e.event_type = 'holiday'
    AND e.start_date = v.d::date
    AND e.title = v.title
);
