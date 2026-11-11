-- Timeline backfill, from the 11 source documents dated 10 November 2026
-- (SAHealth_Simulated_Sources_All_11_Documents.zip) plus the earlier Machine B record for the two partner databases.
-- Dates come from the documents (29 Sep, 24-27 Oct, 31 Oct, 4 Nov, 10 Nov). The time of day is not recorded, so it is a placeholder.
-- Safe to re-run: an entry with the same database and title is not added twice.

create or replace function pg_temp.tl(
  slug text, ts text, typ text, ph text, au text, ti text, su text, de text, st text, par uuid, sess text
) returns uuid language plpgsql as $f$
declare d uuid; found_id uuid; new_id uuid;
begin
  if slug is not null and slug <> 'estate' then
    select id into d from public.databases where databases.slug = tl.slug;
    if d is null then raise exception 'No database with slug %', slug; end if;
  end if;
  select id into found_id from public.timeline_entries
    where title = ti and database_id is not distinct from d limit 1;
  if found_id is not null then return found_id; end if;
  insert into public.timeline_entries
    (database_id, happened_at, type, phase, author, title, summary, detail, status, parent_id, session_label, created_by)
  values (d, ts::timestamptz, typ, ph, au, ti, su, coalesce(de, ''), st, par, sess,
          'af1d6d0b-1068-4c5d-ac9c-f69870739367')
  returning id into new_id;
  return new_id;
end $f$;

do $$
declare
  D constant text := 'Backfill from the 10 Nov 2026 source documents (time of day not recorded)';
  B constant text := 'Backfill from the earlier Machine B record (not in the 11-document pack)';
  e uuid;
