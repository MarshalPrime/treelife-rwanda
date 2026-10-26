# Authentication and roles

The prototype uses a bearer JWT signed with `SECRET_KEY`.

Roles are `admin`, `field_officer`, `farmer`, and `viewer`. A field officer and a farmer can register and edit field records. The officer is asked for the farmer’s name. The farmer is not asked; the record uses the household linked to that login. An administrator reviews the overview, reports, and the audit log, and cannot register trees. A viewer can see the map and the trees, and cannot change records. A field officer can still open a login for an existing farmer record.

`POST /auth/register` is public so the four experiences can be tried. The form asks which account the person is: administrator, field officer, farmer, or viewer. Choosing administrator is part of this demonstration and is not an approval step. The seeded demonstration sign-ins remain for testing. A shared deployment should approve administrator accounts before they can see other organisations' records.

The browser stores the token in `sessionStorage` and sends it on each request. That is simpler to test than a cookie session and it avoids pretending the prototype has a finished production identity design. A shared deployment should replace it with an HTTP-only cookie, shorter lifetimes, and an account-recovery process that does not depend on the seeded passwords.

Demonstration passwords are set by `python -m app.seed` from the environment. They are development credentials, not secrets of an institution.
