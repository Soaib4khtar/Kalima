import { createRemoteJWKSet, jwtVerify, errors, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { AppError } from "../../utils/app-error.js";

export interface LearnerIdentity { issuer: string; subject: string }
export interface AuthVerifier {
  configured: boolean;
  verify(token: string): Promise<LearnerIdentity>;
}

export function createJwtVerifier(issuer: string, keys: JWTVerifyGetKey): AuthVerifier {
  return {
    configured: true,
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer, audience: "authenticated", algorithms: ["ES256", "RS256"],
          requiredClaims: ["sub", "exp", "iat"], clockTolerance: 5,
        });
        const subject = z.uuid().parse(payload.sub);
        if (typeof payload.iat !== "number" || payload.iat > Date.now() / 1000 + 5 ||
          typeof payload.exp !== "number" || payload.exp <= payload.iat) throw new Error("Invalid token lifetime");
        if (payload.role !== "authenticated" || payload.is_anonymous === true) throw new Error("Invalid learner role");
        return { issuer, subject };
      } catch (error) {
        if (error instanceof errors.JWKSTimeout || error instanceof TypeError ||
          (error instanceof errors.JOSEError && ["ERR_JOSE_GENERIC", "ERR_JWKS_INVALID"].includes(error.code))) {
          throw new AppError(503, "AUTH_UNAVAILABLE", "Sign-in verification is temporarily unavailable");
        }
        throw new AppError(401, "INVALID_SESSION", "Your session is invalid or expired. Please sign in again");
      }
    },
  };
}

export function createAuthFromEnv(env: NodeJS.ProcessEnv = process.env): AuthVerifier {
  try {
    const url = new URL(env.SUPABASE_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    const issuer = `${url.origin}/auth/v1`;
    return createJwtVerifier(issuer, createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
      timeoutDuration: 5_000, cacheMaxAge: 600_000, cooldownDuration: 30_000,
    }));
  } catch {
    return {
      configured: false,
      async verify() { throw new AppError(503, "AUTH_UNCONFIGURED", "Sign-in has not been configured on this server"); },
    };
  }
}
