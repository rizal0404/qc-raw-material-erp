# Vercel deployment profile

Create two Vercel projects from the same repository:

| Project | Root Directory | Framework |
| --- | --- | --- |
| Web | `apps/web` | Vite |
| API | `apps/api` | Fastify |

For both projects, keep **Include source files outside of the Root Directory in the Build Step** enabled under Project Settings > Build and Deployment > Root Directory. The API imports the local pnpm workspace packages `@qc/contracts`, `@qc/domain`, and `@qc/db` from `../../packages`.

`apps/api/vercel.json` also explicitly includes those runtime workspace sources in the Fastify function. This is required because Vercel's file tracer can otherwise preserve the pnpm link at `node_modules/@qc/db` without copying its `src/index.ts`, which causes `ERR_MODULE_NOT_FOUND` during a cold start.

Do not configure an Output Directory or a custom Build Command for the API. Vercel detects `src/server.ts` as the Fastify entrypoint; the reusable application factory intentionally lives at the non-entrypoint name `src/application.ts`. The repository requires Vercel CLI 48.6.0 or newer for local `vercel dev` testing.

## API environment variables

Configure these for every Vercel environment that should run the API (Production, Preview, and/or Development):

```dotenv
NODE_ENV=production
TZ=Asia/Makassar
DATABASE_TARGET=supabase
SUPABASE_DATABASE_URL=postgresql://postgres.project-ref:password@aws-0-region.pooler.supabase.com:6543/postgres
SUPABASE_DATABASE_SSL=true
SUPABASE_DB_POOL_MAX=2
PASSWORD_PEPPER=<random-secret-with-at-least-24-characters>
API_CORS_ORIGIN=https://your-web-project.vercel.app
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAME_SITE=none
```

Use the Supabase transaction pooler for serverless runtime traffic. The database client already sets `prepare: false` for pooler compatibility. Do not expose `SUPABASE_DATABASE_URL`, `PASSWORD_PEPPER`, migration URLs, or bootstrap credentials to the web project.

`API_HOST` and `API_PORT` may be omitted on Vercel. When using a custom shared parent domain for the web and API, prefer `SESSION_COOKIE_SAME_SITE=lax`; set `SESSION_COOKIE_DOMAIN` only when a shared parent-domain cookie is intentional.

The web project separately needs:

```dotenv
VITE_API_BASE_URL=https://your-api-project.vercel.app/api/v1
```

After changing Root Directory, environment variables, or `vercel.json`, redeploy without the previous build cache. Verify `GET /api/v1/health` before testing login.
