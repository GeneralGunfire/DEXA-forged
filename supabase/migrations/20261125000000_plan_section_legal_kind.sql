-- gw_plan_sections was created outside this repo (no migration here defines it).
-- This file only changes the kind check, adding 'legal'. No data changes.
alter table public.gw_plan_sections drop constraint gw_plan_sections_kind_check;
alter table public.gw_plan_sections add constraint gw_plan_sections_kind_check
  check (kind = any (array['background','connection','gateway_fit','build_approach','how_it_works','legal']::text[]));
