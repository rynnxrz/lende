import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
  ],
});

// Required by @sentry/nextjs to instrument Next.js navigation transitions.
// Build emits "ACTION REQUIRED" warning if missing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
