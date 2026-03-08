
ALTER TABLE public.user_ai_settings 
  ADD COLUMN day_boundary_hour integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.validate_day_boundary_hour()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.day_boundary_hour < 0 OR NEW.day_boundary_hour > 12 THEN
    RAISE EXCEPTION 'day_boundary_hour must be between 0 and 12'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_day_boundary_hour
  BEFORE INSERT OR UPDATE ON public.user_ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_day_boundary_hour();
