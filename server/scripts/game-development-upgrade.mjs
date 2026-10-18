// Development-only additive upgrade. Never opens the original application's pool.
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { checkedLearningUrl, migrateLearning } from './learning-migrate.mjs';

const tables = ['profiles','word_occurrences','occurrence_sources','vocabulary_items','bookmarks',
  'vocabulary_progress','review_attempts','review_sessions','session_items'];
async function snapshot(pool) {
  const hash = createHash('sha256'), counts = {};
  for (const name of tables) {
    // Names are a static allowlist. No data, identities or digests are printed.
    const { rows } = await pool.query(`SELECT to_jsonb(t) AS row FROM learning.${name} t ORDER BY to_jsonb(t)::text`);
    counts[name] = rows.length; hash.update(name); hash.update(JSON.stringify(rows));
  }
  return { hash: hash.digest('hex'), counts };
}
let pool;
try {
  const connection = checkedLearningUrl(process.env.LEARNING_DATABASE_URL);
  const url = new URL(connection);
  if (decodeURIComponent(url.pathname.slice(1)) !== 'kalima_learning_dev' || url.port !== '55439') throw new Error('Not the approved isolated development store');
  pool = new Pool({ connectionString: connection, max: 1, connectionTimeoutMillis: 3000 });
  const actual = (await pool.query('SELECT current_database() AS name')).rows[0].name;
  if (actual !== 'kalima_learning_dev') throw new Error('Database identity mismatch');
  const before = await snapshot(pool);
  const result = process.argv.includes('--apply') ? await migrateLearning(connection) : { status: 'read-only-preflight' };
  const after = await snapshot(pool);
  if (before.hash !== after.hash) throw new Error('Existing activity changed during upgrade verification; inspect concurrent activity before continuing');
  console.log(JSON.stringify({ ...result, existingActivityUnchanged: true, counts: after.counts, originalDatabaseAccessed: false, secretsPrinted: false }));
} catch {
  console.error('Development upgrade refused or verification failed. Private database details are suppressed.'); process.exitCode = 1;
} finally { await pool?.end(); }
