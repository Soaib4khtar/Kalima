import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import type { VocabularyWord } from "../data/vocabulary";

interface VocabularyListItemProps {
  word: VocabularyWord;
}

function getStatusLabel(status: VocabularyWord["status"]) {
  switch (status) {
    case "new":
      return "New";

    case "learning":
      return "Learning";

    case "mastered":
      return "Mastered";
  }
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

            <Badge variant="outline">
              {word.level}
            </Badge>

            <Badge variant="secondary">
              {getStatusLabel(word.status)}
            </Badge>
          </div>

          <div className="mt-2">
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