-- Run after migration + app sync to verify Niik manual tricks only
SELECT
  COUNT(*) FILTER (WHERE is_active) AS active_tricks,
  COUNT(*) FILTER (WHERE NOT is_active) AS inactive_legacy,
  COUNT(*) FILTER (WHERE is_active AND manual_id IS NOT NULL) AS active_with_excel_id,
  MIN(manual_id) FILTER (WHERE is_active) AS min_id,
  MAX(manual_id) FILTER (WHERE is_active) AS max_id
FROM skills_library;

-- Expect: active_tricks = 320, active_with_excel_id = 320, min_id = 1, max_id = 320
-- If active_tricks > 320, open Skate Program → Trucos and click "Sincronizar Excel"
