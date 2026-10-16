/**
 * Explicit, first-time adoption of the frozen Drizzle v2 baseline only.
 * No dotenv, application database imports, implicit target, or import-time run.
 * Read ../drizzle-v2/README.md before any independently approved execution.
 */
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Client, QueryResultRow } from "pg";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface Target {
  host: "127.0.0.1" | "::1";
  port: 5432;
  user: string;
  database: string;
  original: boolean;
}

interface SecretInput {
  password: string;
  confirmation: string;
}

interface VocabularyState {
  count: number;
  distinctIds: number;
  words: Array<[string, string]>;
  uuidFingerprint: string;
  contentFingerprint: string;
}

interface ObjectIds extends QueryResultRow {
  vocabulary: string | null;
  legacy: string | null;
  legacySequence: string | null;
  v2: string | null;
  v2Sequence: string | null;
  v2PrimaryIndex: string | null;
}

interface TableIdentity extends QueryResultRow {
  tableOid: string;
  rowTypeOid: string;
  primaryIndexOid: string;
  primaryDefinition: string;
  valid: boolean;
  ready: boolean;
  live: boolean;
  unique: boolean;
}

interface LedgerRow extends QueryResultRow {
  id: number;
  hash: string;
  created_at: string;
}

interface Snapshot extends VocabularyState {
  fullRowFingerprint: string;
  columns: Json[];
  history: JsonObject[];
  legacySequence: { last_value: string; is_called: boolean };
  identity: TableIdentity;
  metadata: Record<string, Json>;
  v2Exists: boolean;
  v2Metadata: { table: string | null; sequence: string | null; primaryIndex: string | null };
  v2Rows: LedgerRow[];
}

interface PreparedBaseline {
  folder: string;
  hash: string;
  when: number;
  approvedHistory: Json;
}

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SERVER_DIRECTORY = path.resolve(path.dirname(SCRIPT_FILE), "..");
const MIGRATIONS_DIRECTORY = path.join(SERVER_DIRECTORY, "drizzle-v2");
const CONFIG_FILE = path.join(SERVER_DIRECTORY, "drizzle-v2.config.ts");
const BASELINE_TAG = "0000_vocabulary_baseline";
const BASELINE_WHEN = 1792050962769;
const LEDGER_SCHEMA = "drizzle";
const LEDGER_TABLE = "__drizzle_migrations_v2";
const ORIGINAL_CONFIRMATION = "ADOPT kalima WITH DRIZZLE V2";
const TEST_DATABASE = /^kalima_v2_(?:adoption_test|runner_test)_\d{8}_\d{6}_[0-9a-f]{8}$/;
const ADVISORY_LOCK = [1262570569, 2] as const;

// Byte-level pins from the successful offline verification. Do not regenerate
// these values to bypass a refusal. Even SQL comment/line-ending edits matter.
const FILE_HASHES: Readonly<Record<string, string>> = {
  "drizzle-v2.config.ts": "23c008ffef8040799f48559d89ede74e74223cf5fed4bb37d9c53d5fa1c5fc0f",
  "src/db/schema.ts": "1d7277022489153ef065acedf17bfe9e4ccde31d92293a6ada41273f50530056",
  "drizzle-v2/0000_vocabulary_baseline.sql": "2c62fcff59ae679fe38c318c9294917bdbee578c386faa3fea2f024db31dcf80",
  "drizzle-v2/meta/0000_snapshot.json": "a16c330aec10c803a69271274d485208c67cc34f781addf142d92cb798ca3ccb",
  "drizzle-v2/meta/_journal.json": "21dd705616046737d5c5b1bbc59e90497c6fa6836ece9cb97337aa03b6543307",
};

const EXPECTED_COLUMNS: Json[] = [
  ["id", "uuid", true, null, "", ""],
  ["english", "text", true, null, "", ""],
  ["arabic", "text", true, null, "", ""],
  ["transliteration", "text", true, null, "", ""],
  ["category", "text", true, null, "", ""],
  ["level", "text", true, null, "", ""],
  ["created_at", "timestamp with time zone", true, "now()", "", ""],
  ["updated_at", "timestamp with time zone", true, "now()", "", ""],
];

class RunnerStop extends Error {}
let stage = "startup";

