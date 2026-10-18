import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "./auth-client";
import { useAuth } from "./auth-context";
import { LearningSummary } from "../learning/LearningSummary";
import { authErrorMessage } from "./auth-errors";
import { googleAuthErrorMessage } from "./oauth-callback";

export function AccountPage() {
  const { session, loading } = useAuth();
  const cache = useQueryClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const restore = () => setBusy(false);
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  async function googleSignIn() {
    if (!authClient || busy) return;
    setBusy(true); setError("");
    try {
      const { error } = await authClient.auth.signInWithOAuth({ provider: "google", options: {
        redirectTo: new URL("/auth/callback", window.location.origin).href,
        queryParams: { prompt: "select_account" },
      } });
      if (error) throw error;
    } catch (error) { setError(googleAuthErrorMessage(error)); setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!authClient || busy) return;
    setBusy(true); setError("");
    try {
      const result = sent
        ? await authClient.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" })
        : await authClient.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      if (result.error) throw result.error;
      setSent(true); setCode("");
    } catch (error) { setError(authErrorMessage(error, sent)); }
    finally { setBusy(false); }
  }
  async function signOut() {
    if (!authClient) return;
    setBusy(true); setError("");
    try {
      const { error } = await authClient.auth.signOut({ scope: "local" });
      if (error) throw error;
      await cache.cancelQueries({ queryKey: ["learning"] });
      cache.removeQueries({ queryKey: ["learning"] });
      setSent(false);
    } catch { setError("Sign-out could not be completed. Please try again."); }
    finally { setBusy(false); }
  }
  async function refreshSession() {
    if (!authClient || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error } = await authClient.auth.refreshSession();
      if (error) throw error;
      await cache.invalidateQueries({ queryKey: ["learning"] });
      setNotice("Your sign-in session has been refreshed.");
    } catch { setError("Your sign-in session could not be refreshed. Try signing in again; saved learning is safe."); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR LEARNING JOURNEY</p><h1>A little practice.<br /><em>Remembered.</em></h1></div></div>
    <section className="surface-panel account-panel" aria-label="Account">
      {loading ? <p role="status">Checking your session…</p> : session ? <>
        <h2>You’re signed in</h2><p>{session.user.email}</p>
        <p>Your sign-in session is active. Saved learning appears below when the learning service is connected.</p>
        <div className="auth-account-actions"><Link className="primary-button" to="/reviews">Open daily reviews</Link><Link className="text-link" to="/quran/al-fatihah">Continue Al-Fatihah</Link></div>
        <button className="reveal-button" disabled={busy} onClick={() => void signOut()}>Sign out</button>
        <details className="auth-email-fallback"><summary>Session controls</summary><p>Refresh your sign-in without changing saved learning.</p><button className="reveal-button" disabled={busy} onClick={() => void refreshSession()}>Refresh sign-in session</button></details>
      </> : !authClient ? <>
        <h2>Sign-in isn’t connected yet</h2><p>Account configuration is still needed. Reading and anonymous practice remain available; they do not save account progress.</p>
        <Link className="primary-button" to="/quran/al-fatihah">Read Al-Fatihah</Link>
      </> : <>
        <h2>{sent ? "Check your email" : "Save your learning"}</h2>
        <p>Keep your saved words and review progress with you. Continue securely with Google—no email code needed.</p>
        <button className="google-signin-button" type="button" disabled={busy} onClick={() => void googleSignIn()}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.9.6-2.04.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.91A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.91V7.5H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.5l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.95 5.5l3.34 2.59C7.18 7.72 9.39 5.96 12 5.96Z"/></svg>
          <span>{busy ? "Please wait…" : "Continue with Google"}</span>
        </button>
        <p className="auth-privacy-note">Only basic profile information is requested. Your Quran reading stays public.</p>
        <details className="auth-email-fallback"><summary>Use an email code instead</summary>
        <p>{sent ? "Enter the one-time code sent to your email. Keep the code private." : "Optional fallback. Delivery depends on the development email provider."}</p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="auth-email">Email address</label>
          <input id="auth-email" type="email" autoComplete="email" maxLength={254} required value={email} disabled={busy || sent} onChange={(e) => setEmail(e.target.value)} />
          {sent && <><label htmlFor="auth-code">Sign-in code</label><input id="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={code} onChange={(e) => setCode(e.target.value)} /></>}
          <button className="primary-button" disabled={busy} type="submit">{busy ? "Please wait…" : sent ? "Verify code" : "Send sign-in code"}</button>
          {sent && <button className="reveal-button" type="button" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); }}>Use another email or request a new code</button>}
        </form>
        </details>
        <Link className="text-link" to="/quran/al-fatihah">Read without signing in</Link>
      </>}
      {error && <p role="alert">{error}</p>}
      {notice && session && <p role="status">{notice}</p>}
    </section>
    {session && <LearningSummary key={session.user.id} />}
  </>;
}
