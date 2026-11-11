-- Optional: one example entry per type on Public Hospital, labelled "Example (delete me)".
-- Run in the SQL Editor after the migration. Delete the entries on the site when you are done looking.
do $$
declare db uuid; err uuid;
begin
  select id into db from public.databases where slug = 'public_hospital';
  if db is null then raise exception 'Public Hospital card not found; run the migration first.'; end if;

  insert into public.timeline_entries (database_id, happened_at, type, phase, author, title, summary, session_label, created_by)
  values (db, now() - interval '2 days', 'Action', '1', 'Rajen', 'Example (delete me): started loading admissions',
          'Began copying the admission episodes into the Public Hospital database.', 'Example session', 'af1d6d0b-1068-4c5d-ac9c-f69870739367');

  insert into public.timeline_entries (database_id, happened_at, type, phase, author, title, summary, detail, status, session_label, created_by)
  values (db, now() - interval '2 days' + interval '1 hour', 'Error', '2', 'Claude Code', 'Example (delete me): admission load stopped part-way',
          'The load failed at about two-thirds and was rolled back, so no partial data was kept.',
          E'Msg 547, Level 16, State 0, Line 1\nThe INSERT statement conflicted with the FOREIGN KEY constraint "fk_episode_facility".\nRows loaded before failure: 412,000 of 612,500',
          'Resolved', 'Example session', 'af1d6d0b-1068-4c5d-ac9c-f69870739367')
  returning id into err;

  insert into public.timeline_entries (database_id, happened_at, type, phase, author, title, summary, parent_id, session_label, created_by)
  values (db, now() - interval '2 days' + interval '2 hours', 'Response', '2', 'Claude Code', 'Example (delete me): checked which facilities were missing',
          'Compared facility codes in the episodes against the facility list. 14 codes had no match.', err, 'Example session', 'af1d6d0b-1068-4c5d-ac9c-f69870739367');

  insert into public.timeline_entries (database_id, happened_at, type, phase, author, title, summary, detail, parent_id, session_label, created_by)
  values (db, now() - interval '2 days' + interval '3 hours', 'Fix', '2', 'Claude Code', 'Example (delete me): loaded facilities first, then episodes',
          'Re-ordered the load so facilities go in before admissions. All 612,500 episodes loaded.',
          E'Facilities: 3,214 rows\nEpisodes: 612,500 rows\nDuration: 41 minutes', err, 'Example session', 'af1d6d0b-1068-4c5d-ac9c-f69870739367');

  insert into public.timeline_entries (database_id, happened_at, type, phase, author, title, summary, session_label, created_by)
  values (db, now() - interval '1 day', 'Decision', '2', 'Huzayfa', 'Example (delete me): keep one hospital database per sector',
          'Public and private hospitals stay in separate databases so each can follow its own rules.', 'Example session', 'af1d6d0b-1068-4c5d-ac9c-f69870739367'),
         (db, now() - interval '1 day' + interval '30 minutes', 'Note', '2', 'Claude Code', 'Example (delete me): load counts after the fix',
          '612,500 episodes, 3,214 facilities, 0 orphan rows.', 'Example session', 'af1d6d0b-1068-4c5d-ac9c-f69870739367');
end $$;
