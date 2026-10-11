import { useState } from 'react'

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

import { ReviewButtons } from "@/features/vocabulary/components/ReviewButtons";
import type { ReviewRating } from "@/features/vocabulary/components/ReviewButtons";
import { VocabularyCard } from "@/features/vocabulary/components/VocabularyCard";

// Import our API function — no more static data!
import { fetchVocabulary } from "@/lib/api";
import type { ApiVocabularyWord } from "@/lib/api";

export function LearningPage() {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [completedWords, setCompletedWords] = useState(0);
  const [lastRating, setLastRating] = useState<ReviewRating | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);

  // ─────────────────────────────────────────────────────────────────
  // Fetch vocabulary from the backend.
  // queryKey: ["vocabulary"] — no filters, we want ALL words for a session.
  // The data will be undefined while loading, then ApiVocabularyWord[] once ready.
  // ─────────────────────────────────────────────────────────────────
  const { data: words, isLoading, isError } = useQuery({
    queryKey: ["vocabulary"],
    queryFn: () => fetchVocabulary(),
  });

  // ─────────────────────────────────────────────────────────────────
  // Handle the loading state — show a placeholder while waiting for data
  // ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto flex min-h-[80vh] max-w-3xl flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Loading vocabulary...</p>
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Handle the error state — server may be down or DB may be empty
  // ─────────────────────────────────────────────────────────────────
  if (isError || !words) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto flex min-h-[80vh] max-w-3xl flex-col items-center justify-center gap-4 text-center">
          <p className="text-destructive font-medium">
            Could not load vocabulary.
          </p>
          <p className="text-sm text-muted-foreground">
            Make sure the server is running on port 5000.
          </p>
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Handle the empty state — DB exists but no words added yet
  // ─────────────────────────────────────────────────────────────────
  if (words.length === 0) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto flex min-h-[80vh] max-w-3xl flex-col items-center justify-center gap-6 text-center">
          <h1 className="text-4xl font-bold">Kalima</h1>
          <p className="text-muted-foreground">
            No vocabulary words yet. Add some words to get started!
          </p>
          {/* Link from react-router — navigates WITHOUT a full page reload.
              This is a key benefit of client-side routing. */}
          <Link to="/vocabulary">
            <Button>Go to Vocabulary Library</Button>
          </Link>
        </div>
      </main>
    );
  }

  // At this point, `words` is ApiVocabularyWord[] with at least one item
  const currentWord: ApiVocabularyWord = words[currentWordIndex];
  const progress = (completedWords / words.length) * 100;

  function handleReveal() {
    setShowAnswer(true);
  }

  function handleRate(rating: ReviewRating) {
    setLastRating(rating);
    setCompletedWords((count) => count + 1);

    const isLastWord = currentWordIndex === words!.length - 1;

    if (isLastWord) {
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

  // ─────────────────────────────────────────────────────────────────
  // Session Complete screen
  // ─────────────────────────────────────────────────────────────────
  if (sessionComplete) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto flex min-h-[80vh] max-w-3xl flex-col items-center justify-center gap-6 text-center">
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

          <div className="flex gap-3">
            <Button onClick={handleRestart}>
              Start Again
            </Button>

            {/* Link component from react-router renders an <a> tag
                but intercepts the click and updates the URL without
                reloading the page */}
            <Link to="/vocabulary">
              <Button variant="outline">View Library</Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Main learning session UI
  // ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8">

        {/* Header with navigation */}
        <header className="w-full flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-sm font-medium text-muted-foreground">
              English → Arabic
            </p>

            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              Kalima
            </h1>

            <p className="mt-2 text-muted-foreground">
              Learn Arabic vocabulary one word at a time.
            </p>
          </div>

          {/* Navigation link to the library page */}
          <Link to="/vocabulary" className="shrink-0">
            <Button variant="ghost" size="sm">Library</Button>
          </Link>
        </header>

        {/* Progress bar */}
        <div className="w-full max-w-xl space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>

            <span className="font-medium">
              {completedWords} / {words.length}
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* The flashcard */}
        <VocabularyCard
          word={currentWord}
          showAnswer={showAnswer}
          onReveal={handleReveal}
        >
          <ReviewButtons onRate={handleRate} />
        </VocabularyCard>

        {/* Show last rating as feedback */}
        {lastRating && (
          <p className="text-sm text-muted-foreground">
            Previous rating: <span className="font-medium">{lastRating}</span>
          </p>
        )}
      </div>
    </main>
  );
}
