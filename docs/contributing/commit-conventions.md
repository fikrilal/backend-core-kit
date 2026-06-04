# Commit Conventions

Backend Core Kit uses semantic scoped commit messages for maintainability,
release hygiene, and agent coordination.

## Format

```text
type(scope): message
```

Examples:

```text
feat(auth): add password reset reuse detection
fix(queue): keep worker retries idempotent
docs(openapi): document profile image errors
chore(harness): add env example verification gate
```

## Allowed Types

- `build`
- `chore`
- `ci`
- `docs`
- `feat`
- `fix`
- `perf`
- `refactor`
- `revert`
- `style`
- `test`

## Allowed Scopes

- `admin`
- `api`
- `auth`
- `build`
- `ci`
- `config`
- `db`
- `deps`
- `docs`
- `email`
- `errors`
- `harness`
- `health`
- `http`
- `logging`
- `observability`
- `openapi`
- `platform`
- `push`
- `queue`
- `rbac`
- `release`
- `security`
- `storage`
- `test`
- `users`
- `worker`

## Local Enforcement

Install the local commit hook once per worktree:

```bash
npm ci
npm run setup:hooks
```

Check the last commit:

```bash
npm run commitlint -- --from HEAD~1 --to HEAD
```

Check a commit range:

```bash
npm run commitlint -- --from origin/development --to HEAD
```

GitHub CI intentionally does not run commitlint. CI should validate the code
artifact; commit-message enforcement belongs in local tooling, agent workflow,
and review.
