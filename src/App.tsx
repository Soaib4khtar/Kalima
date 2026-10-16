import { useEffect, useState } from "react";
import { BookOpen, Library, Moon, Sparkles, Sun } from "lucide-react";
import { Link, NavLink, Route, Routes } from "react-router";
import { LearningPage } from "./features/learning/pages/LearningPage";
import { VocabularyPage } from "./features/vocabulary/pages/VocabularyPage";
import { AddVocabularyPage } from "./features/vocabulary/pages/AddVocabularyPage";
import { AlFatihahPage } from "./features/quran/pages/AlFatihahPage";
import "./App.css";

export default function App() {
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
          <NavLink to="/" end><Sparkles size={16} />Practice</NavLink>
          <NavLink to="/quran/al-fatihah"><BookOpen size={16} />Quran</NavLink>
          <NavLink to="/vocabulary" end><Library size={16} />Words</NavLink>
        </nav>
        <div className="nav-actions"><button className="icon-button" onClick={() => setDark(!dark)} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} title={`Switch to ${dark ? "light" : "dark"} mode`}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button></div>
      </div></header>
      <main id="main-content" className="page-container" tabIndex={-1}><Routes>
        <Route path="/" element={<LearningPage />} />
        <Route path="/quran/al-fatihah" element={<AlFatihahPage />} />
        <Route path="/vocabulary" element={<VocabularyPage />} />
        <Route path="/vocabulary/new" element={<AddVocabularyPage />} />
        <Route path="*" element={<div className="empty-panel"><h1>Page not found</h1><Link className="primary-button" to="/">Back to practice</Link></div>} />
      </Routes></main>
      <footer className="site-footer"><span>Little words. A world of possibility.</span><span>Made for your Arabic journey ✦</span></footer>
    </div>
  );
}
