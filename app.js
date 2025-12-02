const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const port = Number(process.env.PORT) || 8080;
const appEnv = process.env.APP_ENV || 'local';
const release = process.env.RELEASE || 'v2.1';
const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const startedAt = Date.now();

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const coversDir = path.join(uploadsDir, 'covers');
const musicDir = path.join(uploadsDir, 'music');

[uploadsDir, dataDir, coversDir, musicDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Database setup
const db = new sqlite3.Database(path.join(dataDir, 'music.db'));

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tracks table
  db.run(`CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    filename TEXT NOT NULL,
    cover_filename TEXT,
    duration INTEGER DEFAULT 0,
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users (id)
  )`);

  // Create admin user if not exists
  const hashedPassword = bcrypt.hashSync(adminPassword, 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, is_admin) VALUES (?, ?, 1)`, 
    [adminUsername, hashedPassword]);
});

const metrics = {
  requests: 0,
  plays: 0,
  skips: 0,
  uploads: 0
};

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'cover') {
      cb(null, coversDir);
    } else if (file.fieldname === 'music') {
      cb(null, musicDir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'music') {
      if (file.mimetype.startsWith('audio/')) {
        cb(null, true);
      } else {
        cb(new Error('Only audio files are allowed for music'), false);
      }
    } else if (file.fieldname === 'cover') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for cover'), false);
      }
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain', ...headers });
  res.end(text);
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

function sendFile(res, filePath, mimeType) {
  if (!fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: 'File not found' });
  }
  
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=86400'
  });
  
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
}

function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret);
  } catch (err) {
    return null;
  }
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return sendJson(res, 401, { error: 'Authentication required' });
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return sendJson(res, 401, { error: 'Invalid token' });
  }
  
  req.user = decoded;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.is_admin) {
      return sendJson(res, 403, { error: 'Admin access required' });
    }
    next();
  });
}

function renderIndexPage() {
  const baseStyle = `
    :root {
      --bg: radial-gradient(circle at 20% 20%, #182848, #0f1624 50%, #0b0f1a 80%);
      --panel: rgba(255, 255, 255, 0.06);
      --accent: #1db954;
      --accent-2: #4ddfa3;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: var(--text);
      background: var(--bg);
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .app {
      width: min(1200px, 100%);
      background: linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.35);
      overflow: hidden;
      backdrop-filter: blur(10px);
    }
    .header {
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: linear-gradient(90deg, rgba(29,185,84,0.18), rgba(29,185,84,0.06));
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.4px;
    }
    .user-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pill {
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .login-form, .upload-form {
      background: var(--panel);
      border-radius: 16px;
      padding: 24px;
      margin: 24px;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    .form-group label {
      font-weight: 600;
      color: var(--text);
    }
    .form-group input, .form-group textarea {
      padding: 12px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      background: rgba(255,255,255,0.04);
      color: var(--text);
      font-family: inherit;
    }
    .form-group input:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(29,185,84,0.2);
    }
    .content {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 0;
    }
    .now-playing {
      padding: 24px;
      border-right: 1px solid rgba(255,255,255,0.06);
      min-height: 320px;
      display: grid;
      align-content: space-between;
      gap: 20px;
    }
    .art {
      width: 100%;
      aspect-ratio: 1.4 / 1;
      background: linear-gradient(135deg, #0ea5e9, #1db954);
      border-radius: 16px;
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
      background-size: cover;
      background-position: center;
    }
    .art::after, .art::before {
      content: '';
      position: absolute;
      border-radius: 50%;
      filter: blur(30px);
      opacity: 0.45;
    }
    .art::after {
      width: 160px; height: 160px;
      background: #1db954;
      top: -20px; right: -40px;
    }
    .art::before {
      width: 200px; height: 200px;
      background: #0ea5e9;
      bottom: -60px; left: -50px;
    }
    .track-info h2 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0.3px;
    }
    .track-info p {
      margin: 4px 0 0;
      color: var(--muted);
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    button {
      cursor: pointer;
      border: none;
      border-radius: 12px;
      padding: 12px 14px;
      background: var(--panel);
      color: var(--text);
      font-weight: 600;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      letter-spacing: 0.1px;
    }
    button:hover { background: rgba(255,255,255,0.12); transform: translateY(-1px); }
    .play { background: var(--accent); color: #0c1a12; }
    .play:hover { background: var(--accent-2); }
    .danger { background: var(--danger); }
    .danger:hover { background: #dc2626; }
    .toggle.active { box-shadow: 0 0 0 1px var(--accent); }
    .progress {
      display: grid;
      gap: 8px;
    }
    .bar {
      width: 100%;
    }
    input[type="range"] {
      width: 100%;
      accent-color: var(--accent);
      cursor: pointer;
    }
    .time {
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 12px;
    }
    .playlist {
      padding: 24px;
      display: grid;
      gap: 12px;
    }
    .track {
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--panel);
      border: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .track:hover { border-color: rgba(255,255,255,0.14); transform: translateY(-1px); }
    .track.active { border-color: var(--accent); box-shadow: 0 8px 30px rgba(29,185,84,0.12); }
    .track .meta { display: flex; flex-direction: column; gap: 4px; }
    .track .title { font-weight: 600; }
    .track .artist { color: var(--muted); font-size: 13px; }
    .badge {
      background: rgba(29,185,84,0.16);
      color: var(--accent);
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 11px;
      letter-spacing: 0.3px;
    }
    .status {
      color: var(--muted);
      font-size: 13px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      display: inline-block;
      box-shadow: 0 0 0 4px rgba(29,185,84,0.12);
    }
    .topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
    }
    .env {
      padding: 4px 8px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .admin-panel {
      grid-column: 1 / -1;
      padding: 24px;
      border-top: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.02);
    }
    .hidden { display: none !important; }
    @media (max-width: 900px) {
      .content { grid-template-columns: 1fr; }
      .now-playing { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); }
    }
  `;

  const html = `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Music Streaming Platform</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
      <style>${baseStyle}</style>
    </head>
    <body>
      <div class="app">
        <div class="header">
          <div class="title">Music Platform</div>
          <div class="user-info">
            <div id="username" class="pill"></div>
            <button id="logout" class="hidden">Logout</button>
          </div>
        </div>

        <!-- Login Form -->
        <div id="login-section" class="login-form">
          <h2>Login</h2>
          <div class="form-group">
            <label>Username:</label>
            <input type="text" id="login-username" placeholder="Enter username" />
          </div>
          <div class="form-group">
            <label>Password:</label>
            <input type="password" id="login-password" placeholder="Enter password" />
          </div>
          <button id="login-btn" class="play">Login</button>
          <button id="register-btn">Register</button>
        </div>

        <!-- Registration Form -->
        <div id="register-section" class="login-form hidden">
          <h2>Register</h2>
          <div class="form-group">
            <label>Username:</label>
            <input type="text" id="register-username" placeholder="Choose username" />
          </div>
          <div class="form-group">
            <label>Password:</label>
            <input type="password" id="register-password" placeholder="Choose password" />
          </div>
          <button id="register-submit" class="play">Register</button>
          <button id="back-to-login">Back to Login</button>
        </div>

        <!-- Main App -->
        <div id="main-app" class="hidden">
          <div class="content">
            <div class="now-playing">
              <div>
                <div id="album-art" class="art"></div>
                <div class="track-info" style="margin-top:16px;">
                  <h2 id="track-title">Select a track</h2>
                  <p id="track-artist">Choose from playlist</p>
                </div>
                <div class="controls" style="margin-top:16px;">
                  <button id="prev" title="Previous">&lt;&lt; Prev</button>
                  <button class="play" id="play">Play</button>
                  <button id="next" title="Next">Next &gt;&gt;</button>
                  <button class="toggle" id="shuffle" title="Shuffle">Shuffle</button>
                  <button class="toggle" id="mute" title="Mute">Mute</button>
                </div>
              <div class="progress">
                <input id="seek" class="bar" type="range" min="0" max="100" value="0" step="0.5"/>
                <div class="time">
                  <span id="current">0:00</span>
                  <span id="duration">0:00</span>
                </div>
              </div>
              <div class="topline">
                <div class="status"><span class="dot"></span><span id="status-text">Ready</span></div>
                <div class="env">env: ${appEnv}</div>
              </div>
            </div>
          </div>
          <div class="playlist">
            <div class="topline">
              <div>Playlist</div>
              <div class="badge">Live</div>
            </div>
            <div id="tracks"></div>
          </div>

          <!-- Admin Panel -->
          <div id="admin-panel" class="admin-panel hidden">
            <h2>Admin Panel - Upload Music</h2>
            <form id="upload-form" enctype="multipart/form-data">
              <div class="form-group">
                <label>Track Title:</label>
                <input type="text" id="track-title-input" required />
              </div>
              <div class="form-group">
                <label>Artist Name:</label>
                <input type="text" id="artist-input" required />
              </div>
              <div class="form-group">
                <label>Music File:</label>
                <input type="file" id="music-file" accept="audio/*" required />
              </div>
              <div class="form-group">
                <label>Cover Image (optional):</label>
                <input type="file" id="cover-file" accept="image/*" />
              </div>
              <button type="submit" class="play">Upload Track</button>
            </form>
          </div>
        </div>
      </div>

      <script>
        let token = localStorage.getItem('token');
        let currentUser = null;
        
        const state = {
          tracks: [],
          current: 0,
          playing: false,
          shuffle: false
        };

        const audio = new Audio();
        audio.preload = 'metadata';

        const els = {
          title: document.getElementById('track-title'),
          artist: document.getElementById('track-artist'),
          status: document.getElementById('status-text'),
          tracks: document.getElementById('tracks'),
          play: document.getElementById('play'),
          next: document.getElementById('next'),
          prev: document.getElementById('prev'),
          shuffle: document.getElementById('shuffle'),
          mute: document.getElementById('mute'),
          seek: document.getElementById('seek'),
          current: document.getElementById('current'),
          duration: document.getElementById('duration'),
          albumArt: document.getElementById('album-art')
        };

        function fmt(seconds) {
          const m = Math.floor(seconds / 60);
          const s = Math.floor(seconds % 60);
          return m + ':' + String(s).padStart(2,'0');
        }

        async function apiCall(endpoint, options = {}) {
          const config = {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              ...(token && { Authorization: \`Bearer \${token}\` }),
              ...options.headers
            }
          };
          
          const response = await fetch(endpoint, config);
          return response.json();
        }

        async function login() {
          const username = document.getElementById('login-username').value;
          const password = document.getElementById('login-password').value;
          
          const result = await apiCall('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
          });
          
          if (result.token) {
            token = result.token;
            localStorage.setItem('token', token);
            currentUser = result.user;
            showMainApp();
          } else {
            alert(result.error || 'Login failed');
          }
        }

        async function register() {
          const username = document.getElementById('register-username').value;
          const password = document.getElementById('register-password').value;
          
          const result = await apiCall('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
          });
          
          if (result.success) {
            alert('Registration successful! Please login.');
            showLoginForm();
          } else {
            alert(result.error || 'Registration failed');
          }
        }

        function showLoginForm() {
          document.getElementById('login-section').classList.remove('hidden');
          document.getElementById('register-section').classList.add('hidden');
          document.getElementById('main-app').classList.add('hidden');
        }

        function showRegisterForm() {
          document.getElementById('login-section').classList.add('hidden');
          document.getElementById('register-section').classList.remove('hidden');
          document.getElementById('main-app').classList.add('hidden');
        }

        async function showMainApp() {
          document.getElementById('login-section').classList.add('hidden');
          document.getElementById('register-section').classList.add('hidden');
          document.getElementById('main-app').classList.remove('hidden');
          
          document.getElementById('username').textContent = currentUser.username;
          document.getElementById('logout').classList.remove('hidden');
          
          if (currentUser.is_admin) {
            document.getElementById('admin-panel').classList.remove('hidden');
          }
          
          await fetchTracks();
        }

        function logout() {
          token = null;
          currentUser = null;
          localStorage.removeItem('token');
          showLoginForm();
        }

        async function fetchTracks() {
          const result = await apiCall('/api/tracks');
          if (result.tracks) {
            state.tracks = result.tracks;
            renderList();
            if (state.tracks.length > 0) {
              loadTrack(0);
            }
          }
        }

        function renderList() {
          els.tracks.innerHTML = '';
          state.tracks.forEach((t, i) => {
            const div = document.createElement('div');
            div.className = 'track' + (i === state.current ? ' active' : '');
            div.innerHTML = \`
              <div class="meta">
                <div class="title">\${t.title}</div>
                <div class="artist">\${t.artist}</div>
              </div>
              <div class="badge">\${t.duration}s</div>
            \`;
            div.onclick = () => { state.current = i; loadTrack(i, true); };
            els.tracks.appendChild(div);
          });
        }

        function loadTrack(idx, autoplay) {
          const t = state.tracks[idx];
          if (!t) return;
          
          state.current = idx;
          els.title.textContent = t.title;
          els.artist.textContent = t.artist;
          audio.src = \`/api/stream/\${t.id}\`;
          audio.currentTime = 0;
          els.duration.textContent = t.duration ? fmt(t.duration) : '0:00';
          els.seek.value = 0;
          els.status.textContent = 'Loaded ' + t.title;
          
          // Set cover image
          if (t.cover_filename) {
            els.albumArt.style.backgroundImage = \`url(/api/cover/\${t.id})\`;
          } else {
            els.albumArt.style.backgroundImage = '';
          }
          
          renderList();
          if (autoplay) play();
        }

        function play() {
          const t = state.tracks[state.current];
          if (!t) return;
          audio.play();
          state.playing = true;
          els.play.textContent = 'Pause';
          els.status.textContent = 'Playing ' + t.title;
          sendEvent('play', t.id);
        }

        function pause() {
          audio.pause();
          state.playing = false;
          els.play.textContent = 'Play';
          els.status.textContent = 'Paused';
        }

        function next() {
          const t = state.tracks[state.current];
          if (state.shuffle) {
            state.current = Math.floor(Math.random() * state.tracks.length);
          } else {
            state.current = (state.current + 1) % state.tracks.length;
          }
          loadTrack(state.current, true);
          if (t) sendEvent('skip', t.id);
        }

        function prev() {
          state.current = (state.current - 1 + state.tracks.length) % state.tracks.length;
          loadTrack(state.current, true);
        }

        function toggleShuffle() {
          state.shuffle = !state.shuffle;
          els.shuffle.classList.toggle('active', state.shuffle);
        }

        function toggleMute() {
          audio.muted = !audio.muted;
          els.mute.classList.toggle('active', audio.muted);
          els.mute.textContent = audio.muted ? 'Muted' : 'Mute';
        }

        async function sendEvent(type, trackId) {
          await apiCall('/api/event', {
            method: 'POST',
            body: JSON.stringify({ type, trackId })
          });
        }

        async function uploadTrack() {
          const formData = new FormData();
          const title = document.getElementById('track-title-input').value;
          const artist = document.getElementById('artist-input').value;
          const musicFile = document.getElementById('music-file').files[0];
          const coverFile = document.getElementById('cover-file').files[0];
          
          if (!title || !artist || !musicFile) {
            alert('Please fill in all required fields');
            return;
          }
          
          formData.append('title', title);
          formData.append('artist', artist);
          formData.append('music', musicFile);
          if (coverFile) {
            formData.append('cover', coverFile);
          }
          
          try {
            const response = await fetch('/api/admin/upload', {
              method: 'POST',
              headers: {
                Authorization: \`Bearer \${token}\`
              },
              body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
              alert('Track uploaded successfully!');
              document.getElementById('upload-form').reset();
              await fetchTracks();
            } else {
              alert(result.error || 'Upload failed');
            }
          } catch (err) {
            alert('Upload failed: ' + err.message);
          }
        }

        audio.addEventListener('ended', next);
        audio.addEventListener('timeupdate', () => {
          if (audio.duration) {
            const pct = (audio.currentTime / audio.duration) * 100;
            els.seek.value = pct;
            els.current.textContent = fmt(audio.currentTime);
            els.duration.textContent = fmt(audio.duration);
          }
        });

        els.play.onclick = () => (state.playing ? pause() : play());
        els.next.onclick = next;
        els.prev.onclick = prev;
        els.shuffle.onclick = toggleShuffle;
        els.mute.onclick = toggleMute;
        els.seek.oninput = (e) => {
          if (!audio.duration) return;
          const pct = Number(e.target.value) / 100;
          audio.currentTime = pct * audio.duration;
        };

        document.getElementById('login-btn').onclick = login;
        document.getElementById('register-btn').onclick = showRegisterForm;
        document.getElementById('register-submit').onclick = register;
        document.getElementById('back-to-login').onclick = showLoginForm;
        document.getElementById('logout').onclick = logout;
        document.getElementById('upload-form').onsubmit = (e) => {
          e.preventDefault();
          uploadTrack();
        };

        // Handle enter key on login forms
        document.getElementById('login-password').onkeypress = (e) => {
          if (e.key === 'Enter') login();
        };
        document.getElementById('register-password').onkeypress = (e) => {
          if (e.key === 'Enter') register();
        };

        // Initialize app
        if (token) {
          apiCall('/api/auth/verify').then(result => {
            if (result.user) {
              currentUser = result.user;
              showMainApp();
            } else {
              logout();
            }
          });
        } else {
          showLoginForm();
        }
      </script>
    </body>
  </html>
  `;

  return html;
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (_) {
        resolve({});
      }
    });
  });
}

function parseMultipart(req, uploadHandler) {
  return new Promise((resolve, reject) => {
    uploadHandler(req, {}, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = url.pathname;
  metrics.requests += 1;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return sendText(res, 200, 'OK');
  }

  // Serve main page
  if (req.method === 'GET' && pathname === '/') {
    return sendHtml(res, renderIndexPage());
  }

  // Authentication endpoints
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const { username, password } = await parseJsonBody(req);
    
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
      if (err || !user) {
        return sendJson(res, 401, { error: 'Invalid credentials' });
      }
      
      if (bcrypt.compareSync(password, user.password)) {
        const token = jwt.sign(
          { id: user.id, username: user.username, is_admin: user.is_admin },
          jwtSecret,
          { expiresIn: '24h' }
        );
        
        sendJson(res, 200, {
          token,
          user: { id: user.id, username: user.username, is_admin: user.is_admin }
        });
      } else {
        sendJson(res, 401, { error: 'Invalid credentials' });
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const { username, password } = await parseJsonBody(req);
    
    if (!username || !password) {
      return sendJson(res, 400, { error: 'Username and password required' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', 
      [username, hashedPassword], function(err) {
        if (err) {
          return sendJson(res, 400, { error: 'Username already exists' });
        }
        sendJson(res, 200, { success: true });
      });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/auth/verify') {
    const token = getTokenFromRequest(req);
    const decoded = verifyToken(token);
    
    if (decoded) {
      db.get('SELECT id, username, is_admin FROM users WHERE id = ?', [decoded.id], (err, user) => {
        if (user) {
          sendJson(res, 200, { user });
        } else {
          sendJson(res, 401, { error: 'User not found' });
        }
      });
    } else {
      sendJson(res, 401, { error: 'Invalid token' });
    }
    return;
  }

  // Protected routes - require authentication
  const protectedRoutes = ['/api/tracks', '/api/event', '/api/stream/', '/api/cover/', '/api/admin/'];
  const isProtected = protectedRoutes.some(route => pathname.startsWith(route));
  
  if (isProtected) {
    const token = getTokenFromRequest(req);
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return sendJson(res, 401, { error: 'Authentication required' });
    }
    
    req.user = decoded;
  }

  // Get tracks
  if (req.method === 'GET' && pathname === '/api/tracks') {
    db.all('SELECT * FROM tracks ORDER BY created_at DESC', (err, tracks) => {
      if (err) {
        return sendJson(res, 500, { error: 'Database error' });
      }
      sendJson(res, 200, { tracks, env: appEnv, release });
    });
    return;
  }

  // Stream music
  if (req.method === 'GET' && pathname.startsWith('/api/stream/')) {
    const trackId = pathname.split('/')[3];
    
    db.get('SELECT filename FROM tracks WHERE id = ?', [trackId], (err, track) => {
      if (err || !track) {
        return sendJson(res, 404, { error: 'Track not found' });
      }
      
      const filePath = path.join(musicDir, track.filename);
      sendFile(res, filePath, 'audio/mpeg');
    });
    return;
  }

  // Get cover image
  if (req.method === 'GET' && pathname.startsWith('/api/cover/')) {
    const trackId = pathname.split('/')[3];
    
    db.get('SELECT cover_filename FROM tracks WHERE id = ?', [trackId], (err, track) => {
      if (err || !track || !track.cover_filename) {
        return sendJson(res, 404, { error: 'Cover not found' });
      }
      
      const filePath = path.join(coversDir, track.cover_filename);
      sendFile(res, filePath, 'image/jpeg');
    });
    return;
  }

  // Event tracking
  if (req.method === 'POST' && pathname === '/api/event') {
    const payload = await parseJsonBody(req);
    if (payload.type === 'play') metrics.plays += 1;
    if (payload.type === 'skip') metrics.skips += 1;
    return sendJson(res, 200, { ok: true });
  }

  // Admin upload
  if (req.method === 'POST' && pathname === '/api/admin/upload') {
    if (!req.user.is_admin) {
      return sendJson(res, 403, { error: 'Admin access required' });
    }

    try {
      await parseMultipart(req, upload.fields([
        { name: 'music', maxCount: 1 },
        { name: 'cover', maxCount: 1 }
      ]));

      const trackId = uuidv4();
      const title = req.body.title;
      const artist = req.body.artist;
      const musicFile = req.files.music ? req.files.music[0] : null;
      const coverFile = req.files.cover ? req.files.cover[0] : null;

      if (!title || !artist || !musicFile) {
        return sendJson(res, 400, { error: 'Missing required fields' });
      }

      db.run(`INSERT INTO tracks (id, title, artist, filename, cover_filename, uploaded_by) 
              VALUES (?, ?, ?, ?, ?, ?)`, 
        [trackId, title, artist, musicFile.filename, 
         coverFile ? coverFile.filename : null, req.user.id], 
        function(err) {
          if (err) {
            return sendJson(res, 500, { error: 'Database error' });
          }
          metrics.uploads += 1;
          sendJson(res, 200, { success: true, trackId });
        });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  // Health endpoints
  if (pathname === '/healthz') {
    return sendText(res, 200, 'ok');
  }

  if (pathname === '/readyz') {
    return sendText(res, 200, 'ready');
  }

  // Metrics endpoint
  if (pathname === '/metrics') {
    const uptimeSeconds = ((Date.now() - startedAt) / 1000).toFixed(0);
    const metricsText = [
      `app_requests_total ${metrics.requests}`,
      `app_track_plays_total ${metrics.plays}`,
      `app_track_skips_total ${metrics.skips}`,
      `app_track_uploads_total ${metrics.uploads}`,
      `app_uptime_seconds ${uptimeSeconds}`
    ].join('\n');
    return sendText(res, 200, metricsText, { 'Content-Type': 'text/plain; version=0.0.4' });
  }

  return sendJson(res, 404, { error: 'not found', path: pathname });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  db.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

server.listen(port, () => {
  console.log(`Server listening on port ${port} (env=${appEnv}, release=${release})`);
  console.log(`Admin login: ${adminUsername}/${adminPassword}`);
});
