interface VocabularySearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function VocabularySearch ({
  value,
  onChange,
}: VocabularySearchProps) {
  return (
    <div className="space-y-2">
      <label
        htmlFor="vocabulary-search"
        className="text-sm font-medium"
      >
        Search vocabulary
      </label>

      <input 
        id="vocabulary-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search English or Arabic..."
        className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}