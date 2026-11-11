-- Background ("Real-world context") and Shortfalls for all 13 database cards.
-- Machine A (11 cards) is written from the 11 source documents dated 10 November 2026.
-- Machine B (2 cards) comes from the earlier Machine B record plus web research, because it is not in that pack.
-- Re-running replaces these two fields.

update public.databases set
background = $b$**In real life.** NAPPI gives every medicine and medical product sold in South Africa a unique number, used on prescriptions, dispensing records and scheme claims. MediKredit maintains the product file (confirmed). A NAPPI Advisory Board governs it (partly confirmed). It is shared as a licensed product file that users load, not as a live service. See [Wikipedia: NAPPI](https://en.wikipedia.org/wiki/National_Pharmaceutical_Product_Index).

**In the simulation.** A plain CSV of 77 products (15 columns, 10-digit codes, no duplicates), leaning towards antiretrovirals and other public-programme medicines. It was written on 25 October 2026 from a build instruction that asked for about 200. On 10 November the hospitals were linked to it: 27 of the private hospital's 92 products and 33 of the public hospital's 103 now appear in it, and about 3% of matched codes are mistyped on purpose.$b$,
shortfalls = $b$- The source, licence and extraction date of the 77 rows are not recorded, so it must never be called the official list.
- The real code length is not established. Our 10 digits are read as a 7-digit product code plus a 3-digit pack code, which is our reading.
- The real list is far larger, so about two thirds of hospital products will not be found.
- There is no generating script or seed, so the file cannot be reproduced exactly.$b$
where slug = 'nappi';

update public.databases set
background = $b$**In real life.** ICD-10 is the international list of diseases. South Africa's private healthcare industry uses a version called the Master Industry Table, which adds detail such as a flag for Prescribed Minimum Benefits (conditions every scheme must cover by law). The National Department of Health publishes it as downloadable Excel and CSV files. The page lists versions dated 1 January 2014, change files from 2014 and a 2021 Excel file dated 16 March 2021 (confirmed).

**In the simulation.** A plain CSV of 132 codes with 14 columns across 9 chapters. 88 are flagged as PMB and 44 are not. It was written on 25 October 2026. On 10 November every code was added to both hospitals' own code lists, and the public hospital's older diagnosis log was filled in, leaving 4,496 encounters (5.9%) without a row on purpose. About 2% of public diagnosis codes are invalid or truncated on purpose.$b$,
shortfalls = $b$- The real table has tens of thousands of codes. Ours has 132, so most real diagnoses will not be found.
- The release label MIT2024.1 does not appear among the releases on the official page, and the origin of the rows is not recorded.
- The private hospital uses 3-character codes and the file lists longer ones, so a roll-up rule is needed (Phase 2).
- The public hospital's two diagnosis stores disagree on the first main diagnosis for 12,652 encounters. This is accepted as realistic drift.
- Our columns follow what a published table carries, not the official layout document, which was not opened.$b$
where slug = 'icd10';

update public.databases set
background = $b$**In real life.** Every billed service has a code and a reference price. Private medical aids use the National Reference Price List (NRPL). Public hospitals charge patients by the Uniform Patient Fee Schedule (UPFS), which sets fees by means-tested category. Regulations under the National Health Act cover the determination and publication of reference price lists. Claims to schemes carry NRPL, ICD-10 and NAPPI codes.

**In the simulation.** A plain CSV of 81 priced items (11 columns): 69 NRPL rows and 12 UPFS rows, across 17 provider groups. Written on 25 October 2026. On 10 November the hospitals were linked: 6 of the private hospital's 10 tariff codes and 217 of the public hospital's 448 now match, and about 3% of matched public codes are mistyped on purpose.$b$,
shortfalls = $b$- The source of the 81 rows is not established, so it must never be called the official list.
- The meanings of item types M (modifier), N (note) and R (rule) are inferred from the file, not confirmed.
- The real lists are far larger. Laboratory, pharmacy, blood, mortuary, physiotherapy and bed-day items have no equivalent and keep their own codes.
- The scheme code translation table is empty by design (Phase 2).
- Some reporting says the NRPL was legally challenged, and its current standing was not confirmed in the research.$b$
where slug = 'nrpl';

update public.databases set
background = $b$**In real life.** The National Health Laboratory Service (NHLS) runs the public laboratory service and tests samples for public hospitals and clinics. A published study of its turnaround times names the laboratory information system as TrakCare and describes a national network with a central data warehouse. Earlier research put the real catalogue at more than 2,400 tests and named LOINC and SNOMED CT as mapping standards.

**In the simulation.** One SQLite file with 4 tables. The catalogue holds 68 tests in six disciplines, with LOINC codes on all 68 and SNOMED CT on 21. The three order and result tables are empty on purpose. A schema and 21 tests were written on 25 October 2026, and the catalogue was expanded to 68 on 26 October. On 10 November the hospitals were aligned to it: 24 of 40 private tests and 94,355 of 135,988 public result rows now carry a catalogue code.$b$,
shortfalls = $b$- The real NHLS test codes are proprietary, so the codes here are invented and cannot be checked against the real list.
- 68 tests against a real catalogue of more than 2,400 is about 2.8%.
- There are no orders or results here. This is a catalogue, not a record of real tests.
- Units differ on purpose between sources, for example creatinine in mmol/L in the private hospital and µmol/L here.
- Only 21 of 68 tests have a SNOMED CT code.$b$
where slug = 'nhls';

update public.databases set
background = $b$**In real life.** The Master Facility List (MFL) is the national register of public and private health facilities. Each has a unique ID, a name and a sector, and public facilities have a province and a district (from the Department of Health user guide, version 1.2.4). DHIS2 is the District Health Information Software used for routine facility reporting, and its facility tree is the agreed list of public facilities.

**In the simulation.** A PostgreSQL database in the standard DHIS2 layout, 13 tables, 6 of which hold data. 37 facilities in Gauteng inside a tree of 59 organisation units (1 country, 9 provinces, 5 districts, 7 sub-districts). Facility names are real public hospital and clinic names, and every other detail is simulated. Written on 25 October 2026; on 10 November the two hospitals and 25 feeder clinics were added, every code was filled, and 24 data elements, 34 monthly periods and one data set were added. A facility can be known by four identifiers.$b$,
shortfalls = $b$- 37 Gauteng facilities stand in for a national register of thousands.
- There is no reporting data: the datavalue table is empty.
- The partner's DHIS2-style database, with its own list of data elements, is not on this computer, so ours was not matched to it.
- The standard DHIS2 layout was not checked table by table against the current release.
- No read-only database role exists yet (Phase 2).$b$
where slug = 'mfl_dhis2';

update public.databases set
background = $b$**In real life.** To work as a nurse in South Africa you must be on the Nursing Council register and renew your certificate every year. At 31 December 2024 the register held 265,877 nurses and midwives: 157,097 registered, 49,054 enrolled and 59,726 auxiliary (confirmed from the Council's growth table). Regulation R.195 says what the register must hold, including name, ID or passport, category, first registration date, qualification, certificate number and the date and reason for any suspension.

**In the simulation.** One SQLite file with 3 tables: 3,500 invented nurses, 3,640 registrations and 5,830 practice locations. Written on 25 and 26 October 2026, with about 4% suspended on 27 October (140 nurses: RN 77, EN 31, ENA 25, CS 4, SPEC 3). On 10 November every ID was repaired, 167 hospital staff were linked, and practice history was added for 1,911 nurses.$b$,
shortfalls = $b$- 3,500 nurses against 265,877. The suspension rate, reasons and proportions are our own choice, not real figures.
- Midwife and specialist are separate categories here. The Council's growth table counts midwives inside other groups, and the regulation does not list a specialist category.
- 106 hospital staff were renamed to match the register. This is an accepted design choice.
- The generator that wrote the population and its seed are not on this computer.
- A file has no access control and no protection against two programs writing at once.$b$
where slug = 'sanc';

update public.databases set
background = $b$**In real life.** Registration with the Health Professions Council is legally required to practise a health profession, and failing to register is a criminal offence (from the Council's 2024 annual report). Practitioners are organised into professional boards and renew every year. The annual report gives 181,981 for 2023/24, but the text does not make clear whether that is the whole register, so it was used only as a scaling anchor.

**In the simulation.** SQL Server on its own instance and port, so the gateway treats the regulator as a separate organisation. 5 tables with 2,500 invented practitioners, 2,562 registrations and 11 boards. Written on 25 and 26 October 2026. On 10 November every practitioner got a valid ID, 62 got a second board and 62 an earlier address, and hospital doctors were linked (57 of 72 public and 23 of 30 private). 248 practitioners are not simply Active.$b$,
shortfalls = $b$- No HPCSA data dictionary is public, so every table, column, board code, status name and registration number format is our own design.
- All practitioners practise in Gauteng, and the status mix is our own choice.
- No suspended hospital doctor resolves, because every linked doctor is Active.
- The generator and seed for the population are not on this computer.
- A read-only login exists, but there is no database encryption, masking or audit.$b$
where slug = 'hpcsa';

update public.databases set
background = $b$**In real life.** The Council for Medical Schemes lists 70 registered schemes (16 open, 54 restricted) at 31 March 2026, with about 8.9 million beneficiaries (CMS 2025/26 annual report). An open scheme accepts any member of the public. A restricted scheme serves one group, such as the employees of one employer. The Council publishes no member data model, and a scheme's member number has no national format.

**In the simulation.** A PostgreSQL database on its own instance with 4 tables: 10 schemes, 40 options and 8,000 invented members. Written on 25 and 26 October 2026. On 10 November 454 members were tied to private-hospital patients (about 7% of their numbers mistyped on purpose), SAMWUMED and Keyhealth were added, and Medshield replaced the unverified Aetna. No member has an SA ID number, on purpose.$b$,
shortfalls = $b$- 10 schemes against 70, and member counts and mix are our own choice, not real market shares.
- Because no member has an SA ID, the gateway has to match on names, birth dates and member numbers.
- The real registration numbers of the seeded schemes are not confirmed, and three are synthetic placeholders.
- The scheme code translation table is empty by design (Phase 2). The database uses WIN1252 encoding, accepted as a realistic mismatch.
- No read-only role exists yet, SSL is off and no logging is switched on.$b$
where slug = 'cms';

update public.databases set
background = $b$**In real life.** The Health Patient Registration System (HPRS) is the National Department of Health's patient registry. It exists, is linked to the laboratory service and issues a Master Patient Index number (confirmed by a written parliamentary reply, question NW2717, 15 September 2022). That reply reported 63,241,201 people registered at the point of care and 3,150 public facilities (3,089 primary care and 61 hospitals) as at 29 August 2022, and says some may have died or left the country.

**In the simulation.** A lookup and verification registry with no clinical data, on its own SQL Server instance. 15,000 invented patients across 4 tables (59,799 rows), weighted to Gauteng (85.3%). The HPRN is our own 12-digit number and never the SA ID. On 31 October the structure was fixed to keep them apart, and on 10 November every SA ID was made valid and 1,500 patients were linked to the hospitals.$b$,
shortfalls = $b$- 15,000 patients against tens of millions. The real design, including the HPRN shape and how duplicates are flagged, is not public. The simulation reproduces documented behaviour, not hidden design.
- The mix of missing, duplicate, unverified and failed records is our own choice. Duplicates are flags only: of 450 flagged, only 13 also have record status Duplicate.
- Only the linked subset has hospital, scheme and laboratory numbers.
- Every patient has one mobile number and one address, so the history columns are unused.
- Older documents still call mpi_id the HPRN, which is a documentation task.$b$
where slug = 'hprs';

update public.databases set
background = $b$**In real life.** South Africa's private hospital groups include Netcare, Mediclinic and Life Healthcare. None publishes its tables or engine, so the "private hospital" is our own framing of that archetype, and every table and column name is our own. Care is paid through medical schemes, so every claim carries ICD-10, NAPPI and tariff codes.

**In the simulation.** The clean control: 197 tables in 20 schemas, 375 enforced foreign keys, 4,218 patients, 47,465 visits and about 1.89 million rows. Built from a blueprint on 29 September 2026, loaded on 24 October, corrected and given 46 more tables of data on 26 October, audited for realism on 31 October and closed out on 10 November. It is still not perfect: account totals, diagnoses, codes and ID numbers carry small deliberate faults. 500 patients are linked to the national registry.$b$,
shortfalls = $b$- One hospital with one facility, so a group-level patient master across sites is not exercised.
- The error rates are targeted ranges set in our own audit, not published figures.
- It keeps its own diagnosis, product, tariff and laboratory codes. Only 5 of its 75 distinct diagnosis codes appear in the national file, which mostly holds longer codes.
- 253 visits dated before birth were moved. Last-visit dates were not recalculated, so 14 patients differ from their latest visit and 18 have none.
- 61 tables are empty by design, and the base load has no recorded seed so it cannot be reproduced.$b$
where slug = 'private_hospital';

update public.databases set
background = $b$**In real life.** Public hospital data is older and messier. The central patient index is planned as one file per patient per facility, but duplicates persist (earlier project research). The planned fault rates here are borrowed from a Western Cape study, according to the defects file, and are not figures for this hospital. A daily laboratory import is aspirational, not universal.

**In the simulation.** Built to be messy, as a legacy system with a newer layer on top: 108 tables, of which 100 are the old system (dbo) and 8 a tidier layer (his). 35 tables have no key, only 7 relationships are declared, and 151 more columns look like links that nobody enforced. 6,716 patients, 75,783 visits and about 1.71 million rows. Schema 29 September 2026, population 25 and 26 October, realism fix 31 October, and linking of 1,200 patients to the national registry on 10 November. Only 36.3% of visits have a charge.$b$,
shortfalls = $b$- It shows what a messy source looks like. It does not describe any named hospital, and no real hospital schema was used.
- One hospital only. There is no patient without a visit, and no lab result row is ever blank, which a real feed would not guarantee.
- Billing is a stated target, 45% of visits unbilled by design, not measured from a real hospital.
- Gastro seasonality was created by swapping diagnoses, and the private hospital has none.
- Nothing is encrypted, masked or classified, and the seed for the first population is not recorded.$b$
where slug = 'public_hospital';

update public.databases set
background = $b$**In real life.** DHIS2 is the open-source platform that districts and provinces use to collect routine health statistics. An aggregate database holds monthly totals reported by each facility (for example, how many patients are on antiretroviral treatment) and not the individual patients. It is organised as data elements, organisation units, periods, datasets and completed returns. For HIV viral load, the target is for 95% of those tested to be suppressed.

**In the simulation.** A PostgreSQL database on the partner's laptop (Machine B), reachable only through the gateway and not by direct SQL. 17 tables populated and 11 left empty on purpose. 29,596 data values, 18 monthly periods, 22 organisation units including 10 Gauteng facilities, and 120 completed monthly returns. Patients on ART rise from 2,845 in January 2025 to 2,882 in December 2025. Viral load suppression improves each quarter, from 85.5% to 94.0%, and stays under the 95% target. This card is written from the earlier Machine B record, which is not in the 11-document pack.$b$,
shortfalls = $b$- **Open:** queries fail because the schema search path is set wrong. The partner has to fix this before the gateway can read it.
- Aggregate totals hide duplicates and errors in the underlying patient data.
- Real returns arrive late and incomplete. The simulation's monthly returns are tidy.
- Direct SQL from Rajen's machine is impossible by design, so any test must go through the Machine B bridge, which is not built yet.$b$
where slug = 'dhis2_aggregate';

update public.databases set
background = $b$**In real life.** TIER.Net (Three Interlinked Electronic Registers) is the electronic register used to record each patient on antiretroviral therapy in the South African public sector. It replaced paper registers from December 2010 and has been rolled out to most public ART service points. A 2025 study found that viral load capture in TIER.Net has reached close to 100%, while CD4 capture is still sub-optimal. The research found no source saying it has been replaced.

**In the simulation.** A file-based SQLite database on the partner's laptop (Machine B), with no network port. 13 tables populated and 12 left empty on purpose. 38,521 rows, 3,515 patients (3,380 real and 135 planted duplicates), 18,799 visits, 3,069 viral load results and 1,269 CD4 results. Six counted defects are planted: duplicate registrations 135 (4.0%), missing baseline CD4 185 (5.5%), late data entry over 30 days 1,638 (8.7%), legacy regimens from before 2016 56 (2.0%), no outcome after six months 169 (5.0%), and viral load stored as text 100 (3.4%). This card is written from the earlier Machine B record.$b$,
shortfalls = $b$- **Open:** the partner needs to confirm the schema, because tables may be missing against the build spec.
- It covers one programme (ART).
- Real patients move between clinics and are registered again, which produces duplicates the simulation can only approximate.
- The gateway must convert text viral loads to numbers and flag the 56 pre-2016 regimens for review.
- It cannot be reached by direct SQL, so the bridge is needed.$b$
where slug = 'tiernet_clinic';
