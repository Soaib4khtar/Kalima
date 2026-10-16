import type { ApiVocabularyWord } from "@/lib/api";
import { VocabularyListItem } from "./VocabularyListItem";
export function VocabularyList({ words }: { words: ApiVocabularyWord[] }) {
  if (!words.length) return <div className="empty-panel"><h2>No words found</h2><p>Try a different search or category.</p></div>;
  return <div className="vocabulary-grid">{words.map(word => <VocabularyListItem key={word.id} word={word} />)}</div>;
}
