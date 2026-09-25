import { VocabularyLibrary } from "../components/VocabularyLibrary";

export function VocabularyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex max-w-5xl justify-center">
        <VocabularyLibrary />
      </div>
    </main>
  )
}