# Vercel deployment profile

Recommended split:

- `apps/web`: Vercel static/frontend deployment.
- `apps/api`: either Vercel serverless adapter (to be added when chosen) or persistent VPS/container.

For serverless API connecting to Supabase, use an appropriate pooled connection string and disable prepared statements in the postgres client. The repository client currently uses `prepare: false` for portability with transaction-pooler deployments.
