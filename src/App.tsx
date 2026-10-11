// React Router v7 — the modern way to do client-side routing
// "Route" defines a single URL pattern → component mapping
// "Routes" is a container that looks at the current URL and renders
//          the first <Route> that matches it
import { Route, Routes } from "react-router";

// We import our page components. Notice the path — pages live inside
// their "feature" folder. This is called "feature-based folder structure":
// instead of /pages/LearningPage.tsx (grouped by type),
// we use /features/learning/pages/LearningPage.tsx (grouped by feature).
// This scales much better as the app grows.
import { LearningPage } from "./features/learning/pages/LearningPage";
import { VocabularyPage } from "./features/vocabulary/pages/VocabularyPage";

// App is the root component — it defines the routing structure of the app.
// Every URL the user can visit is declared here.
export default function App() {
  return (
    // <Routes> looks at window.location.pathname and finds the matching <Route>
    <Routes>
      {/* "/" = the home/root URL (e.g. http://localhost:5173/)
          This is the main learning/flashcard experience */}
      <Route path="/" element={<LearningPage />} />

      {/* "/vocabulary" = the word library page (e.g. http://localhost:5173/vocabulary)
          This shows the full searchable list of words */}
      <Route path="/vocabulary" element={<VocabularyPage />} />
    </Routes>
  );
}
