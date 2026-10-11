import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";


// We now use the API type — this matches what comes from the backend
import type { ApiVocabularyWord } from "@/lib/api";

interface VocabularyCardProps {
  word: ApiVocabularyWord;
  showAnswer: boolean;
  onReveal: () => void;
  children?: ReactNode;
}

export function VocabularyCard ({
  word,
  showAnswer,
  onReveal,
  children,
}: VocabularyCardProps) {
  return (
    <Card className= "w-full max-w-xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <Badge>{word.level}</Badge>

        <span className="text-sm text-muted-foreground">
          {word.category}
        </span>
      </CardHeader>

      <CardContent className="space-y-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground">
            English
          </p>

          {/* text-4xl = large font size. font-bold = bold weight
               Note: Tailwind classes use 'xl' not 'x1' (letter L not number 1) */}
          <h2 className="mt-2 text-4xl font-bold">
            {word.english}
          </h2>
        </div>

        {showAnswer && (
          <div>
            <p className="text-sm text-muted-foreground">
              Arabic
            </p>

            {/* dir="rtl" = right-to-left text direction, required for Arabic
                 lang="ar" = tells the browser this is Arabic text (helps with
                 font selection and accessibility tools) */}
            <p
              dir="rtl"
              lang="ar"
              className="mt-2 text-5xl font-bold"
            >
              {word.arabic}
            </p>

            {/* text-muted-foreground = the grey/subdued text color from our design system */}
            <p className="mt-2 text-muted-foreground">
              {word.transliteration}
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter>
        {!showAnswer ? (
          <Button 
            className="w-full"
            onClick={onReveal}
          >
            Show Arabic
          </Button>  
        ) : (
          children
        )}
      </CardFooter>
    </Card>
  );  
}