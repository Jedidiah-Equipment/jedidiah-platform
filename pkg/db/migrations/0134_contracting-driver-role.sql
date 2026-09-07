-- Role eligibility spans a Machine and a public User, so a CHECK cannot express it.
-- Both write directions participate: assignment takes a share lock on the User, and a
-- role change holds its update lock while checking assignments. Concurrent changes fail closed.
CREATE FUNCTION contracting.check_machine_driver() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_driver_user_id IS NOT NULL THEN
    PERFORM 1 FROM public."user"
      WHERE id = NEW.current_driver_user_id AND contracting_role = 'driver' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Select a person with the Contracting driver role.'
        USING ERRCODE = '23503', CONSTRAINT = 'machine_driver_role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER machine_driver_role
  BEFORE INSERT OR UPDATE OF current_driver_user_id ON contracting.machine
  FOR EACH ROW EXECUTE FUNCTION contracting.check_machine_driver();
--> statement-breakpoint
CREATE FUNCTION contracting.protect_assigned_driver_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contracting_role IS DISTINCT FROM 'driver'
    AND EXISTS (SELECT 1 FROM contracting.machine WHERE current_driver_user_id = OLD.id) THEN
    RAISE EXCEPTION 'Unassign this driver from Contracting Machines before changing their role.'
      USING ERRCODE = '23503', CONSTRAINT = 'machine_driver_role';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contracting_assigned_driver_role
  BEFORE UPDATE OF contracting_role ON public."user"
  FOR EACH ROW EXECUTE FUNCTION contracting.protect_assigned_driver_role();
