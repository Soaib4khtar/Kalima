import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const gateway = "https://apis-prelive.quran.foundation/content/api/v4/";
const tokenUrl = "https://prelive-oauth2.quran.foundation/oauth2/token";
const tokenSchema = z.object({ access_token: z.string().min(1) });
const translationsSchema = z.object({
  translations: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string(),
    author_name: z.string(),
    language_name: z.string(),
  })),
});
const recitationsSchema = z.object({
  recitations: z.array(z.object({
    id: z.number().int().positive(),
    reciter_name: z.string(),
    style: z.string().nullable().optional(),
  })),
});

/** Bootstrap resource discovery before a translation ID is selected.
 * Only credential-presence flags and catalog metadata can leave this helper.
 * It imports no app/database code, persists nothing, and never requests verses.
 */
export async function discoverPreliveResources(env = process.env, fetchImplementation = globalThis.fetch) {
  if ((env.QF_ENV ?? "prelive") !== "prelive") {
    return { status: "refused", authentication: "not-attempted", reason: "This command only supports QF_ENV=prelive." };
  }
  const missing = ["QF_CLIENT_ID", "QF_CLIENT_SECRET"].filter((key) => !env[key]?.trim());
  if (missing.length) {
    return { status: "unconfigured", authentication: "not-attempted", missing };
  }

  let stage = "authentication";
  try {
    const tokenResponse = await fetchImplementation(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.QF_CLIENT_ID.trim()}:${env.QF_CLIENT_SECRET.trim()}`, "utf8").toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "content" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) {
      return { status: "unavailable", authentication: "failed", stage, httpStatus: tokenResponse.status };
    }
    const token = tokenSchema.parse(await tokenResponse.json()).access_token;
    const catalogs = {};
    for (const [name, schema] of [["translations", translationsSchema], ["recitations", recitationsSchema]]) {
      stage = name;
      const response = await fetchImplementation(`${gateway}resources/${name}?language=en`, {
        headers: { Accept: "application/json", "x-auth-token": token, "x-client-id": env.QF_CLIENT_ID.trim() },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        return { status: "unavailable", authentication: "succeeded", stage, httpStatus: response.status };
      }
      catalogs[name] = schema.parse(await response.json())[name];
    }
    return {
      status: "catalogs-loaded",
      authentication: "succeeded",
      environment: "prelive",
      // The language query localizes catalog names; filter actual language here.
      translations: catalogs.translations.filter((item) => item.language_name.toLowerCase() === "english"),
      recitations: catalogs.recitations,
      note: "Catalog membership does not verify Al-Fatihah coverage or audio playback. No verses were requested.",
    };
  } catch {
    // Error objects or raw bodies can contain tokens, requests, or provider data.
    return {
      status: "unavailable",
      authentication: stage === "authentication" ? "not-verified" : "succeeded",
      stage,
      reason: "The prelive request failed or its response was invalid. No raw response is printed.",
    };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await discoverPreliveResources();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "catalogs-loaded") process.exitCode = 1;
}
