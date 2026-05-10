const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const protectedRoutes = require('./routes/protected');
const logisticsRoutes = require('./routes/logistics');

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
app.use('/api/logistics', logisticsRoutes);

if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) =>
    res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'))
  );
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
