# ADR: Standardize on NestJS with Fastify

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

We need a long-lived Node.js backend foundation that:

- supports modular architecture and DI
- is testable and maintainable across many projects
- has strong ecosystem support

## Decision

The core kit standardizes on:

- NestJS as the application framework
- Fastify as the HTTP server adapter

## Rationale

- NestJS provides consistent module boundaries, DI, interceptors/filters, and testing utilities.
- Fastify provides strong performance characteristics and a mature ecosystem.

## Consequences

- The kit is opinionated; projects that cannot use NestJS/Fastify should not use this kit.
- Some low-level Express middleware patterns will be replaced by Nest-native patterns.

## Alternatives Considered

- Express-only: rejected (more custom wiring, weaker DI story, higher drift across projects).
- Koa/Fastify without Nest: rejected (more bespoke architecture, less standardized conventions).

## Links / References

- `docs/core/project-stack.md`
