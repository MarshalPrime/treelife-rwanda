# Pilot readiness

This package describes a possible first pilot. It does not name a partner, a site, or a result. No organization has agreed to host a trial, and no field data has been collected with this software.

## Problem and proposal

Urban and fruit trees are planted by households, cooperatives, institutions, and city programs. Following a tree from planting through survival and fruiting is hard when the record is a paper list or a spreadsheet that does not keep the place, the tree, and later inspections together.

TreeLife proposes a small registration system beside FMES: a planting site, then either one tree or a batch, with optional coordinates and later inspections. FMES remains the government forestry system. TreeLife should exchange data with it only after the system owner agrees the mapping.

## Initial pilot use case

One supervised team registers planting sites and new trees or batches for a limited period, then records at least one follow-up inspection. The pilot answers whether the forms are understandable, whether coordinates are captured often enough to be useful, and whether the records can be reviewed by a supervisor. It does not try to run nursery sales, payments, or a national rollout.

Candidate roles, not assigned people:

- Field officer: registers sites, trees, batches, and inspections.
- Supervisor or administrator: reviews records and the audit log.
- Viewer: a partner staff member who needs to read but not change records.
- Farmer or household member: not a direct user in the first pilot unless the partner explicitly wants that and a consent process is in place. The first interface is English and assumes a trained officer.

## Implemented and planned

Implemented now:

- Sign-in and three roles
- Site, individual tree, and planting-batch registration
- Edit, search, filter, and pagination
- Inspections that can update status
- Map of records that have coordinates, and a list of records that do not
- Synthetic demonstration data, clearly labelled
- API tests, form validation tests, and a smoke script

Not implemented:

- Offline queue and sync
- Kinyarwanda and French
- Nursery production, distribution, maintenance work orders, harvest lots, and sales
- FMES or any other government connection
- Production hosting, backups, and an institutional account process
- Measured field performance

## Proposed pilot workflow

1. Agree the area, the tree types, and who may see coordinates.
2. Create named officer accounts. Do not share the demonstration passwords.
3. Train officers on site, then tree or batch, then inspection.
4. Register records while a supervisor can see the same database.
5. Review missing coordinates, incomplete species, and inspections weekly.
6. Stop before any real export to another system.

## Field-testing checklist

Use this only after a partner and a data-protection arrangement exist.

- [ ] Officers can explain the difference between a site, a tree, and a batch.
- [ ] A new site can be saved with and without coordinates.
- [ ] An invalid coordinate or a zero quantity is rejected in words the officer understands.
- [ ] A tree saved without coordinates is visibly absent from the map.
- [ ] "Use site coordinates" is used only when the officer means that the tree shares the site point.
- [ ] An inspection can be found again the next day.
- [ ] A viewer account cannot change records.
- [ ] The phone remains usable in sunlight and with one hand.
- [ ] The officer knows what happens if the network drops. Today, the safe action is to submit again on the same form. Closing the form can lose the unsent entry.
- [ ] No real household name or phone number was typed into the notes.

## Proposed indicators

These are proposals. They have not been measured.

- Share of new records with required fields filled.
- Share of tree and batch records with coordinates.
- Minutes to register one site and one tree, observed by a supervisor, not self-reported in the software.
- Share of registered trees or batches with an inspection inside the agreed follow-up window.
- Count of records a supervisor corrects after review.
- Count of duplicate records that had to be retired.

Do not treat a fast demo on a laptop as a field timing.

## Data protection and consent

Before any real plot is registered:

- [ ] Name the data controller and who operates the server.
- [ ] State what is collected: place names, coordinates, organization name, species, dates, status, and notes. Do not add phone numbers or national IDs for the first pilot.
- [ ] Explain who can see exact coordinates.
- [ ] Use a consent or institutional authorization appropriate to the partner. Do not assume a farmer consented because an officer has an account.
- [ ] Keep demonstration data out of the pilot database.
- [ ] Agree how long records are kept and how a correction is requested.
- [ ] Agree what is backed up and who can export it.
- [ ] Do not publish a map of real farms.

## Questions for FMES and domain experts

- Which urban and fruit-tree facts does FMES already store?
- Is the exchange a one-way submission, a read of existing stands, or both?
- What identifier should be stored in `external_id`?
- Are official coordinates points, parcels, or administrative units, and in which CRS?
- Does a planting batch correspond to any FMES object?
- Which species names and local names should be the reference list?
- Who may register a tree on private land, and who may see the coordinate?
- What status words do field teams already use for survival?
- Is a nursery a site, a stock location, or a separate register?

## Prerequisites, risks, and dependencies

Prerequisites:

- A named pilot owner and a decision that real data may be collected
- Hosting with backups, TLS, and access control
- Accounts for the actual officers, with the seed data removed
- A consent or authorization note
- A training session and a support contact during the trial
- A tile service suitable for the expected map traffic

Risks:

- Coordinates reveal homes or farms if access control is loose.
- English screens will exclude officers who need Kinyarwanda or French.
- Officers will lose entries if the network fails, because offline sync does not exist.
- Species local names in a later list may be wrong if they are guessed.
- A premature FMES claim would misrepresent both systems.

Costs and dependencies, not priced:

- A small server and a PostGIS database
- Staff time for training and weekly review
- Translation
- Possibly a map-tile arrangement
- Legal review of the data flow before any institutional handover

No quote, vendor, or budget figure is stated here because none has been obtained.
