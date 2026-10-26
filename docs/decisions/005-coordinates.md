# Coordinates

WGS 84, SRID 4326, is the only coordinate reference system in this version.

The API accepts decimal degrees. Latitude and longitude are stored as numbers for straightforward reads, and the same point is written to a PostGIS geography column for spatial indexing. Geography well-known text uses longitude first. A regression test reads `ST_X` and `ST_Y` back from PostGIS so a swapped axis fails the suite.

Records may be saved without a point. They appear in the map response under `unlocated` and are labelled in the interface. The application does not copy a site coordinate onto a tree unless the user chooses "Use site coordinates", because an unmeasured tree should not look precisely surveyed.

Globally valid points outside Rwanda are accepted. The registration form warns when a point falls outside an approximate national extent. That extent is not enforced until someone with the mandate confirms the boundary rule, including how to treat border trees and GPS error.
