import { useState } from "react";

// useQuery is the main TanStack Query hook.
// You give it:
//   - queryKey: a unique identifier for this query (used for caching)
//   - queryFn: an async function that fetches the data
// It returns: { data, isLoading, isError, error, ... }
import { useQuery } from "@tanstack/react-query";

// Import our typed API function
import { fetchVocabulary } from "@/lib/api";

import { CategoryFilter } from "./CategoryFilter";
import { VocabularyList } from "./VocabularyList";
import { VocabularySearch } from "./VocabularySearch";

export function VocabularyLibrary() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  // ─────────────────────────────────────────────────────────────────
  // useQuery — This replaces the old hardcoded `vocabulary` import.
  //
  // queryKey: ["vocabulary", search, category]
  //   This is like a cache key. Whenever search or category changes,
  //   TanStack Query sees a NEW key and fetches fresh data.
  //   This means filtering now happens on the SERVER (more efficient).
  //
  // queryFn: () => fetchVocabulary({ search, category })
  //   The function that actually makes the HTTP request.
  //   TanStack Query calls this automatically and tracks the result.
  // ─────────────────────────────────────────────────────────────────
  const { data: words, isLoading, isError } = useQuery({
    queryKey: ["vocabulary", search, category],
    queryFn: () => fetchVocabulary({ search, category }),
  });

  // Extract unique categories from the fetched words for the filter dropdown.
  // (words ?? []) = if words is undefined (still loading), use an empty array
  const categories = Array.from(
    new Set((words ?? []).map((word) => word.category))
  );

  return (
    <section className="w-full max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          Vocabulary Library
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Browse and search your Arabic vocabulary.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <VocabularySearch
          value={search}
          onChange={setSearch}
        />

        <CategoryFilter
          categories={categories}
          value={category}
          onChange={setCategory}
        />
      </div>

      {/* Show word count only when data is loaded */}
      {!isLoading && !isError && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {words?.length ?? 0} words found
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading words...</p>
      )}

      {/* Error state */}
      {isError && (
        <p className="text-sm text-destructive">
          Failed to load vocabulary. Is the server running?
        </p>
      )}

      {/* Word list — only render when we have data */}
      {words && <VocabularyList words={words} />}
    </section>
  );
}