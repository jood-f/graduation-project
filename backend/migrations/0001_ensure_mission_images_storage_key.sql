-- Migration: ensure `storage_key` exists on mission_images and is NOT NULL
-- Timestamp: 2026-02-17

DO $$
BEGIN
  -- add column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mission_images' AND column_name = 'storage_key'
  ) THEN
    ALTER TABLE public.mission_images ADD COLUMN storage_key text;
  END IF;

  -- populate from storage_path for backward compatibility
  UPDATE public.mission_images SET storage_key = storage_path WHERE storage_key IS NULL;

  -- make column NOT NULL going forward
  ALTER TABLE public.mission_images ALTER COLUMN storage_key SET NOT NULL;
END
$$;
