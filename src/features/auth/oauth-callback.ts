/** The SDK performs the PKCE verification. This layer only owns safe routing,
 * URL cleanup and one exchange per document (including React StrictMode). */
export type OAuthCompletion = { status: "success" } | { status: "error"; message: string };
interface CodeExchange {
  exchangeCodeForSession(code: string): Promise<{ data: { session: unknown }; error: unknown }>;
}

export function googleAuthErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "access_denied") return "Google sign-in was cancelled or access was not granted. You can try again when ready.";
  if (code === "provider_disabled" || code === "oauth_provider_not_supported") return "Google sign-in is not enabled for this project. Check the development Supabase Google provider settings.";
  if (["bad_code_verifier", "pkce_code_verifier_not_found", "flow_state_not_found", "flow_state_expired", "bad_oauth_callback"].includes(String(code))) return "This sign-in could not be completed. Start Google sign-in again in this same browser; the secure callback may have expired or lost its verifier.";
  return "Google sign-in could not be completed. Try again from the sign-in page, or check the development project's Google provider and callback settings.";
}

export function createOAuthCallbackCompletion(address: string, auth: CodeExchange | null, clearUrl: () => void) {
  let completion: Promise<OAuthCompletion> | undefined;
  return () => completion ??= (async (): Promise<OAuthCompletion> => {
    try {
      const url = new URL(address);
      // Never accept implicit tokens or a caller-supplied next/redirect target.
      // All callback parameters are removed before rendering or making requests.
      const fragment = new URLSearchParams(url.hash.slice(1));
      const failure = url.searchParams.get("error") ?? fragment.get("error");
      const codes = url.searchParams.getAll("code");
      const implicit = ["access_token", "refresh_token", "id_token"].some((key) => url.searchParams.has(key) || fragment.has(key));
      clearUrl();
      if (failure) return { status: "error", message: googleAuthErrorMessage({ code: failure }) };
      if (!auth) return { status: "error", message: "Sign-in is not configured. Reading remains available without an account." };
      if (implicit || codes.length !== 1 || !codes[0] || codes[0].length > 4096) return { status: "error", message: googleAuthErrorMessage(null) };
      const { data, error } = await auth.exchangeCodeForSession(codes[0]);
      if (error || !data.session) return { status: "error", message: googleAuthErrorMessage(error) };
      return { status: "success" };
    } catch { return { status: "error", message: googleAuthErrorMessage(null) }; }
  })();
}
