-- A Disabled User (better-auth's `banned`) can no longer be named Foreman or Driver. Only a new or changed person is
-- checked: Job writes rewrite foreman_user_id unchanged, and a past Job that still names a Disabled User (or someone
-- whose role has since changed) must stay editable.
CREATE OR REPLACE FUNCTION contracting.check_job_foreman() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.foreman_user_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.foreman_user_id IS DISTINCT FROM OLD.foreman_user_id) THEN
    PERFORM 1 FROM public."user"
      WHERE id = NEW.foreman_user_id AND contracting_role = 'foreman' AND banned IS NOT TRUE FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Select a person with the Contracting foreman role.'
        USING ERRCODE = '23503', CONSTRAINT = 'job_foreman_role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION contracting.protect_assigned_foreman_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contracting_role IS DISTINCT FROM 'foreman'
    AND EXISTS (SELECT 1 FROM contracting.job WHERE foreman_user_id = OLD.id AND status IN ('upcoming', 'active')) THEN
    RAISE EXCEPTION 'Reassign this foreman''s open Jobs before changing their role, disabling or removing them.'
      USING ERRCODE = '23503', CONSTRAINT = 'job_foreman_role';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION contracting.check_machine_assignment_driver() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.driver_user_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.driver_user_id IS DISTINCT FROM OLD.driver_user_id) THEN
    PERFORM 1 FROM public."user"
      WHERE id = NEW.driver_user_id AND contracting_role = 'driver' AND banned IS NOT TRUE FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Select a person with the Contracting driver role.'
        USING ERRCODE = '23503', CONSTRAINT = 'machine_assignment_driver_role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION contracting.protect_assignment_driver_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contracting_role IS DISTINCT FROM 'driver'
    AND EXISTS (
      SELECT 1
      FROM contracting.machine_assignment assignment
      JOIN contracting.job ON contracting.job.id = assignment.job_id
      WHERE assignment.driver_user_id = OLD.id AND contracting.job.status IN ('upcoming', 'active')
    ) THEN
    RAISE EXCEPTION 'Reassign this driver''s open Machine Assignments before changing their role, disabling or removing them.'
      USING ERRCODE = '23503', CONSTRAINT = 'machine_assignment_driver_role';
  END IF;
  RETURN NEW;
END;
$$;
