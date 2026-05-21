import Database from 'better-sqlite3';
const db = new Database('database.sqlite');

console.log('--- Patching for Protected Bookmarks ---');

// 1. Add is_protected to bookmarks
try {
    db.exec("ALTER TABLE bookmarks ADD COLUMN is_protected INTEGER DEFAULT 0;");
    console.log("✅ Added 'is_protected' to bookmarks");
} catch (e) {}

// 2. Add pin to users (Stored as a hash)
try {
    db.exec("ALTER TABLE users ADD COLUMN pin TEXT;");
    console.log("✅ Added 'pin' to users");
} catch (e) {}

console.log('--- Patch Complete ---');