# Repository / Module Boundaries

```text
HTTP route/plugin
  -> application service
    -> domain rules/value objects
      -> repository port
        -> PostgreSQL adapter (Drizzle)
```

## Domain modules

- `iam`
- `master-data`
- `raw-sample`
- `mixing`
- `vendor-operation`
- `retase`
- `reconciliation`
- `reporting`
- `audit`
- `system`

## Rule

A route handler must not contain durable business rules. A React component must not reconstruct server business state by duplicating domain calculations that determine persistence decisions.
