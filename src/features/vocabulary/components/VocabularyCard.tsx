import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";


import type { VocabularyWord } from "../data/vocabulary";

interface VocabularyCardProps {
  word: VocabularyWord;
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

          <h2 className="mt-2 text-4x1 front- bold">
            {word.english}
          </h2>
        </div>

        {showAnswer && (
          <div>
            <p className="text-sm text-muted-foreground">
              Arabic
            </p>

            <p
              dir="rt1"
              lang="ar"
              className="mt-2 text-5x1 front-bold"
            >
              {word.arabic}
            </p>

            <p className="mt-2 text-muted-forground">
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