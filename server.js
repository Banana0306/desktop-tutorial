const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const protectedRoutes = require('./routes/protected');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// In production, serve React dashboard first so its index.html takes precedence
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client', 'dist')));
}

// Auth HTML pages (login.html, register.html, etc.) always available
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api', protectedRoutes);

app.post('/api/jp-racing/save-content', (req, res) => {
  if (req.body.pin !== 'jp2827') return res.status(401).json({ error: '密碼錯誤' });
  const filePath = path.join(__dirname, 'public', 'jp-racing', 'index.html');
  let html = fs.readFileSync(filePath, 'utf8');
  for (const [key, value] of Object.entries(req.body.fields || {})) {
    const s = `<!-- FIELD:${key} -->`, e = `<!-- /FIELD:${key} -->`;
    const si = html.indexOf(s), ei = html.indexOf(e);
    if (si !== -1 && ei !== -1) html = html.slice(0, si + s.length) + value + html.slice(ei);
  }
  fs.writeFileSync(filePath, html, 'utf8');
  res.json({ ok: true });
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) =>
    res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'))
  );
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
