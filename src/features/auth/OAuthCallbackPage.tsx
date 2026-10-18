import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { oauthCompletion } from "./auth-client";
import { googleAuthErrorMessage, type OAuthCompletion } from "./oauth-callback";

export function OAuthCallbackPage() {
  const [result, setResult] = useState<OAuthCompletion | null>(null);
  useEffect(() => {
    let active = true;
    void (oauthCompletion ?? Promise.resolve<OAuthCompletion>({ status: "error", message: googleAuthErrorMessage(null) }))
      .then((value) => { if (active) setResult(value); });
    return () => { active = false; };
  }, []);
  if (result?.status === "success") return <Navigate to="/account" replace />;
  return <section className="surface-panel account-panel" aria-label="Secure sign-in callback">
    {!result ? <><h1>Completing your sign-in…</h1><p role="status">Verifying the secure callback. Please keep this browser open.</p></> : <>
      <h1>Let’s try that sign-in again.</h1><p role="alert">{result.message}</p>
      <Link className="primary-button" to="/account">Back to sign in</Link>
      <Link className="text-link" to="/quran/al-fatihah">Read without signing in</Link>
    </>}
  </section>;
}
