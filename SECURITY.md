# Security

TreeLife stores planting locations. Exact coordinates can identify a farm or a household plot and should be treated as sensitive even when a person's name is not stored.

## Supported use

This repository is a local prototype. It is not a production service and it is not connected to a government system.

## Reporting a vulnerability

Use GitHub private vulnerability reporting on this repository. Do not open a public issue for a security report, and do not include real farmer data in the report.

## Practices for this codebase

- Secrets belong in the environment. `.env` is gitignored.
- The development database password in `docker-compose.yml` is for a local database only.
- `python -m app.seed` refuses to run when `APP_ENV=production`.
- The API refuses to start in production when `SECRET_KEY` is missing, shorter than 32 characters, or still the development placeholder.
- Write endpoints require a field officer or an administrator. The audit log requires an administrator.
- The audit log stores field names, not note text or coordinate values.
- A farmer record can store a display name and an optional phone number. National identifiers are not collected.

## Known prototype limits

Access tokens are stored in browser `sessionStorage`. That is acceptable for a local demonstration and is not the intended production session design. A shared deployment needs a reviewed cookie session, transport security, backups, and an access policy agreed with the data owner.
