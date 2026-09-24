import { useState } from "react";

import { vocabulary } from "../data/vocabulary";

import { CategoryFilter } from "./CategoryFilter";
import { VocabularyList } from "./VocabularyList";
import { VocabularySearch } from "./VocabularySearch";

export function VocabularyLibrary() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const categories = Array.from(
    new Set(vocabulary.map((word) => word.category))
  );

  const filteredWords = vocabulary.filter((word) => {
    const searchTerm = search.toLowerCase().trim();

    const matchesSearch =
      word.english.toLowerCase().includes(searchTerm) ||
      word.arabic.includes(searchTerm);

    const matchesCategory =
      category === "all" ||
      word.category === category;

    return matchesSearch && matchesCategory;
  });

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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredWords.length} words found
        </p>
      </div>

      <VocabularyList words={filteredWords} />
    </section>
  );
}