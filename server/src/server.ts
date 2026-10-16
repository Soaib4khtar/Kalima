import app from "./app.js";

const PORT = Number(process.env.PORT ?? 5000);

// Quran Foundation reads do not depend on PostgreSQL. Legacy vocabulary routes
// acquire a database connection when queried and use the normal error handler.
app.listen(PORT, () => {
  console.log(`Kalima API running on port ${PORT}`);
});
