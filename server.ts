import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer as createHTTPServer } from 'http';
import { Server } from 'socket.io';
import { Client } from 'ssh2';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createTransport } from 'nodemailer';
import winston from 'winston';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'webterminal-pro-super-secret-key-change-in-production';
const PORT = parseInt(process.env.PORT || '3001');
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3001';

// Winston Logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

if (!fs.existsSync('logs')) fs.mkdirSync('logs');

// Rate Limiter
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Email transporter for notifications (optional)
const transporter = createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
}, { from: process.env.SMTP_FROM || 'noreply@webterminal' });

function setupDB() {
  const dbDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
  
  const db = new Database(path.join(dbDir, 'webterminal.db'));

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'operator',
      twofa_secret TEXT,
      twofa_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT,
      host TEXT,
      port TEXT,
      username TEXT,
      authType TEXT,
      password TEXT,
      privateKey TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shared_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER,
      session_id TEXT,
      target_user_id INTEGER,
      share_token TEXT UNIQUE,
      mode TEXT DEFAULT 'view',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(owner_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS session_recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id TEXT,
      filename TEXT,
      duration INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'operator'"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN twofa_secret TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN twofa_enabled INTEGER DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch (e) {}
  
  return db;
}

async function startServer() {
  const db = setupDB();
  const app = express();
  const httpServer = createHTTPServer(app);
  
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(limiter);

  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, { ip: req.ip });
    next();
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // --- REST API ROUTES ---
  
  // Permission definitions
  const PERMISSIONS = {
    admin: ['*'],
    operator: ['ssh.connect', 'ssh.execute', 'sftp.*', 'docker.*', 'ai.*', 'net.*', 'db.query'],
    viewer: ['ssh.connect', 'ssh.execute']
  };

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  // Role check middleware
  const requireRole = (...roles: string[]) => {
    return (req: any, res: any, next: any) => {
      const userRole = req.user.role || 'viewer';
      if (!roles.includes(userRole) && userRole !== 'admin') {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      next();
    };
  };

  // Generate TOTP secret
  const generateTOTPSecret = () => {
    return crypto.randomBytes(20).toString('hex');
  };

  // Verify TOTP code
  const verifyTOTP = (secret: string, code: string): boolean => {
    const time = Math.floor(Date.now() / 30000);
    for (let i = -1; i <= 1; i++) {
      const t = time + i;
      const counter = t.toString(16).padStart(16, '0');
      const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex'));
      hmac.update(Buffer.from(counter, 'hex'));
      const hash = hmac.digest('hex');
      const offset = parseInt(hash.substring(hash.length - 1), 16);
      const binary = parseInt(hash.substring(offset * 2, offset * 2 + 8), 16) & 0x7fffffff;
      const otp = binary % 1000000;
      if (otp.toString().padStart(6, '0') === code) return true;
    }
    return false;
  };

  app.post('/api/auth/register', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const userRole = role || 'operator';
      const stmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
      const result = stmt.run(username, hashedPassword, userRole);
      const token = jwt.sign({ id: result.lastInsertRowid, username, role: userRole }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: result.lastInsertRowid, username, role: userRole } });
    } catch (err: any) {
      if (err.message.includes('UNIQUE')) res.status(400).json({ error: 'Username already exists' });
      else res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { username, password, totpCode } = req.body;
    try {
      const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
      const user = stmt.get(username) as any;
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });
      
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

      if (user.twofa_enabled && user.twofa_secret) {
        if (!totpCode || !verifyTOTP(user.twofa_secret, totpCode)) {
          return res.status(401).json({ error: 'Invalid 2FA code', requires2FA: true });
        }
      }
      
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, username: user.username, role: user.role, twofa_enabled: !!user.twofa_enabled } });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/auth/2fa/setup', authenticate, async (req: any, res) => {
    try {
      const secret = generateTOTPSecret();
      db.prepare('UPDATE users SET twofa_secret = ? WHERE id = ?').run(secret, req.user.id);
      const otpauth = `otpauth://totp/WebTerminal:${req.user.username}?secret=${secret}&issuer=WebTerminal`;
      res.json({ secret, otpauth });
    } catch (err) {
      res.status(500).json({ error: 'Failed to setup 2FA' });
    }
  });

  app.post('/api/auth/2fa/enable', authenticate, async (req: any, res) => {
    const { code } = req.body;
    try {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
      if (!user || !user.twofa_secret) return res.status(400).json({ error: '2FA not setup' });
      if (!verifyTOTP(user.twofa_secret, code)) return res.status(400).json({ error: 'Invalid code' });
      db.prepare('UPDATE users SET twofa_enabled = 1 WHERE id = ?').run(req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to enable 2FA' });
    }
  });

  app.post('/api/auth/2fa/disable', authenticate, async (req: any, res) => {
    const { code } = req.body;
    try {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
      if (!user || !user.twofa_secret) return res.status(400).json({ error: '2FA not enabled' });
      if (!verifyTOTP(user.twofa_secret, code)) return res.status(400).json({ error: 'Invalid code' });
      db.prepare('UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?').run(req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to disable 2FA' });
    }
  });

  app.get('/api/auth/me', authenticate, (req: any, res: any) => {
    try {
      const user = db.prepare('SELECT id, username, role, twofa_enabled, created_at FROM users WHERE id = ?').get(req.user.id);
      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/profiles', authenticate, (req: any, res: any) => {
    try {
      const stmt = db.prepare('SELECT id, name, host, port, username, authType, password, privateKey FROM profiles WHERE user_id = ?');
      const profiles = stmt.all(req.user.id);
      res.json(profiles);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/profiles', authenticate, (req: any, res: any) => {
    const { name, host, port, username, authType, password, privateKey } = req.body;
    try {
      const stmt = db.prepare('INSERT INTO profiles (user_id, name, host, port, username, authType, password, privateKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const result = stmt.run(req.user.id, name, host, port, username, authType, password, privateKey);
      res.json({ id: result.lastInsertRowid, name, host, port, username, authType, password, privateKey });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.delete('/api/profiles/:id', authenticate, (req: any, res: any) => {
    try {
      const stmt = db.prepare('DELETE FROM profiles WHERE id = ? AND user_id = ?');
      stmt.run(req.params.id, req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/audit-logs', authenticate, (req: any, res: any) => {
    try {
      const logs = db.prepare('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50').all(req.user.id);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // Admin routes - User Management
  app.get('/api/admin/users', authenticate, (req: any, res: any) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    try {
      const users = db.prepare('SELECT id, username, role, twofa_enabled, created_at FROM users').all();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.put('/api/admin/users/:id/role', authenticate, (req: any, res: any) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { role } = req.body;
    if (!['admin', 'operator', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    try {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.delete('/api/admin/users/:id', authenticate, (req: any, res: any) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/admin/stats', authenticate, (req: any, res: any) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    try {
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
      const serverCount = db.prepare('SELECT COUNT(*) as count FROM profiles').get();
      const logCount = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get();
      const recentLogs = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10').all();
      res.json({
        users: userCount.count,
        servers: serverCount.count,
        totalLogs: logCount.count,
        recentActivity: recentLogs
      });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // --- SOCKET.IO ---
  const io = new Server(httpServer, {
    cors: { 
      origin: CORS_ORIGIN,
      credentials: true
    },
    maxHttpBufferSize: 1e8
  });

  // Socket Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.data.user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const sshSessions = new Map<string, { client: Client, stream: any, sftp: any, statsInterval: any, currentSftpPath: string, userId?: number, role?: string, recording?: { chunks: {t: number, d: any}[], startTime: number }, sharedWith?: string[] }>();

    const refreshSftp = (sessionId: string) => {
      const session = sshSessions.get(sessionId);
      if (session && session.sftp && session.currentSftpPath) {
        session.sftp.readdir(session.currentSftpPath, (err: any, list: any[]) => {
          if (!err) {
            const serializedList = list.map((item: any) => ({
              filename: item.filename,
              isDirectory: item.attrs.isDirectory(),
              size: item.attrs.size
            }));
            socket.emit(`sftp-list-${sessionId}`, { path: session.currentSftpPath, list: serializedList });
          }
        });
      }
    };

    socket.on('ssh-connect', (config) => {
      const { sessionId, host, port, username, password, privateKey } = config;
      const sshClient = new Client();
      
      sshSessions.set(sessionId, { client: sshClient, stream: null, sftp: null, statsInterval: null, currentSftpPath: '.', userId: socket.data.user?.id });

      sshClient.on('ready', () => {
        if (socket.data.user && socket.data.user.id) {
          db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(socket.data.user.id, 'SSH_CONNECT', `Connected to ${username}@${host}:${port || 22}`);
        }
        socket.emit(`ssh-ready-${sessionId}`);
        
        sshClient.shell({ term: 'xterm-256color' }, (err, stream) => {
          if (err) {
            socket.emit(`ssh-error-${sessionId}`, err.message);
            return;
          }
          const session = sshSessions.get(sessionId);
          if (session) session.stream = stream;
          
          stream.on('data', (data: Buffer) => socket.emit(`ssh-data-${sessionId}`, data.toString('utf-8')));
          stream.on('close', () => {
            sshClient.end();
          });
        });

        sshClient.sftp((err, sftp) => {
          if (!err) {
            const session = sshSessions.get(sessionId);
            if (session) {
              session.sftp = sftp;
              sftp.realpath('.', (errRP, absPath) => {
                session.currentSftpPath = absPath || '.';
                refreshSftp(sessionId);
              });
            }
          }
        });

        const statsInterval = setInterval(() => {
          sshClient.exec("uptime && echo '---' && free -m", (err, stream) => {
            if (err) return;
            let out = '';
            stream.on('data', (d: Buffer) => out += d.toString());
            stream.on('close', () => socket.emit(`ssh-stats-${sessionId}`, out));
          });
        }, 5000);

        const session = sshSessions.get(sessionId);
        if (session) session.statsInterval = statsInterval;

      }).on('error', (err) => {
        socket.emit(`ssh-error-${sessionId}`, err.message);
      }).on('close', () => {
        socket.emit(`ssh-close-${sessionId}`);
        const session = sshSessions.get(sessionId);
        if (session && session.statsInterval) clearInterval(session.statsInterval);
        sshSessions.delete(sessionId);
      }).connect({
        host,
        port: port || 22,
        username,
        password,
        privateKey,
        readyTimeout: 10000,
      });
    });

    socket.on('ssh-data', ({ sessionId, data }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.stream) session.stream.write(data);
    });

    socket.on('ssh-resize', ({ sessionId, rows, cols, height, width }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.stream) session.stream.setWindow(rows, cols, height, width);
    });

    socket.on('sftp-list', ({ sessionId, path: targetPath }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.sftp) {
        session.sftp.realpath(targetPath || '.', (errRP: any, absPath: string) => {
          session.currentSftpPath = absPath || targetPath || '.';
          refreshSftp(sessionId);
        });
      }
    });

    socket.on('sftp-mkdir', ({ sessionId, path }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.sftp) {
        session.sftp.mkdir(path, (err: any) => {
          if (err) socket.emit(`sftp-error-${sessionId}`, err.message);
          else refreshSftp(sessionId);
        });
      }
    });

    socket.on('sftp-delete', ({ sessionId, path, isDirectory }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.sftp) {
        const cb = (err: any) => {
          if (err) socket.emit(`sftp-error-${sessionId}`, err.message);
          else refreshSftp(sessionId);
        };
        if (isDirectory) session.sftp.rmdir(path, cb);
        else session.sftp.unlink(path, cb);
      }
    });

    socket.on('sftp-rename', ({ sessionId, oldPath, newPath }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.sftp) {
        session.sftp.rename(oldPath, newPath, (err: any) => {
          if (err) socket.emit(`sftp-error-${sessionId}`, err.message);
          else refreshSftp(sessionId);
        });
      }
    });

    socket.on('sftp-read', ({ sessionId, path }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.sftp) {
        session.sftp.readFile(path, 'utf8', (err: any, data: string) => {
          if (err) socket.emit(`sftp-error-${sessionId}`, err.message);
          else socket.emit(`sftp-read-content-${sessionId}`, { path, content: data });
        });
      }
    });

    socket.on('sftp-write', ({ sessionId, path, content }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.sftp) {
        session.sftp.writeFile(path, content, 'utf8', (err: any) => {
          if (err) socket.emit(`sftp-error-${sessionId}`, err.message);
          else {
            socket.emit(`sftp-write-success-${sessionId}`, { path });
            refreshSftp(sessionId);
          }
        });
      }
    });

    socket.on('sftp-download', ({ sessionId, path, filename }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.sftp) {
        session.sftp.readFile(path, (err: any, data: Buffer) => {
          if (err) socket.emit(`sftp-error-${sessionId}`, err.message);
          else socket.emit(`sftp-download-${sessionId}`, { filename, data });
        });
      }
    });

    socket.on('sftp-upload', ({ sessionId, path, data }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.sftp) {
        session.sftp.writeFile(path, data, (err: any) => {
          if (err) socket.emit(`sftp-error-${sessionId}`, err.message);
          else {
            if (session.userId) {
              db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(session.userId, 'SFTP_UPLOAD', `Uploaded file to ${path}`);
            }
            refreshSftp(sessionId);
          }
        });
      }
    });

    socket.on('docker-list', ({ sessionId }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.client) {
        session.client.exec('docker ps -a --format \'{{json .}}\'', (err: any, stream: any) => {
          if (err) return socket.emit(`docker-error-${sessionId}`, err.message);
          let data = '';
          stream.on('data', (chunk: any) => data += chunk.toString());
          stream.on('close', () => {
            try {
              const containers = data.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
              socket.emit(`docker-list-${sessionId}`, containers);
            } catch (e) {
              socket.emit(`docker-error-${sessionId}`, 'Failed to parse Docker output. Is Docker installed?');
            }
          });
        });
      }
    });

    socket.on('docker-action', ({ sessionId, action, containerId }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.client) {
        const validActions = ['start', 'stop', 'restart', 'rm'];
        if(!validActions.includes(action)) return;
        
        const cmd = action === 'rm' ? `docker rm -f ${containerId}` : `docker ${action} ${containerId}`;
        session.client.exec(cmd, (err: any, stream: any) => {
          if (err) return socket.emit(`docker-error-${sessionId}`, err.message);
          stream.on('close', () => {
             socket.emit(`docker-action-success-${sessionId}`);
          });
        });
      }
    });

    socket.on('ai-ask', async ({ sessionId, prompt }) => {
      socket.emit(`ai-error-${sessionId}`, { error: 'AI feature is disabled. Please set GEMINI_API_KEY environment variable.' });
    });

    socket.on('net-ping', ({ sessionId, target }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.client) {
        session.client.exec(`ping -c 4 ${target}`, (err: any, stream: any) => {
          if (err) return socket.emit(`net-error-${sessionId}`, err.message);
          let data = '';
          stream.on('data', (chunk: any) => data += chunk.toString());
          stream.on('close', () => {
             socket.emit(`net-ping-result-${sessionId}`, data);
          });
        });
      }
    });

    socket.on('net-port-scan', ({ sessionId, target, port }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.client) {
        session.client.exec(`nc -zv -w 2 ${target} ${port} 2>&1`, (err: any, stream: any) => {
          if (err) return socket.emit(`net-error-${sessionId}`, err.message);
          let data = '';
          stream.on('data', (chunk: any) => data += chunk.toString());
          stream.on('close', () => {
             socket.emit(`net-port-result-${sessionId}`, data);
          });
        });
      }
    });

    socket.on('ssh-close-request', ({ sessionId }) => {
      const session = sshSessions.get(sessionId);
      if (session) {
        if (session.statsInterval) clearInterval(session.statsInterval);
        if (session.recording) {
          const duration = Date.now() - session.recording.startTime;
          db.prepare('INSERT INTO session_recordings (user_id, session_id, filename, duration) VALUES (?, ?, ?, ?)').run(
            session.userId, sessionId, `recording_${sessionId}.json`, duration
          );
        }
        session.client.end();
        sshSessions.delete(sessionId);
      }
    });

    // Session Recording
    socket.on('recording-start', ({ sessionId }) => {
      const session = sshSessions.get(sessionId);
      if (session) {
        session.recording = { chunks: [], startTime: Date.now() };
        socket.emit(`recording-started-${sessionId}`);
      }
    });

    socket.on('recording-stop', ({ sessionId }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.recording) {
        const recordingData = JSON.stringify(session.recording.chunks);
        const duration = Date.now() - session.recording.startTime;
        const filename = `recording_${sessionId}_${Date.now()}.json`;
        fs.writeFileSync(path.join(process.cwd(), 'data', 'recordings', filename), recordingData);
        db.prepare('INSERT INTO session_recordings (user_id, session_id, filename, duration) VALUES (?, ?, ?, ?)').run(
          session.userId, sessionId, filename, duration
        );
        session.recording = undefined;
        socket.emit(`recording-stopped-${sessionId}`, { filename, duration });
      }
    });

    socket.on('recording-data', ({ sessionId, data }) => {
      const session = sshSessions.get(sessionId);
      if (session && session.recording) {
        session.recording.chunks.push({ t: Date.now() - session.recording.startTime, d: data });
      }
    });

    // Session Sharing
    socket.on('share-session', ({ sessionId, targetUsername, mode }) => {
      const session = sshSessions.get(sessionId);
      if (!session) return;
      
      const targetUser = db.prepare('SELECT id FROM users WHERE username = ?').get(targetUsername) as any;
      if (!targetUser) {
        socket.emit(`share-error-${sessionId}`, 'User not found');
        return;
      }

      const shareToken = crypto.randomBytes(16).toString('hex');
      db.prepare('INSERT INTO shared_sessions (owner_id, session_id, target_user_id, share_token, mode) VALUES (?, ?, ?, ?, ?)').run(
        socket.data.user.id, sessionId, targetUser.id, shareToken, mode || 'view'
      );

      if (!session.sharedWith) session.sharedWith = [];
      session.sharedWith.push(targetUsername);

      socket.emit(`share-success-${sessionId}`, { token: shareToken, mode });
    });

    socket.on('join-shared-session', ({ token }) => {
      const share = db.prepare('SELECT * FROM shared_sessions WHERE share_token = ?').get(token) as any;
      if (!share) {
        socket.emit('join-error', 'Invalid share token');
        return;
      }

      socket.join(`shared_${share.session_id}`);
      socket.emit('joined-shared-session', { sessionId: share.session_id, mode: share.mode });
    });

    // Broadcast command to multiple sessions
    socket.on('broadcast-command', ({ sessionIds, command }) => {
      sessionIds.forEach((sid: string) => {
        const session = sshSessions.get(sid);
        if (session && session.stream) {
          session.stream.write(command + '\n');
        }
      });
    });

    // Database Client (MySQL/PostgreSQL)
    socket.on('db-connect', async ({ sessionId, dbType, host, port, username, password, database }) => {
      socket.emit(`db-error-${sessionId}`, 'Database connections are simulated. Install mysql2 or pg package for real connections.');
    });

    socket.on('db-query', async ({ sessionId, query }) => {
      socket.emit(`db-result-${sessionId}`, { 
        columns: ['id', 'name', 'status'],
        rows: [{ id: 1, name: 'Sample', status: 'active' }],
        message: 'Database query simulated. Install mysql2 or pg package for real connections.'
      });
    });

    // SSH Tunnel Management
    socket.on('tunnel-create', ({ sessionId, type, localPort, remoteHost, remotePort }) => {
      const session = sshSessions.get(sessionId);
      if (!session || !session.client) {
        socket.emit(`tunnel-error-${sessionId}`, 'No SSH session');
        return;
      }

      const local = type === 'local' ? localPort : 0;
      const host = type === 'local' ? remoteHost : '127.0.0.1';
      const port = type === 'local' ? remotePort : localPort;

      session.client.forwardOut(`127.0.0.1`, local, host, port, (err, stream) => {
        if (err) {
          socket.emit(`tunnel-error-${sessionId}`, err.message);
          return;
        }
        socket.emit(`tunnel-created-${sessionId}`, { localPort: local, type });
      });
    });

    // Get recordings list
    socket.on('get-recordings', () => {
      try {
        const recordings = db.prepare('SELECT * FROM session_recordings WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20').all(socket.data.user.id);
        socket.emit('recordings-list', recordings);
      } catch (err) {
        socket.emit('recordings-error', 'Failed to fetch recordings');
      }
    });

    socket.on('disconnect', () => {
      sshSessions.forEach(session => {
        if (session.statsInterval) clearInterval(session.statsInterval);
        session.client.end();
      });
      sshSessions.clear();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`WebTerminal Pro started on port ${PORT}`, { env: NODE_ENV });
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔒 Environment: ${NODE_ENV}`);
  });
}

startServer();
