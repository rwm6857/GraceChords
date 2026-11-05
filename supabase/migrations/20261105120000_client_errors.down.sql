-- Revert 20261105120000_client_errors.sql.
-- NOT data-lossless: drops the stored crash log. Nothing else depends on it;
-- with the table gone, /api/client-error still logs to Cloudflare and returns 204.

BEGIN;
DROP FUNCTION IF EXISTS public.log_client_error(text, text, text, text, text, text, text, text, text);
DROP TABLE IF EXISTS public.client_errors;
COMMIT;
