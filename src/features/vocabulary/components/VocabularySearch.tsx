import { Search } from "lucide-react";
export function VocabularySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="field"><label htmlFor="vocabulary-search">Search vocabulary</label><div className="search-input"><Search size={18} /><input id="vocabulary-search" type="search" maxLength={100} value={value} onChange={event => onChange(event.target.value)} placeholder="Search English or Arabic…" /></div></div>;
}
