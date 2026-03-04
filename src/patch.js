import Database from 'better-sqlite3';

const db = new Database('database.sqlite');

console.log('--- Patching Database for Bookmarks ---');

// Create Bookmarks Table
try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        url TEXT NOT NULL,
        title TEXT,
        icon TEXT,
        is_public INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);
    console.log('✅ [bookmarks] Table created/verified.');
} catch (err) {
    console.error('❌ Error creating bookmarks table:', err.message);
}

console.log('--- Patch Complete ---');