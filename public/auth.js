// Token helpers
function getToken() { return localStorage.getItem('token'); }
function setToken(token) { localStorage.setItem('token', token); }
function clearToken() { localStorage.removeItem('token'); localStorage.removeItem('username'); }
function setUsername(u) { localStorage.setItem('username', u); }
function getUsername() { return localStorage.getItem('username'); }

// Redirect to login if no token is present
function requireAuth() {
  if (!getToken()) window.location.href = '/login.html';
}

// Redirect to dashboard if already logged in
function redirectIfAuthed() {
  if (getToken()) window.location.href = '/dashboard.html';
}

function showAlert(el, message, type = 'error') {
  el.textContent = message;
  el.className = 'alert ' + type;
  el.style.display = 'block';
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  clearToken();
  window.location.href = '/login.html';
}

// Fetch /api/me using stored token
async function fetchMe() {
  const res = await fetch('/api/me', {
    headers: { Authorization: 'Bearer ' + getToken() }
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login.html';
    return null;
  }
  return res.json();
}
