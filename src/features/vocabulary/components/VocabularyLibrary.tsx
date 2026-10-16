import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Plus } from "lucide-react";
import { Link } from "react-router";
import { fetchVocabulary } from "@/lib/api";
import { CategoryFilter } from "./CategoryFilter";
import { VocabularyList } from "./VocabularyList";
import { VocabularySearch } from "./VocabularySearch";

export function VocabularyLibrary() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  // Keep categories stable while filtering, including categories of newly added words.
  const library = useQuery({ queryKey: ["vocabulary"], queryFn: () => fetchVocabulary() });
  const filtered = useQuery({ queryKey: ["vocabulary", search, category], queryFn: () => fetchVocabulary({ search, category }), enabled: Boolean(search || category !== "all") });
  const { data: words, isPending, isError, refetch } = search || category !== "all" ? filtered : library;
  const categories = [...new Set((library.data ?? []).map(word => word.category))].sort();
  return <section className="library-page">
    <div className="page-heading"><div><p className="eyebrow"><BookOpen size={14} /> YOUR GROWING COLLECTION</p><h1>Words open <em>worlds.</em></h1><p className="heading-description">A home for every Arabic word you’re learning.</p></div><Link className="primary-button" to="/vocabulary/new"><Plus size={17} />Add a word</Link></div>
    <div className="library-filters surface-panel"><VocabularySearch value={search} onChange={setSearch} /><CategoryFilter categories={categories} value={category} onChange={setCategory} /></div>
    <div className="library-topline"><span>{isPending ? "Finding your words…" : `${words?.length ?? 0} words in this collection`}</span><Link className="text-link" to="/">Practice your words <ArrowRight size={14} /></Link></div>
    {isPending ? <div className="loading-panel" role="status">Loading your collection…</div> : isError ? <div className="empty-panel"><h2>Your collection couldn’t be loaded</h2><p>Please try again in a moment.</p><button className="primary-button" onClick={() => void refetch()}>Try again</button></div>
      : words?.length === 0 && !search && category === "all" ? <div className="empty-panel"><BookOpen size={34} /><h2>Every collection starts somewhere.</h2><p>Add a word, then make it part of your everyday vocabulary.</p><Link className="primary-button" to="/vocabulary/new">Add your first word <Plus size={16} /></Link></div>
      : words && <VocabularyList words={words} />}
  </section>;
}
