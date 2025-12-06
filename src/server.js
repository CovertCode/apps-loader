import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import * as db from './db.js';
import { requireAuth, requireAdmin, requireApproval, generateToken } from './middleware.js';

// Setup paths for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

const app = express();

// Config
app.set('view engine', 'ejs');
app.set('views', path.join(PROJECT_ROOT, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

// Multer Setup (Temp storage)
const upload = multer({ dest: path.join(PROJECT_ROOT, 'uploads') });

// --- Helper: Slugify ---
const createSlug = (str) => {
  if (!str) return '';
  return str
    .toString()
    .normalize('NFD')               // Split accented characters (e.g., é -> e + ')
    .replace(/[\u0300-\u036f]/g, '')// Remove accent marks
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // Remove invalid chars (keep letters, numbers, spaces, hyphens)
    .replace(/[\s_]+/g, '-')        // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-');           // Collapse multiple hyphens
};



// --- Auth Routes ---

app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.findUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('login', { error: 'Invalid credentials' });
  }
  const token = generateToken(user);
  res.cookie('token', token, { httpOnly: true });
  res.redirect('/dashboard');
});

app.get('/register', (req, res) => res.render('register', { error: null }));

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Check Auto-Approve Setting
    const autoApproveStr = db.getSetting('auto_approve'); // returns string '0' or '1'
    const isApproved = autoApproveStr === '1' ? 1 : 0;

    db.createUser(username, hashedPassword, isApproved);
    res.redirect('/login');
  } catch (err) {
    res.render('register', { error: 'Username already taken' });
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

// --- Dashboard & App Logic ---

app.get('/dashboard', requireAuth, (req, res) => {
  const apps = db.getAppsByUser(req.user.id);
  res.render('dashboard', { user: req.user, apps, error: null });
});

// Helper to move file
const moveAndRenameFile = (tempPath, slug) => {
  const appDir = path.join(PROJECT_ROOT, 'apps', slug);

  // Create directory if not exists
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }

  const targetPath = path.join(appDir, 'index.html');

  // Move and rename
  fs.renameSync(tempPath, targetPath);
};

app.post('/upload', requireAuth, requireApproval, upload.single('htmlFile'), (req, res) => {
  const { slug } = req.body;
  const file = req.file;

  if (!file) return res.redirect('/dashboard');

  // 1. FORCE SLUG FORMAT
  // If user enters "My Cool Game!!!", this becomes "my-cool-game"
  // If user enters nothing, fallback to filename "my-file.html" -> "my-file"
  let safeSlug = createSlug(slug);

  // Fallback if slug became empty after sanitization or wasn't provided
  if (!safeSlug) {
    const filenameWithoutExt = file.originalname.split('.').slice(0, -1).join('.');
    safeSlug = createSlug(filenameWithoutExt);
  }

  // If it's STILL empty (rare edge case like filename "???.html"), generate a random one
  if (!safeSlug) {
    safeSlug = 'app-' + Date.now();
  }

  try {
    const existing = db.getAppBySlug(safeSlug);
    if (existing) {
      fs.unlinkSync(file.path);
      const apps = db.getAppsByUser(req.user.id);
      return res.render('dashboard', {
        user: req.user,
        apps,
        error: `The URL '${safeSlug}' is already taken. Please try a different name.`
      });
    }

    moveAndRenameFile(file.path, safeSlug);
    db.createApp(req.user.id, safeSlug, file.originalname);

    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

app.post('/update', requireAuth, requireApproval, upload.single('htmlFile'), (req, res) => {
  const { slug } = req.body;
  const file = req.file;

  if (!file || !slug) return res.redirect('/dashboard');

  const appData = db.getAppBySlug(slug);

  // Security: Ensure the user owns this app
  if (!appData || appData.user_id !== req.user.id) {
    fs.unlinkSync(file.path); // clean temp
    return res.status(403).send("Unauthorized");
  }

  try {
    moveAndRenameFile(file.path, slug); // Overwrites existing index.html
    db.updateAppTimestamp(slug, file.originalname);
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating");
  }
});

// --- Serving the Apps ---

// Middleware to serve static files from the 'apps' directory
// URL pattern: /sites/:slug/
app.use('/sites', express.static(path.join(PROJECT_ROOT, 'apps')));

// Redirect /sites/:slug to /sites/:slug/ to ensure relative paths work in the HTML
app.use('/sites/:slug', (req, res, next) => {
  if (!req.path.endsWith('/')) {
    return res.redirect(req.originalUrl + '/');
  }
  next();
});

// --- ADMIN ROUTES ---

app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const users = db.getAllUsers();
  const autoApprove = db.getSetting('auto_approve') === '1';
  res.render('admin', { user: req.user, users, autoApprove });
});

app.post('/admin/approve', requireAuth, requireAdmin, (req, res) => {
  const { userId, action } = req.body; // action: 'approve' or 'revoke'
  const status = action === 'approve' ? 1 : 0;
  db.updateUserStatus(userId, status);
  res.redirect('/admin');
});

app.post('/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const { autoApprove } = req.body; // "on" if checked, undefined if not
  const val = autoApprove ? '1' : '0';
  db.setSetting('auto_approve', val);
  res.redirect('/admin');
});


const PORT_FILE = 'port.txt';

const startServer = (preferredPort) => {
  // Use a standard function() so 'this' refers to the server instance
  const server = app.listen(preferredPort, function () {
    const address = this.address();
    
    // Safety check
    if (!address) {
        console.error("Server started, but address is not available.");
        return;
    }

    const actualPort = address.port;
    console.log(`Server running at http://localhost:${actualPort}`);
    
    // Save the working port to file
    try {
        fs.writeFileSync(PORT_FILE, actualPort.toString());
    } catch (e) {
        console.error("Could not save port to file:", e);
    }
  });

  // Handle port conflicts
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${preferredPort} is busy, finding a new available port...`);
      // Retry with port 0 (OS will assign a random available port)
      startServer(0);
    } else {
      console.error('Server error:', err);
    }
  });
};

// --- Execution Logic ---

let portToUse = 3000; // Default fallback

// 1. Try to load previously saved port
if (fs.existsSync(PORT_FILE)) {
  const savedPort = parseInt(fs.readFileSync(PORT_FILE, 'utf-8').trim());
  if (!isNaN(savedPort)) {
    portToUse = savedPort;
  }
}

// 2. Start the server
startServer(portToUse);