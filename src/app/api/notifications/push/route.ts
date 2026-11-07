import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/tours/operator-access";
import { deliverNotification, type PushStore } from "@/lib/tours/push-delivery";


/**
 * Called by the database (pg_net, trigger tours_notifications_dispatch_push)
 * for each new notification. The body only names the notification; what is
 * sent is read back from the database with the service role.
 */

function authorized(request: NextRequest): boolean {
  const secret = process.env.NOTIFICATIONS_PUSH_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:tourism@daet.gov.ph";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const keys = vapid();
  if (!keys) return NextResponse.json({ error: "push not configured" }, { status: 503 });

  let id: unknown;
  try {
    id = ((await request.json()) as { notification_id?: unknown })?.notification_id;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof id !== "string" || !isUuid(id)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const store: PushStore = {
    async getNotification(notificationId) {
      const { data } = await admin
        .from("tours_notifications")
        .select("id, profile_id, type, title, body, link, pushed_at")
        .eq("id", notificationId)
        .maybeSingle();
      return data ?? null;
    },
    async getSubscriptions(profileId) {
      const { data } = await admin.from("push_subscriptions").select("id, endpoint, p256dh_key, auth_key").eq("profile_id", profileId);
      return data ?? [];
    },
    async removeSubscription(subscriptionId) {
      await admin.from("push_subscriptions").delete().eq("id", subscriptionId);
    },
    async markPushed(notificationId) {
      await admin.from("tours_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", notificationId);
    },
  };

  const result = await deliverNotification(id, store, async (subscription, payload) => {
    await webpush.sendNotification(subscription, payload, {
      TTL: 60 * 60 * 24,
      urgency: "high",
      vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
    });
  });
  if (result.failed > 0) console.error("Push delivery failures:", { id, ...result });
  return NextResponse.json(result);
}
