import type { ApiVocabularyWord } from "@/lib/api";
export function VocabularyListItem({ word }: { word: ApiVocabularyWord }) {
  return <article className="vocabulary-item"><div className="vocabulary-item-top"><span className="level-pill">{word.level}</span><span>{word.category}</span></div><h3>{word.english}</h3><p className="library-arabic" dir="rtl" lang="ar">{word.arabic}</p><p className="library-transliteration">{word.transliteration}</p></article>;
}
