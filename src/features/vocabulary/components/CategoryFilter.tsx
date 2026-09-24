interface CategoryFilterProps {
  categories: string[];
  value:string;
  onChange: (value: string) => void;
}

export function CategoryFilter({
  categories,
  value,
  onChange,
}: CategoryFilterProps) {
  return (
    <div className="space-y-2">
      <label
        htmlFor="category-filter"
        className="text-sm font-medium"
      >
        Category
      </label>

      <select
        id="category-filter"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="all">All categories</option>

        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select> 
    </div>
  )
}