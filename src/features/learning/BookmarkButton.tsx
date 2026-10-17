import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { useAuth } from "../auth/auth-context";
import { learningApi, type Bookmark, type Coordinate } from "./learning-api";

export function BookmarkButton({ coordinate }: { coordinate: Coordinate }) {
  const { session, loading } = useAuth();
  const user = session?.user.id;
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["learning", user, "bookmarks"], queryFn: () => learningApi<{ items: Bookmark[]; nextCursor: string | null }>("/bookmarks"), enabled: Boolean(user), retry: false });
  const saved = query.data?.items.find((item) => item.surah === coordinate.surah && item.ayah === coordinate.ayah && item.word === coordinate.word);
  const mutation = useMutation({
    mutationFn: () => saved ? learningApi(`/bookmarks/${saved.vocabularyId}`, "DELETE") : learningApi("/bookmarks", "POST", { surah: coordinate.surah, ayah: coordinate.ayah, word: coordinate.word }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["learning", user] }),
  });
  if (loading) return <p role="status">Checking sign-in…</p>;
  if (!user) return <Link className="bookmark-action" to="/account">Sign in to bookmark this word</Link>;
  return <div className="bookmark-action">
    <button className="reveal-button" aria-pressed={Boolean(saved)} disabled={query.isPending || query.isError || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Saving…" : saved ? "Remove bookmark" : "Bookmark word"}</button>
    {query.isError && <p role="alert">{query.error.message} <button onClick={() => void query.refetch()}>Retry bookmarks</button></p>}
    {mutation.isError && <p role="alert">{mutation.error.message}</p>}
  </div>;
}
