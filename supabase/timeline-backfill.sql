-- Timeline backfill: set-up and population of all 13 databases, up to 31 October 2026.
-- Built from the DEXA technical records and peer review (doc1_machine_a, doc1_rajens_pc_technical_record,
-- doc2_machine_b, doc3_peer_review). Safe to re-run: an entry with the same database and title is not added twice.
-- Dates: 27 and 31 October are stated in the records. Earlier build dates are not stated, so they are placed on
-- 26-30 October and marked "date approximate".

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
  S1 constant text := 'Backfill from technical records (date approximate)';
  S2 constant text := 'Backfill from technical records';
  e uuid;
begin
  -- ============ whole estate: decisions that shaped everything ============
  perform pg_temp.tl('estate','2026-10-26 08:00+02','Decision','1','Rajen','Every source stands alone: no links between databases',
    'None of the 13 sources links to any other. Matching patients and facilities across systems is done by the gateway in application code, never by database joins or linked servers.',
    'No cross-database foreign keys, linked servers or enforced referential integrity. This mirrors the fragmentation of real South African health systems.',null,null,S1);
  perform pg_temp.tl('estate','2026-10-26 08:10+02','Decision','1','Rajen','One SQL Server instance per database, each on its own port',
    'Each SQL Server database runs in its own instance with a fixed port, as separate hospital and registry systems do in real life.',
    E'Machine A SQL Server instances: MSSQLSERVER (private_hospital, 1433), PUBHOSPITAL (public_hospital, 1438), HPRS (hprs_identity, 1436), HPCSA (hpcsa_registry, 1437). See the note on port numbers below.',null,null,S1);
  perform pg_temp.tl('estate','2026-10-26 08:20+02','Decision','1','Rajen','Flat-file sources stay flat files',
    'NAPPI, ICD-10 and NRPL are distributed as spreadsheet downloads in real life, so they were kept as CSV files and not turned into database tables. The gateway reads them directly.',
    'Format accuracy rule: a system distributed as a flat file is simulated as a flat file; a relational system is simulated as a relational database with a matching engine.',null,null,S1);
  perform pg_temp.tl('estate','2026-10-26 08:30+02','Decision','1','Rajen','Four separate patient identifiers',
    'A patient can be known by four different numbers that are never treated as the same thing, so the gateway has to resolve all four.',
    E'HPRN (HPRS, 12 digits, system-assigned), SA ID number (13 digits, Luhn-checked, may be empty), folder/file number (per facility), MRN (private hospital only). HPRN and SA ID are separate columns in every schema.',null,null,S1);
  perform pg_temp.tl('estate','2026-10-26 08:40+02','Decision','1','Rajen','Deliberate, counted data defects in every source',
    'Each source was given realistic faults on purpose, fewer in the private hospital and more in the public hospital, so the gateway is tested against messy data. 20 defect types are planted in total.',
    'Private hospital: low defect rates. Public hospital: higher rates. Registries: realistic gaps and unverified records. TIER.Net: six counted defect types. The gateway must detect and report each one, not hide it.',null,null,S1);
  perform pg_temp.tl('estate','2026-10-26 08:50+02','Decision','1','Rajen','Machine B is out of reach of direct SQL',
    'The two partner databases sit on Huzayfa''s laptop and cannot be queried directly from Rajen''s PC, so the gateway will need an API or transfer layer to reach them.',
    'All registry and reference sources are on Machine A. Machine B holds only the two remote clinical sources.',null,null,S1);
  perform pg_temp.tl('estate','2026-10-26 09:00+02','Decision','1','Rajen','Synthetic data only, and nothing from the database folder goes to GitHub',
    'All data is invented. The database files, backups, connection details and anything derived from them, and all partner-side work, are never committed to GitHub.',
    'Read-only logins for the sensitive registries are kept outside any code or repository. British English throughout.',null,null,S1);

  -- ============ private_hospital ============
  e := pg_temp.tl('private_hospital','2026-10-27 09:00+02','Action','1','Claude Code','Built and populated the private hospital database',
    'A clean private-hospital database in the style of Netcare, Mediclinic or Life Healthcare: 197 tables, with patients, encounters, diagnoses, prescriptions, lab work and billing.',
    E'4,326 patients, 47,465 encounters, 57,020 diagnoses, 166,331 billing charges.\nInstance MSSQLSERVER, port 1433. Three-character ICD-10 codes (J06, not J06.9), as is common in private practice.',null,null,S1);
  perform pg_temp.tl('private_hospital','2026-10-27 15:00+02','Action','1','Claude Code','Renamed the logical file names',
    'Tidied the internal file names of the private hospital database so they match its name.',
    'private_hospital.mdf and private_hospital_log.ldf.',null,null,S2);
  perform pg_temp.tl('private_hospital','2026-10-31 17:42+02','Action','1','Claude Code','Backed up the database and ran a realism audit',
    'Took a backup before any corrections, then ran a read-only audit to measure how realistic the data was.',
    E'Backup before fixes: private_hospital_prefix_20261031_174252.bak\nAudit: private_hospital_realism_audit.txt',null,null,S2);
  e := pg_temp.tl('private_hospital','2026-10-31 17:50+02','Error','1','Claude Code','Too many duplicate patients (3.38%, target 0.3 to 0.5%)',
    'The audit found 147 duplicate patient registrations, more than a clean private hospital would have.',
    'Duplicate patient rate 3.38% against a target of 0.3 to 0.5%.','Resolved',null,S2);
  perform pg_temp.tl('private_hospital','2026-10-31 17:58+02','Fix','1','Claude Code','Removed 130 of 147 duplicate patients (P1)',
    'Merged away most of the duplicates; a few were kept on purpose so the gateway still has some to find.',
    'Duplicate rate 3.38% to 0.40%.',null,e,S2);
  e := pg_temp.tl('private_hospital','2026-10-31 18:00+02','Error','1','Claude Code','Encounters with no diagnosis (1.65%, target 0.5 to 1.0%)',
    'Slightly too many visits had no diagnosis recorded.',
    'Encounters without diagnosis 1.65%.','Resolved',null,S2);
  perform pg_temp.tl('private_hospital','2026-10-31 18:06+02','Fix','1','Claude Code','Added diagnoses to half of the undiagnosed encounters (P2)',
    'Gave a diagnosis to about half of the visits that had none.','Undiagnosed rate 1.65% to 0.80%.',null,e,S2);
  e := pg_temp.tl('private_hospital','2026-10-31 18:10+02','Error','1','Claude Code','Zero-value billing too common (2.0%, target 0.5 to 1.0%)',
    'Too many charges were recorded at nothing.','Zero-value billing 2.00%.','Resolved',null,S2);
  perform pg_temp.tl('private_hospital','2026-10-31 18:15+02','Fix','1','Claude Code','Restored charges on 60% of zero-value records (P3)',
    'Put realistic charges back on most of the zero-value lines.','Zero-value rate 2.00% to 0.80%.',null,e,S2);
  perform pg_temp.tl('private_hospital','2026-10-31 18:20+02','Action','1','Claude Code','Made 1.5% of medicine codes empty on purpose (P4)',
    'Real private hospitals sometimes bill a medicine without its NAPPI code, so the NAPPI column was made nullable and 1.5% were blanked.',
    'Null NAPPI rate 0.00% to 1.50% (deliberate). The column was NOT NULL before this pass.',null,null,S2);
  e := pg_temp.tl('private_hospital','2026-10-31 18:25+02','Error','1','Claude Code','Lab results missing their value (21.98% empty)',
    'Many qualitative lab results (such as positive or negative) had no value.','Empty qualitative lab results 21.98%.','Resolved',null,S2);
  perform pg_temp.tl('private_hospital','2026-10-31 18:30+02','Fix','1','Claude Code','Filled in all five qualitative lab result types (P5)',
    'Every qualitative lab result now carries a value.','Empty rate 21.98% to 0%.',null,e,S2);
  perform pg_temp.tl('private_hospital','2026-10-31 18:35+02','Action','1','Claude Code','Backed up again before the seasonal regeneration',
    'Second backup (109 MB) taken before re-dating the encounters.','private_hospital_preseasonal_20261031_183508.bak',null,null,S2);
  e := pg_temp.tl('private_hospital','2026-10-31 18:40+02','Error','1','Claude Code','Illnesses did not follow the seasons',
    'Respiratory illness should peak in winter and trauma in summer, but the dates were spread evenly.','No seasonal pattern in encounter dates.','Resolved',null,S2);
  e := pg_temp.tl('private_hospital','2026-10-31 19:00+02','Fix','1','Claude Code','Re-dated 45,891 encounters with seasonal weights (P6)',
    'Wiped the supplementary layer, re-dated the encounters and re-ran the population script so winter and summer peaks appear.',
    'Respiratory winter peak 2.04x (target 1.3x or more). Trauma summer peak 1.64x (target 1.3x or more).',null,e,S2);
  e := pg_temp.tl('private_hospital','2026-10-31 19:10+02','Error','1','Claude Code','Diagnosis code Z00 was missing from the code list',
    'The seasonal re-run used Z00 (general health examination), which was not in the private hospital''s ICD-10 reference table.',
    'Z00 absent from ref.icd10_code.','Resolved',null,S2);
  perform pg_temp.tl('private_hospital','2026-10-31 19:15+02','Fix','1','Claude Code','Added Z00 to the ICD-10 reference table',
    'The code now exists, so the re-dated encounters are valid.','',null,e,S2);
  perform pg_temp.tl('private_hospital','2026-10-31 19:30+02','Note','1','Claude Code','Private hospital: final realism figures',
    'All six correction passes are done and the database is ready for the gateway.',
    E'Duplicates 0.40%, undiagnosed 0.80%, zero-value billing 0.80%, null NAPPI 1.50% (deliberate), empty lab values 0%.\nSA ID Luhn failures (about 2%) corrected in place.\nVerification: private_hospital_seasonal_regen_verification.txt',null,null,S2);

  -- ============ public_hospital ============
  perform pg_temp.tl('public_hospital','2026-10-28 09:00+02','Action','1','Claude Code','Built and populated the public hospital database',
    'A deliberately messy public-hospital database in the style of a Gauteng district or regional hospital, with 108 tables.',
    E'6,800 patients, 76,000 encounters, 84,811 diagnoses, 132,151 lab results, 115,607 prescriptions, 31,548 billing accounts, 115,176 billing lines, 27,901 payments.\nInstance PUBHOSPITAL, port 1438.',null,null,S1);
  perform pg_temp.tl('public_hospital','2026-10-28 09:30+02','Decision','1','Rajen','Public hospital built in two layers',
    'A modern structured layer sits beside a legacy flat-file layer and a billing layer, as in real public hospitals that grew in stages.',
    E'Structured HIS (his.*): encounters, diagnoses, lab orders and results, referrals, TB screening, ART referrals, maternity, chronic disease.\nLegacy flat (dbo.*): accumulated programme tables.\nBilling (billing.*): BILL_ACCOUNT, BILL_LINE, BILL_PAYMENT, BILL_WRITEOFF.',null,null,S1);
  perform pg_temp.tl('public_hospital','2026-10-31 14:00+02','Action','1','Claude Code','Backed up the database and ran a realism audit',
    'Backup first, then a read-only audit of the defect rates.',
    E'Backup: public_hospital_prefixes_20261031.bak\nAudit: public_hospital_realism_audit.txt',null,null,S2);
  e := pg_temp.tl('public_hospital','2026-10-31 14:10+02','Error','1','Claude Code','Duplicate patients above target (4.69%, target 2 to 4%)',
    'The audit found slightly more duplicate patients than the public-hospital target.','Duplicate patient rate 4.69%.','Resolved',null,S2);
  perform pg_temp.tl('public_hospital','2026-10-31 14:25+02','Fix','1','Claude Code','Removed 84 duplicate patients across 55 tables (U1)',
    'Merged the duplicates in every table that referred to them.','Duplicate rate 4.69% to 2.99%.',null,e,S2);
  e := pg_temp.tl('public_hospital','2026-10-31 14:30+02','Error','1','Claude Code','Too many encounters with no diagnosis (13.9%, target 3 to 6%)',
    'Far more visits than expected had no diagnosis on record.','Encounters without diagnosis 13.9%.','Resolved',null,S2);
  perform pg_temp.tl('public_hospital','2026-10-31 14:45+02','Fix','1','Claude Code','Added 7,500 diagnoses read from free-text notes (U2)',
    'Worked out diagnoses from the doctors'' written notes.','Undiagnosed rate 13.9% to 4.0%.',null,e,S2);
  e := pg_temp.tl('public_hospital','2026-10-31 14:50+02','Error','1','Claude Code','Medicine codes missing on 36.8% of prescriptions (target 5 to 10%)',
    'Far too many prescription lines had no NAPPI code.','Null NAPPI rate 36.8%.','Resolved',null,S2);
  perform pg_temp.tl('public_hospital','2026-10-31 15:05+02','Fix','1','Claude Code','Matched 5,903 lines to NAPPI by drug name (U3)',
    'Matched lines by drug name and gave a NAPPI code to 26 formulary items.','Null NAPPI rate 36.8% to 8.0%.',null,e,S2);
  e := pg_temp.tl('public_hospital','2026-10-31 15:10+02','Error','1','Claude Code','Diagnosis codes missing on 7.06% of diagnoses',
    'Some diagnoses had free text but no ICD-10 code.','Null ICD-10 rate 7.06%.','Resolved',null,S2);
  perform pg_temp.tl('public_hospital','2026-10-31 15:25+02','Fix','1','Claude Code','Coded 2,744 rows from free-text diagnoses (U4)',
    'Assigned ICD-10 codes to the uncoded rows.','Null ICD-10 rate 7.06% to 3.5%.',null,e,S2);
  e := pg_temp.tl('public_hospital','2026-10-31 15:30+02','Error','1','Claude Code','Injuries did not peak in summer',
    'Trauma cases should peak in the summer months but were spread across the year.','Trauma summer peak 1.40x.','Resolved',null,S2);
  perform pg_temp.tl('public_hospital','2026-10-31 15:45+02','Fix','1','Claude Code','Moved 800 trauma encounters from June-August to November-January (U5)',
    'Shifted trauma cases into the summer months.','Trauma summer peak 1.40x to 1.84x.',null,e,S2);
  e := pg_temp.tl('public_hospital','2026-10-31 15:50+02','Error','1','Claude Code','Diagnosis code Z71.1 was missing from the local code list',
    'Z71.1 was used by the data but absent from ICD10_LOCAL.','Z71.1 not in ICD10_LOCAL.','Resolved',null,S2);
  perform pg_temp.tl('public_hospital','2026-10-31 15:55+02','Fix','1','Claude Code','Added Z71.1 to the local code list',
    'The code now exists.','',null,e,S2);
  perform pg_temp.tl('public_hospital','2026-10-31 16:10+02','Note','1','Claude Code','Public hospital: final realism figures',
    'All six correction passes are done and the database is ready for the gateway.',
    E'6,716 patients and 75,783 encounters after de-duplication.\nDuplicates 2.99%, undiagnosed 4.0%, null NAPPI 8.0%, null ICD-10 3.5%, trauma summer peak 1.84x.\n58.5% of encounters have no bill, by design (public patients are often not billed).',null,null,S2);

  -- ============ registries and reference sources (Machine A) ============
  e := pg_temp.tl('hprs','2026-10-28 11:00+02','Error','1','Claude Code','The patient registry used the SA ID number as the HPRN',
    'The first build treated a patient''s 13-digit ID number as their health registration number. In the real registry they are different numbers.',
    'Original build: sa_id used as hprn.','Resolved',null,S1);
  perform pg_temp.tl('hprs','2026-10-28 12:00+02','Fix','1','Claude Code','Gave the registry a separate 12-digit HPRN',
    'Added a system-assigned 12-digit HPRN column and kept the SA ID as its own column, so gateway code is built against the real structure.',
    'Added columns: hprn, verification_status, duplicate_flag, sync_status.',null,e,S1);
  perform pg_temp.tl('hprs','2026-10-28 13:00+02','Action','1','Claude Code','Seeded the registry with 15,000 patients',
    'A lookup and verification service only, with no clinical data. Every registered facility is a real facility ID.',
    E'15,000 patients; about 8% have no HPRN, about 3% flagged as possible duplicates.\nVerification: 5% biometric, 30% manual, 65% unverified. Sync: 55% synced, 30% pending, 15% failed.\nAll 15,000 registered_facility_id values are real MFL/DHIS2 UIDs (10 Gauteng facilities).',null,null,S1);
  perform pg_temp.tl('hprs','2026-10-27 16:00+02','Action','1','Claude Code','Created the read-only gateway login',
    'The gateway gets a login that can only read, so it can never change the registry.','Login hprs_reader (password stored outside any code).',null,null,S2);

  perform pg_temp.tl('hpcsa','2026-10-28 14:00+02','Action','1','Claude Code','Seeded the practitioner register',
    'Built the register of health professionals: 2,500 practitioners and the professional boards, with registration, qualifications and disciplinary history.',
    E'2,500 practitioners, 11 boards seeded, 5 tables.\nStatus values: Active, Suspended, Lapsed.',null,null,S1);
  perform pg_temp.tl('hpcsa','2026-10-27 16:10+02','Action','1','Claude Code','Created the read-only gateway login',
    'Same arrangement as the patient registry: the gateway can only read.','Login hpcsa_reader (password stored outside any code).',null,null,S2);

  perform pg_temp.tl('mfl_dhis2','2026-10-28 15:00+02','Action','1','Claude Code','Built the facility list and organisation hierarchy',
    'A PostgreSQL database with the national facility list and the organisation hierarchy from national down to facility.',
    E'13 tables, 45 organisation units, 10 Gauteng facilities (clinics, district and regional hospitals).\nPort 5432.',null,null,S1);
  perform pg_temp.tl('mfl_dhis2','2026-10-28 15:30+02','Decision','1','Rajen','Keep all three facility identifiers',
    'Facilities are known by three different IDs in the real reporting chain, so all three are kept and the gateway must translate between them.',
    E'mfl_facility_uid (national Master Facility List ID), dhis2_org_unit_uid (used in DHIS2 API calls), dhis2_org_unit_code (used in imports and exchange). The same three appear in facility_masterlist.csv.',null,null,S1);
  perform pg_temp.tl('mfl_dhis2','2026-10-31 20:00+02','Note','1','Claude Code','Checked the schema search path on the facility database',
    'Confirmed queries resolve correctly. This is the same fault that is still open on the partner''s aggregate database.','search_path verified.',null,null,S2);

  perform pg_temp.tl('cms','2026-10-29 09:00+02','Action','1','Claude Code','Built the medical schemes register',
    'A queryable stand-in for the Council for Medical Schemes directory, which is really published as a report and web lookup.',
    E'4 tables, 7 real schemes (including Discovery, Bonitas, Medihelp, Momentum), 37 plan options.\nSeparate PostgreSQL instance on port 5433, with its own data folder and Windows service.',null,null,S1);

  perform pg_temp.tl('sanc','2026-10-29 10:00+02','Action','1','Claude Code','Built the nursing register with suspended nurses planted',
    'A file-based register of nurses and midwives. 140 are suspended on purpose so the gateway can be tested on checking a nurse''s standing.',
    E'3,500 nurses (RN, EN, ENA, CS, SPEC). Valid 2,712, lapsed 363, renewal due 209, not issued 76.\nSuspended 140: 77 RN, 31 EN, 25 ENA. Reasons: non-payment 58, disciplinary 49, voluntary 20, criminal 13.',null,null,S1);

  perform pg_temp.tl('nhls','2026-10-29 11:00+02','Action','1','Claude Code','Built the laboratory test code reference',
    'A file-based list of lab tests with specimens, units and normal ranges, loaded by the gateway.',
    E'68 tests, 4 tables. About 70% mapped to LOINC and 30% unmapped, which is realistic for the South African public sector.',null,null,S1);

  perform pg_temp.tl('nappi','2026-10-29 12:00+02','Action','1','Claude Code','Created the medicine code file',
    'A CSV of medicine codes for the highest-volume ARV and TB medicines in this simulation.',
    E'77 product codes in the current file (an earlier record says 78; see the note on inconsistencies). Fields: nappi_code, product_name, generic_name, atc_code, formulation, pack_size, scheduled_status.',null,null,S1);

  e := pg_temp.tl('icd10','2026-10-29 13:00+02','Action','1','Claude Code','Created the diagnosis code file',
    'A CSV of South African ICD-10 diagnosis codes, with both three- and four-character codes.','132 diagnosis codes.',null,null,S1);
  e := pg_temp.tl('icd10','2026-10-31 19:12+02','Error','1','Claude Code','Z00 and Z71.1 were missing from the diagnosis code file',
    'Two codes used by the hospital data were absent from the code list.','Z00 and Z71.1 absent from the original build.','Resolved',null,S2);
  perform pg_temp.tl('icd10','2026-10-31 19:20+02','Fix','1','Claude Code','Added Z00 and Z71.1 to the code file',
    'Both codes are now in the list.','',null,e,S2);

  perform pg_temp.tl('nrpl','2026-10-29 14:00+02','Action','1','Claude Code','Created the procedure and tariff code file',
    'A CSV of procedure items based on the 2006 National Reference Price List, used for medical scheme claims.','81 items.',null,null,S1);

  -- ============ Machine B (Huzayfa''s laptop) ============
  perform pg_temp.tl('dhis2_aggregate','2026-10-30 10:00+02','Action','1','Huzayfa','Built and populated the DHIS2-style aggregate database',
    'A PostgreSQL database of monthly reported totals (not patient rows) for an ART programme, on the partner''s laptop.',
    E'17 tables populated, 11 left empty on purpose. 29,596 data values, 30,006 rows in total, 18 periods, 22 organisation units (10 Gauteng facilities), 120 completed monthly returns.\nPort 5432. Reachable through the gateway only.',null,null,S1);
  perform pg_temp.tl('dhis2_aggregate','2026-10-30 11:00+02','Note','1','Huzayfa','Reported ART and viral-load figures in the data',
    'The numbers trend as a real programme would: patients on treatment creep up and viral suppression improves through 2025 but stays just under the 95% target.',
    E'ART current: 2,845 (Jan 2025) to 2,882 (Dec 2025).\nViral load suppression: Q1 85.5%, Q2 87.3%, Q3 90.1%, Q4 94.0% (target 95%).',null,null,S1);
  perform pg_temp.tl('dhis2_aggregate','2026-10-30 12:00+02','Error','1','Huzayfa','Queries fail: the schema search path is wrong',
    'The tables can be seen but queries against them fail because the database is not looking in the right schema. The partner needs to fix this.',
    'search_path misconfiguration found during the build. Partner fix pending.','Open',null,S1);

  perform pg_temp.tl('tiernet_clinic','2026-10-30 14:00+02','Action','1','Huzayfa','Built and populated the TIER.Net-style clinic database',
    'A file-based SQLite database of HIV treatment patients with visits, regimens, viral loads and outcomes, on the partner''s laptop.',
    E'13 tables populated, 12 empty on purpose. 38,521 rows, 3,515 patients (3,380 real plus 135 planted duplicates), 18,799 visits, 3,069 viral load results, 1,269 CD4 results.\nNo network port.',null,null,S1);
  perform pg_temp.tl('tiernet_clinic','2026-10-30 15:00+02','Note','1','Huzayfa','Six counted defects planted in the clinic data',
    'The gateway has to find and report each of these, not quietly fix them.',
    E'Duplicate patients 135 (4.0%). Missing baseline CD4 185 (5.5%). Late data entry over 30 days 1,638 (8.7%). Legacy regimens before 2016 56 (2.0%). No outcome after 6+ months 169 (5.0%). Viral load stored as text 100 (3.4%).',null,null,S1);
  perform pg_temp.tl('tiernet_clinic','2026-10-30 16:00+02','Error','1','Huzayfa','Some expected tables may be missing from the clinic database',
    'The partner has to confirm the tables against the build specification.',
    'Missing tables in tier_net_style.db. Partner to confirm schema.','Open',null,S1);

  -- ============ whole estate: where things stand ============
  perform pg_temp.tl('estate','2026-10-31 20:30+02','Note','1','Claude Code','Phase 1 foundation complete: 13 of 13 sources verified',
    'All 13 sources are populated and checked: 11 on Rajen''s PC and 2 on Huzayfa''s laptop. Two partner fixes are still open.',
    E'Machine A 11/11, Machine B 2/2, 20 defect types planted, 13/13 verified.\nRoughly 350K rows in private_hospital and 500K in public_hospital; 38,521 in the TIER.Net-style database and 30,006 in the DHIS2-style aggregate.',null,null,S2);
  perform pg_temp.tl('estate','2026-10-31 21:00+02','Note','1','Claude Code','Wrote the technical records and peer review',
    'Three internal documents now describe Machine A, Machine B and a review of all 13 sources.',
    'Machine A Technical Record, Machine B Technical Record and the Peer Review Summation, all dated 31 October 2026.',null,null,S2);
  perform pg_temp.tl('estate','2026-10-31 21:10+02','Note','1','Claude Code','The documents disagree on a few details',
    'Some figures and names differ between the three records and need reconciling.',
    E'1. HPRS and HPCSA ports: 1440 and 1441 in the older technical record, 1436 and 1437 in the newer Machine A record and the peer review.\n2. NAPPI file: 77 codes in two documents, 78 in the technical record.\n3. The ICD-10 file is called icd10_mit.csv in two documents and icd10_za.csv in the technical record.\n4. The facility list is a separate CSV in the technical record but counted with mfl_dhis2 elsewhere.\n5. Patient counts differ between versions (private 4,218 vs 4,326; public 6,716 after de-duplication vs 6,800).\n6. HPCSA boards: 11 seeded here; the real council has 12.',null,null,S2);
  perform pg_temp.tl('estate','2026-10-31 21:20+02','Decision','2','Rajen','Phase 2 gateway build waits for Rajen''s go-ahead',
    'No build instructions for the gateway are issued until the research is finished and Rajen says to start.',
    E'Phase 2 plan: gateway API layer, identity resolver, defect pipeline, registry checker, Machine B bridge.',null,null,S2);
end $$;
