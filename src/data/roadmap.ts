// Build order shown on the public site and the workspace dashboard.
// Moves into the database later so the team can edit it from Forged.
export type Status = 'In progress' | 'Planned'
export const ROADMAP: { title: string; text: string; status: Status }[] = [
  { title: 'Realistic source systems', text: 'Test sources that mirror how South African health data really looks, including its imperfections.', status: 'In progress' },
  { title: 'Core pipeline', text: 'Gateway, adapters, a common data model, identity matching, consent and audit.', status: 'Planned' },
  { title: 'Explorer website', text: 'An interactive tour of how health data moves across the country today.', status: 'In progress' },
  { title: 'Wider source coverage', text: 'More system types, database engines and data shapes.', status: 'Planned' },
  { title: 'Onboarding pipeline', text: 'AI-assisted mapping, schema introspection, validation and review.', status: 'Planned' },
  { title: 'Clinician platform', text: 'Secure sign-in, consent management and a doctor-facing app.', status: 'Planned' },
  { title: 'Beyond the pilot', text: 'More clients and real network separation.', status: 'Planned' },
]
