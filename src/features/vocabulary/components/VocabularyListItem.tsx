import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// ApiVocabularyWord is what the backend actually returns.
// The old VocabularyWord had extra fields (status, partOfSpeech, example)
// that were only in the static data — the real DB doesn't have them yet.
import type { ApiVocabularyWord } from "@/lib/api";

interface VocabularyListItemProps {
  word: ApiVocabularyWord;
}

export function VocabularyListItem({
  word,
}: VocabularyListItemProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">
              {word.english}
            </h3>

            {/* Badge showing the CEFR level (A1, A2, B1) */}
            <Badge variant="outline">
              {word.level}
            </Badge>
          </div>

          <div className="mt-2">
            {/* dir="rtl" is critical for Arabic — without it, text
                alignment and cursor behavior would be wrong */}
            <p
              dir="rtl"
              lang="ar"
              className="text-2xl font-semibold"
            >
              {word.arabic}
            </p>

            <p className="text-sm text-muted-foreground">
              {word.transliteration}
            </p>
          </div>
        </div>

        <Badge variant="outline">
          {word.category}
        </Badge>
      </CardContent>
    </Card>
  );
}