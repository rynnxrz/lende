-- ============================================================
-- Migration: Add 'archived' status to reservations
-- Purpose: Allow archiving reservations to release dates
-- ============================================================

-- 1. Add 'archived' to the reservation_status ENUM type
-- 2026-05-07 patch (BRIEF-47 §7.3 unblock): 00001 把 reservations.status 定为 TEXT+CHECK，
-- 原 ALTER 假设 ENUM 存在是错的——ENUM 实际在 prod Supabase dashboard 手动创建（参 00058 注释）。
-- 干净本地 db 跑此行会撞 "type reservation_status does not exist"。后续 00039 重建 ENUM（含 archived
-- compat 路径）+ 00058 codify 新 7-value enum，'archived' 在新 schema 已不使用。
-- 故改为 idempotent guard：type 存在则 best-effort ADD VALUE；不存在则 NO-OP（00039+00058 接管）。
-- prod schema_migrations 已记录本 migration 跑过，不会重跑——本改动只影响本地干净 db。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
    BEGIN
      EXECUTE 'ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS ''archived''';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[00006] ALTER TYPE skipped: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE '[00006] reservation_status ENUM not yet created — skip ADD VALUE (00039+00058 接管)';
  END IF;
END$$;

-- 2. Create restore_reservation RPC function
-- Attempts to restore an archived reservation to 'confirmed' status
-- Only succeeds if the dates are still available
CREATE OR REPLACE FUNCTION restore_reservation(p_reservation_id UUID)
RETURNS JSON AS $$
DECLARE
  v_reservation RECORD;
  v_is_available BOOLEAN;
BEGIN
  -- Get the reservation
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Reservation not found');
  END IF;
  
  IF v_reservation.status != 'archived' THEN
    RETURN json_build_object('success', false, 'error', 'Only archived reservations can be restored');
  END IF;
  
  -- Check if dates are available (exclude this reservation from check)
  SELECT check_item_availability(
    v_reservation.item_id,
    v_reservation.start_date::DATE,
    v_reservation.end_date::DATE,
    p_reservation_id
  ) INTO v_is_available;
  
  IF NOT v_is_available THEN
    RETURN json_build_object('success', false, 'error', 'Dates are no longer available. Another reservation occupies this time slot.');
  END IF;
  
  -- Restore the reservation
  UPDATE reservations SET status = 'confirmed' WHERE id = p_reservation_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION restore_reservation(UUID) TO authenticated;
