#!/usr/bin/env node
/**
 * PayMongo sandbox setup. Run on your own machine; keys stay in your shell.
 *
 *   PAYMONGO_SECRET_KEY=sk_test_... APP_URL=https://<your-deployment> \
 *     node scripts/paymongo-setup.mjs [--test-checkout]
 *
 * 1. Checks the key is a TEST key and that PayMongo accepts it.
 * 2. Registers <APP_URL>/api/webhooks/paymongo for payment and refund events,
 *    or reuses (and re-enables) an existing webhook for that URL.
 * 3. Prints the environment variables to set on the deployment.
 * 4. --test-checkout: creates a ₱100 test checkout to pay with PayMongo's test
 *    methods. It is not linked to a booking, so the app records the webhook
 *    as "unknown_booking" and changes no ledger: proof that delivery and the
 *    signature work.
 */
import { pathToFileURL } from "node:url";

export const API_BASE = "https://api.paymongo.com/v1";
export const PAID_EVENT = "checkout_session.payment.paid";
export const REFUND_EVENTS = ["payment.refunded", "payment.refund.updated"];
export const WEBHOOK_EVENTS = [PAID_EVENT, ...REFUND_EVENTS];
export const WEBHOOK_PATH = "/api/webhooks/paymongo";

/** Validates inputs and derives the webhook URL. Throws with a readable message. */
export function planSetup({ secretKey, appUrl, methods }) {
  const key = (secretKey ?? "").trim();
  if (!key) throw new Error("Set PAYMONGO_SECRET_KEY to your test secret key (sk_test_…), from PayMongo → Developers → API keys in test mode.");
  if (key.startsWith("sk_live_")) throw new Error("That is a LIVE key. Use the test key (sk_test_…) for the sandbox; live keys move real money.");
  if (!key.startsWith("sk_test_")) throw new Error("PAYMONGO_SECRET_KEY must be a secret key starting with sk_test_ (not the pk_ public key).");

  let url;
  try {
    url = new URL((appUrl ?? "").trim());
  } catch {
    throw new Error("Set APP_URL to your public deployment URL, e.g. https://daet-connect-git-claude-f12-hardening-you.vercel.app");
  }
  if (url.protocol !== "https:") throw new Error("APP_URL must be https:// (PayMongo only calls public HTTPS URLs; use a tunnel for local testing).");
  if (["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("PayMongo cannot reach localhost. Deploy a preview or use a tunnel (cloudflared / ngrok) and pass that URL.");

  const base = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  const methodList = (methods ?? "gcash,paymaya,card").split(",").map((m) => m.trim()).filter(Boolean);
  return { key, base, webhookUrl: `${base}${WEBHOOK_PATH}`, methods: methodList };
}

/** Pick what to do with the account's existing webhooks for our URL. */
export function decideWebhook(existing, webhookUrl) {
  const same = existing.filter((w) => w.attributes?.url === webhookUrl);
  if (same.length === 0) return { action: "create" };
  const hook = same.find((w) => w.attributes?.status === "enabled") ?? same[0];
  const events = hook.attributes?.events ?? [];
  return {
    action: "reuse",
    hook,
    needsEvent: WEBHOOK_EVENTS.some((event) => !events.includes(event)),
    needsEnable: hook.attributes?.status !== "enabled",
    duplicates: same.length - 1,
  };
}

export function makeClient(key, fetchImpl = fetch) {
  const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
  return async function request(path, init = {}) {
    const response = await fetchImpl(`${API_BASE}${path}`, {
      ...init,
      headers: { accept: "application/json", "content-type": "application/json", authorization: auth, ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body?.errors?.map((e) => e.detail).filter(Boolean).join("; ");
      const error = new Error(detail || `PayMongo returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  };
}

export async function runSetup({ secretKey, appUrl, methods, testCheckout = false }, fetchImpl = fetch, log = console.log) {
  const plan = planSetup({ secretKey, appUrl, methods });
  const request = makeClient(plan.key, fetchImpl);

  let list;
  try {
    list = await request("/webhooks");
  } catch (error) {
    if (error.status === 401) throw new Error("PayMongo rejected the key (401). Copy the secret key again from the dashboard in TEST mode.");
    throw error;
  }
  log("✔ Test key accepted by PayMongo.");

  const decision = decideWebhook(list?.data ?? [], plan.webhookUrl);
  let hook;
  let secret = null;
  if (decision.action === "create") {
    const created = await request("/webhooks", {
      method: "POST",
      body: JSON.stringify({ data: { attributes: { url: plan.webhookUrl, events: WEBHOOK_EVENTS } } }),
    });
    hook = created.data;
    secret = hook?.attributes?.secret_key ?? null;
    log(`✔ Webhook created for ${plan.webhookUrl}`);
  } else {
    hook = decision.hook;
    if (decision.needsEvent) {
      const events = [...new Set([...(hook.attributes?.events ?? []), ...WEBHOOK_EVENTS])];
      const updated = await request(`/webhooks/${hook.id}`, { method: "PUT", body: JSON.stringify({ data: { attributes: { url: plan.webhookUrl, events } } }) });
      hook = updated.data ?? hook;
      log(`✔ Added payment and refund events to the existing webhook.`);
    }
    if (decision.needsEnable) {
      const enabled = await request(`/webhooks/${hook.id}/enable`, { method: "POST" });
      hook = enabled.data ?? hook;
      log("✔ Re-enabled the existing webhook.");
    }
    secret = hook?.attributes?.secret_key ?? null;
    log(`✔ Reusing webhook ${hook.id} for ${plan.webhookUrl}${decision.duplicates ? ` (${decision.duplicates} older duplicate(s) exist; disable them in the dashboard)` : ""}`);
  }

  log("\nSet these on the deployment (Vercel → Settings → Environment Variables), then redeploy:\n");
  log(`  PAYMONGO_SECRET_KEY=${plan.key.slice(0, 8)}…${plan.key.slice(-4)}   (the key you used here)`);
  log(secret ? `  PAYMONGO_WEBHOOK_SECRET=${secret}` : "  PAYMONGO_WEBHOOK_SECRET=<the whsk_… secret shown for this webhook in the PayMongo dashboard>");
  log(`  PAYMONGO_PAYMENT_METHODS=${plan.methods.join(",")}`);
  log(`  NEXT_PUBLIC_APP_URL=${plan.base}`);

  let checkoutUrl = null;
  if (testCheckout) {
    const session = await request("/checkout_sessions", {
      method: "POST",
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [{ name: "CONNECT-Daet sandbox check", amount: 10000, currency: "PHP", quantity: 1 }],
            payment_method_types: plan.methods,
            description: "Setup test, not linked to a booking",
            success_url: `${plan.base}/`,
            cancel_url: `${plan.base}/`,
            metadata: { purpose: "setup-test" },
          },
        },
      }),
    });
    checkoutUrl = session?.data?.attributes?.checkout_url ?? null;
    log(`\n✔ Test checkout (₱100, sandbox): ${checkoutUrl}`);
    log("  Pay it with a PayMongo test method. Then, in Supabase SQL:");
    log("  select event_id, outcome, received_at from tours_payment_events order by received_at desc limit 3;");
    log("  A new row with outcome 'unknown_booking' means the webhook reached the app and its signature checked out.");
  }
  return { webhookUrl: plan.webhookUrl, webhookId: hook?.id ?? null, secret, checkoutUrl };
}

async function main() {
  try {
    await runSetup({
      secretKey: process.env.PAYMONGO_SECRET_KEY,
      appUrl: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL,
      methods: process.env.PAYMONGO_PAYMENT_METHODS,
      testCheckout: process.argv.includes("--test-checkout"),
    });
  } catch (error) {
    console.error(`✖ ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