function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RunnerStop(message);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fingerprint(value: unknown): string {
  const serialized = JSON.stringify(value);
  must(typeof serialized === "string", "Unsupported verification value.");
  return createHash("sha256").update(serialized).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTarget(args: string[]): Target {
  const values = new Map<string, string>();
  const switches = new Set<string>();
  const valueOptions = new Set(["--host", "--port", "--user", "--database"]);
  const switchOptions = new Set(["--adopt-existing", "--allow-original-kalima"]);
  for (let index = 0; index < args.length; index++) {
    const option = args[index]!;
    must(!values.has(option) && !switches.has(option), "Duplicated command-line option.");
    if (switchOptions.has(option)) {
      switches.add(option);
    } else {
      must(valueOptions.has(option), "Unsupported command-line option.");
      const value = args[++index];
      must(value !== undefined && value.length > 0 && !value.startsWith("--"), "Missing command-line value.");
      values.set(option, value);
    }
  }
  must(switches.has("--adopt-existing"), "Explicit --adopt-existing mode is required.");
  must(values.size === 4, "Explicit host, port, user and database are required.");
  const host = values.get("--host")!;
  const port = values.get("--port")!;
  const user = values.get("--user")!;
  const database = values.get("--database")!;
  must(["localhost", "127.0.0.1", "::1"].includes(host), "Only approved loopback hosts are allowed.");
  must(port === "5432", "Only local PostgreSQL port 5432 is allowed.");
  must(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(user), "An explicit, simple PostgreSQL role name is required.");
  const original = database === "kalima";
  must(original || TEST_DATABASE.test(database), "Database name is not on the adoption allowlist.");
  must(original === switches.has("--allow-original-kalima"), "The original-database switch must match the target.");
  // Avoid hostname resolution, connection URLs, Unix sockets and service files.
  return { host: host === "::1" ? "::1" : "127.0.0.1", port: 5432, user, database, original };
}

function assertCleanEnvironment(): void {
  const forbidden = Object.keys(process.env).some((name) => {
    const upper = name.toUpperCase();
    return upper.startsWith("PG") || [
      "DATABASE_URL", "NODE_OPTIONS", "NODE_PATH", "NODE_PG_FORCE_NATIVE",
    ].includes(upper);
  });
  must(!forbidden, "Inherited PostgreSQL/runtime overrides are refused; use the documented clean launcher.");
}

async function assertLocalFile(relative: string): Promise<string> {
  const filename = path.join(SERVER_DIRECTORY, relative);
  const parts = relative.split(/[\\/]/);
  let current = SERVER_DIRECTORY;
  must(path.relative(SERVER_DIRECTORY, await realpath(SERVER_DIRECTORY)) === "", "Server directory is redirected.");
  for (const part of parts) {
    must(part !== ".." && part !== "", "Unexpected prepared-file path.");
    current = path.join(current, part);
    must(!(await lstat(current)).isSymbolicLink(), "Prepared files must not use redirected paths.");
  }
  must((await lstat(filename)).isFile(), "A required prepared file is not a regular file.");
  must(path.relative(filename, await realpath(filename)) === "", "Prepared file is redirected.");
  return filename;
}

async function preparedBaseline(): Promise<PreparedBaseline> {
  const contents = new Map<string, string>();
  for (const [relative, expected] of Object.entries(FILE_HASHES)) {
    const bytes = await readFile(await assertLocalFile(relative));
    must(createHash("sha256").update(bytes).digest("hex") === expected, "A frozen configuration, schema or baseline file changed.");
    contents.set(relative, bytes.toString("utf8"));
  }
  const rootEntries = await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true });
  must(rootEntries.every((entry) => !entry.isSymbolicLink() &&
    (entry.name === "meta" ? entry.isDirectory() : entry.isFile())),
  "Migration directory contains an unexpected entry type.");
  must(same(rootEntries.map((entry) => entry.name).sort(), [
    `${BASELINE_TAG}.sql`, "README.md", "meta",
  ].sort()), "Unexpected migration-directory contents.");
  const meta = await readdir(path.join(MIGRATIONS_DIRECTORY, "meta"), { withFileTypes: true });
  must(meta.every((entry) => entry.isFile() && !entry.isSymbolicLink()), "Unexpected metadata file type.");
  must(same(meta.map((entry) => entry.name).sort(), ["0000_snapshot.json", "_journal.json"]), "Expected exactly one baseline snapshot and journal.");
  const journal: unknown = JSON.parse(contents.get("drizzle-v2/meta/_journal.json")!);
  must(isRecord(journal) && journal.version === "7" && journal.dialect === "postgresql", "Unexpected journal format.");
  must(Array.isArray(journal.entries) && journal.entries.length === 1, "Initial adoption requires one baseline entry.");
  const entry: unknown = journal.entries[0];
  must(isRecord(entry) && entry.idx === 0 && entry.version === "7" && entry.tag === BASELINE_TAG &&
    entry.when === BASELINE_WHEN && entry.breakpoints === true, "Unexpected baseline journal entry.");
  const sql = contents.get(`drizzle-v2/${BASELINE_TAG}.sql`)!;
  const history = sql.match(/legacy_history IS DISTINCT FROM \$history\$([\s\S]*?)\$history\$::jsonb/);
  must(history !== null, "The approved historical-history guard is missing.");
  const approvedHistory: unknown = JSON.parse(history[1]!);
  must(Array.isArray(approvedHistory) && approvedHistory.length === 3, "Unexpected approved historical history.");
  return {
    folder: MIGRATIONS_DIRECTORY,
    hash: FILE_HASHES[`drizzle-v2/${BASELINE_TAG}.sql`]!,
    when: BASELINE_WHEN,
    approvedHistory: approvedHistory as Json,
  };
}

