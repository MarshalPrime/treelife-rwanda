# Project status

Last updated: 2026-10-26

The repository started as a README and an initial commit on `main`, tracking `origin` at `https://github.com/MarshalPrime/treelife-rwanda.git`. The remote repository is private. Before this implementation it contained only that initial commit.

## Milestone 1 — Repository foundation

Done. The project layout, license, environment example, Compose file, CI workflow, and setup docs are in place.

## Milestone 2 — Database and API

Done. Alembic revisions `0001_initial` and `0002_value_chain` create the PostGIS schema. Site, tree, batch, inspection, farmer, nursery, distribution, growth, maintenance, harvest, sale, advice, analytics, map, and audit routes are implemented.

Local result on 2026-10-26, against PostGIS in Docker:

- `ruff check` passed
- `ruff format --check` passed
- `pytest`: 18 passed

## Milestone 3 — Frontend

Done. Registration, lists, details, editing, and role-aware actions call the API. Loading, empty, error, and success states are on the main screens.

Local result:

- Vitest: 4 passed
- `tsc --noEmit` passed
- `next lint` passed
- `next build` passed

The same frontend checks were run again after the mobile layout and map fixes: Vitest 3 passed, typecheck passed, lint passed, and `next build` passed with no warnings.

## Milestone 4 — Map and demonstration data

Done. The map requests `/api/v1/map`, draws markers, and lists records without coordinates. `python -m app.seed` loads labelled synthetic records.

## Milestone 5 — Quality and pilot package

Docs for architecture, the data model, the API, setup, the demo script, offline limits, FMES, and the pilot package are in the repository.

Checked on 2026-10-26 against the local API and the Next.js dev server:

- `python3 tests/smoke.py` passed. It created synthetic records `SITE-2026-JUU3U2`, `TREE-2026-6LN9FG`, and `BATCH-2026-Y72QWF`. Health reported PostGIS 3.4.
- Browser walkthrough as the demo field officer: empty site name was rejected, then a labelled synthetic site, one avocado tree, and one mango batch of 25 were saved. A quantity of 0 was rejected. The tree was edited to Surviving. The map loaded OpenStreetMap tiles and markers, selected the new records, filtered to mango, and showed the empty state for a filter with no matches. Records without coordinates were listed separately.
- The demo viewer account reached the overview and was told it cannot change records. Opening site registration showed "You do not have permission to register a site."

These rows are synthetic interface checks. They are not field observations.

Checked again on 2026-10-26 after the value-chain work, with `docker compose up` serving the API and the web app:

- A field officer created a farmer, a seedling lot, a distribution, a growth measurement, a watering record, a harvest, a sale, and an advice note. A distribution larger than the remaining seedlings was rejected, and a sale larger than the remaining harvest was rejected.
- Analytics showed the nursery balance, harvest, and sales totals from those records.
- The map filtered to one farmer and showed that farmer's orchard, tree, and batch.
- The viewer account could read farmers and was not offered a save button.

These rows are synthetic interface checks. They are not field observations. The stack is available on this machine at `http://localhost:3000`. It is not a public deployment.

## Not done

- The private remote is `https://github.com/MarshalPrime/treelife-rwanda.git`. Keep it private unless Protogene approves a visibility change.
- FMES integration
- Queuing edits, and sending saved creates after the browser session is signed out
- Kinyarwanda and French
- A public hosted deployment

## How to resume

Follow [development-setup.md](development-setup.md). The database container is `treelife-rwanda-db-1` when Compose is running.
