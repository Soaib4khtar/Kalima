import type { ReactNode } from "react";
import { ArrowRight, RotateCw } from "lucide-react";
import type { ApiVocabularyWord } from "@/lib/api";
interface VocabularyCardProps { word: ApiVocabularyWord; showAnswer: boolean; onReveal: () => void; children?: ReactNode; }
export function VocabularyCard({ word, showAnswer, onReveal, children }: VocabularyCardProps) {
  return <div className="flashcard-shell"><div className="flashcard-perspective"><div className={`flashcard-inner ${showAnswer ? "is-flipped" : ""}`}>
    <div className="flashcard-face flashcard-front" aria-hidden={showAnswer}>
      <div className="card-topline"><span className="level-pill">{word.level} <span>·</span> {word.category}</span><span className="card-number">01 / RECALL</span></div>
      <div className="card-word"><p className="card-language">HOW DO YOU SAY THIS IN ARABIC?</p><h2>{word.english}</h2><span className="word-rule" /><p className="card-prompt">Find the word. Make the connection.</p></div>
      <span className="card-bottom-note"><RotateCw size={14} /> A moment of recall makes a difference</span><span className="card-decoration" aria-hidden="true" lang="ar">ك</span>
    </div>
    <div className="flashcard-face flashcard-back" aria-hidden={!showAnswer}>
      <div className="card-topline"><span className="level-pill">{word.level} <span>·</span> {word.category}</span><span className="card-number">02 / CONNECT</span></div>
      <div className="card-word"><p className="card-language">{word.english}</p><h2 className="arabic-word" dir="rtl" lang="ar">{word.arabic}</h2><p className="transliteration">{word.transliteration}</p><span className="word-rule" /><p className="card-prompt">How well did you remember?</p></div>
      <span className="card-bottom-note">A new connection, one word at a time.</span>
    </div>
  </div></div><div className="card-controls">{showAnswer ? children : <button className="reveal-button" onClick={onReveal}><span>Reveal Arabic <ArrowRight size={17} /></span><kbd>space</kbd></button>}</div></div>;
}
