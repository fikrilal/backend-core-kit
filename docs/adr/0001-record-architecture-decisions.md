# ADR: Record Architecture Decisions

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

This repository is intended to be reused across many future projects. Without a durable decision log, architectural choices will drift, “tribal knowledge” will accumulate, and the kit will lose coherence over time.

## Decision

We will use Architecture Decision Records (ADRs) from day one:

- ADRs live in `docs/adr/`.
- ADRs use `docs/adr/template.md`.
- ADRs are written for non-trivial architectural and contract decisions (stack, API shapes, auth model, observability, persistence patterns).

## Rationale

ADRs provide a lightweight and auditable record of:

- what we decided
- why we decided it
- what alternatives were considered
- what consequences we accepted

This is essential for a long-lived boilerplate where consistency is a feature.

## Consequences

- Engineering work includes documentation work for significant decisions.
- We will occasionally write “superseding ADRs” when decisions change.

## Alternatives Considered

- No formal decision log: rejected (drift, repeated debates, inconsistent implementations).
- Wiki-only documentation: rejected (harder to keep close to code and PR review flow).

## Links / References

- Template: `docs/adr/template.md`
