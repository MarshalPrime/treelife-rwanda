# Demonstration script

This script uses the synthetic seed. Say that aloud before showing the map. The points are layout examples inside a rough national extent. They are not GPS readings from trees.

## Prepare

1. Start the database, migrate, seed, and run the API and the web app. See [development-setup.md](development-setup.md).
2. Sign in as `officer@demo.treelife.local` / `demo-officer-pass1`.
3. Keep a second window ready with `viewer@demo.treelife.local` / `demo-viewer-pass1` if you want to show read-only access.

## Walkthrough

1. On the overview, point out the warning that demonstration records are synthetic and that FMES is not connected.
2. Open Sites. Show `SYNTHETIC Roadside row — demo C`, which has no coordinates.
3. Open `SYNTHETIC Fruit orchard — demo B`. Show the linked trees and the batch.
4. Register a new site with a name you choose, a district, and a coordinate pair such as latitude `-1.96` and longitude `30.05`. Save it. Open the detail page.
5. Choose "Register a tree". Pick the new site, a species, a planting date, and leave the coordinates empty. Save. The detail page says the tree has no coordinates.
6. Edit the tree, choose "Use site coordinates", and save. The detail page now offers "Show on map".
7. Open the map. Select the marker. The summary names the record and links back to it. The roadside demo site, or any record you left without coordinates, is listed under "No coordinates".
8. Filter the map by species or category and show that the list changes.
9. Record an inspection on the tree and set the status to surviving. Return to the tree and show the new status.
10. If time allows, sign in as the viewer and show that the edit and register actions are gone.

## What not to say

- Do not say the sample points were surveyed.
- Do not say TreeLife is connected to FMES, FAO, or a ministry.
- Do not quote registration times, survival rates, or user feedback. None have been measured.
- Do not present the English screens as ready for farmers who need Kinyarwanda.

## Accounts

| Email | Role | Password |
| --- | --- | --- |
| `admin@demo.treelife.local` | Administrator, including the audit log | `demo-admin-pass1` |
| `officer@demo.treelife.local` | Can register and edit | `demo-officer-pass1` |
| `viewer@demo.treelife.local` | Read only | `demo-viewer-pass1` |
