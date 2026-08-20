# ADR-006 — TanStack Frontend Architecture


## Status
ACCEPTED

## Decision
Gunakan React + Vite + TypeScript strict dengan:
- TanStack Router file-based routing;
- TanStack Query untuk server state;
- TanStack Table untuk data grids;
- TanStack Form untuk complex forms;
- route/module code splitting;
- shared API contracts dari package `@qc/contracts`.

Local component state hanya untuk ephemeral UI state; canonical server state berada di Query cache setelah server response.
