import Database from 'better-sqlite3';

const db = new Database('database.sqlite');

console.log('--- Starting Production Database Patch ---');

// Helper function to safely add columns
const addColumn = (table, columnDef) => {
    try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
        console.log(`✅ [${table}] Added column: ${columnDef}`);
    } catch (err) {
        if (err.message.includes('duplicate column name')) {
            console.log(`ℹ️  [${table}] Column already exists: ${columnDef.split(' ')[0]}`);
        } else {
            console.error(`❌ [${table}] Error adding column:`, err.message);
        }
    }
};

// --- 1. Update USERS Table ---
// Adds support for RBAC and Approvals
addColumn('users', "role TEXT DEFAULT 'user'");
addColumn('users', "is_approved INTEGER DEFAULT 0");

// --- 2. Update APPS Table ---
// Adds support for Featured list and Titles
addColumn('apps', "is_featured INTEGER DEFAULT 0");
addColumn('apps', "title TEXT");

// --- 3. Create SETTINGS Table ---
// For global configs like auto-approve
try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    console.log('✅ [settings] Table ensured.');

    // Insert default setting if missing
    db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_approve', '0')");
    console.log('✅ [settings] Default values checked.');
} catch (err) {
    console.error('❌ [settings] Error creating table:', err.message);
}

// --- 4. Backfill / Migration Data ---
try {
    console.log('🔄 Running data migrations...');
    
    // 1. If an app has no title, use its slug as the title
    const result = db.exec("UPDATE apps SET title = slug WHERE title IS NULL OR title = ''");
    
    // 2. Ensure existing users have a default role if NULL
    db.exec("UPDATE users SET role = 'user' WHERE role IS NULL");

    // 3. (Optional) Auto-approve the very first user (usually the admin/creator) if not set
    // db.exec("UPDATE users SET is_approved = 1, role = 'admin' WHERE id = 1");

    console.log('✅ Data migration complete.');
} catch (err) {
    console.error('❌ Error during data migration:', err.message);
}

console.log('--- Patch Complete ---');