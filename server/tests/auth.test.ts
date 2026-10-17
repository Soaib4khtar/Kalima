import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK, createRemoteJWKSet } from "jose";
import { createAuthFromEnv, createJwtVerifier } from "../src/modules/auth/auth.js";

const issuer = "https://abcdefghijklmnopqrst.supabase.co/auth/v1";
const subject = "10000000-0000-4000-8000-000000000001";
const status = (expected: number) => (error: unknown) => (error as { statusCode?: number }).statusCode === expected;

for (const algorithm of ["ES256", "RS256"] as const) {
  test(`${algorithm} signatures bind issuer, audience, expiry, and learner identity`, async () => {
    const keys = await generateKeyPair(algorithm);
    const verify = createJwtVerifier(issuer, createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: "synthetic-key", alg: algorithm }] }));
    async function token(claims: Record<string, unknown> = {}) {
      return new SignJWT({ iss: issuer, sub: subject, aud: "authenticated", role: "authenticated", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, ...claims })
        .setProtectedHeader({ alg: algorithm, kid: "synthetic-key" }).sign(keys.privateKey);
    }
    assert.deepEqual(await verify.verify(await token()), { issuer, subject });
    for (const claims of [{ iss: "https://wrong.example/auth/v1" }, { aud: "anon" }, { exp: 1 }, { iat: Math.floor(Date.now() / 1000) + 60 },
      { sub: "not-a-uuid" }, { role: "service_role" }, { is_anonymous: true }, { exp: Math.floor(Date.now() / 1000) - 100, iat: 1 }, { nbf: Math.floor(Date.now() / 1000) + 120 }]) {
      const signed = await token(claims);
      await assert.rejects(() => verify.verify(signed), status(401));
    }
    const wrongKeys = await generateKeyPair(algorithm);
    const forged = await new SignJWT({ iss: issuer, sub: subject, aud: "authenticated", role: "authenticated" }).setIssuedAt().setExpirationTime("5m")
      .setProtectedHeader({ alg: algorithm, kid: "synthetic-key" }).sign(wrongKeys.privateKey);
    await assert.rejects(() => verify.verify(forged), status(401));
  });
}

test("shared-secret and malformed tokens are rejected; JWKS failures are unavailable, not successful", async () => {
  const keys = await generateKeyPair("ES256");
  const verifier = createJwtVerifier(issuer, createLocalJWKSet({ keys: [await exportJWK(keys.publicKey)] }));
  const sharedSecret = await new SignJWT({ role: "authenticated" }).setIssuer(issuer).setAudience("authenticated").setSubject(subject).setIssuedAt().setExpirationTime("5m")
    .setProtectedHeader({ alg: "HS256" }).sign(new Uint8Array(32));
  await assert.rejects(() => verifier.verify(sharedSecret), status(401));
  await assert.rejects(() => verifier.verify("not-a-token"), status(401));
  const remote = createJwtVerifier(issuer, createRemoteJWKSet(new URL("http://127.0.0.1:1/jwks"), { timeoutDuration: 100 }));
  const signed = await new SignJWT({ role: "authenticated" }).setIssuer(issuer).setAudience("authenticated").setSubject(subject).setIssuedAt().setExpirationTime("5m").setProtectedHeader({ alg: "ES256" }).sign(keys.privateKey);
  await assert.rejects(() => remote.verify(signed), status(503));
});

test("production env verifier has no loopback/test identity or insecure URL fallback", () => {
  for (const SUPABASE_URL of [undefined, "http://127.0.0.1:4175", "http://project.supabase.co", "https://user:private@project.supabase.co", "https://project.supabase.co/path", "https://project.supabase.co/?key=private"]) {
    assert.equal(createAuthFromEnv({ SUPABASE_URL }).configured, false);
  }
  assert.equal(createAuthFromEnv({ SUPABASE_URL: issuer.replace("/auth/v1", "") }).configured, true);
});
