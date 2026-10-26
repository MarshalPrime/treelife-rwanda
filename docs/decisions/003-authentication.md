# Authentication and roles

The prototype uses a bearer JWT signed with `SECRET_KEY`.

Roles are `admin`, `field_officer`, and `viewer`. Viewers cannot create or update records. The audit log is admin-only. There is no public signup, because the prototype should not collect accounts from the open internet.

The browser stores the token in `sessionStorage` and sends it on each request. That is simpler to test than a cookie session and it avoids pretending the prototype has a finished production identity design. A shared deployment should replace it with an HTTP-only cookie, shorter lifetimes, and an account-recovery process that does not depend on the seeded passwords.

Demonstration passwords are set by `python -m app.seed` from the environment. They are development credentials, not secrets of an institution.
