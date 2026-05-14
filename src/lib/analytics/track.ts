import { track as vercelTrack } from "@vercel/analytics";
import * as Sentry from "@sentry/nextjs";

/**
 * BRIEF-45 — analytics SDK wrapper. Sends to Vercel Analytics + adds a
 * Sentry breadcrumb so a later error can be replayed alongside its
 * recent activity.
 *
 * BRIEF-60 — extended EventName union with 7 onboarding/paywall events
 * so the new self-serve OTP signup path (D6 v3) and the day-14 paywall
 * (D37) emit observable signals. Per BRIEF-61 the engagement_score
 * RPC reads raw `items` / `reservations` counts from SQL (not from
 * events), so these events are for *funnel* observation, not for the
 * scoring formula:
 *
 *   - signup_otp_sent              Stage A submitted, Supabase emailed OTP
 *   - signup_otp_verified          Stage B verifyOtp succeeded
 *   - signup_org_provisioned       provisionOrgForNewUser ok
 *   - activation_sample_data_loaded user clicked "Try with sample data"
 *   - activation_first_reservation_created  user created first reservation
 *   - paywall_blocked_write        middleware redirected mutating req
 *   - paywall_extend_clicked       user clicked "Request extension" CTA
 */

type EventName =
  | "invitation_email_sent"
  | "invitation_email_opened"
  | "invitation_link_clicked"
  | "signup_completed"
  | "first_reservation_created"
  // BRIEF-60 — self-serve OTP signup (D6 v3)
  | "signup_otp_sent"
  | "signup_otp_verified"
  | "signup_org_provisioned"
  // BRIEF-60 — activation events feeding BRIEF-61 engagement_score
  | "activation_sample_data_loaded"
  | "activation_first_reservation_created"
  // BRIEF-60 — day-14 paywall (D37)
  | "paywall_blocked_write"
  | "paywall_extend_clicked";

export function track(event: EventName, props?: Record<string, string | number | boolean | null>) {
  try {
    vercelTrack(event, props ?? {});
    Sentry.addBreadcrumb({ category: "analytics", message: event, data: props });
  } catch (e) {
    console.error("[analytics] track failed", e);
  }
}
