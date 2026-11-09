import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPaymongoConfig, retrieveCheckoutSession, retrieveRefund } from "@/lib/paymongo/client";
import { processPaymongoWebhook } from "@/lib/paymongo/webhook";
import { createSupabaseWebhookStore } from "@/lib/paymongo/webhook-store";


/**
 * PayMongo webhook endpoint. Register it in the PayMongo dashboard (or API)
 * as https://<your-domain>/api/webhooks/paymongo for the
 * checkout_session.payment.paid, payment.refunded and payment.refund.updated events, and put the returned secret in
 * PAYMONGO_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const config = getPaymongoConfig();
  if (!config?.webhookSecret) {
    return Response.json({ ok: false, message: "PayMongo webhooks are not configured" }, { status: 503 });
  }

  // The signature covers the exact bytes PayMongo sent, so read the raw text.
  const rawBody = await request.text();

  try {
    const result = await processPaymongoWebhook(
      { rawBody, signatureHeader: request.headers.get("paymongo-signature") },
      {
        webhookSecret: config.webhookSecret,
        mode: config.mode,
        retrieveSession: (id) => retrieveCheckoutSession(config, id),
        retrieveRefund: (id) => retrieveRefund(config, id),
        store: createSupabaseWebhookStore(createSupabaseAdminClient()),
      },
    );
    if (result.status >= 400) console.warn("PayMongo webhook rejected:", result.body.message);
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    // 5xx makes PayMongo retry; the event stays unprocessed until then.
    console.error("PayMongo webhook failed:", error);
    return Response.json({ ok: false, message: "Webhook processing failed" }, { status: 500 });
  }
}
