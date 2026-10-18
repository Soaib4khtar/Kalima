import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { createRemoteJWKSet, decodeJwt } from "jose";
import { createJwtVerifier } from "../src/modules/auth/auth.js";
import { testIdentityProvider } from "./support/learning-fixture.mjs";
import { createGoogleBrowserMonitor } from "../../scripts/manual-google-acceptance.mjs";

test("regular-browser monitor requires real verified OAuth claims and preserves HTTP/auth behavior", async (context) => {
  // SYNTHETIC signed identities only. No real Google credentials or learner DB.
  const identity = await testIdentityProvider();
  const verifier = createJwtVerifier(identity.issuer, createRemoteJWKSet(new URL(`${identity.issuer}/.well-known/jwks.json`)));
  const monitor = createGoogleBrowserMonitor(verifier, decodeJwt);
  const messages: unknown[][] = [];
  context.mock.method(console, "log", (...values: unknown[]) => { messages.push(values); });
  const subject = randomUUID(), other = randomUUID(), session = randomUUID(), attemptId = randomUUID();
  const token = await identity.token(subject, { app_metadata: { provider: "google" }, amr: [{ method: "oauth" }], session_id: session });
  const emailToken = await identity.token(other, { app_metadata: { provider: "email" }, amr: [{ method: "otp" }], session_id: randomUUID() });
  const app = express(); app.use(express.json());
  const router = express.Router();
  router.use(async (req, res) => {
    try {
      const user = await monitor.auth.verify(req.headers.authorization?.slice(7) ?? "");
      res.locals.profile = { id: user.subject };
      res.json({ success: true, data: req.path.endsWith("attempts") ? { attemptId } : { id: user.subject, synthetic: true } });
    } catch { res.status(401).json({ success: false }); }
  });
  app.use("/api/learning", router);
  const server = createServer(monitor.handle(app)).listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/learning`;
  async function call(bearer: string, path: string, browser = true) {
    return fetch(`${base}${path}`, { method: path === "/profile" ? "GET" : "POST", headers: {
      Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", ...(browser ? { Origin: "http://localhost:5173" } : {}),
    }, ...(path === "/profile" ? {} : { body: JSON.stringify({ rating: "good", synthetic: true }) }) });
  }
  try {
    assert.equal((await call("forged-SYNTHETIC-PRIVATE", "/profile")).status, 401); assert.equal(monitor.users.size, 0);
    assert.equal((await call(emailToken, "/profile")).status, 200); assert.equal(monitor.users.size, 0);
    const response = await call(token, "/profile"); assert.equal(response.status, 200);
    assert.equal((await response.json()).data.id, subject);
    await call(token, "/bookmarks"); await call(token, "/attempts"); await call(token, "/attempts");
    const user = monitor.users.get(subject);
    assert.equal(user.identity.subject, subject); assert.equal(user.bookmarks.length, 1); assert.equal(user.reviews.length, 1);
    assert.equal(user.sessions.size, 1); assert.equal(user.tokens.size, 1);
    await call(token, "/attempts", false); assert.equal(user.reviews.length, 1);
    const nextToken = await identity.token(subject, { app_metadata: { providers: ["email", "google"] }, amr: [{ method: "oauth" }], session_id: randomUUID() });
    await call(nextToken, "/profile"); assert.equal(user.sessions.size, 2); assert.equal(user.tokens.size, 2);
    assert.ok(!JSON.stringify(messages).includes(token)); assert.ok(!JSON.stringify(messages).includes(subject));
  } finally { await new Promise<void>((done) => server.close(() => done())); await identity.close(); }
});
