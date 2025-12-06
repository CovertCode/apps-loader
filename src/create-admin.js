import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

const db = new Database('database.sqlite');
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node src/create-admin.js <username> <password>');
  process.exit(1);
}

const [username, password] = args;
const hashedPassword = bcrypt.hashSync(password, 10);

try {
  // Ensure tables exist (in case this is the very first script run)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user',
        is_approved INTEGER DEFAULT 0
    );
  `);

  // Check if user exists
  const checkStmt = db.prepare('SELECT * FROM users WHERE username = ?');
  const existing = checkStmt.get(username);

  if (existing) {
    // Promote existing user to admin
    // FIX: used single quotes for 'admin'
    const updateStmt = db.prepare("UPDATE users SET role = 'admin', is_approved = 1, password = ? WHERE username = ?");
    updateStmt.run(hashedPassword, username);
    console.log(`User '${username}' updated to Admin.`);
  } else {
    // Create new admin
    // FIX: used single quotes for 'admin'
    const insertStmt = db.prepare("INSERT INTO users (username, password, role, is_approved) VALUES (?, ?, 'admin', 1)");
    insertStmt.run(username, hashedPassword);
    console.log(`Admin '${username}' created successfully.`);
  }
} catch (error) {
  console.error('Error creating admin:', error.message);
}