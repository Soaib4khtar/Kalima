import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Plus, Sprout } from "lucide-react";
import { Link } from "react-router";
import { createVocabularyWord, fetchVocabulary } from "@/lib/api";

type WordInput = Parameters<typeof createVocabularyWord>[0];
const initialForm: WordInput = { english: "", arabic: "", transliteration: "", category: "", level: "A1" };
export function AddVocabularyPage() {
  const [form, setForm] = useState<WordInput>(initialForm);
  const [validationError, setValidationError] = useState("");
  const queryClient = useQueryClient();
  const { data: words } = useQuery({ queryKey: ["vocabulary"], queryFn: () => fetchVocabulary() });
  const categories = [...new Set((words ?? []).map(word => word.category))].sort();
  const mutation = useMutation({
    mutationFn: createVocabularyWord,
    onSuccess: () => {
      setForm(initialForm);
      // Invalidating the shared prefix refreshes both practice and filtered libraries.
      void queryClient.invalidateQueries({ queryKey: ["vocabulary"] });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const input = { ...form, english: form.english.trim(), arabic: form.arabic.trim(), transliteration: form.transliteration.trim(), category: form.category.trim() };
    if (!input.english || !input.arabic || !input.transliteration || !input.category) { setValidationError("Please fill in every field. Spaces alone don’t count as a word."); return; }
    setValidationError("");
    mutation.mutate(input);
  }
  function update(field: keyof WordInput, value: string) {
    setForm(previous => ({ ...previous, [field]: value }));
    setValidationError("");
    if (mutation.isError || mutation.isSuccess) mutation.reset();
  }
  return <div className="add-page">
    <Link className="text-link back-link" to="/vocabulary"><ArrowLeft size={15} />Back to word library</Link>
    <div className="page-heading"><div><p className="eyebrow"><Plus size={14} /> GROW YOUR VOCABULARY</p><h1>Make room for<br />a <em>new word.</em></h1><p className="heading-description">A word today. A new connection tomorrow.</p></div></div>
    <div className="add-layout">
      <form className="surface-panel word-form" onSubmit={submit}>
        <h2>The little details</h2><p className="muted-copy">Add the word and its Arabic translation. All fields are required.</p>
        {mutation.isSuccess && <div className="success-message" role="status"><CheckCircle2 size={20} /><div><strong>“{mutation.data.english}” is in your library.</strong><p>Add another word below, or <Link to="/vocabulary">view your collection</Link>. New words join your next practice session.</p></div></div>}
        {(validationError || mutation.isError) && <div className="error-message" role="alert">{validationError || mutation.error?.message || "Your word couldn’t be saved. Please try again."}</div>}
        <fieldset disabled={mutation.isPending}>
          <div className="form-grid">
            <div className="field"><label htmlFor="english">English word</label><input autoFocus id="english" name="english" required maxLength={100} value={form.english} onChange={event => update("english", event.target.value)} placeholder="e.g. Book" autoComplete="off" /></div>
            <div className="field"><label htmlFor="arabic">Arabic translation</label><input id="arabic" name="arabic" required maxLength={100} dir="rtl" lang="ar" value={form.arabic} onChange={event => update("arabic", event.target.value)} placeholder="كتاب" autoComplete="off" /></div>
            <div className="field full-width"><label htmlFor="transliteration">Transliteration</label><input id="transliteration" name="transliteration" required maxLength={100} value={form.transliteration} onChange={event => update("transliteration", event.target.value)} placeholder="e.g. kitāb" autoComplete="off" /><small>How the Arabic word sounds, written in Latin letters.</small></div>
            <div className="field"><label htmlFor="category">Category</label><input id="category" name="category" required maxLength={50} list="word-categories" value={form.category} onChange={event => update("category", event.target.value)} placeholder="e.g. Everyday" /><datalist id="word-categories">{categories.map(category => <option key={category} value={category} />)}</datalist><small>Choose an existing category or create one.</small></div>
            <div className="field"><label htmlFor="level">Learning level</label><select id="level" name="level" value={form.level} onChange={event => update("level", event.target.value)}><option value="A1">A1 · Beginner</option><option value="A2">A2 · Elementary</option><option value="B1">B1 · Intermediate</option></select></div>
          </div>
          <div className="form-footer"><Link className="text-link" to="/vocabulary">Cancel</Link><button className="primary-button" type="submit">{mutation.isPending ? <><LoaderCircle className="spin" size={17} />Saving word…</> : <><Plus size={17} />Add to library</>}</button></div>
        </fieldset>
      </form>
      <aside className="tip-panel form-tip"><span className="tip-icon"><Sprout size={25} /></span><p className="panel-kicker">MAKE IT MEANINGFUL</p><h3>Learn the words<br />you want to use.</h3><p>Start with the things around you. Your morning coffee. A favorite book. The people you love.</p><p>Words with a little personal meaning are easier to remember.</p><Link className="text-link" to="/">Back to practice <ArrowRight size={15} /></Link></aside>
    </div>
  </div>;
}
