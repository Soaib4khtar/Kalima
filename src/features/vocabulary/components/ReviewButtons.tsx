import { Check, RotateCcw, Timer } from "lucide-react";
import type { ReviewRating } from "@/features/learning/review-session";
export type { ReviewRating } from "@/features/learning/review-session";
export function ReviewButtons({ onRate }: { onRate: (rating: ReviewRating) => void }) {
  return <div className="review-buttons">
    <button className="review-button again" onClick={() => onRate("again")}><span><RotateCcw size={17} />Again <kbd>1</kbd></span><small>Repeat soon</small></button>
    <button className="review-button difficult" onClick={() => onRate("difficult")}><span><Timer size={17} />Difficult <kbd>2</kbd></span><small>Repeat later</small></button>
    <button className="review-button know" onClick={() => onRate("know")}><span><Check size={18} />Know <kbd>3</kbd></span><small>Done this session</small></button>
  </div>;
}
