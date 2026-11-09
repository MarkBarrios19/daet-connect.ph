import assert from "node:assert/strict";
import { test } from "node:test";
import { decideWebhook, PAID_EVENT, WEBHOOK_EVENTS, planSetup, runSetup } from "./paymongo-setup.mjs";

const app = "https://daet-preview.vercel.app/";

test("plan accepts a test key and builds the webhook URL", () => {
  assert.deepEqual(planSetup({ secretKey: " sk_test_abc ", appUrl: app }), {
    key: "sk_test_abc",
    base: "https://daet-preview.vercel.app",
    webhookUrl: "https://daet-preview.vercel.app/api/webhooks/paymongo",
    methods: ["gcash", "paymaya", "card"],
  });
});

test("plan refuses live/public keys and unreachable URLs", () => {
  assert.throws(() => planSetup({ secretKey: "sk_live_x", appUrl: app }), /LIVE key/);
  assert.throws(() => planSetup({ secretKey: "pk_test_x", appUrl: app }), /sk_test_/);
  assert.throws(() => planSetup({ secretKey: "", appUrl: app }), /PAYMONGO_SECRET_KEY/);
  assert.throws(() => planSetup({ secretKey: "sk_test_x", appUrl: "http://daet.app" }), /https/);
  assert.throws(() => planSetup({ secretKey: "sk_test_x", appUrl: "https://localhost:3000" }), /localhost/);
  assert.throws(() => planSetup({ secretKey: "sk_test_x", appUrl: "not a url" }), /APP_URL/);
});

test("decide reuses, re-enables or extends an existing webhook", () => {
  const url = "https://x.app/api/webhooks/paymongo";
  assert.deepEqual(decideWebhook([], url), { action: "create" });
  const d = decideWebhook([{ id: "hook_1", attributes: { url, status: "disabled", events: ["payment.paid"] } }], url);
  assert.equal(d.action, "reuse");
  assert.equal(d.needsEnable, true);
  assert.equal(d.needsEvent, true);
  const ok = decideWebhook([{ id: "hook_2", attributes: { url, status: "enabled", events: WEBHOOK_EVENTS } }], url);
  assert.equal(ok.needsEnable || ok.needsEvent, false);
  assert.equal(decideWebhook([{ id: "hook_3", attributes: { url, status: "enabled", events: [PAID_EVENT] } }], url).needsEvent, true);
});

function fakePaymongo(existing = []) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = url.replace("https://api.paymongo.com/v1", "");
    calls.push({ method: init.method ?? "GET", path, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.authorization });
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (init.headers.authorization !== `Basic ${Buffer.from("sk_test_good:").toString("base64")}`) return json(401, { errors: [{ detail: "Invalid key" }] });
    if (path === "/webhooks" && !init.method) return json(200, { data: existing });
    if (path === "/webhooks" && init.method === "POST") return json(200, { data: { id: "hook_new", attributes: { ...JSON.parse(init.body).data.attributes, secret_key: "whsk_new", status: "enabled" } } });
    if (path === "/checkout_sessions") return json(200, { data: { id: "cs_1", attributes: { checkout_url: "https://checkout.paymongo.com/cs_1" } } });
    return json(404, { errors: [{ detail: "not found" }] });
  };
  return { calls, fetchImpl };
}

test("run creates the webhook, prints the secret and a test checkout", async () => {
  const { calls, fetchImpl } = fakePaymongo();
  const out = [];
  const result = await runSetup({ secretKey: "sk_test_good", appUrl: app, testCheckout: true }, fetchImpl, (l) => out.push(l));
  assert.equal(result.secret, "whsk_new");
  assert.equal(result.checkoutUrl, "https://checkout.paymongo.com/cs_1");
  const create = calls.find((c) => c.method === "POST" && c.path === "/webhooks");
  assert.deepEqual(create.body.data.attributes, { url: "https://daet-preview.vercel.app/api/webhooks/paymongo", events: WEBHOOK_EVENTS });
  const checkout = calls.find((c) => c.path === "/checkout_sessions");
  assert.equal(checkout.body.data.attributes.line_items[0].amount, 10000);
  assert.ok(out.join("\n").includes("PAYMONGO_WEBHOOK_SECRET=whsk_new"));
  assert.ok(!out.join("\n").includes("sk_test_good"), "the full secret key is never printed");
});

test("run reuses an existing enabled webhook without creating another", async () => {
  const url = "https://daet-preview.vercel.app/api/webhooks/paymongo";
  const { calls, fetchImpl } = fakePaymongo([{ id: "hook_1", attributes: { url, status: "enabled", events: WEBHOOK_EVENTS } }]);
  const result = await runSetup({ secretKey: "sk_test_good", appUrl: app }, fetchImpl, () => {});
  assert.equal(result.webhookId, "hook_1");
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
});

test("run explains a rejected key", async () => {
  const { fetchImpl } = fakePaymongo();
  await assert.rejects(runSetup({ secretKey: "sk_test_wrong", appUrl: app }, fetchImpl, () => {}), /rejected the key/);
});
