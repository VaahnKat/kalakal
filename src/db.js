// Kalakal database (Cloudflare D1): accounts, saved quizzes, the public library.
// Tables are created automatically on first use, so a fresh database needs no setup.
// To change the schema: add statements to MIGRATIONS (never edit old ones) and bump nothing else.

const MIGRATIONS = [
  // 1: first version
  [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, google_id TEXT UNIQUE, email TEXT, name TEXT, display_name TEXT, picture TEXT,
      status TEXT NOT NULL DEFAULT 'active', accepted_terms_at INTEGER, created_at INTEGER, last_seen_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER, expires_at INTEGER)`,
    `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
    `CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, category TEXT, language TEXT, age TEXT,
      mode TEXT, visibility TEXT NOT NULL DEFAULT 'private', status TEXT NOT NULL DEFAULT 'ok', slides TEXT NOT NULL,
      question_count INTEGER, cover TEXT, plays INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0,
      copied_from TEXT, created_at INTEGER, updated_at INTEGER, published_at INTEGER)`,
    `CREATE INDEX IF NOT EXISTS quizzes_owner ON quizzes(owner_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS quizzes_public ON quizzes(visibility, status, published_at)`,
    `CREATE TABLE IF NOT EXISTS plays_daily (quiz_id TEXT NOT NULL, day TEXT NOT NULL, plays INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (quiz_id, day))`,
    `CREATE INDEX IF NOT EXISTS plays_day ON plays_daily(day)`,
    `CREATE TABLE IF NOT EXISTS likes (user_id TEXT NOT NULL, quiz_id TEXT NOT NULL, created_at INTEGER, PRIMARY KEY (user_id, quiz_id))`,
    `CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, reporter TEXT NOT NULL, reason TEXT, note TEXT,
      status TEXT NOT NULL DEFAULT 'open', created_at INTEGER, UNIQUE (quiz_id, reporter))`,
    `CREATE TABLE IF NOT EXISTS media (key TEXT PRIMARY KEY, owner_id TEXT NOT NULL, size INTEGER, created_at INTEGER)`,
    `CREATE INDEX IF NOT EXISTS media_owner ON media(owner_id)`,
  ],
];

let ready = null;
export function db(env) {
  if (!env.DB) throw Object.assign(new Error("Accounts aren't switched on yet."), { status: 503 });
  if (!ready) ready = migrate(env.DB).catch((e) => { ready = null; throw e; });
  return ready.then(() => env.DB);
}

async function migrate(DB) {
  await DB.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)").run();
  const row = await DB.prepare("SELECT v FROM meta WHERE k = 'schema'").first();
  const done = row ? Number(row.v) : 0;
  for (let i = done; i < MIGRATIONS.length; i++) {
    await DB.batch([...MIGRATIONS[i].map((sql) => DB.prepare(sql)),
      DB.prepare("INSERT INTO meta (k, v) VALUES ('schema', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(i + 1))]);
  }
}

export const now = () => Date.now();
export const today = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
export function newId(len = 16) {
  const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(len));
  return [...b].map((x) => abc[x % abc.length]).join("");
}
