import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "./auth-client";
import { useAuth } from "./auth-context";
import { LearningSummary } from "../learning/LearningSummary";
import { authErrorMessage } from "./auth-errors";

export function AccountPage() {
  const { session, loading } = useAuth();
  const cache = useQueryClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR LEARNING JOURNEY</p><h1>A little practice.<br /><em>Remembered.</em></h1></div></div>
    <section className="surface-panel account-panel" aria-label="Account">
      {loading ? <p role="status">Checking your session…</p> : session ? <>
        <h2>You’re signed in</h2><p>{session.user.email}</p>
        <p>Your sign-in session is active. Saved learning appears below when the learning service is connected.</p>
        <Link className="primary-button" to="/quran/al-fatihah">Continue Al-Fatihah</Link>
        <button className="reveal-button" disabled={busy} onClick={() => void signOut()}>Sign out</button>
      </> : !authClient ? <>
        <h2>Sign-in isn’t connected yet</h2><p>Account configuration is still needed. Reading and anonymous practice remain available; they do not save account progress.</p>
        <Link className="primary-button" to="/quran/al-fatihah">Read Al-Fatihah</Link>
      </> : <>
        <h2>{sent ? "Check your email" : "Save your learning"}</h2>
        <p>{sent ? "Enter the one-time code sent to your email. Keep the code private." : "Sign in or create an account with an email code. No password to remember."}</p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="auth-email">Email address</label>
          <input id="auth-email" type="email" autoComplete="email" maxLength={254} required value={email} disabled={busy || sent} onChange={(e) => setEmail(e.target.value)} />
          {sent && <><label htmlFor="auth-code">Sign-in code</label><input id="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={code} onChange={(e) => setCode(e.target.value)} /></>}
          <button className="primary-button" disabled={busy} type="submit">{busy ? "Please wait…" : sent ? "Verify code" : "Send sign-in code"}</button>
          {sent && <button className="reveal-button" type="button" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); }}>Use another email or request a new code</button>}
        </form>
      </>}
      {error && <p role="alert">{error}</p>}
    </section>
    {session && <LearningSummary key={session.user.id} />}
  </>;
}
