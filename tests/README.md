# Run the API smoke check

From the repository root, with the API running and the synthetic seed loaded:

```bash
python3 tests/smoke.py
```

The script signs in as the demonstration field officer, creates a site, an individual tree, and a planting batch, then reads them back and requests the map. It uses unique request ids. It does not delete the rows it creates.

Set `API_URL`, `SMOKE_EMAIL`, and `SMOKE_PASSWORD` if the defaults are not right.

Backend tests live in `backend/tests`. Frontend tests live in `frontend/src`.
