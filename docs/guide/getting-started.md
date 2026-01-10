# Getting Started (Local)

This guide assumes you are building a service from this core kit and want a reproducible local setup.

## Prerequisites

- Node.js 22 LTS + npm
- Docker Desktop (Compose v2)

## Environment

- Copy example env file:
  - `cp env.example .env`
- Never commit `.env`.

## Start Dependencies

Bring up local Postgres + Redis:

- `npm run deps:up` (recommended), or
- `docker compose up -d`

Defaults:

- Postgres exposed on `127.0.0.1:54321` (container `5432`, local-only, passwordless)
- Redis exposed on `127.0.0.1:63790` (container `6379`, local-only, passwordless)

If you need passwords locally, create a `docker-compose.override.yml` (do not commit) and update your `.env`.

If you previously ran this repo with password-protected containers, you may need to re-init volumes once:

- `docker compose down -v`
- `docker compose up -d`

## Install Dependencies

- `npm install`

## Database Setup

Typical workflow (exact commands depend on the project scaffold):

- run migrations
- generate Prisma client
- optionally seed

## Run the API

Typical workflow:

- `npm run start:dev`

## Run the Worker

The worker process exposes `/health` and `/ready` for orchestration (Kubernetes, ECS, etc.).

Typical workflow:

- `npm run start:worker:dev`

## Verify

- `GET /health` should return OK (liveness)
- `GET /ready` should return OK when DB/Redis are ready (readiness)
- OpenAPI/Swagger UI should be available (project-defined route)

## Build Docker Images (Production Targets)

- API image: `docker build --target api -t backend-core-kit-api:local .`
- Worker image: `docker build --target worker -t backend-core-kit-worker:local .`

If anything is unclear or missing, add/adjust docs before adding code so the core kit remains “doc-driven”.