begin
  -- ===================== whole estate =====================
  perform pg_temp.tl('estate','2026-10-25 08:00+02','Decision','1','Rajen','If a code set is a flat file in real life, it is a flat file here',
    'NAPPI, ICD-10 and NRPL are shared as files in the real world, so they are CSV files, not database tables. The gateway reads them directly.',
    'Format accuracy rule from the project brief.',null,null,D);
  perform pg_temp.tl('estate','2026-10-25 08:10+02','Action','1','Claude Code','Started the build: schemas for the registries written on 25 October',
    'The three code files and the schemas for the registry databases were created from a written build instruction. Most of these were marked "approximated" in the instruction, because the real designs are not public.',
    'Schemas dated 25 Oct 2026 for the nurse, practitioner, facility, scheme, laboratory and patient registries. No generating script or seed survives for the flat files.',null,null,D);
  perform pg_temp.tl('estate','2026-11-04 12:00+02','Note','1','Claude Code','First round of checks and documents (4 November)',
    'The first set of source documents was written. At that point none of the hospitals'' medicine, tariff, lab, staff or doctor numbers appeared in the national reference files.',
    'This is the "before" baseline that every 10 November comparison in the source documents uses.',null,null,D);
  perform pg_temp.tl('estate','2026-11-10 12:00+02','Action','1','Claude Code','Close-out pass: hospitals linked to the national registries and reference files',
    'On 10 November the hospitals were linked to the registries and aligned to the code files so the gateway has real matches and real misses to find. Every pass backed up first, ran in one transaction and was recounted afterwards. Random seeds are recorded.',
    E'Hospital patients linked to HPRS (private 500, public 1,200); doctors, nurses and staff linked to HPCSA and SANC; medicine, tariff, diagnosis and lab codes aligned to the code files; SA ID numbers rebuilt so they pass the check digit; about 3% of matched codes mistyped on purpose and every one recorded in a defects log.',null,null,D);
  perform pg_temp.tl('estate','2026-11-10 14:00+02','Note','1','Claude Code','Eleven source documents written, one per Machine A database',
    'Each document explains the real system in plain words, how our copy was built and checked, what is still not known, and what the gateway developers need to know.',
    'Documents 1 to 11 are dated 10 November 2026 and marked Final, Internal.',null,null,D);
  perform pg_temp.tl('estate','2026-11-10 14:10+02','Note','2','Claude Code','Open items handed to Phase 2',
    'Several things are deliberately left for the gateway phase: read-only database roles, code translation tables, crosswalks and adapters.',
    E'Examples: read-only roles for the PostgreSQL databases; scheme_code_mapping (empty on purpose); roll-up rule from detailed to 3-character diagnosis codes; hospital code crosswalks; gateway logins and row-level security for the hospitals.\nStill "not established": where the flat-file rows came from, and the generators and seeds of several first populations.',null,null,D);

  -- ===================== NAPPI =====================
  e := pg_temp.tl('nappi','2026-10-25 12:00+02','Action','1','Claude Code','Wrote the medicine code file from a build instruction',
    'A CSV of 77 medicine products, leaning towards antiretrovirals and other public-programme medicines. The instruction asked for about 200; 77 were delivered.',
    E'15 columns, 10-digit codes (read as a 7-digit product code plus a 3-digit pack code, our reading), no duplicates, all Active. No generating script or seed survives.',null,null,D);
  perform pg_temp.tl('nappi','2026-11-10 12:30+02','Action','1','Claude Code','Linked the hospitals'' medicine codes to the file',
    'Matched hospital products to the file by ingredient, strength and form and wrote its code into each hospital''s medicine table, so the gateway has real matches to test.',
    E'Private hospital: 27 of 92 products now in the file. Public hospital: 33 of 103. About 3% of matched codes mistyped on purpose. Before 10 November: none matched.',null,null,D);
  perform pg_temp.tl('nappi','2026-11-10 13:00+02','Note','1','Claude Code','Medicine file: final checks',
    'The file is tidy and consistent, but it cannot be compared with the real list because we do not hold it.',
    'Checked 10 Nov 2026: 77 rows, 15 columns, no duplicate codes, 10 digits on every row, 77 blanks all in effective_to. SHA-256 fingerprint recorded.',null,null,D);
  perform pg_temp.tl('nappi','2026-11-10 13:10+02','Error','1','Claude Code','Where the 77 rows came from is not recorded',
    'No source, licence or extraction date exists on the project computer. The file must never be described as the full or official NAPPI list.',
    E'Real NAPPI code length also "not established". MediKredit maintains the real product file (confirmed); the NAPPI Advisory Board governs it (partly confirmed).','Open',null,D);

  -- ===================== ICD-10 =====================
  perform pg_temp.tl('icd10','2026-10-25 12:00+02','Action','1','Claude Code','Wrote the diagnosis code file from a build instruction',
    'A CSV of 132 diagnosis codes following the structure of the national table (the Master Industry Table). The instruction asked for about 500.',
    E'14 columns, 9 chapters, 88 codes flagged as Prescribed Minimum Benefits and 44 not, release label MIT2024.1.',null,null,D);
  perform pg_temp.tl('icd10','2026-11-10 12:30+02','Action','1','Claude Code','Added all 132 codes to both hospitals'' code lists',
    'The hospitals now share the file''s codes, so the gateway has real matches. The public hospital also had its older diagnosis log filled in.',
    E'Public hospital: 18,740 rows added to the older diagnosis log, leaving 4,496 encounters (5.9%) without one on purpose. About 2% of public diagnosis codes planted as invalid or truncated (1,777 rows).',null,null,D);
  perform pg_temp.tl('icd10','2026-11-10 13:00+02','Note','1','Claude Code','The public hospital''s two diagnosis stores disagree',
    'On 12,652 of 71,287 encounters the two places a diagnosis is kept disagree on the first main diagnosis. This is accepted as realistic drift.',
    'The private hospital uses 3-character codes; the file lists longer ones, so a roll-up rule is needed (Phase 2).',null,null,D);
  perform pg_temp.tl('icd10','2026-11-10 13:10+02','Error','1','Claude Code','The release label MIT2024.1 cannot be verified',
    'The official publisher''s page lists releases dated 1 January 2014 and 16 March 2021, but not MIT2024.1. The origin of the 132 rows is also not recorded.',
    'The file must never be described as the full or official table.','Open',null,D);

  -- ===================== NRPL =====================
  perform pg_temp.tl('nrpl','2026-10-25 12:00+02','Action','1','Claude Code','Wrote the price list file from a build instruction',
    'A CSV of 81 priced items: 69 from the National Reference Price List (private sector) and 12 from the Uniform Patient Fee Schedule (public sector patient fees).',
    '11 columns, 17 provider groups, no duplicate codes. No generating script or seed survives.',null,null,D);
  perform pg_temp.tl('nrpl','2026-11-10 12:30+02','Action','1','Claude Code','Linked the hospitals'' tariff codes to the file',
    'Matched tariff items by description and copied the file''s item code into each hospital''s tariff table.',
    E'Private hospital: 6 of 10 tariff codes. Public hospital: 217 of 448 (48.4%). About 3% of matched public codes mistyped on purpose. Before 10 November: none matched.',null,null,D);
  perform pg_temp.tl('nrpl','2026-11-10 13:00+02','Error','1','Claude Code','Meaning of the item types M, N and R is not confirmed',
    'No source was found for what the modifier, note and rule item types mean. The meanings in the document are inferred from the file.',
    'Also not established: where the 81 rows came from. Regulations under the National Health Act cover reference price lists (Government Gazette 30110, 23 July 2007).','Open',null,D);

  -- ===================== NHLS =====================
  perform pg_temp.tl('nhls','2026-10-25 12:00+02','Action','1','Claude Code','Created the laboratory catalogue with its first 21 tests',
    'A SQLite database with four tables. One SQL script created the schema and the first 21 tests, including full blood count, CD4, HIV viral load and creatinine.',
    'Script about 8 KB. The header calls the schema "approximated".',null,null,D);
  perform pg_temp.tl('nhls','2026-10-26 12:00+02','Action','1','Claude Code','Expanded the catalogue to 68 tests',
    'A second script added the rest. It cannot create duplicate codes, and it sets the HIV viral load normal range to undetectable below 20 copies/mL.',
    E'68 tests in six disciplines (chemistry 29, microbiology 14, haematology 11, immunology 8, virology 5, anatomical pathology 1). The order and result tables are empty on purpose.',null,null,D);
  perform pg_temp.tl('nhls','2026-11-10 12:30+02','Action','1','Claude Code','Aligned the hospitals'' lab codes to the catalogue',
    'The catalogue itself was not changed. The hospitals were changed to carry its codes, and missing public results were filled in.',
    E'Private hospital: 24 of 40 tests. Public hospital: 94,355 of 135,988 result rows. Results added to 1,593 of 1,804 final orders (4,284 rows), 180 left empty on purpose. About 3% of matched codes mistyped on purpose.',null,null,D);
  perform pg_temp.tl('nhls','2026-11-10 13:00+02','Decision','1','Rajen','Use our own invented test codes, with LOINC and SNOMED CT only as mappings',
    'The real NHLS test codes are proprietary, so the catalogue uses invented ones. LOINC is never used as the key.',
    'Real catalogue reported at more than 2,400 tests (earlier research citing an NHLS procurement document). Only 21 of 68 tests carry a SNOMED CT code.',null,null,D);
  perform pg_temp.tl('nhls','2026-11-10 13:10+02','Error','1','Claude Code','Codes cannot be checked against the real NHLS list',
    'The real codes are not public, so the catalogue cannot be compared with them.','Marked "not established" in the source document.','Open',null,D);

  -- ===================== MFL / DHIS2 =====================
  perform pg_temp.tl('mfl_dhis2','2026-10-25 12:00+02','Action','1','Claude Code','Built the facility database in the standard DHIS2 layout',
    'A PostgreSQL database with 13 tables, following the standard DHIS2 layout plus one South African facility table.',
    'One SQL script created the tables and the first 32 organisation units and 10 facilities. There was no separate population script.',null,null,D);
  perform pg_temp.tl('mfl_dhis2','2026-11-10 12:30+02','Action','1','Claude Code','Added the hospitals and 25 clinics, and filled every code',
    'Added 27 facilities (the two hospitals and 25 feeder clinics) and an extra code column for each hospital''s own facility code, then filled every empty code.',
    E'Now 37 facilities, 59 organisation units (1 country, 9 provinces, 5 districts, 7 sub-districts, 37 facilities), all under Gauteng. Added 24 data elements, 34 monthly periods and one data set; reporting values stay empty. Seed recorded.',null,null,D);
  perform pg_temp.tl('mfl_dhis2','2026-11-10 13:00+02','Decision','1','Rajen','Keep each hospital''s own facility code beside the national one',
    'The hospitals'' own codes are kept in alternative_code so the code mismatch is real, and no separate translation table was built.',
    'A facility can be known by four identifiers: facility_uid, national_facility_id, dhis2_org_unit_code and alternative_code.',null,null,D);
  perform pg_temp.tl('mfl_dhis2','2026-11-10 13:10+02','Error','1','Claude Code','The partner''s DHIS2 reference list has not been matched',
    'The partner''s DHIS2-style database, with its own list of data elements, is not on this computer, so ours was not compared with it. The 24 elements and 34 periods are examples we chose.',
    'Also open: a read-only database role (Phase 2).','Open',null,D);

  -- ===================== SANC =====================
  perform pg_temp.tl('sanc','2026-10-25 23:45+02','Action','1','Claude Code','Created the nursing register schema',
    'Three tables for nurses, their registrations and where they have practised, following the Nursing Council regulation that prescribes what the register must hold.',
    'SQL script about 3 KB.',null,null,D);
  perform pg_temp.tl('sanc','2026-10-26 00:03+02','Action','1','Claude Code','Populated the register with 3,500 invented nurses',
    'The population was scaled from the real register''s 265,877 nurses and midwives at the end of 2024. All names and numbers are made up.',
    'A 3 MB script of 10,500 insert statements in 53 transactions. The generator that wrote it is not on this computer, so it cannot be reproduced exactly.',null,null,D);
  perform pg_temp.tl('sanc','2026-10-27 12:00+02','Action','1','Claude Code','Marked about 4% of nurses as suspended',
    'So the gateway can be tested on spotting a suspended nurse. The rate and reasons are our own choice, not real figures.',
    'Python script, seed 20261027. 140 suspended: RN 77, EN 31, ENA 25, CS 4, SPEC 3.',null,null,D);
  perform pg_temp.tl('sanc','2026-11-10 12:30+02','Action','1','Claude Code','Repaired IDs, added midwife registrations and linked hospital staff',
    'Every nurse now has a valid SA ID number. Hospital staff were linked to register entries and practice history was added.',
    E'3,640 registrations (140 midwife), 5,830 practice locations, 1,911 nurses with moves. 167 hospital staff linked, 162 resolve, 5 mistyped on purpose, 15 linked nurses suspended. 106 hospital staff renamed to match the register (accepted design choice). Seeds 20261111 and 20261113.',null,null,D);
  perform pg_temp.tl('sanc','2026-11-10 13:10+02','Error','1','Claude Code','The generator and seed for the 3,500 nurses are not on this computer',
    'The population cannot be reproduced exactly.','Marked "not established".','Open',null,D);

  -- ===================== HPCSA =====================
  perform pg_temp.tl('hpcsa','2026-10-25 23:42+02','Action','1','Claude Code','Created the practitioner register schema',
    'Five tables: boards, practitioners, registrations, qualifications and practice addresses. No real HPCSA design is public, so every name is our own.',
    'T-SQL script about 5.6 KB, header "approximated schema". Runs on its own SQL Server instance and port.',null,null,D);
  perform pg_temp.tl('hpcsa','2026-10-26 00:03+02','Action','1','Claude Code','Populated the register with 2,500 invented practitioners',
    'Scaled from the real register''s 2023/24 figure of 181,981, which the annual report does not clearly say is the whole register.',
    'A 3 MB script of 10,000 insert statements in 20 transactions. Generator not on this computer.',null,null,D);
  perform pg_temp.tl('hpcsa','2026-11-10 12:30+02','Action','1','Claude Code','Added valid IDs, second boards and address history, and linked hospital doctors',
    'Every practitioner has a valid SA ID. 62 have a second board and 62 an earlier address. Hospital doctors were linked to council records.',
    E'2,562 registrations. 248 practitioners are not simply Active (suspended, cancelled, removed or overdue). Linked: 57 of 72 public and 23 of 30 private doctors. Seeds 20261111 to 20261113.',null,null,D);
  perform pg_temp.tl('hpcsa','2026-11-10 13:10+02','Error','1','Claude Code','The generator and seed for the 2,500 practitioners are not on this computer',
    'The population cannot be reproduced exactly. No hospital doctor that resolves is suspended.','Marked "not established".','Open',null,D);

  -- ===================== CMS =====================
  perform pg_temp.tl('cms','2026-10-25 12:00+02','Action','1','Claude Code','Created the medical schemes schema',
    'Four tables for schemes, plan options, members and claims. The Council publishes no member data model, so every column name is our own.',
    'PostgreSQL script about 5 KB, header "approximated schema". Own instance on port 5433.',null,null,D);
  perform pg_temp.tl('cms','2026-10-26 12:00+02','Action','1','Claude Code','Populated 8,000 invented members',
    'Scaled from about 8.9 million real beneficiaries, with scheme-specific member number formats.',
    'A 5.4 MB script of 12,302 insert statements in one transaction. Generator not on this computer.',null,null,D);
  perform pg_temp.tl('cms','2026-11-10 12:30+02','Action','1','Claude Code','Linked 454 members to private-hospital patients and updated the scheme list',
    'Members were tied to hospital patients by name, birth date and member number. About 7% of their numbers are mistyped or out of date on purpose (33 deliberate errors). Added SAMWUMED and Keyhealth, and swapped the unverified Aetna for Medshield.',
    'Now 10 schemes, 40 options. The CMS 2025/26 annual report lists 70 registered schemes (16 open, 54 restricted) at 31 March 2026. Seed 20261110.',null,null,D);
  perform pg_temp.tl('cms','2026-11-10 13:00+02','Decision','1','Rajen','No SA ID number on any scheme member',
    'On purpose, so the gateway has to match on names, birth dates and member numbers.','',null,null,D);
  perform pg_temp.tl('cms','2026-11-10 13:10+02','Error','1','Claude Code','Real CMS registration numbers of the seeded schemes are not confirmed',
    'The numbers and dates of the three added schemes are synthetic placeholders.','The database also uses WIN1252 encoding, accepted as a realistic mismatch.','Open',null,D);

  -- ===================== HPRS =====================
  perform pg_temp.tl('hprs','2026-10-26 12:00+02','Action','1','Claude Code','Created the patient registry and loaded 15,000 invented patients',
    'A lookup and verification registry in the style of the national Health Patient Registration System. Gauteng-weighted (85.3% of patients).',
    'A 16 MB script of 57,045 insert statements in 114 transactions. Generator not on this computer.',null,null,D);
  e := pg_temp.tl('hprs','2026-10-31 12:00+02','Error','1','Claude Code','The registry''s own number was confused with the SA ID',
    'The HPRN must be the registry''s own number and never the 13-digit ID. The first build did not keep them apart.','','Resolved',null,D);
  perform pg_temp.tl('hprs','2026-10-31 12:30+02','Fix','1','Claude Code','Added the HPRN, verification, duplicate and sync columns',
    'One structural pass added four columns, a unique index that stops two patients sharing an HPRN while allowing empty ones, and checks on the allowed values. A full backup came first.',
    '',null,e,D);
  perform pg_temp.tl('hprs','2026-11-04 12:00+02','Decision','1','Rajen','The HPRN is the canonical identifier column',
    'Decided 4 November. The 12-digit HPRN is our own design; the real format is not published.','',null,null,D);
  perform pg_temp.tl('hprs','2026-11-10 12:30+02','Action','1','Claude Code','Made every SA ID valid and linked 1,500 patients to the hospitals',
    'Repaired check digits, rebuilt IDs from birth date and sex, and corrected 17 future birth dates. 1,500 patients now exist in both the registry and a hospital.',
    E'12,045 valid IDs and 150 planted mismatches. 14,799 cross-references: hospital 1,502, scheme 405, laboratory 847. Seeds 20261110 to 20261112.',null,null,D);
  perform pg_temp.tl('hprs','2026-11-10 13:10+02','Error','1','Claude Code','Older documents still call mpi_id the HPRN',
    'A documentation task: earlier documents use the wrong column name.','','Open',null,D);

  -- ===================== Private hospital =====================
  perform pg_temp.tl('private_hospital','2026-09-29 12:00+02','Action','1','Claude Code','Wrote the blueprint and built the schema',
    'A written blueprint described every table first. Numbered scripts then created 20 schemas, 197 tables, 375 foreign keys and the security layer.',
    'A comparison tool matched the live database to the blueprint with no differences, and a smoke test pushed one patient through to a payment and rolled back.',null,null,D);
  perform pg_temp.tl('private_hospital','2026-10-24 12:00+02','Action','1','Claude Code','Loaded a year of history',
    'A large script generated about 4,200 patients, 9,500 inpatient and 38,000 outpatient visits.',
    'It uses the database''s own random function with no seed, so a re-run would give different people.',null,null,D);
  perform pg_temp.tl('private_hospital','2026-10-26 12:00+02','Action','1','Claude Code','Corrected IDs, planted deliberate faults and filled 46 empty tables',
    'Rewrote invalid ID numbers, fixed age and sex inconsistencies, set deaths and then planted small deliberate faults. A second script filled 46 empty tables and can be re-run to the same result.',
    'Fixed seed 20261026.',null,null,D);
  perform pg_temp.tl('private_hospital','2026-10-31 12:00+02','Action','1','Claude Code','Re-applied seasonality and ran a realism audit',
    'Measured each fault rate against benchmark ranges set in our own audit. These are plausible targets, not published figures.','',null,null,D);
  perform pg_temp.tl('private_hospital','2026-11-10 12:30+02','Action','1','Claude Code','Close-out: linked to the registry, councils and code files',
    'Linked 500 patients to the national registry and the hospital''s doctors and nurses to their councils, recalculated account totals, moved encounters dated before birth and aligned code lists.',
    E'Doctors 23 of 30 and nurses 20 of 26 resolve. 253 visits dated before birth were moved, with every connected table. Seeds 20261111 to 20261117.',null,null,D);
  perform pg_temp.tl('private_hospital','2026-11-10 13:00+02','Note','1','Claude Code','Private hospital: final figures',
    'The clean control. Every table has a key and all 375 relationships are enforced, but small deliberate faults remain.',
    '197 tables, 4,218 patients, 47,465 visits, about 1.89 million rows, 61 tables empty by design.',null,null,D);
  perform pg_temp.tl('private_hospital','2026-11-10 13:10+02','Error','1','Claude Code','Last-visit dates on patients were not recalculated after moving visits',
    '14 patients differ from their latest visit and 18 have none.','Left as is and documented.','Open',null,D);

  -- ===================== Public hospital =====================
  perform pg_temp.tl('public_hospital','2026-09-29 12:00+02','Action','1','Claude Code','Built the schema, messy on purpose',
    'Four scripts created the schemas, 108 tables, 7 foreign keys and 7 indexes. The script states that the mess is deliberate.',
    '100 tables are the legacy system (dbo) and 8 are a tidier layer (his). 35 of 108 tables have no key and 151 columns look like links that nothing enforces.',null,null,D);
  perform pg_temp.tl('public_hospital','2026-10-25 12:00+02','Action','1','Claude Code','Populated the database',
    'Twenty-four part scripts joined into one file, loaded in 500-row transactions so a failed chunk is reported and the run continues. The legacy tables hold text dates, string money and free text.',
    'Each part was first run on a scratch database. No seed recorded for the first population.',null,null,D);
  perform pg_temp.tl('public_hospital','2026-10-31 12:00+02','Action','1','Claude Code','Re-applied seasonality, removed duplicates and ran a realism audit',
    'Seasonality was re-applied and duplicate patients removed, then each fault rate was measured.','',null,null,D);
  perform pg_temp.tl('public_hospital','2026-11-10 12:30+02','Action','1','Claude Code','Close-out: linked 1,200 patients and aligned the code lists',
    'Linked to the national registry, rebuilt SA IDs so every SA-type ID passes the check digit, aligned medicine, tariff, diagnosis and lab codes, added gastro seasonality, raised unbilled visits to a stated 45% target and filled lab results with a 10% gap.',
    E'1,086 of the linked patients share the SA ID. 0 failures among 5,407 SA-type IDs. Medicine 33 of 103, tariff 217 of 448, 94,355 lab result rows. 1,777 diagnosis rows (2.00%) carry a non-local code, accepted.',null,null,D);
  perform pg_temp.tl('public_hospital','2026-11-10 13:00+02','Note','1','Claude Code','Public hospital: final figures',
    'Built to be messy. A legacy system with a newer layer on top.',
    '108 tables, 6,716 patients, 75,783 visits, about 1.71 million rows. Only 36.3% of visits have a charge; 4,496 visits have no diagnosis log row. Nothing is encrypted, masked or classified, on purpose.',null,null,D);
  perform pg_temp.tl('public_hospital','2026-11-10 13:10+02','Error','1','Claude Code','The seed for the first population was not recorded',
    'The first population cannot be reproduced exactly. The planned fault rates are borrowed from a Western Cape study and are not measured for this hospital.',
    '','Open',null,D);

  -- ===================== Machine B (partner''s laptop): earlier record only =====================
  perform pg_temp.tl('dhis2_aggregate','2026-10-30 10:00+02','Action','1','Huzayfa','Built and populated the DHIS2-style aggregate database',
    'A PostgreSQL database of monthly reported totals (not patient rows) for an ART programme, on the partner''s laptop.',
    E'17 tables populated, 11 empty on purpose. 29,596 data values, 18 periods, 22 organisation units (10 Gauteng facilities), 120 completed monthly returns. Reachable through the gateway only.',null,null,B);
  perform pg_temp.tl('dhis2_aggregate','2026-10-30 12:00+02','Error','1','Huzayfa','Queries fail: the schema search path is wrong',
    'The tables can be seen but queries fail. The partner needs to fix this.','search_path misconfiguration. Partner fix pending.','Open',null,B);
  perform pg_temp.tl('tiernet_clinic','2026-10-30 14:00+02','Action','1','Huzayfa','Built and populated the TIER.Net-style clinic database',
    'A SQLite database of HIV treatment patients with visits, regimens, viral loads and outcomes, on the partner''s laptop.',
    E'13 tables populated, 12 empty on purpose. 38,521 rows, 3,515 patients (3,380 real plus 135 planted duplicates), 18,799 visits. Six counted defects planted.',null,null,B);
  perform pg_temp.tl('tiernet_clinic','2026-10-30 16:00+02','Error','1','Huzayfa','Some expected tables may be missing from the clinic database',
    'The partner has to confirm the tables against the build specification.','Partner to confirm schema.','Open',null,B);
end $$;
