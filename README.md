# openrental

Multi-tenant SaaS conversion of the IvyJSTUDIO jewelry rental and wholesale admin (Next.js 16 + React 19 + Supabase + Tailwind v4 + shadcn).

> **Working name only.** Final product name is locked in `tracker/DECISIONS.md` (D1). All user-facing strings currently use a placeholder.

For project context, architecture decisions, and active task tracker, see:
- `CLAUDE.md` — agent workflow / project rules (read this first if you are an AI agent)
- `tracker/` — single source of truth (DECISIONS, BRIEFS, LOG, GLOSSARY)
- `docs/SAAS_ROADMAP.md` — engineering / design / commercialization plan

## Local development

```bash
# Install (peer-deps relaxed because of React 19 / Next 16 mix)
npm install --legacy-peer-deps

# Configure env
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, etc.

# Run dev server
npm run dev
```

App runs at http://localhost:3000. The build script pins webpack (`NEXT_FORCE_WEBPACK=1 next build`) to avoid Turbopack edge cases with the current dependency tree.

```bash
npm run build   # production build
npm run start   # serve the built app
npm run lint    # eslint
```

## Deploy on Vercel

This repo is configured for Vercel hosting. See `vercel.json` (framework=nextjs, install with `--legacy-peer-deps`, region `sin1`).

### First-time setup (CLI-first)

Three commands cover install, login, deploy. Use the `npx vercel@latest` form — `npm i -g vercel` is known to install a broken symlink (tar ENOENT during postinstall) on some macOS/zsh setups (see `tracker/LOG.md` 2026-05-04 14:00 NOTE).

```bash
# 1. install (or use npx)
npm i -g vercel    # if this fails, skip and use `npx vercel@latest <cmd>` everywhere

# 2. login (one-time OAuth via browser)
npx vercel@latest login

# 3. link + deploy (run from repo root)
npx vercel@latest link --yes --project=openrental
npx vercel@latest deploy
```

After `vercel link` the project ID is written to `.vercel/project.json` (already in `.gitignore`). Capture it for BRIEF-17 (production domain).

**Environment variables** — pushed to all three Vercel envs (development / preview / production) by the executor automation. At minimum:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ADMIN_NOTIFY_EMAIL`
- At least one AI provider key if Smart Import is exercised on the preview (e.g. `DASHSCOPE_API_KEY` / `GEMINI_API_KEY`).

The first preview build takes 3–6 minutes.

### Branch / PR previews

Once the project is connected, every push gets a preview URL of the form `<branch>-<project>-<team>.vercel.app`. Open a PR against `main` and Vercel will comment with the preview link.

To test the landing page in isolation:

```bash
git checkout -b landing-v1
git push -u origin landing-v1
```

Vercel will produce a preview URL. Verify the landing renders before merging.

### Production branch

Production deploys are pinned to `main` — set this in **Project Settings → Git → Production Branch**. Custom domain wiring (Spaceship DNS, SSL) lives in BRIEF-17 and runs after D1 naming locks.

### Environment variable categories

`.env.example` groups variables into four blocks:

1. **Supabase (required)** — auth, DB, storage. The service role key is server-only; never mark it as `NEXT_PUBLIC_*`.
2. **Email (required)** — Resend for transactional mail; `ADMIN_NOTIFY_EMAIL` for inbound bulk-request notifications.
3. **AI providers (optional)** — Smart Import / OCR / chat. Set `AI_PROVIDER` plus the matching API key (Gemini / Dashscope / Zhipu / Ollama). Adapters fall back gracefully when keys are missing.
4. **Customer-service feature flags (optional)** — staged rollout switches read by `src/lib/customer-service/feature-flags.ts`.

In Vercel, set Production / Preview / Development scopes separately if you want different Supabase projects per environment. The current default during preview is to share one Supabase instance with the existing IvyJSTUDIO production data — change before opening preview URLs to anyone outside the team.

### Build notes

- `next.config.ts` ships an explicit Content-Security-Policy. If you add a third-party script (analytics, chat widget, etc.), update the `script-src` / `connect-src` directives there or the script will be blocked.
- `images.remotePatterns` allows the Supabase storage CDN, `placehold.co`, and Shopify CDN hosts. Add new image hosts there before referencing them.
- `experimental.serverActions.bodySizeLimit` is set to 25 MB to handle Smart Import lookbook uploads.

## Repository layout

```
src/                  Next.js 16 app (route groups in progress per BRIEF-03)
  app/(marketing)/    Landing page (BRIEF-15 export)
  app/admin/          IvyJSTUDIO admin (legacy single-tenant; refactor in BRIEF-03)
  components/         UI components (shadcn + custom)
  lib/                Supabase clients, AI gateway, email senders, feature flags
supabase/
  migrations/         57 migrations; multi-tenant additions land in 00052+ (BRIEF-08)
  functions/          edge functions
docs/                 Strategy docs (SAAS_ROADMAP, case studies, naming, etc.)
tracker/              Active task tracker (read CLAUDE.md before editing)
public/               Static assets
```

## Tech stack pins

- Next.js 16.1, React 19.2 (app router, server actions, RSC)
- Supabase (Postgres 17.6, Auth, Storage, RLS) — current region eu-west-2; migration to ap-southeast-1 in BRIEF-11
- Tailwind v4 + shadcn/ui + Radix primitives
- Resend for transactional email
- Vercel AI SDK (`ai` v6) with Gemini / Dashscope / Zhipu / Ollama adapters
- Lemon Squeezy for billing (integration in BRIEF-04)
