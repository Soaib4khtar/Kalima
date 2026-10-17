// Hermetic test host only. Never used by the application server or deployment.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { disposableDatabase, testIdentityProvider, syntheticProvider } from "../../server/tests/support/learning-fixture.mjs";
import { createApp } from "../../server/dist/app.js";
import { createJwtVerifier } from "../../server/dist/modules/auth/auth.js";
import { LearningRepository } from "../../server/dist/modules/learning/learning.repository.js";
const require = createRequire(new URL("../../server/package.json", import.meta.url));
const { createRemoteJWKSet } = await import(pathToFileURL(require.resolve("jose")).href);
const database = await disposableDatabase();
const identity = await testIdentityProvider(4175);
let reviewClockOffset = 0;
const app = createApp({
  quranProvider: syntheticProvider, learningRepository: new LearningRepository(database.pool, () => new Date(Date.now() + reviewClockOffset)),
  auth: createJwtVerifier(identity.issuer, createRemoteJWKSet(new URL(`${identity.issuer}/.well-known/jwks.json`))),
});
// The cleanup path exists only in this hermetic test host, never in createApp.
// Playwright's Windows process kill does not reliably deliver SIGTERM.
const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/__test/advance-time") {
    // Test-only clock control; never registered in the real application.
    reviewClockOffset += 65_000;
    res.setHeader("Content-Type", "application/json"); res.end('{"advanced":true}');
  } else if (req.method === "POST" && req.url === "/__test/cleanup") {
    await database.close();
    res.setHeader("Content-Type", "application/json"); res.end('{"cleaned":true}');
  } else app(req, res);
}).listen(4174, "127.0.0.1", () => console.log("Synthetic identity + Quran fixtures with real isolated learner storage ready"));
let closing = false;
async function close() {
  if (closing) return; closing = true;
  await new Promise((resolve) => server.close(resolve));
  await identity.close(); process.exit(0);
}
process.on("SIGTERM", close); process.on("SIGINT", close);
