import type { VocabularyWord } from "../data/vocabulary";
import { VocabularyListItem } from "./VocabularyListItem";

interface VocabularyListProps {
  words: VocabularyWord[];
}

export function VocabularyList({
  words,
}: VocabularyListProps) {
  if (words.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="font-medium">
          No vocabulary found.
        </p>

        <p className="mt-1 text-sm text-muted-foreground">
          Try a different search or category.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {words.map((word) => (
        <VocabularyListItem
          key={word.id}
          word={word}
        />
      ))}
    </div>
  );
}