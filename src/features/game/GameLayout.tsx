import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { BookOpen, Castle, Flower2, Map, ScrollText } from 'lucide-react';
import { WorldScene } from './WorldArt';
import './game.css';

export function GameLayout({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <p role="status">Opening your learning world…</p>;
  if (!session) return <section className="world-invitation"><div><p className="eyebrow">A LITTLE PLACE OF YOUR OWN</p><h1>A world worth returning to.</h1><p>Sign in to grow your private Memory Garden and keep your quests across devices. Quran reading is always open.</p><Link className="primary-button" to="/account">Continue with Google</Link><Link className="text-link" to="/quran/al-fatihah">Read without signing in</Link></div><WorldScene/></section>;
  return <div className="game-world" key={session.user.id}><nav className="world-nav" aria-label="Learning world"><NavLink to="/" end><Map/><span>Overview</span></NavLink><NavLink to="/quests"><ScrollText/><span>Today’s Quests</span></NavLink><NavLink to="/garden"><Flower2/><span>Memory Garden</span></NavLink><NavLink to="/kingdom"><Castle/><span>My Kingdom</span></NavLink><NavLink to="/progress"><BookOpen/><span>Progress</span></NavLink></nav>{children}</div>;
}