async function readSecretInput(original: boolean): Promise<SecretInput> {
  must(!process.stdin.isTTY, "Password input must come from the secure PowerShell launcher.");
  const buffers: Buffer[] = [];
  let combined: Buffer | undefined;
  let decoded: Buffer | undefined;
  let size = 0;
  const timer = setTimeout(() => {
    process.stdin.destroy(new RunnerStop("Timed out waiting for secure stdin input."));
  }, 30000);
  timer.unref();
  try {
    for await (const chunk of process.stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      must(size <= 16384, "Secure stdin input exceeded its size limit.");
      buffers.push(bytes);
    }
    combined = Buffer.concat(buffers);
    const line = combined.toString("utf8").trim();
    must(line.length > 0 && !/[\r\n]/.test(line), "Expected one secure JSON input line.");
    const payload: unknown = JSON.parse(line);
    must(isRecord(payload) && same(Object.keys(payload).sort(), ["confirmation", "passwordBase64"]), "Unexpected secure input format.");
    must(typeof payload.passwordBase64 === "string" && typeof payload.confirmation === "string", "Unexpected secure input fields.");
    const encoded = payload.passwordBase64;
    must(encoded.length > 0 && encoded.length <= 5464 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded), "Invalid encoded password input.");
    decoded = Buffer.from(encoded, "base64");
    must(decoded.length > 0 && decoded.length <= 4096 && decoded.toString("base64") === encoded && !decoded.includes(0), "Invalid password input.");
    const password = decoded.toString("utf8");
    must(Buffer.from(password, "utf8").equals(decoded), "Password input is not valid UTF-8.");
    must(payload.confirmation === (original ? ORIGINAL_CONFIRMATION : ""), "Original-database confirmation did not match the target.");
    // Do not trim the decoded password: whitespace may be part of it.
    return { password, confirmation: payload.confirmation };
  } finally {
    clearTimeout(timer);
    buffers.forEach((buffer) => buffer.fill(0));
    combined?.fill(0);
    decoded?.fill(0);
  }
}

async function one<Row extends QueryResultRow>(client: Client, text: string, values: unknown[] = []): Promise<Row> {
  const result = await client.query<Row>(text, values);
  must(result.rows.length === 1, "Expected exactly one verification result.");
  return result.rows[0]!;
}

async function jsonRows(client: Client, text: string, values: unknown[] = []): Promise<Json[]> {
  return (await client.query<{ value: Json }>(text, values)).rows.map((row) => row.value);
}

