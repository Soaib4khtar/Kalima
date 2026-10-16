export function CategoryFilter({ categories, value, onChange }: { categories: string[]; value: string; onChange: (value: string) => void }) {
  return <div className="field"><label htmlFor="category-filter">Category</label><select id="category-filter" value={value} onChange={event => onChange(event.target.value)}><option value="all">All categories</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></div>;
}
