# FMES interoperability

The Forestry Management and Evaluation System is operated by the Rwanda Forestry Authority. TreeLife is not integrated with it. This document is a proposal for a later conversation. It is not an official interface, data dictionary, or endorsement.

No endpoint, credential, field code, or exchange schedule is invented here. Those facts have to come from the system owner.

## Boundary in the code

`backend/app/integrations/fmes/adapter.py` defines `FmesAdapter.export_registration`, which raises `NotImplementedError`. Registration calls `dispatch_registration_hook`, which returns without using the adapter. Core create and update logic does not import FMES types into the database models.

Internal UUIDs and public codes identify TreeLife records. `external_id` can hold another system's identifier later. It is empty unless someone types a value, and typing a value does not transmit anything.

## Proposed shape of a future adapter

When an authority authorizes an exchange, the adapter should sit behind the hook and outside the registration transaction:

1. TreeLife commits the local record.
2. A job records the attempt in an integration log that is separate from the user audit log.
3. The adapter authenticates with credentials supplied in the environment, not in source code.
4. It validates the outbound payload against the agreed schema. If validation fails, it does not guess missing official codes.
5. It retries transient transport failures with a limit and records the last error.
6. A permanent rejection stays visible to an administrator and does not delete the local record.
7. The local record gains the external identifier only after the remote system accepts it.

Authentication, rate limits, and payload codes are unknown until they are provided. The adapter should fail closed when they are absent, which is what it does now.

## Assumptions that must be checked

- Which records FMES already stores, and which urban or fruit-tree facts it does not.
- Whether TreeLife should send new registrations, receive existing ones, or both.
- The identifier FMES uses for a tree, a stand, a nursery, or a household plot.
- Whether coordinates in FMES are points, plots, or administrative units, and which CRS they use.
- Who is allowed to see exact farm coordinates.
- How corrections are exchanged when a record changes after it was sent.
- Whether a batch of trees is a valid FMES object or must be expanded into individual trees.

## Example payload

[examples/fmes-registration.proposed.json](examples/fmes-registration.proposed.json) is a synthetic illustration of fields TreeLife already stores. It is labelled proposed. It is not an FMES schema.

## Questions for a later technical meeting

See the question list in [pilot-plan.md](pilot-plan.md). Do not contact the authority until the project owner decides to do so.