async function verifyIdentity(client: Client, target: Target): Promise<void> {
  const identity = await one<{
    database: string; current_role: string; session_role: string;
    address: string | null; port: number | null; version: number;
  }>(client, `
    SELECT current_database() AS database, current_user AS current_role,
           session_user AS session_role, pg_catalog.host(pg_catalog.inet_server_addr()) AS address,
           inet_server_port() AS port,
           current_setting('server_version_num')::int AS version
  `);
  const addresses = target.host === "::1" ? ["::1"] : ["127.0.0.1", "::ffff:127.0.0.1"];
  must(identity.database === target.database && identity.current_role === target.user &&
    identity.session_role === target.user && identity.port === target.port &&
    identity.address !== null && addresses.includes(identity.address) &&
    identity.version >= 180000 && identity.version < 190000,
  "Connected database, role, address, port or PostgreSQL version is unexpected.");
}

async function schemaMetadata(client: Client, baseOids: string[]): Promise<Record<string, Json>> {
  const oids = (await client.query<{ oid: string }>(`
    SELECT c.oid::text AS oid FROM pg_class c
    WHERE c.oid = ANY($1::oid[]) OR c.oid IN (
      SELECT indexrelid FROM pg_index WHERE indrelid = ANY($1::oid[])
    ) ORDER BY c.oid
  `, [baseOids])).rows.map((row) => row.oid);
  const metadata: Record<string, Json> = {};
  metadata.namespaces = await jsonRows(client, `
    SELECT to_jsonb(n) AS value FROM pg_namespace n
    WHERE nspname IN ('public', 'drizzle') ORDER BY oid
  `);
  metadata.relations = await jsonRows(client, `
    SELECT to_jsonb(t) AS value FROM (
      SELECT c.oid::text, n.nspname, c.relname, c.reltype::text,
             c.reloftype, c.relowner, c.relam, c.reltablespace,
             c.relkind, c.relpersistence, c.relrowsecurity,
             c.relforcerowsecurity, c.relreplident, c.relispartition,
             c.reloptions, c.relacl, c.relpartbound::text
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid = ANY($1::oid[]) ORDER BY c.oid
    ) t
  `, [oids]);
  // Only the three expected new ledger relations are excluded. Other new
  // relations, altered original objects or changed ACLs still cause failure.
  metadata.inventory = await jsonRows(client, `
    SELECT to_jsonb(t) AS value FROM (
      SELECT c.oid::text, n.nspname, c.relname, c.relkind,
             c.relowner, c.relacl
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'drizzle') AND NOT (
        n.nspname = 'drizzle' AND c.relname IN (
          '__drizzle_migrations_v2', '__drizzle_migrations_v2_pkey',
          '__drizzle_migrations_v2_id_seq'
        )
      ) ORDER BY n.nspname, c.relname, c.oid
    ) t
  `);
  const catalogs = [
    ["columns", "pg_attribute", "attrelid", "attrelid, attnum"],
    ["defaults", "pg_attrdef", "adrelid", "oid"],
    ["constraints", "pg_constraint", "conrelid", "oid"],
    ["indexes", "pg_index", "indrelid", "indexrelid"],
    ["triggers", "pg_trigger", "tgrelid", "oid"],
    ["policies", "pg_policy", "polrelid", "oid"],
    ["rules", "pg_rewrite", "ev_class", "oid"],
    ["sequences", "pg_sequence", "seqrelid", "seqrelid"],
  ] as const;
  for (const [label, catalog, key, order] of catalogs) {
    const expression = label === "indexes" ? "to_jsonb(t) - 'indcheckxmin'" : "to_jsonb(t)";
    // Identifiers come only from the constant list above, never from CLI input.
    metadata[label] = await jsonRows(client, `
      SELECT ${expression} AS value FROM pg_catalog.${catalog} t
      WHERE ${key} = ANY($1::oid[]) ORDER BY ${order}
    `, [oids]);
  }
  metadata.types = await jsonRows(client, `
    SELECT to_jsonb(t) AS value FROM pg_type t WHERE
      t.oid IN (SELECT reltype FROM pg_class
                WHERE oid = ANY($1::oid[]) AND reltype <> 0)
      OR t.typelem IN (SELECT reltype FROM pg_class
                      WHERE oid = ANY($1::oid[]) AND reltype <> 0)
    ORDER BY t.oid
  `, [oids]);
  metadata.dependencies = await jsonRows(client, `
    SELECT to_jsonb(d) AS value FROM pg_depend d
    WHERE (classid = 'pg_class'::regclass AND objid = ANY($1::oid[]))
       OR (refclassid = 'pg_class'::regclass AND refobjid = ANY($1::oid[]))
    ORDER BY classid, objid, objsubid, refclassid, refobjid, refobjsubid, deptype
  `, [oids]);
  metadata.defaultPrivileges = await jsonRows(client, `
    SELECT to_jsonb(d) AS value FROM pg_default_acl d
    WHERE defaclnamespace IN (
      SELECT oid FROM pg_namespace WHERE nspname IN ('public', 'drizzle')
    ) ORDER BY oid
  `);
  return metadata;
}

