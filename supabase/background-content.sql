-- Background ("Real-world context") and Shortfalls for all 13 database cards.
-- Written from the DEXA technical records and peer review plus web research (sources linked in each text).
-- Run in the Forged SQL Editor after the migration. Re-running replaces these two fields.

update public.databases set
background = $b$**What it is in real life.** NAPPI (National Pharmaceutical Product Index) gives each medicine, and many medical devices and consumables, sold in South Africa its own numeric code. Pharmacies, doctors, hospitals, medical schemes and the companies that switch claims between them all use it so that "the same product" means the same thing everywhere. The product file is reported to be run by MediKredit and overseen by the NAPPI Advisory Board, a non-profit body of hospitals, schemes, administrators and medical associations. Those two roles come from secondary sources, so confirm them with MediKredit before quoting them. See [Wikipedia: NAPPI](https://en.wikipedia.org/wiki/National_Pharmaceutical_Product_Index).

**Why it matters here.** A claim with a wrong or missing NAPPI code is hard for a scheme to match to a price or a benefit, and a hospital that cannot code a medicine cannot be paid properly for it.

**In the simulation.** A flat CSV file, not a database, because NAPPI is passed around as a product file in real life. It holds 77 codes for the highest-volume ARV and TB medicines (one record says 78). Fields: code, product name, generic name, ATC code, formulation, pack size, scheduled status. The private hospital deliberately leaves 1.5% of medicine codes empty; the public hospital started at 36.8% empty and was corrected to 8.0%.$b$,
shortfalls = $b$- The simulation covers 77 medicines. The real index holds many thousands of products.
- Real NAPPI codes are tied to a pack, so the same medicine in two pack sizes has two codes. The simulation does not model that fully.
- Public-sector facilities often track medicines by their own stock lists, so NAPPI is patchy there. The gateway cannot assume every prescription line has a code.
- Ownership and access terms of the real file were not confirmed in the research.$b$
where slug = 'nappi';

update public.databases set
background = $b$**What it is in real life.** ICD-10 is the World Health Organization's coding system for diagnoses. In South Africa the Medical Schemes Act requires an account from a doctor, specialist or dentist to carry the right ICD-10 code, and entitlement to Prescribed Minimum Benefits depends on the diagnosis carrying a suitable code. Schemes can reject claims with incorrect codes. A National Task Team publishes the South African ICD-10 Coding Standards, and the official Master Industry Table is the national code list. Private hospitals employ dedicated coders; public hospitals code less consistently. Sources: [SAMA on ICD-10](https://samedical.org/private-health/icd_10), [Council for Medical Schemes coding standards](https://medicalschemes.com/files/ICD10%20Codings/ICD%20Coding%20Standards%20Vers%202%20June%2008.pdf).

**In the simulation.** A flat CSV of 132 South African ICD-10 codes, with both three- and four-character codes. The private hospital uses three-character codes (J06, not J06.9), which reflects common private-sector practice. Z00 and Z71.1 were missing from the first build and were added on 31 October 2026.$b$,
shortfalls = $b$- 132 codes is a tiny slice of the real list, which runs to many thousands.
- The task team warns that the Master Industry Table must not be used to code clinical conditions or to identify Prescribed Minimum Benefits. The simulation file is for testing only.
- Full implementation of the later ICD-10 phases has not happened across the industry, so real data mixes coding styles.
- Free-text diagnoses with no code are common in public records. The public hospital deliberately keeps about 3.5% uncoded.
- One document calls the file icd10_mit.csv and another icd10_za.csv. The name should be reconciled.$b$
where slug = 'icd10';

update public.databases set
background = $b$**What it is in real life.** The National Health Reference Price List (NRPL) was published by the National Department of Health in October 2006 as a guide price list for procedures and services, and medical schemes used it as a reference when paying providers. It was legally challenged and a High Court declaration invalidated it, which left billing confusion (sources: [gov.za notice](https://www.gov.za/news/health-publication-national-health-reference-price-list-08-oct-2006), [Bizcommunity](https://bizcommunity.com/Article/196/354/79985.html)). Providers and schemes have since relied on their own tariffs and negotiated rates. The research did not find a clear dated notice that the NRPL was formally withdrawn, so treat its current status as unconfirmed.

**In the simulation.** A flat CSV of 81 procedure items, based on the 2006 NRPL plus the Uniform Patient Fee Schedule. It supports claims adjudication in the private billing path.$b$,
shortfalls = $b$- It is a 2006 snapshot. Real tariffs have moved on and are not set in one national list.
- There is no single binding national tariff to model, so any "correct price" in the simulation is a simplification.
- 81 items is a very small sample of real procedure codes.$b$
where slug = 'nrpl';

update public.databases set
background = $b$**What it is in real life.** The National Health Laboratory Service (NHLS) is the diagnostic pathology service for South Africa's public sector, with a network of about 265 laboratories serving public hospitals and clinics. Tests appear on invoices as tariff codes (for example, one study notes code 2210 for a haemoglobin test), and the NHLS data warehouse holds those codes for every investigation. Primary care facilities request from an essential test list in the Department of Health's PHC Laboratory Handbook. Sources: [NHLS on Wikipedia](https://www.Wikipedia.org/wiki/National_Health_Laboratory_Service), [PHC Laboratory Handbook](https://knowledgehub.health.gov.za/system/files/elibdownloads/2023-04/PHC%252520Laboratory%252520Handbook%25252022%252520May%2525202018%252520Lo%252520Res.pdf).

**In the simulation.** A file-based SQLite database of 68 lab tests with specimen type, unit and reference range, in 4 tables. About 70% of the codes are mapped to LOINC and 30% are not, which is realistic for the public sector. It is loaded by the gateway's normalisation layer; there is no live connection.$b$,
shortfalls = $b$- One study counted more than 120,000 test codes in operational data. The simulation has 68.
- No official public catalogue of NHLS test codes was found, so the simulation's codes are a stand-in.
- Real results also carry units, flags and verification states that vary by laboratory system.
- LOINC mapping is partial, so results cannot always be matched to an international code.$b$
where slug = 'nhls';

update public.databases set
background = $b$**What it is in real life.** The Master Facility List (MFL) is the National Department of Health's list of health facilities, held on a portal built with the CSIR (user guide v1.2.4, 2021) and also published as a downloadable spreadsheet. DHIS2 is the open-source health information platform used for routine reporting, and it keeps its own list of organisation units. The two lists are meant to agree, but in practice they can drift apart. A facility can therefore carry three identifiers: the MFL unique ID, the DHIS2 organisation unit UID (used in API calls) and the DHIS2 organisation unit code (used in imports and exchange). Sources: [MFL user guide](https://knowledgehub.health.gov.za/system/files/elibdownloads/2023-04/MFL%2520User%2520guide%2520v%25201.2.4_20122021.pdf), [DHIS2 documentation](https://docs.dhis2.org/cs/implement/health/health-facility-profile/design.html).

**In the simulation.** A PostgreSQL database (port 5432) with 13 tables, 45 organisation units arranged as national, province, district, sub-district and facility, and 10 seeded Gauteng facilities (clinics, district and regional hospitals). A matching CSV, facility_masterlist.csv, carries the same three identifiers. The patient registry uses these real facility IDs.$b$,
shortfalls = $b$- Ten facilities stand in for several thousand real ones.
- The research found no published rule for how South African MFL and DHIS2 codes map to each other, so the crosswalk is the simulation's own.
- Real facility lists change often: openings, closures, renaming. The simulation is a fixed snapshot.
- The schema search path was checked and works here. The same fault is still open on the partner's aggregate database.$b$
where slug = 'mfl_dhis2';

update public.databases set
background = $b$**What it is in real life.** The South African Nursing Council (SANC) is the statutory regulator of nurses and midwives. Its register has separate categories for registered nurses and midwives, enrolled nurses and midwives, and enrolled nursing auxiliaries. To practise, a nurse needs an annual practising certificate (APC), which is issued when the annual fee is paid. SANC is moving to electronic certificates, with a pilot from July 2025 and full implementation planned from July 2026. Sources: [SANC annual fees and APCs](https://www.sanc.co.za/?p=3356), [SANC](https://www.sanc.co.za/?p=3066). Check the circulars for the current rules on continuing professional development, because sources disagree.

**In the simulation.** A file-based SQLite register of 3,500 nurses (RN, EN, ENA, CS, SPEC) with registration, practice location and status. Valid APC 2,712, lapsed 363, renewal due 209, not issued 76. 140 nurses are suspended on purpose (77 RN, 31 EN, 25 ENA; reasons: non-payment 58, disciplinary 49, voluntary 20, criminal 13) so the gateway can be tested on checking a nurse's standing. It is treated as a periodically refreshed reference, not a live service.$b$,
shortfalls = $b$- A 4% suspension rate was chosen for testing. It is not a real statistic.
- A real nurse can hold more than one registration category, and the register changes daily. The simulation is a snapshot.
- SANC has online verification, but the gateway cannot assume real-time access, so the simulation behaves as a batch reference.
- The real register is far larger than 3,500.$b$
where slug = 'sanc';

update public.databases set
background = $b$**What it is in real life.** The Health Professions Council of South Africa (HPCSA) is a statutory body created by the Health Professions Act 56 of 1974. It registers and regulates doctors, dentists, psychologists, allied health professionals and others through 12 professional boards. Registration is a legal requirement to practise, and practitioners pay annual fees due from 1 April. Sources differ on what happens when fees are not paid (suspension or removal from the register), so confirm with the council. Sources: [HPCSA annual fee notice 2026/27](https://www.psyssa.com/hpcsa-annual-fee-notice-for-2026-27/), [Health Professions Act](https://shop.acts.co.za/health-professions-act-1974/health_professions_act_1974_content.php).

**In the simulation.** A SQL Server database on its own instance, with 5 tables: practitioner, board, registration, qualification and disciplinary history. 2,500 practitioners and 11 seeded boards. Status values: Active, Suspended, Lapsed. The gateway uses a read-only login (hpcsa_reader), with its password kept outside any code.$b$,
shortfalls = $b$- The simulation seeds 11 boards. The real council has 12, so one board is missing.
- Status is simplified to three values. Real records also track conditions on registration and the date of each change.
- 2,500 practitioners is a small fraction of the real register.
- It is a batch-refreshed reference, not a live lookup.$b$
where slug = 'hpcsa';

update public.databases set
background = $b$**What it is in real life.** The Council for Medical Schemes (CMS) regulates medical schemes under the Medical Schemes Act 131 of 1998. It publishes its registers and annual reports, and members of the public can look schemes up on its website. Recent reporting puts the industry at about 70 to 71 registered schemes covering roughly nine million members; counts differ by year and method, so check the latest CMS report. Discovery Health Medical Scheme is the largest open scheme, with 2,735,204 beneficiaries at 31 December 2024 and about 58% of the open-scheme market. Sources: [Daily Maverick](https://www.dailymaverick.co.za/article/2024-10-16-medical-schemes-hustle-for-the-young-and-fit.md), [Discovery 2024 results](https://www.discovery.co.za/assets/discoverycoza/corporate/investor-relations/2024/dhms-highlights-of-results-2024.pdf).

**In the simulation.** A PostgreSQL database on its own instance (port 5433, separate data folder and Windows service) with 4 tables: scheme, scheme option, member and claim. 7 real schemes (Discovery, Bonitas, Medihelp, Momentum and others) and 37 plan options. It lets the private billing path check that a scheme exists. CMS publishes no real-time interface, so this is a queryable stand-in.$b$,
shortfalls = $b$- Seven schemes stand in for about seventy.
- Real benefit options change each year and have many more attributes than the simulation holds.
- Member and claim tables are stand-ins. Real member data sits with each scheme's administrator and is not published.
- Open and restricted schemes behave differently, and the simulation does not distinguish them.$b$
where slug = 'cms';

update public.databases set
background = $b$**What it is in real life.** The Health Patient Registration System (HPRS) is the National Department of Health's electronic patient registration system, developed with the CSIR. It assigns each registered person a unique number so that one person is recognised across facilities, and it is meant to supply the National Health Insurance beneficiary registry. A 2019 report said more than 42 million people had been enrolled. Rollout has been uneven: KwaZulu-Natal reported budget shortfalls and unreliable connectivity in 2025, and said the system only handles registration and does not yet connect with other departmental systems. Sources: [Department of Health SOP](https://knowledgehub.health.gov.za/system/files/elibdownloads/2023-04/FACILITY%2520LEVEL%2520SOP.pdf), [The Post, 2025](https://thepost.co.za/news/south-africa/kwazulu-natal/2025-06-11-challenges-in-implementing-the-health-patient-registration-system-in-kwazulu-natal), [Parliament, July 2025](https://allafrica.com/stories/202507030357.html).

**In the simulation.** A lookup and verification service only, with no clinical data, on its own SQL Server instance. 15,000 registered patients. The key design decision: the HPRN is a separate 12-digit system-assigned number, and the 13-digit SA ID is a separate column. The first build wrongly used the ID number as the HPRN and was corrected. About 8% of records have no HPRN, about 3% are flagged as possible duplicates, and 65% are unverified. Sync status: 55% synced, 30% pending, 15% failed. All 15,000 registered facility IDs are real MFL/DHIS2 UIDs. The gateway uses a read-only login (hprs_reader).$b$,
shortfalls = $b$- Real coverage and data quality differ by province. The simulation's rates are test settings, not measurements.
- Death records do not flow automatically into the registry, and the simulation does not model that either.
- Provinces such as the Free State run their own patient master index and send daily updates to the national system. The simulation has a single registry.
- Private hospitals have no enforced link to the HPRS, so a private patient may not have an HPRN at all.
- One technical record lists this database under the wrong engine. It is SQL Server.$b$
where slug = 'hprs';

update public.databases set
background = $b$**What it is in real life.** South Africa's private hospital sector is dominated by a few groups, such as Netcare, Mediclinic and Life Healthcare. Care is mostly paid through medical schemes, so every claim carries an ICD-10 diagnosis code, NAPPI medicine codes and tariff codes. Private hospitals employ dedicated clinical coders and run proprietary hospital information systems that differ from group to group. This database follows that archetype.

**In the simulation.** A clean, low-defect hospital database on the default SQL Server instance (port 1433) with 197 tables: patients, encounters, diagnoses, prescriptions, lab orders and results, and billing. 4,326 patients, 47,465 encounters, 57,020 diagnoses and 166,331 billing charges. Diagnoses use three-character ICD-10 codes. After six correction passes and a seasonal regeneration on 31 October 2026: duplicate patients 0.40%, undiagnosed encounters 0.80%, zero-value billing 0.80%, empty medicine codes 1.50% (deliberate), empty lab values 0%. Respiratory illness peaks in winter (2.04 times) and trauma in summer (1.64 times).$b$,
shortfalls = $b$- It is one archetype. Real groups each use different systems and schemas.
- The SA ID number can be empty, and there is no enforced link to the national patient registry.
- A real hospital has far more tables, free text and attachments than 197 tables of structured data.
- Billing is simplified. Real claims involve scheme rules, authorisations and rejections.
- Patient counts differ between records (4,218 and 4,326), so one needs reconciling.$b$
where slug = 'private_hospital';

update public.databases set
background = $b$**What it is in real life.** Public hospitals are run by the provincial health departments. They serve most of the population, often on older, separate systems and paper folders; the technical record names MEDICOM, Clinicom and legacy folder systems as the archetype. A patient is usually identified by a folder number at that hospital, not by a national number. Billing is patchy because many patients are not billed in the same way as scheme members. The National Department of Health issued a bid invitation for electronic medical record implementation in March 2026, which signals that this is still changing. Check [that notice](https://www.health.gov.za/wp-content/uploads/2026/03/NDoH04-20252026-Final-BSC-Invitation-to-Bid-EMR-implementation-03-03-2026.pdf).

**In the simulation.** A deliberately messy database on its own SQL Server instance (PUBHOSPITAL, port 1438), scoped to one Gauteng public hospital, with 108 tables in two layers: a structured hospital information system, and a legacy flat layer, plus billing tables. 6,716 patients and 75,783 encounters after de-duplication, 84,811 diagnoses, 132,151 lab results and 115,607 prescriptions. After six correction passes: duplicates 2.99%, undiagnosed encounters 4.0%, empty medicine codes 8.0%, empty ICD-10 codes 3.5%, trauma summer peak 1.84 times. 58.5% of encounters have no bill, by design.$b$,
shortfalls = $b$- The defect rates are test settings. They were chosen to be realistic, not measured at a real hospital.
- A real public hospital has many more systems (radiology, pharmacy stock, theatre) than are modelled.
- Folder numbers are only unique within one hospital, so matching across facilities is genuinely hard.
- Patient counts differ between records (6,716 after de-duplication and 6,800 before).
- Free-text diagnoses are common in real public records. Most were coded here, but not all.$b$
where slug = 'public_hospital';

update public.databases set
background = $b$**What it is in real life.** DHIS2 is the open-source platform that districts and provinces use to collect routine health statistics. An aggregate database holds monthly totals reported by each facility (for example, how many patients are on antiretroviral treatment) and not the individual patients. It is organised as data elements, organisation units, periods, datasets and completed returns. For HIV viral load, the target is for 95% of those tested to be suppressed.

**In the simulation.** A PostgreSQL database on the partner's laptop (Machine B), reachable only through the gateway and not by direct SQL. 17 tables populated and 11 left empty on purpose to resemble a sparse real instance. 29,596 data values (30,006 rows in total), 18 monthly periods, 22 organisation units including 10 Gauteng facilities, and 120 completed monthly returns. Patients on ART rise from 2,845 in January 2025 to 2,882 in December 2025. Viral load suppression improves each quarter, from 85.5% to 94.0%, and stays under the 95% target.$b$,
shortfalls = $b$- **Open:** queries fail because the schema search path is set wrong. The partner has to fix this before the gateway can read it.
- Aggregate totals hide duplicates and errors in the underlying patient data. Two facilities can report the same patient.
- Real returns arrive late and incomplete. The simulation's monthly returns are tidy.
- The partner's companion document is waiting for this fix.
- Direct SQL from Rajen's machine is impossible by design, so any test must go through the Machine B bridge, which is not built yet.$b$
where slug = 'dhis2_aggregate';

update public.databases set
background = $b$**What it is in real life.** TIER.Net (Three Interlinked Electronic Registers) is the electronic register used to record each patient on antiretroviral therapy in the South African public sector. It replaced paper registers from December 2010 and has been rolled out to most public ART service points. A 2025 study found that viral load capture in TIER.Net has reached close to 100%, while CD4 capture is still sub-optimal. The research found no source saying it has been replaced. Sources: [UCT working paper](https://health.uct.ac.za/media/41896), [PMC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10021242).

**In the simulation.** A file-based SQLite database on the partner's laptop (Machine B), with no network port. 13 tables populated and 12 left empty on purpose to look like a partial deployment. 38,521 rows, 3,515 patients (3,380 real and 135 planted duplicates), 18,799 visits, 3,069 viral load results and 1,269 CD4 results. Six counted defects are planted: duplicate registrations 135 (4.0%), missing baseline CD4 185 (5.5%), late data entry over 30 days 1,638 (8.7%), legacy regimens from before 2016 56 (2.0%), no outcome after six months 169 (5.0%), and viral load stored as text 100 (3.4%).$b$,
shortfalls = $b$- **Open:** the partner needs to confirm the schema, because tables may be missing against the build spec.
- It covers one programme (ART). The real register is moving towards HIV, TB and maternal and child health in one system.
- Real patients move between clinics and are registered again, which produces duplicates the simulation can only approximate.
- The gateway must convert text viral loads to numbers and flag the 56 pre-2016 regimens for review.
- Like the aggregate database, it cannot be reached by direct SQL, so the bridge is needed.$b$
where slug = 'tiernet_clinic';
