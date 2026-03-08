import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import * as db from './db.js';
import { requireAuth, requireAdmin, requireApproval, generateToken } from './middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const PORT_FILE = 'port.txt';

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(PROJECT_ROOT, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(PROJECT_ROOT, 'public')));
app.use((req, res, next) => {
    // Cache static assets (CSS, Images) for 1 day
    if (req.url.match(/\.(css|js|png|jpg|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    next();
});
const upload = multer({ dest: path.join(PROJECT_ROOT, 'uploads') });

// --- Helper Functions ---
const createSlug = (str) => {
  if (!str) return '';
  return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-');
};

// --- Helper: Fetch Metadata ---
// Simple scraper to get <title> and favicon
const fetchUrlMetadata = async (targetUrl) => {
  try {
    // Ensure protocol
    if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

    const response = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) }); // 5s timeout
    const html = await response.text();

    // Extract Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : new URL(targetUrl).hostname;

    // Extract Icon
    // 1. Check <link rel="icon"> or "shortcut icon"
    let icon = '';
    const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["'](.*?)["']/i);

    if (iconMatch) {
      icon = iconMatch[1];
      // Handle relative URLs
      if (!icon.startsWith('http')) {
        const origin = new URL(targetUrl).origin;
        icon = new URL(icon, origin).href;
      }
    } else {
      // Fallback to default /favicon.ico
      const origin = new URL(targetUrl).origin;
      icon = origin + '/favicon.ico';
    }

    return { title, icon, url: targetUrl };
  } catch (err) {
    console.error("Metadata fetch error:", err.message);
    return { title: targetUrl, icon: '', url: targetUrl };
  }
};


const moveAndRenameFile = (tempPath, slug) => {
  const appDir = path.join(PROJECT_ROOT, 'apps', slug);
  if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
  fs.renameSync(tempPath, path.join(appDir, 'index.html'));
};

const saveStringAsFile = (content, slug) => {
  const appDir = path.join(PROJECT_ROOT, 'apps', slug);
  if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'index.html'), content);
};

const parseFileContent = (fullContent) => {
  let html = fullContent;
  let css = '';
  let js = '';

  // 1. Extract and Remove Inline CSS (<style>...</style>)
  // We look for style tags, append content to css, and replace with empty string
  html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, content) => {
    css += content.trim() + '\n\n';
    return '';
  });

  // 2. Extract and Remove Inline JS (<script>...</script> without src)
  // We only extract scripts that do NOT have a 'src=' attribute
  html = html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (match, attributes, content) => {
    if (attributes && attributes.includes('src=')) {
      return match; // Keep external scripts in HTML
    }
    js += content.trim() + '\n\n';
    return ''; // Remove inline scripts from HTML
  });

  // 3. Extract BODY content
  // We try to find the body tag. If found, we take its inner HTML.
  // If not found (e.g. user just saved a div), we assume the whole remaining string is HTML.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    html = bodyMatch[1];
  } else {
    // Cleanup: If no body tag, remove head/html/doctype tags to just get the "content"
    html = html
      .replace(/<!DOCTYPE html>/i, '')
      .replace(/<html[^>]*>/i, '')
      .replace(/<\/html>/i, '')
      .replace(/<head[^>]*>([\s\S]*?)<\/head>/i, '')
      .trim();
  }

  return {
    html: html.trim(),
    css: css.trim(),
    js: js.trim()
  };
};