async function snapshot(client: Client): Promise<Snapshot> {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL search_path = pg_catalog");
    const ids = await one<ObjectIds>(client, `
      SELECT to_regclass('public.vocabulary')::oid::text AS vocabulary,
        to_regclass('drizzle.__drizzle_migrations')::oid::text AS legacy,
        to_regclass('drizzle.__drizzle_migrations_id_seq')::oid::text AS "legacySequence",
        to_regclass('drizzle.__drizzle_migrations_v2')::oid::text AS v2,
        to_regclass('drizzle.__drizzle_migrations_v2_id_seq')::oid::text AS "v2Sequence",
        to_regclass('drizzle.__drizzle_migrations_v2_pkey')::oid::text AS "v2PrimaryIndex"
    `);
    must(ids.vocabulary && ids.legacy && ids.legacySequence,
      "Initial adoption requires existing vocabulary, historical ledger and sequence.");
    const vocabulary = await one<{ state: VocabularyState }>(client, `
      SELECT jsonb_build_object(
        'count', count(*), 'distinctIds', count(DISTINCT id),
        'words', coalesce(jsonb_agg(
          jsonb_build_array(id::text, md5(row_to_json(v)::text)) ORDER BY id
        ), '[]'::jsonb),
        'uuidFingerprint', md5(coalesce(string_agg(id::text, ',' ORDER BY id), '')),
        'contentFingerprint', md5(coalesce(string_agg(
          row_to_json(v)::text, chr(10) ORDER BY id
        ), ''))
      ) AS state FROM (
        SELECT id, english, arabic, transliteration,
               category, level, created_at, updated_at
        FROM public.vocabulary
      ) v
    `);
    const full = await one<{ value: string }>(client, `
      SELECT md5(coalesce(string_agg(
        row_to_json(v)::text, chr(10) ORDER BY id
      ), '')) AS value FROM public.vocabulary v
    `);
    const columns = await jsonRows(client, `
      SELECT jsonb_build_array(
        a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
        pg_get_expr(d.adbin, d.adrelid), a.attidentity, a.attgenerated
      ) AS value FROM pg_attribute a LEFT JOIN pg_attrdef d
        ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = $1::oid AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum
    `, [ids.vocabulary]);
    const history = await jsonRows(client, `
      SELECT to_jsonb(m) AS value FROM drizzle.__drizzle_migrations m
      ORDER BY created_at, id
    `);
    must(history.every((row) => isRecord(row)), "Unexpected historical record format.");
    const legacySequence = await one<{ last_value: string; is_called: boolean }>(client, `
      SELECT last_value::text AS last_value, is_called
      FROM drizzle.__drizzle_migrations_id_seq
    `);
    const identity = await one<TableIdentity>(client, `
      SELECT c.oid::text AS "tableOid", c.reltype::text AS "rowTypeOid",
        i.indexrelid::text AS "primaryIndexOid",
        pg_get_indexdef(i.indexrelid) AS "primaryDefinition",
        i.indisvalid AS valid, i.indisready AS ready,
        i.indislive AS live, i.indisunique AS unique
      FROM pg_class c JOIN pg_index i ON i.indrelid = c.oid
      WHERE c.oid = $1::oid AND i.indisprimary
    `, [ids.vocabulary]);
    const metadata = await schemaMetadata(client, [ids.vocabulary, ids.legacy, ids.legacySequence]);
    const v2Rows = ids.v2 === null ? [] : (await client.query<LedgerRow>(`
      SELECT id, hash, created_at FROM drizzle.__drizzle_migrations_v2 ORDER BY id
    `)).rows;
    return {
      ...vocabulary.state, fullRowFingerprint: full.value, columns,
      history: history as JsonObject[], legacySequence, identity, metadata,
      v2Exists: ids.v2 !== null,
      v2Metadata: { table: ids.v2, sequence: ids.v2Sequence, primaryIndex: ids.v2PrimaryIndex },
      v2Rows,
    };
  } finally {
    await client.query("ROLLBACK");
  }
}

