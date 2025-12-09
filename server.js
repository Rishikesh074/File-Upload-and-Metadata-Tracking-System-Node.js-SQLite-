const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Serve static front-end and uploaded files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// Initialize SQLite
const db = new Database(path.join(__dirname, 'files.db'));
db.prepare(`
  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL
  )
`).run();

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Avoid collisions and keep traceability
    const safeBase = path.basename(file.originalname).replace(/\s+/g, '_');
    const uniqueName = Date.now() + '-' + safeBase;
    cb(null, uniqueName);
  }
});

// Optional: file type/size limits for basic hygiene
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
});

// Upload route
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });

    const file = req.file;
    const insert = db.prepare(`
      INSERT INTO uploads (original_name, stored_name, mime_type, size_bytes, uploaded_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    insert.run(file.originalname, file.filename, file.mimetype, file.size);

    res.json({
      success: true,
      file: {
        original_name: file.originalname,
        stored_name: file.filename,
        mime_type: file.mimetype,
        size_bytes: file.size,
        url: `/uploads/${file.filename}`
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: 'Server error during upload' });
  }
});

// List files
app.get('/files', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM uploads ORDER BY uploaded_at DESC').all();
    res.json(rows);
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ success: false, error: 'Server error fetching files' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));