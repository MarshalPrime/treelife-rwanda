.PHONY: up down api web test test-api test-web seed migrate lint

PY := backend/.venv/bin

up:
	docker compose up -d db

down:
	docker compose down

migrate:
	cd backend && .venv/bin/alembic upgrade head

seed:
	cd backend && .venv/bin/python -m app.seed

api:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

web:
	cd frontend && npm run dev

test-api:
	cd backend && .venv/bin/pytest

test-web:
	cd frontend && npm test

lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	cd frontend && npm run lint && npm run typecheck

test: test-api test-web
