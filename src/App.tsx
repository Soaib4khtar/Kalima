import { useEffect, useState } from "react";
import { BookOpen, CalendarCheck, Library, Moon, Sparkles, Sun } from "lucide-react";
import { lazy, Suspense } from 'react';
import { Link, NavLink, Route, Routes } from "react-router";
import { LearningPage } from "./features/learning/pages/LearningPage";
import { VocabularyPage } from "./features/vocabulary/pages/VocabularyPage";
import { AddVocabularyPage } from "./features/vocabulary/pages/AddVocabularyPage";
import "./App.css";
import { useAuth } from "./features/auth/auth-context";
import { OAuthCallbackPage } from "./features/auth/OAuthCallbackPage";
const HomePage = lazy(() => import('./features/game/HomePage'));
const QuestsPage = lazy(() => import('./features/game/HomePage').then(m => ({ default: m.QuestsPage })));
const GardenPage = lazy(() => import('./features/game/GardenPage'));
const KingdomPage = lazy(() => import('./features/game/KingdomPage'));
const ProgressPage = lazy(() => import('./features/game/ProgressPage'));
const AlFatihahPage=lazy(()=>import('./features/quran/pages/AlFatihahPage').then(m=>({default:m.AlFatihahPage})));
const AccountPage=lazy(()=>import('./features/auth/AccountPage').then(m=>({default:m.AccountPage})));
const DailyReviewsPage=lazy(()=>import('./features/learning/pages/DailyReviewsPage').then(m=>({default:m.DailyReviewsPage})));

export default function App() {
  const { session, loading } = useAuth();
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("kalima-theme") !== "light"; } catch { return true; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("kalima-theme", dark ? "dark" : "light"); } catch { /* Storage is optional. */ }
  }, [dark]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header"><div className="nav-inner">
        <Link className="brand" to="/" aria-label="Kalima home"><span className="brand-symbol" lang="ar" aria-hidden="true">ك</span><span>kalima<span className="brand-dot">.</span></span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/" end><Sparkles size={16} />{session ? 'Home' : 'Practice'}</NavLink>
          <NavLink to="/reviews"><CalendarCheck size={16} />Reviews</NavLink>
          <NavLink to="/quran/al-fatihah"><BookOpen size={16} />Quran</NavLink>
          <NavLink to="/vocabulary" end><Library size={16} />Words</NavLink>
        </nav>
        <div className="nav-actions"><NavLink className="account-link" to="/account">{session ? "Account" : "Sign in"}</NavLink><button className="icon-button" onClick={() => setDark(!dark)} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} title={`Switch to ${dark ? "light" : "dark"} mode`}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button></div>
      </div></header>
      <main id="main-content" className="page-container" tabIndex={-1}><Suspense fallback={<p role="status">Opening your learning space…</p>}><Routes>
        <Route path="/" element={loading ? <p role="status">Restoring your learning session…</p> : session ? <HomePage /> : <LearningPage />} />
        <Route path="/practice" element={<LearningPage />} />
        <Route path="/quests" element={<QuestsPage />} />
        <Route path="/garden" element={<GardenPage />} />
        <Route path="/kingdom" element={<KingdomPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/quran/al-fatihah" element={<AlFatihahPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />
        <Route path="/reviews" element={<DailyReviewsPage />} />
        <Route path="/vocabulary" element={<VocabularyPage />} />
        <Route path="/vocabulary/new" element={<AddVocabularyPage />} />
        <Route path="*" element={<div className="empty-panel"><h1>Page not found</h1><Link className="primary-button" to="/">Back to practice</Link></div>} />
      </Routes></Suspense></main>
      <footer className="site-footer"><span>Little words. A world of possibility.</span><span>Made for your Arabic journey ✦</span></footer>
    </div>
  );
}
