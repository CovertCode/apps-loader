import Database from 'better-sqlite3';

const db = new Database('database.sqlite');

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',         -- 'admin' or 'user'
    is_approved INTEGER DEFAULT 0     -- 0 = pending, 1 = approved
  );

  CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    slug TEXT UNIQUE,
    original_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Default Setting: Auto Approve is OFF (0)
  INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_approve', '0');
`);

// --- User Functions ---

export const createUser = (username, password, isApproved = 0, role = 'user') => {
  const stmt = db.prepare('INSERT INTO users (username, password, is_approved, role) VALUES (?, ?, ?, ?)');
  return stmt.run(username, password, isApproved, role);
};

export const findUserByUsername = (username) => {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
};

export const findUserById = (id) => {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id);
};

export const getAllUsers = () => {
  const stmt = db.prepare('SELECT id, username, role, is_approved FROM users ORDER BY id DESC');
  return stmt.all();
};

export const updateUserStatus = (userId, isApproved) => {
  const stmt = db.prepare('UPDATE users SET is_approved = ? WHERE id = ?');
  return stmt.run(isApproved, userId);
};

// --- App Functions (Unchanged) ---

export const createApp = (userId, slug, originalName) => {
  const stmt = db.prepare('INSERT INTO apps (user_id, slug, original_name) VALUES (?, ?, ?)');
  return stmt.run(userId, slug, originalName);
};

export const getAppsByUser = (userId) => {
  const stmt = db.prepare('SELECT * FROM apps WHERE user_id = ? ORDER BY created_at DESC');
  return stmt.all(userId);
};

export const getAppBySlug = (slug) => {
  const stmt = db.prepare('SELECT * FROM apps WHERE slug = ?');
  return stmt.get(slug);
};

export const updateAppTimestamp = (slug, originalName) => {
  const stmt = db.prepare('UPDATE apps SET original_name = ?, created_at = CURRENT_TIMESTAMP WHERE slug = ?');
  return stmt.run(originalName, slug);
};

// --- Settings Functions ---

export const getSetting = (key) => {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const result = stmt.get(key);
  return result ? result.value : null;
};

export const setSetting = (key, value) => {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  return stmt.run(key, value);
};