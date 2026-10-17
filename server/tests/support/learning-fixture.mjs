// SYNTHETIC TEST FIXTURE ONLY. No Quran Foundation content or credentials.
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { Pool } from "pg";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { checkedLearningUrl, migrateLearning } from "../../scripts/learning-migrate.mjs";

export async function disposableDatabase({ throughVersion = 2 } = {}) {
  const settings = JSON.parse(await readFile(new URL("../../../.local/learning-postgres/connection.json", import.meta.url), "utf8"));
  if (settings.port !== 55439 || settings.user !== "kalima_learning_admin") throw new Error("Unexpected isolated test cluster");
  const name = `kalima_learning_test_${randomUUID().replaceAll("-", "")}`;
  if (!/^kalima_learning_test_[a-f0-9]{32}$/.test(name)) throw new Error("Invalid disposable database name");
  const base = `postgresql://${encodeURIComponent(settings.user)}:${encodeURIComponent(settings.password)}@127.0.0.1:${settings.port}/`;
  const admin = new Pool({ connectionString: base + "postgres", connectionTimeoutMillis: 3000 });
  await admin.query(`CREATE DATABASE "${name}"`);
  const connectionString = checkedLearningUrl(base + name);
  await migrateLearning(connectionString, { throughVersion });
  const pool = new Pool({ connectionString, max: 8 });
  return { pool, connectionString, async close() {
    await pool.end();
    // Only this randomly named database created by this fixture is removed.
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  } };
}

export const alice = "10000000-0000-4000-8000-000000000001";
export const bob = "10000000-0000-4000-8000-000000000002";
export async function testIdentityProvider(port = 0) {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "ES256", use: "sig" };
  let issuer;
  const sessions = new Map();
  async function token(subject = alice, claims = {}, options = {}) {
    return new SignJWT({ role: "authenticated", ...claims }).setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(options.issuer ?? issuer).setAudience(options.audience ?? "authenticated").setSubject(subject)
      .setIssuedAt().setExpirationTime(options.expiry ?? "5m").sign(privateKey);
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:4173");
    res.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (req.url === "/auth/v1/.well-known/jwks.json") { res.end(JSON.stringify({ keys: [jwk] })); return; }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    if (req.url === "/auth/v1/otp" || req.url?.startsWith("/auth/v1/logout")) { res.end("{}"); return; }
    if (req.url?.startsWith("/auth/v1/token?grant_type=refresh_token") && sessions.has(body.refresh_token)) {
      const previous = sessions.get(body.refresh_token);
      const result = { ...previous, access_token: await token(previous.user.id) };
      res.end(JSON.stringify(result)); return;
    }
    if (req.url === "/auth/v1/verify" && body.token === "123456") {
      const hex = createHash("sha256").update(body.email).digest("hex");
      const subject = body.email === "bob@example.test" ? bob : body.email === "alice@example.test" ? alice : `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      const result = { access_token: await token(subject), token_type: "bearer", expires_in: 300,
        refresh_token: `test-refresh-${subject}`, user: { id: subject, aud: "authenticated", role: "authenticated", email: body.email,
          email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), app_metadata: { provider: "email" }, user_metadata: {} } };
      sessions.set(result.refresh_token, result); res.end(JSON.stringify(result)); return;
    }
    res.writeHead(400); res.end(JSON.stringify({ msg: "Synthetic test identity request rejected" }));
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${server.address().port}/auth/v1`;
  return { issuer, token, async close() { await new Promise((resolve) => server.close(resolve)); } };
}

export const syntheticResult = {
  status: "ready", attribution: { provider: "Quran Foundation", label: "Quran data provided by Quran.Foundation", url: "https://quran.foundation", translationName: "SYNTHETIC TEST ONLY" },
  surah: { number: 1, nameArabic: "اختبار", nameTransliterated: "SYNTHETIC TEST ONLY", translatedName: "Not Quranic content",
    verses: [{ sourceId: 9001, number: 1, verseKey: "1:1", textUthmani: "اختبار تجريبي فقط",
      words: [1, 2, 3].map((position) => ({ sourceId: 9100 + position, position, textUthmani: ["اختبار", "تجريبي", "فقط"][position - 1],
        ...(position === 1 ? { audioUrl: "https://audio.example.test/synthetic-word.mp3" } : {}),
        ...(position < 3 ? { translation: `Synthetic meaning ${position}` } : {}),
        reference: { surah: 1, ayah: 1, word: position, verseKey: "1:1" } })) }],
  },
};
export const syntheticProvider = {
  getStatus: () => ({ status: "configured", environment: "prelive", attribution: syntheticResult.attribution }),
  getSurah: async () => structuredClone(syntheticResult),
};
