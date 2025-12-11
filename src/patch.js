import Database from 'better-sqlite3';

const db = new Database('database.sqlite');

try {
    console.log("Attempting to add 'title' column to 'apps' table...");
    
    // Add the column
    db.exec("ALTER TABLE apps ADD COLUMN title TEXT;");
    
    // Backfill existing rows: set title = slug so it's not null/empty
    db.exec("UPDATE apps SET title = slug WHERE title IS NULL;");
    
    console.log("Success: Database patched.");
} catch (err) {
    if (err.message.includes('duplicate column name')) {
        console.log("Notice: 'title' column already exists. No changes needed.");
    } else {
        console.error("Error patching database:", err.message);
    }
}