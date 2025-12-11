import Database from 'better-sqlite3';

const db = new Database('database.sqlite');

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    is_approved INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    slug TEXT UNIQUE,
    original_name TEXT,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_featured INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

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

// --- App Functions ---
export const createApp = (userId, slug, originalName, title) => {
  const stmt = db.prepare('INSERT INTO apps (user_id, slug, original_name, title) VALUES (?, ?, ?, ?)');
  return stmt.run(userId, slug, originalName, title);
};

export const getAppsByUser = (userId) => {
  const stmt = db.prepare('SELECT * FROM apps WHERE user_id = ? ORDER BY created_at DESC');
  return stmt.all(userId);
};

export const getAppBySlug = (slug) => {
  const stmt = db.prepare('SELECT * FROM apps WHERE slug = ?');
  return stmt.get(slug);
};

// CHANGED: Flexible update function
export const updateApp = (slug, title, originalName) => {
  if (originalName) {
    // Update Title AND File
    const stmt = db.prepare('UPDATE apps SET title = ?, original_name = ?, created_at = CURRENT_TIMESTAMP WHERE slug = ?');
    return stmt.run(title, originalName, slug);
  } else {
    // Update Title ONLY
    const stmt = db.prepare('UPDATE apps SET title = ?, created_at = CURRENT_TIMESTAMP WHERE slug = ?');
    return stmt.run(title, slug);
  }
};

export const getAllApps = () => {
  const stmt = db.prepare(`
    SELECT apps.*, users.username as author 
    FROM apps 
    JOIN users ON apps.user_id = users.id 
    ORDER BY apps.created_at DESC
  `);
  return stmt.all();
};

export const getFeaturedApps = () => {
  const stmt = db.prepare(`
    SELECT apps.*, users.username as author 
    FROM apps 
    JOIN users ON apps.user_id = users.id 
    WHERE apps.is_featured = 1 
    ORDER BY apps.created_at DESC
  `);
  return stmt.all();
};

export const updateAppFeatured = (appId, isFeatured) => {
  const stmt = db.prepare('UPDATE apps SET is_featured = ? WHERE id = ?');
  return stmt.run(isFeatured, appId);
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