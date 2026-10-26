# Contributing

TreeLife Rwanda is an early prototype. Small, reviewed changes are easier to keep correct than broad rewrites.

## Local setup

Follow [development-setup.md](docs/development-setup.md). Run the backend tests and the frontend tests before opening a pull request.

```bash
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pytest
cd frontend && npm test && npm run typecheck && npm run lint
```

## Expectations

- Do not commit secrets, `.env`, farmer identities, or database dumps.
- Do not add an FMES client, credential, or invented endpoint.
- Keep synthetic records labelled. Do not present sample coordinates as field observations.
- Prefer a change that finishes one registration path over a partial future module.
- Add or update a test when you change validation, authorization, or persistence.

## License

Contributions are accepted under the MIT License in the repository root. See [docs/decisions/001-license.md](docs/decisions/001-license.md).
