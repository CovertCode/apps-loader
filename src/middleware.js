import jwt from 'jsonwebtoken';
import * as db from './db.js';

const SECRET_KEY = 'super-secret-key-change-this-in-prod';

export const generateToken = (user) => {
  return jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '2h' });
};

// 1. Authenticate and Fetch Fresh User Data
export const requireAuth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login');

  try {
    const payload = jwt.verify(token, SECRET_KEY);
    const user = db.findUserById(payload.id); // Fetch fresh from DB

    if (!user) {
        res.clearCookie('token');
        return res.redirect('/login');
    }

    req.user = user; // Attach full user object (including role/is_approved)
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.redirect('/login');
  }
};

// 2. Ensure User is Admin
export const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).render('error', { message: "Access Denied: Admins Only" });
    }
};

// 3. Ensure User is Approved (for uploading)
export const requireApproval = (req, res, next) => {
    if (req.user && req.user.is_approved === 1) {
        next();
    } else {
        res.status(403).render('error', { message: "Account Pending Approval" });
    }
};