// --- PUBLIC ROUTES ---
app.get('/', async (req, res) => { // Added async
  try {
    const featuredApps = await db.getFeaturedApps();     // Added await
    const publicBookmarks = await db.getPublicBookmarks(); // Added await

    res.render('home', { featuredApps, publicBookmarks, userToken: req.cookies.token });
  } catch (err) {
    console.error("Home load error:", err);
    res.render('home', { featuredApps: [], publicBookmarks: [], userToken: req.cookies.token });
  }
});

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
    const autoApproveStr = db.getSetting('auto_approve');
    const isApproved = autoApproveStr === '1' ? 1 : 0;
    db.createUser(username, hashedPassword, isApproved);
    res.redirect('/login');
  } catch (err) {
    res.render('register', { error: 'Username already taken' });
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

// --- DASHBOARD ---
app.get('/dashboard', requireAuth, (req, res) => {
  const apps = db.getAppsByUser(req.user.id);
  const bookmarks = db.getBookmarksByUser(req.user.id); // NEW: Fetch User Bookmarks
  res.render('dashboard', { user: req.user, apps, bookmarks, error: null });
});

// --- FIDDLE ---
app.get('/fiddle', requireAuth, (req, res) => {
  res.render('fiddle', { user: req.user, prefill: null });
});


app.post('/fiddle/save', requireAuth, requireApproval, (req, res) => {
  const { html, css, js, slug, title } = req.body;

  // Validate or Generate Slug
  let safeSlug = createSlug(slug);
  if (!safeSlug) safeSlug = 'fiddle-' + Math.random().toString(36).substring(2, 8);
  const appTitle = title && title.trim().length > 0 ? title.trim() : "Untitled Fiddle";

  try {
    const existing = db.getAppBySlug(safeSlug);

    if (existing) {
      // CHECK OWNERSHIP
      if (existing.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Slug exists and belongs to another user.' });
      }
      // If owned, we allow proceeding (it will overwrite)
    }

    const finalHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${appTitle}</title>
<style>${css}</style>
</head>
<body>
${html}
<script>${js}<\/script>
</body>
</html>`;

    saveStringAsFile(finalHtml, safeSlug);

    if (existing) {
      // Update DB entry
      db.updateApp(safeSlug, appTitle, 'index.html'); // Ensure timestamp updates
    } else {
      // Create DB entry
      db.createApp(req.user.id, safeSlug, 'Fiddle Project', appTitle);
    }

    res.json({ success: true, redirect: '/dashboard' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// --- ADMIN ---
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const users = db.getAllUsers();
  const apps = db.getAllApps();
  const autoApprove = db.getSetting('auto_approve') === '1';
  res.render('admin', { user: req.user, users, apps, autoApprove });
});

app.post('/admin/approve', requireAuth, requireAdmin, (req, res) => {
  const { userId, action } = req.body;
  db.updateUserStatus(userId, action === 'approve' ? 1 : 0);
  res.redirect('/admin');
});

app.post('/admin/settings', requireAuth, requireAdmin, (req, res) => {
  db.setSetting('auto_approve', req.body.autoApprove ? '1' : '0');
  res.redirect('/admin');
});

app.post('/admin/feature', requireAuth, requireAdmin, (req, res) => {
  db.updateAppFeatured(req.body.appId, req.body.isFeatured ? 1 : 0);
  res.redirect('/admin');
});

// --- UPLOAD ---
app.post('/upload', requireAuth, requireApproval, upload.single('htmlFile'), (req, res) => {
  const { slug, title } = req.body;
  const file = req.file;

  if (!file) return res.redirect('/dashboard');

  let safeSlug = createSlug(slug);
  if (!safeSlug) safeSlug = createSlug(file.originalname.split('.')[0]) || ('app-' + Date.now());
  const appTitle = title && title.trim().length > 0 ? title.trim() : safeSlug;

  try {
    const existing = db.getAppBySlug(safeSlug);
    if (existing) {
      fs.unlinkSync(file.path);
      const apps = db.getAppsByUser(req.user.id);
      return res.render('dashboard', { user: req.user, apps, error: 'Slug taken' });
    }
    moveAndRenameFile(file.path, safeSlug);
    db.createApp(req.user.id, safeSlug, file.originalname, appTitle);
    res.redirect('/dashboard');
  } catch (e) { res.status(500).send("Error"); }
});

// --- UPDATE (MODIFIED) ---
app.post('/update', requireAuth, requireApproval, upload.single('htmlFile'), (req, res) => {
  const { slug, title } = req.body;
  const file = req.file;

  // Validation
  if (!slug || !title) return res.redirect('/dashboard');

  const appData = db.getAppBySlug(slug);
  if (!appData || appData.user_id !== req.user.id) {
    if (file) fs.unlinkSync(file.path);
    return res.status(403).send("Unauthorized");
  }

  try {
    if (file) {
      moveAndRenameFile(file.path, slug);
      db.updateApp(slug, title, file.originalname);
    } else {
      db.updateApp(slug, title, null);
    }
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating");
  }
});

// --- STATIC SITES ---
app.use('/sites', express.static(path.join(PROJECT_ROOT, 'apps')));
app.use('/sites/:slug', (req, res, next) => {
  if (!req.path.endsWith('/')) return res.redirect(req.originalUrl + '/');
  next();
});

// 1. NEW: Load Editor with existing app data
app.get('/fiddle/:slug', requireAuth, (req, res) => {
  const { slug } = req.params;
  const appData = db.getAppBySlug(slug);

  if (!appData) return res.status(404).send("App not found");
  if (appData.user_id !== req.user.id) return res.status(403).send("Unauthorized");

  const appDir = path.join(PROJECT_ROOT, 'apps', slug);
  const filePath = path.join(appDir, 'index.html');

  if (!fs.existsSync(filePath)) return res.status(404).send("File missing");

  const fullContent = fs.readFileSync(filePath, 'utf-8');

  // Parse the file
  const { html, css, js } = parseFileContent(fullContent);

  res.render('fiddle', {
    user: req.user,
    prefill: {
      slug: appData.slug,
      title: appData.title,
      html,
      css,
      js
    }
  });
});

// --- NEW: BOOKMARK API ROUTES ---

// 1. Preview Metadata (called by frontend JS)
app.post('/api/preview-url', requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const data = await fetchUrlMetadata(url);
  res.json(data);
});

// 2. Save Bookmark
app.post('/bookmarks/create', requireAuth, requireApproval, async (req, res) => {
  const { url, title, icon, isPublic } = req.body;

  if (!url) return res.redirect('/dashboard');

  try {
    db.createBookmark(req.user.id, url, title, icon, isPublic ? 1 : 0);
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard?error=Failed to save bookmark');
  }
});

// 3. Delete Bookmark
app.post('/bookmarks/delete', requireAuth, (req, res) => {
  const { id } = req.body;
  db.deleteBookmark(id, req.user.id);
  res.redirect('/dashboard');
});


// --- START SERVER ---
const startServer = (preferredPort) => {
  const server = app.listen(preferredPort, function () {
    const address = this.address();
    if (!address) return;
    const actualPort = address.port;
    console.log(`Server running at http://localhost:${actualPort}`);
    try { fs.writeFileSync(PORT_FILE, actualPort.toString()); } catch (e) { }
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') startServer(0);
    else console.error(err);
  });
};

let portToUse = 3000;
if (fs.existsSync(PORT_FILE)) {
  const saved = parseInt(fs.readFileSync(PORT_FILE, 'utf-8').trim());
  if (!isNaN(saved)) portToUse = saved;
}
startServer(portToUse);