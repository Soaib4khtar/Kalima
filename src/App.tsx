import { useState } from 'react'

import { Button } from "@/components/ui/button";

import { ReviewButtons } from "./features/vocabulary/components/ReviewButtons";
import type { ReviewRating } from "./features/vocabulary/components/ReviewButtons";
import { VocabularyCard } from "./features/vocabulary/components/VocabularyCard";
import { vocabulary } from "./features/vocabulary/data/vocabulary";
import { VocabularyLibrary } from './features/vocabulary/components/VocabularyLibrary';


function App () {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [completedWords, setCompletedWords] = useState(0);
  const [lastRating, setLastRating] = useState<ReviewRating | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);

  const currentWord = vocabulary[currentWordIndex];

  const progress = (completedWords / vocabulary.length) * 100;

  function handleReveal () {
    setShowAnswer(true);
  }

  function handleRate(rating: ReviewRating) {
    setLastRating(rating);

    setCompletedWords((count) => count + 1);

    const isLastword = 
      currentWordIndex === vocabulary.length - 1;

    if (isLastword) {
      setSessionComplete(true);
      return;
    }
    
    setCurrentWordIndex((index) => index + 1);
    setShowAnswer(false);
  }

  function handleRestart() {
    setCurrentWordIndex(0);
    setShowAnswer(false);
    setCompletedWords(0);
    setLastRating(null);
    setSessionComplete(false);
  }

  if (sessionComplete) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto flex min-h-[80vh] max-w-3x1 flex-col items-center justify-center gap-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Session complete
          </p>

          <h1 className="text-4xl font-bold">
            Great job! 🎉
          </h1>

          <p className="text-muted-foreground">
            You reviewed {completedWords} words.
          </p>

          {lastRating && (
            <p className="text-sm text-muted-foreground">
              Last rating: {lastRating}
            </p>
          )}

          <Button onClick={handleRestart}>
            Start Again
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8">
        <header className="text-center">
          <p className="text-sm font-medium text-muted-foreground">
            English → Arabic
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            Kalima
          </h1>

          <p className="mt-2 text-muted-foreground">
            Learn Arabic vocabulary one word at a time.
          </p>
        </header>

        <div className="w-full max-w-xl space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Progress
            </span>

            <span className="font-medium">
              {completedWords} / {vocabulary.length}
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <VocabularyCard
          word={currentWord}
          showAnswer={showAnswer}
          onReveal={handleReveal}
        >
          <ReviewButtons onRate={handleRate} />
        </VocabularyCard>

        <VocabularyLibrary />

        {lastRating && (
          <p className="text-sm text-muted-foreground">
            Previous answer: {lastRating}
          </p>
        )}
      </div>
    </main>
  );
}

export default App;