# User Authentication Tutorial

A step-by-step tutorial application showing how to implement user authentication in a Node.js/Express app using bcryptjs and JWT.

## Concepts Covered

- **Password hashing** with bcryptjs — plain-text passwords are never stored
- **JSON Web Tokens (JWT)** — stateless, signed tokens for session management
- **Auth middleware** — protecting routes by verifying the JWT on every request
- **Token expiry** — tokens expire after 1 hour, forcing re-login

## Getting Started

```bash
npm install
npm start
```

Then open <http://localhost:3000> in your browser.

## Auth Flow

```
Register  →  hash password  →  save user  →  issue JWT  →  dashboard
Login     →  verify hash    →              →  issue JWT  →  dashboard
Request   →  read JWT       →  verify sig  →  allow/deny
Logout    →  clear token    →  redirect to login
```

## API Endpoints

| Method | Path | Description | Auth required |
|--------|------|-------------|---------------|
| POST | `/api/auth/register` | Create a new account | No |
| POST | `/api/auth/login` | Log in and receive JWT | No |
| POST | `/api/auth/logout` | Log out (clears cookie) | No |
| GET | `/api/me` | Return current user info | Yes |

## Project Structure

```
├── server.js            # Express entry point
├── middleware/
│   └── auth.js          # JWT verification middleware
├── routes/
│   ├── auth.js          # /api/auth/* routes
│   └── protected.js     # /api/me route
└── public/              # Static frontend
    ├── index.html
    ├── login.html
    ├── register.html
    ├── dashboard.html
    ├── style.css
    └── auth.js          # Client-side token helpers
```
