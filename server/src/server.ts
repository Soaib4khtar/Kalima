import app from "./app.js";
import { pool } from "./db.js";

const PORT = Number(process.env.PORT ?? 5000);

async function startServer() {
  try {
    await pool.query("SELECT 1");

    console.log("Database connected successfully");

    app.listen(PORT, () => {
      console.log(`Kalima API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
}

startServer();