function assertInitialState(before: Snapshot, prepared: PreparedBaseline): void {
  must(!before.v2Exists, "The v2 ledger already exists, even if empty; stop for review.");
  must(Object.values(before.v2Metadata).every((oid) => oid === null),
    "Existing or orphaned v2 metadata must be reviewed before adoption.");
  must(before.count === 20 && before.distinctIds === 20 && before.words.length === 20,
    "Expected exactly 20 existing vocabulary records and distinct UUIDs.");
  must(same(before.columns, EXPECTED_COLUMNS), "Vocabulary columns differ from the approved baseline.");
  must(before.identity.valid && before.identity.ready && before.identity.live && before.identity.unique &&
    before.identity.primaryDefinition ===
      "CREATE UNIQUE INDEX vocabulary_pkey ON public.vocabulary USING btree (id)",
  "Vocabulary primary-key metadata is incompatible.");
  const indexRows = before.metadata.indexes;
  must(Array.isArray(indexRows) && indexRows.filter((row) => isRecord(row) &&
    String(row.indrelid) === before.identity.tableOid).length === 1,
  "Unexpected vocabulary indexes.");
  must(before.history.length === 3, "Expected exactly three historical migration records.");
  const history = before.history.map((row) => [row.hash, row.created_at]);
  must(same(history, prepared.approvedHistory), "Historical migration records do not match the approved history.");
  const inventory = before.metadata.inventory;
  must(Array.isArray(inventory) && inventory.length === 5,
    "Unexpected public or migration-schema relation inventory.");
}

function assertPreserved(before: Snapshot, after: Snapshot, prepared: PreparedBaseline): void {
  const protectedBefore = { ...before, v2Exists: undefined, v2Rows: undefined, v2Metadata: undefined };
  const protectedAfter = { ...after, v2Exists: undefined, v2Rows: undefined, v2Metadata: undefined };
  must(same(protectedBefore, protectedAfter),
    "Post-migration preservation check failed; retain the database and inspect it.");
  must(after.v2Exists && after.v2Rows.length === 1, "Expected exactly one successful v2 baseline record.");
  must(Object.values(after.v2Metadata).every((oid) => typeof oid === "string"),
    "The expected v2 table, sequence and primary index are incomplete.");
  const record = after.v2Rows[0]!;
  must(record.id === 1 && record.hash === prepared.hash && String(record.created_at) === String(prepared.when),
    "The recorded v2 baseline identity, hash or timestamp is unexpected.");
}

