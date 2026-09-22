import { useState } from 'react'

import { VocabularyCard } from "./features/vocabulary/components/VocabularyCard";
import { vocabulary } from "./features/vocabulary/data/vocabulary";

function App () {
  const [showAnswer, setShowAnswer] = useState(false);

  const currentWord = vocabulary[0];

  function handleRevel () {
    setShowAnswer(true);
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

        <VocabularyCard 
          word={currentWord}
          showAnswer={showAnswer}
          onRevel={handleRevel}
        />
      </div>
    </main>
  );
}

export default App;