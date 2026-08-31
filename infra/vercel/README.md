# Vercel deployment profile

Create two Vercel projects from the same repository:

| Project | Root Directory | Framework |
| --- | --- | --- |
| Web | `apps/web` | Vite |
| API | `apps/api` | Fastify |

For both projects, keep **Include source files outside of the Root Directory in the Build Step** enabled under Project Settings > Build and Deployment > Root Directory. The API imports the local pnpm workspace packages `@qc/contracts`, `@qc/domain`, and `@qc/db` from `../../packages`.

The API production build bundles the runtime workspace packages into `dist/server.js`. This avoids retaining pnpm links such as `node_modules/@qc/db` in the Vercel Function, because their targets live outside the API project root and can otherwise be absent during a cold start. Third-party and native npm dependencies remain external and are installed normally by Vercel.

Keep the dashboard Build Command and Output Directory overrides empty so the repository settings remain authoritative. `apps/api/vercel.json` selects `dist`, and the API package build emits `dist/server.js`. The reusable application factory intentionally lives at the non-entrypoint name `src/application.ts`. The repository requires Vercel CLI 48.6.0 or newer for local `vercel dev` testing.

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

## Release checklist: 3D piles and photo reports

- Both app packages require Node.js 24.x, matching the API bundle target. The web configuration includes the [Vite SPA rewrite](https://vercel.com/docs/frameworks/frontend/vite) so direct navigation and refresh on `/peta-mutu` and `/clay-report` work.
- Apply pending database migrations through the existing migration workflow before routing production traffic to this release: `0021_clay_photo_report_import.sql` adds Clay import persistence; `0022_stockpile_layer_depth.sql` adds depth coordinates for current and historical pile layers. Git push and Vercel builds do **not** apply these migrations. A missing migration can cause API requests to return HTTP 500. Back up the database and verify the migration target before applying changes.
- Enable Fluid compute and verify an API function maximum duration of at least 300 seconds in Vercel Project Settings. Image extraction can wait up to 240 seconds for its provider. See [function duration](https://vercel.com/docs/functions/configuring-functions/duration). Uploads remain limited to 4 MiB, below Vercel's request body limit.
- No new mandatory environment variables are introduced by the 3D editor or Clay photo import. Photo extraction reuses the existing OreVision provider configuration, for example:

  ```dotenv
  OREVISION_PROVIDER=gemini
  OREVISION_MODEL=gemini-2.5-flash
  OREVISION_GEMINI_API_KEY=<provider-secret>
  ```

  For another provider, set its corresponding existing key (`OREVISION_OPENAI_API_KEY`, `OREVISION_OPENROUTER_API_KEY`, or `OREVISION_CUSTOM_API_KEY`) and, for a custom provider, `OREVISION_CUSTOM_ENDPOINTS`. Keep provider keys in the API project only.
- OreVision settings edited in the UI are stored in `/tmp` on Vercel: they are instance-local and can disappear on cold starts. Keep provider/model/key defaults in environment variables. UI prompt and sampling adjustments are not durable across serverless instances; persistent shared settings storage is not part of this release.
- The standalone Python OCR/training service is not part of the Vercel API runtime. Local training output and environment snapshots are excluded from Git and deployment uploads.
- After deployment, check health, login, direct route refresh, stockpile loading, layer drag/resize persistence after reload, and Clay photo extraction. Local build/test success is not a substitute for these production checks.
