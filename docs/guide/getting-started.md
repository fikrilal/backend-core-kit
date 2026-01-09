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

## Verify

- `GET /health` should return OK (liveness)
- `GET /ready` should return OK when DB/Redis are ready (readiness)
- OpenAPI/Swagger UI should be available (project-defined route)

If anything is unclear or missing, add/adjust docs before adding code so the core kit remains “doc-driven”.
