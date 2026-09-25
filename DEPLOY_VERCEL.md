# Deploying Tollaby on Vercel

## Architecture

- The project uses Vercel Services, with `frontend/` and `backend/` built as separate services in one Vercel project.
- `frontend/` is a Vite service that serves the React app.
- `backend/src/index.js` is an Express service behind `/api/*`.
- `vercel.json` routes `/api/*` to the backend service and everything else to the frontend service.
- Background work uses `@vercel/functions` `waitUntil` through `backend/src/utils/backgroundTask.js`.

## Background Tasks

The app has no recurring cron jobs or queue workers. The background work is request-triggered:

- Attendance auto-notifications after attendance edits/scans.
- Payment auto-notifications after adding a payment.
- WhatsApp webhook post-processing after Meta receives a fast `200 OK`.

On Vercel Services, backend services run on Fluid Compute and these tasks are registered with `waitUntil`, so they can continue briefly after the HTTP response is returned. Keep them short and idempotent. If you later need long-running retries, bulk broadcasts, or scheduled processing, move that work to Vercel Workflows, Queues, or another worker service instead of a request-triggered task.

## Required Environment Variables

Set these in Vercel Project Settings > Environment Variables:

- `DATABASE_URL`: PostgreSQL connection string. Use the pooled Neon URL for runtime.
- `SESSION_SECRET`: a long random secret.
- `FRONTEND_URL`: your Vercel production URL, for example `https://your-app.vercel.app`.
- `NODE_ENV`: `production`.
- `WHATSAPP_TOKEN`: Meta WhatsApp access token.
- `WHATSAPP_PHONE_NUMBER_ID`: WhatsApp phone number ID.
- `WHATSAPP_API_VERSION`: for example `v25.0`.
- `WHATSAPP_VERIFY_TOKEN`: webhook verification token.
- `WHATSAPP_APP_SECRET`: recommended, enables webhook signature verification.

Do not commit `.env` secrets to git.

## Database Setup

Run these locally after setting `backend/.env` to the same database you want to deploy:

```bash
cd backend
npm install
npm run db:generate
npm run db:push
npm run db:seed
```

For production, prefer migrations once schema changes stabilize:

```bash
cd backend
npm run db:migrate
```

## Vercel Deployment

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Keep the root directory as the repository root.
4. In Project Settings > Build and Deployment, set Framework Preset to `Services`.
5. Vercel uses `vercel.json` to build two services:
   - `frontend`: root `frontend/`, framework `vite`, output `dist`.
   - `backend`: root `backend/`, framework `express`, entrypoint `src/index.js`.
6. Add all environment variables listed above.
7. Deploy.

## Local Services Development

Install the Vercel CLI, then run both services together from the repo root:

```bash
vercel dev -L
```

The top-level rewrites route requests exactly like production:

- `/api/*` -> backend service
- `/*` -> frontend service

## WhatsApp Webhook

In Meta Developer Dashboard, configure:

- Callback URL: `https://your-app.vercel.app/api/chat/webhook`
- Verify token: same value as `WHATSAPP_VERIFY_TOKEN`

Use `GET /api/chat/webhook/debug` while logged in with `chat` permission to confirm the WhatsApp env flags are present without exposing secrets.

## Verification

After deployment:

- Open `https://your-app.vercel.app/api/health` and expect `{ "status": "ok" }`.
- Log in and check `/api/auth/me` through the app.
- Test a WhatsApp webhook verification from Meta.
- Add a small payment or scan attendance and confirm notification archive/send behavior.
