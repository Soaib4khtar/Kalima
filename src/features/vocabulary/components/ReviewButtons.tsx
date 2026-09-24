import { Button } from "@/components/ui/button";

export type ReviewRating = "again" | "difficult" | "know";

interface ReviewButtonsProps {
  onRate: (rating: ReviewRating) => void;
}

export function ReviewButtons({ onRate }: ReviewButtonsProps) {
  return (
    <div className="grid w-full grid-cols-3 gap-2">
      <Button
        variant="outline"
        onClick={() => onRate("again")}
      >
        Again
      </Button>

      <Button
        variant={"secondary"}
        onClick={() => onRate("difficult")}
      >
        Difficult
      </Button>

      <Button
        onClick={() => onRate("know")}
      >
        Know
      </Button>
    </div>
  );
}