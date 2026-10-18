import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useAuth } from '../auth/auth-context';
import './game.css';

export function GameLayout({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <p role="status">Opening your learning world…</p>;
  if (!session) return <section className="empty-panel"><h1>A world worth returning to.</h1><p>Sign in to grow your private Memory Garden and keep your quests across devices. Quran reading is always open.</p><Link className="primary-button" to="/account">Continue with Google</Link><Link className="text-link" to="/quran/al-fatihah">Read without signing in</Link></section>;
  return <div className="game-world" key={session.user.id}><nav className="world-nav" aria-label="Learning world"><NavLink to="/" end>Overview</NavLink><NavLink to="/quests">Today’s Quests</NavLink><NavLink to="/garden">Memory Garden</NavLink><NavLink to="/kingdom">My Kingdom</NavLink><NavLink to="/progress">Progress</NavLink></nav>{children}</div>;
}