function report(label: string, target: Target, state: Snapshot): void {
  console.log(JSON.stringify({
    stage: label, database: target.database,
    vocabulary_count: state.count, distinct_uuid_count: state.distinctIds,
    uuid_fingerprint: state.uuidFingerprint,
    vocabulary_content_fingerprint: state.contentFingerprint,
    full_row_fingerprint: state.fullRowFingerprint,
    historical_migration_count: state.history.length,
    historical_records_fingerprint: fingerprint(state.history),
    historical_sequence_fingerprint: fingerprint(state.legacySequence),
    protected_schema_fingerprint: fingerprint(state.metadata),
    v2_ledger_exists: state.v2Exists, successful_v2_records: state.v2Rows.length,
  }, null, 2));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (same(args, ["--help"])) {
    console.log("Initial adoption only: --adopt-existing --host <loopback> --port 5432 --user <role> --database <approved-name>");
    console.log("kalima also requires --allow-original-kalima and the documented secure stdin confirmation.");
    return;
  }
  stage = "arguments and environment";
  const target = parseTarget(args);
  assertCleanEnvironment();
  stage = "frozen files";
  const prepared = await preparedBaseline();
  for (const [name, expected] of [["drizzle-orm", "0.45.3"], ["pg", "8.23.1"]] as const) {
    const metadata: unknown = JSON.parse(await readFile(path.join(SERVER_DIRECTORY, "node_modules", name, "package.json"), "utf8"));
    must(isRecord(metadata) && metadata.version === expected, "Installed migration dependencies differ from the reviewed versions.");
  }
  // Import only the hash-verified, credential-free v2 configuration. Never
  // import drizzle.config.ts or the application's dotenv/database modules.
  const config: unknown = (await import(pathToFileURL(CONFIG_FILE).href)).default;
  must(isRecord(config) && config.dialect === "postgresql" &&
    config.schema === "./src/db/schema.ts" && config.out === "./drizzle-v2" &&
    !("dbCredentials" in config) && isRecord(config.migrations) &&
    config.migrations.schema === LEDGER_SCHEMA && config.migrations.table === LEDGER_TABLE,
  "Unexpected v2 configuration.");
  const { readMigrationFiles } = await import("drizzle-orm/migrator");
  const migrationFiles = readMigrationFiles({ migrationsFolder: prepared.folder });
  must(migrationFiles.length === 1 && migrationFiles[0]!.hash === prepared.hash &&
    migrationFiles[0]!.folderMillis === prepared.when, "Unexpected installed-migrator baseline interpretation.");
  const { Client: PgClient } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  stage = "secure input";
  const secret = await readSecretInput(target.original);
  const client = new PgClient({
    host: target.host, port: target.port, user: target.user, database: target.database,
    password: async () => secret.password, ssl: false,
    application_name: "kalima-v2-initial-adoption",
    connectionTimeoutMillis: 10000, query_timeout: 35000,
    options: "-c search_path=pg_catalog -c timezone=UTC -c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000",
  });
  let connectionError = false;
  client.on("error", () => { connectionError = true; });
  try {
    stage = "connection and identity";
    await client.connect();
    await verifyIdentity(client, target);
    stage = "migration concurrency guard";
    const lock = await one<{ acquired: boolean }>(client,
      "SELECT pg_try_advisory_lock($1::int, $2::int) AS acquired", [...ADVISORY_LOCK]);
    must(lock.acquired, "Another cooperating v2 runner holds the migration lock.");
    stage = "read-only preflight";
    const before = await snapshot(client);
    assertInitialState(before, prepared);
    must(!connectionError, "A database connection error was observed.");
    report("BEFORE", target, before);
    stage = "final migration gate";
    await verifyIdentity(client, target);
    const frozenAgain = await preparedBaseline();
    must(same(prepared, frozenAgain), "Prepared baseline changed during preflight.");
    must(!connectionError, "A database connection error was observed.");
    stage = "v2 baseline migration";
    await migrate(drizzle({ client }), {
      migrationsFolder: prepared.folder,
      migrationsSchema: LEDGER_SCHEMA,
      migrationsTable: LEDGER_TABLE,
    });
    stage = "read-only postflight";
    await verifyIdentity(client, target);
    const after = await snapshot(client);
    assertPreserved(before, after, prepared);
    must(same(prepared, await preparedBaseline()), "Prepared files changed during execution.");
    must(!connectionError, "A database connection error was observed.");
    report("AFTER", target, after);
  } finally {
    // Closing the session releases our advisory lock; no repair/cleanup SQL.
    secret.password = "";
    await client.end();
  }
  console.log("PASS: v2 initial adoption and preservation checks completed.");
}

function safeErrorCodes(error: unknown): string[] {
  const codes = new Set<string>();
  const seen = new Set<object>();
  let current: unknown = error;
  while (isRecord(current) && !seen.has(current)) {
    seen.add(current);
    if (typeof current.code === "string" && /^[A-Z0-9_]+$/.test(current.code)) codes.add(current.code);
    current = current.cause;
  }
  return [...codes];
}

// Importing this module never starts a connection or migration.
if (process.argv[1] && path.relative(SCRIPT_FILE, path.resolve(process.argv[1])) === "") {
  void main().catch((error: unknown) => {
    console.log(`STOP during ${stage}: ${error instanceof RunnerStop ? error.message : "Unexpected failure; retain the database for inspection."}`);
    const codes = safeErrorCodes(error);
    if (codes.length) console.log(`Error codes: ${codes.join(", ")}`);
    // Raw errors/stacks may contain SQL, historical hashes or data: never log.
    process.exitCode = 1;
  });
}
