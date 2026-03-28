import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { io, Socket } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import { 
  Terminal as TerminalIcon, Server, Key, User, Lock, Loader2, LogOut, 
  AlertCircle, Plus, X, Folder, FileText, Activity, Play, Save, Trash2,
  ChevronLeft, Palette, Command, Download, Upload, Edit2, FolderPlus,
  Columns, Maximize, Shield, Code, Box, RefreshCw, Square, Power,
  Bot, Network, Send, FileClock, Share2, Users, Eye, Edit3, Wifi,
  Database, List, Keyboard, Sun, Moon, Video, PlayCircle, Hash,
  Globe, Clock, Filter, Search, Copy, Check, QrCode, Settings,
  GripVertical, History, Bell, Minus, AlertTriangle
} from 'lucide-react';
import 'xterm/css/xterm.css';

// Types
type SftpFile = { filename: string; isDirectory: boolean; size: number };
type DockerContainer = { ID: string; Image: string; Command: string; CreatedAt: string; RunningFor: string; Ports: string; Status: string; Size: string; Names: string; State: string };
type AIChatMessage = { role: 'user' | 'ai'; text: string };
type AuditLog = { id: number; action: string; details: string; timestamp: string };
type Recording = { id: number; session_id: string; filename: string; duration: number; timestamp: string };
type ConnectionHistory = { host: string; username: string; port: string; timestamp: number };
type Session = { 
  id: string; 
  server: any; 
  connected: boolean; 
  error?: string; 
  stats?: string; 
  files?: SftpFile[]; 
  currentPath: string;
  editingFile?: { path: string; content: string; originalContent: string };
  activeView?: 'terminal' | 'editor';
  dockerContainers?: DockerContainer[];
  activeRightPanel?: 'sftp' | 'docker' | 'ai' | 'net' | 'logs' | 'share' | 'recordings' | 'db' | 'broadcast';
  aiChat?: AIChatMessage[];
  netResult?: string;
  auditLogs?: AuditLog[];
  isRecording?: boolean;
  sharedMode?: 'view' | 'interactive';
};
type CustomCommand = { id: string; name: string; command: string };
type Settings = { fontSize: number; cursorStyle: 'block' | 'underline' | 'bar'; scrollback: number };

const THEMES = {
  default: { background: '#0f172a', foreground: '#f8fafc', cursor: '#3b82f6', selectionBackground: '#1e293b' },
  matrix: { background: '#000000', foreground: '#00ff00', cursor: '#00ff00', selectionBackground: '#003300' },
  dracula: { background: '#282a36', foreground: '#f8f8f2', cursor: '#ff79c6', selectionBackground: '#44475a' }
};

type UIMode = 'dark' | 'light';

// Terminal Component
const TerminalInstance = ({ session, socket, isActive, theme, settings }: { session: Session, socket: Socket | null, isActive: boolean, theme: keyof typeof THEMES, settings: Settings }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current || !socket) return;

    const term = new XTerminal({
      cursorBlink: true,
      theme: THEMES[theme],
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: settings.fontSize,
      cursorStyle: settings.cursorStyle,
      scrollback: settings.scrollback,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      socket.emit('ssh-data', { sessionId: session.id, data });
    });

    const handleResize = () => {
      fitAddon.fit();
      socket.emit('ssh-resize', {
        sessionId: session.id,
        rows: term.rows,
        cols: term.cols,
        width: terminalRef.current?.clientWidth,
        height: terminalRef.current?.clientHeight
      });
    };

    window.addEventListener('resize', handleResize);
    
    const dataHandler = (data: string) => term.write(data);
    socket.on(`ssh-data-${session.id}`, dataHandler);

    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.off(`ssh-data-${session.id}`, dataHandler);
      term.dispose();
    };
  }, [session.id, socket]);

  useEffect(() => {
    if (xtermRef.current) xtermRef.current.options.theme = THEMES[theme];
  }, [theme]);

  useEffect(() => {
    if (isActive && fitAddonRef.current) setTimeout(() => fitAddonRef.current?.fit(), 50);
  }, [isActive]);

  return (
    <div className={`w-full h-full ${isActive ? 'block' : 'hidden'}`}>
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
};

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('webssh_token'));
  const [user, setUser] = useState<any>(null);
  
  const [socket, setSocket] = useState<Socket | null>(null);
  const [savedServers, setSavedServers] = useState<any[]>([]);
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showNewConnection, setShowNewConnection] = useState(true);
  const [theme, setTheme] = useState<keyof typeof THEMES>('default');
  const [splitMode, setSplitMode] = useState(false);

  // Form states
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('root');
  const [authType, setAuthType] = useState<'password' | 'key'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [serverName, setServerName] = useState('');
  
  const [cmdName, setCmdName] = useState('');
  const [cmdValue, setCmdValue] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [netTarget, setNetTarget] = useState('');
  const [netPort, setNetPort] = useState('');

  // Auth States
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [twoFASecret, setTwoFASecret] = useState('');
  const [pending2FAUser, setPending2FAUser] = useState<any>(null);

  // UI States
  const [uiMode, setUIMode] = useState<UIMode>('dark');

  // Share & Collaboration States
  const [shareUsername, setShareUsername] = useState('');
  const [shareMode, setShareMode] = useState<'view' | 'interactive'>('view');
  const [recordings, setRecordings] = useState<Recording[]>([]);

  // Broadcast States
  const [broadcastCommand, setBroadcastCommand] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);

  // Database Client States
  const [dbQuery, setDbQuery] = useState('');
  const [dbResult, setDbResult] = useState<any>(null);

  // Command Palette
  const [showPalette, setShowPalette] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    fontSize: 14,
    cursorStyle: 'block',
    scrollback: 1000
  });

  // Connection History
  const [connectionHistory, setConnectionHistory] = useState<ConnectionHistory[]>([]);

  // Notifications
  const [notifications, setNotifications] = useState<{id: number; message: string; type: 'info' | 'success' | 'error'}[]>([]);

  // Admin Panel
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState<any>(null);

  // Server Groups
  const [serverGroups, setServerGroups] = useState<{id: string; name: string; color: string}[]>([
    { id: 'production', name: 'Production', color: 'red' },
    { id: 'staging', name: 'Staging', color: 'yellow' },
    { id: 'development', name: 'Development', color: 'green' },
  ]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  // SSH Tunnels
  const [showTunnelModal, setShowTunnelModal] = useState(false);
  const [tunnels, setTunnels] = useState<{id: string; localPort: number; remoteHost: string; remotePort: number; active: boolean}[]>([]);

  // Import/Export
  const [showImportExport, setShowImportExport] = useState(false);

  // Session Playback
  const [showPlayback, setShowPlayback] = useState(false);
  const [playbackData, setPlaybackData] = useState<{t: number; d: string}[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const playbackRef = useRef<HTMLDivElement>(null);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Show notification helper
  const showNotification = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!token) return;
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette(true);
        return;
      }
      if (e.ctrlKey && e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 't':
            e.preventDefault();
            setShowNewConnection(true);
            break;
          case 'w':
            e.preventDefault();
            if (activeSessionId) {
              const session = sessions.find(s => s.id === activeSessionId);
              if (session) closeSession(session.id, {} as any);
            }
            break;
          case '\\':
            e.preventDefault();
            setSplitMode(!splitMode);
            break;
        }
      }
      if (e.key === 'F11') {
        e.preventDefault();
        document.documentElement.requestFullscreen?.();
      }
      if (e.key === 'Escape' && showPalette) {
        setShowPalette(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [token, activeSessionId, sessions, splitMode, showPalette]);

  // Initialize Socket & Data
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Fetch user & profiles
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.error) handleLogout();
        else setUser(data.user);
      });

    fetch('/api/profiles', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (!data.error) setSavedServers(data);
      })
      .finally(() => setIsLoading(false));

    const savedCmds = localStorage.getItem('webssh_commands');
    if (savedCmds) setCustomCommands(JSON.parse(savedCmds));

    const savedTheme = localStorage.getItem('webssh_theme');
    if (savedTheme && THEMES[savedTheme as keyof typeof THEMES]) setTheme(savedTheme as keyof typeof THEMES);

    const savedSettings = localStorage.getItem('webssh_settings');
    if (savedSettings) setSettings(JSON.parse(savedSettings));

    const savedHistory = localStorage.getItem('webssh_history');
    if (savedHistory) setConnectionHistory(JSON.parse(savedHistory));

    const newSocket = io({ auth: { token } });
    
    newSocket.on('connect_error', (err) => {
      if (err.message === 'Authentication error') handleLogout();
    });

    setSocket(newSocket);

    return () => { newSocket.close(); };
  }, [token]);

  // Playback effect
  useEffect(() => {
    if (!showPlayback || !playbackPlaying || playbackData.length === 0) return;
    
    const interval = setInterval(() => {
      if (playbackIndex < playbackData.length) {
        const chunk = playbackData[playbackIndex];
        if (playbackRef.current) {
          playbackRef.current.textContent += chunk.d;
        }
        setPlaybackIndex(prev => prev + 1);
      } else {
        setPlaybackPlaying(false);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [showPlayback, playbackPlaying, playbackData, playbackIndex]);

  // Save settings when they change
  useEffect(() => {
    localStorage.setItem('webssh_settings', JSON.stringify(settings));
  }, [settings]);

  // Save connection history when it changes
  useEffect(() => {
    localStorage.setItem('webssh_history', JSON.stringify(connectionHistory.slice(0, 20)));
  }, [connectionHistory]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword, totpCode: show2FA ? totpCode : undefined })
      });
      const data = await res.json();
      if (data.error) {
        if (data.requires2FA) {
          setPending2FAUser({ username: authUsername, password: authPassword });
          setShow2FA(true);
          setAuthError('Enter your 2FA code');
        } else {
          setAuthError(data.error);
        }
      } else {
        localStorage.setItem('webssh_token', data.token);
        setToken(data.token);
        setUser(data.user);
      }
    } catch (err) {
      setAuthError('Connection failed');
    }
  };

  const setup2FA = async () => {
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.secret) {
        setTwoFASecret(data.secret);
      }
    } catch (err) {
      alert('Failed to setup 2FA');
    }
  };

  const enable2FA = async (code: string) => {
    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success) {
        alert('2FA enabled successfully!');
        setUser({ ...user, twofa_enabled: true });
      } else {
        alert(data.error || 'Failed to enable 2FA');
      }
    } catch (err) {
      alert('Failed to enable 2FA');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('webssh_token');
    setToken(null);
    setUser(null);
    if (socket) socket.disconnect();
    setSessions([]);
  };

  const saveServer = async () => {
    if (!host || !username || !token) return;
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: serverName || host, host, port, username, authType, password, privateKey })
      });
      const newServer = await res.json();
      if (newServer.error) {
        alert('Error: ' + newServer.error);
      } else {
        setSavedServers([...savedServers, newServer]);
        setServerName('');
        alert('Server saved!');
      }
    } catch (err) {
      alert('Failed to save profile');
    }
  };

  const deleteServer = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    try {
      await fetch(`/api/profiles/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setSavedServers(savedServers.filter(s => s.id !== id));
    } catch (err) {
      alert('Failed to delete profile');
    }
  };

  const saveCommand = () => {
    if (!cmdName || !cmdValue) return;
    const newCmd = { id: Date.now().toString(), name: cmdName, command: cmdValue };
    const updated = [...customCommands, newCmd];
    setCustomCommands(updated);
    localStorage.setItem('webssh_commands', JSON.stringify(updated));
    setCmdName('');
    setCmdValue('');
  };

  const deleteCommand = (id: string) => {
    const updated = customCommands.filter(c => c.id !== id);
    setCustomCommands(updated);
    localStorage.setItem('webssh_commands', JSON.stringify(updated));
  };

  const connectToServer = (serverConfig: any) => {
    if (!socket) return;
    const sessionId = Date.now().toString();
    
    // Add to connection history
    setConnectionHistory(prev => [{
      host: serverConfig.host,
      username: serverConfig.username,
      port: serverConfig.port || '22',
      timestamp: Date.now()
    }, ...prev.filter(h => !(h.host === serverConfig.host && h.username === serverConfig.username)).slice(0, 19)]);

    setSessions(prev => [...prev, { id: sessionId, server: serverConfig, connected: false, currentPath: '.', activeView: 'terminal', activeRightPanel: 'sftp' }]);
    setActiveSessionId(sessionId);
    setShowNewConnection(false);

    socket.emit('ssh-connect', { sessionId, ...serverConfig });

    socket.on(`ssh-ready-${sessionId}`, () => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, connected: true, error: undefined } : s));
      socket.emit('docker-list', { sessionId });
    });

    socket.on(`ssh-error-${sessionId}`, (err) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, error: err } : s));
    });

    socket.on(`ssh-close-${sessionId}`, () => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, connected: false, error: 'Connection closed' } : s));
    });

    socket.on(`ssh-stats-${sessionId}`, (stats) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, stats } : s));
    });

    socket.on(`sftp-list-${sessionId}`, ({ path, list }) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, currentPath: path, files: list } : s));
    });

    socket.on(`sftp-error-${sessionId}`, (err) => {
      alert(`SFTP Error: ${err}`);
    });

    socket.on(`sftp-read-content-${sessionId}`, ({ path, content }) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, editingFile: { path, content, originalContent: content }, activeView: 'editor' } : s));
    });

    socket.on(`sftp-write-success-${sessionId}`, ({ path }) => {
      setSessions(prev => prev.map(s => s.id === sessionId && s.editingFile ? { ...s, editingFile: { ...s.editingFile, originalContent: s.editingFile.content } } : s));
    });

    socket.on(`sftp-download-${sessionId}`, ({ filename, data }) => {
      const blob = new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });

    socket.on(`docker-list-${sessionId}`, (containers) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, dockerContainers: containers } : s));
    });

    socket.on(`docker-error-${sessionId}`, (err) => {
      console.error(`Docker Error: ${err}`);
    });

    socket.on(`docker-action-success-${sessionId}`, () => {
      socket.emit('docker-list', { sessionId });
    });

    socket.on(`ai-response-${sessionId}`, ({ text }) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, aiChat: [...(s.aiChat || []), { role: 'ai', text }] } : s));
    });

    socket.on(`ai-error-${sessionId}`, ({ error }) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, aiChat: [...(s.aiChat || []), { role: 'ai', text: `Error: ${error}` }] } : s));
    });

    socket.on(`net-ping-result-${sessionId}`, (data) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, netResult: data } : s));
    });

    socket.on(`net-port-result-${sessionId}`, (data) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, netResult: data } : s));
    });

    socket.on(`net-error-${sessionId}`, (err) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, netResult: `Error: ${err}` } : s));
    });

    // Recording handlers
    socket.on(`recording-started-${sessionId}`, () => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isRecording: true } : s));
    });

    socket.on(`recording-stopped-${sessionId}`, ({ filename, duration }) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isRecording: false } : s));
      alert(`Recording saved: ${filename} (${Math.round(duration / 1000)}s)`);
    });

    // Share handlers
    socket.on(`share-success-${sessionId}`, ({ token, mode }) => {
      alert(`Session shared! Token: ${token} (${mode} mode)`);
    });

    socket.on(`share-error-${sessionId}`, (error) => {
      alert(`Share error: ${error}`);
    });

    // DB handlers
    socket.on(`db-result-${sessionId}`, (result) => {
      setDbResult(result);
    });

    socket.on(`db-error-${sessionId}`, (error) => {
      setDbResult({ error });
    });
  };

  const startRecording = (sessionId: string) => {
    socket?.emit('recording-start', { sessionId });
  };

  const stopRecording = (sessionId: string) => {
    socket?.emit('recording-stop', { sessionId });
  };

  const shareSession = (sessionId: string) => {
    if (!shareUsername.trim()) return;
    socket?.emit('share-session', { sessionId, targetUsername: shareUsername, mode: shareMode });
    setShareUsername('');
  };

  const joinSharedSession = (token: string) => {
    socket?.emit('join-shared-session', { token });
    socket?.on('joined-shared-session', ({ sessionId, mode }) => {
      alert(`Joined shared session in ${mode} mode`);
    });
  };

  const broadcastCommandExecute = () => {
    if (!broadcastCommand.trim() || selectedSessions.length === 0) return;
    socket?.emit('broadcast-command', { sessionIds: selectedSessions, command: broadcastCommand });
    setBroadcastCommand('');
  };

  const executeDbQuery = (sessionId: string) => {
    if (!dbQuery.trim()) return;
    socket?.emit('db-query', { sessionId, query: dbQuery });
  };

  const closeSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (socket) socket.emit('ssh-close-request', { sessionId });
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      if (remaining.length > 0) setActiveSessionId(remaining[0].id);
      else setShowNewConnection(true);
    }
  };

  const executeCommand = (cmd: string) => {
    if (socket && activeSessionId) {
      socket.emit('ssh-data', { sessionId: activeSessionId, data: cmd + '\n' });
    }
  };

  const navigateSftp = (sessionId: string, currentPath: string, target: string) => {
    if (!socket) return;
    const newPath = target === '..' ? currentPath.split('/').slice(0, -1).join('/') || '/' : `${currentPath}/${target}`;
    socket.emit('sftp-list', { sessionId, path: newPath });
  };

  const handleMkdir = () => {
    if(!activeSessionId || !socket) return;
    const s = sessions.find(x => x.id === activeSessionId);
    if(!s) return;
    const name = prompt('Enter new folder name:');
    if(name) socket.emit('sftp-mkdir', { sessionId: activeSessionId, path: `${s.currentPath}/${name}` });
  };

  const handleUpload = () => {
    if(!activeSessionId || !socket) return;
    const s = sessions.find(x => x.id === activeSessionId);
    if(!s) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        socket.emit('sftp-upload', { sessionId: activeSessionId, path: `${s.currentPath}/${file.name}`, data: ev.target?.result });
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  };

  const handleDownload = (f: SftpFile) => {
    if(!activeSessionId || !socket) return;
    const s = sessions.find(x => x.id === activeSessionId);
    if(s) socket.emit('sftp-download', { sessionId: activeSessionId, path: `${s.currentPath}/${f.filename}`, filename: f.filename });
  };

  const handleDelete = (f: SftpFile) => {
    if(!activeSessionId || !socket) return;
    const s = sessions.find(x => x.id === activeSessionId);
    if(s && confirm(`Are you sure you want to delete ${f.filename}?`)) {
      socket.emit('sftp-delete', { sessionId: activeSessionId, path: `${s.currentPath}/${f.filename}`, isDirectory: f.isDirectory });
    }
  };

  const handleRename = (f: SftpFile) => {
    if(!activeSessionId || !socket) return;
    const s = sessions.find(x => x.id === activeSessionId);
    if(!s) return;
    const newName = prompt('Enter new name:', f.filename);
    if(newName && newName !== f.filename) {
      socket.emit('sftp-rename', { sessionId: activeSessionId, oldPath: `${s.currentPath}/${f.filename}`, newPath: `${s.currentPath}/${newName}` });
    }
  };

  const handleEdit = (f: SftpFile) => {
    if(!activeSessionId || !socket) return;
    const s = sessions.find(x => x.id === activeSessionId);
    if(s) socket.emit('sftp-read', { sessionId: activeSessionId, path: `${s.currentPath}/${f.filename}` });
  };

  const handleEditorChange = (sessionId: string, value: string | undefined) => {
    setSessions(prev => prev.map(s => s.id === sessionId && s.editingFile ? { ...s, editingFile: { ...s.editingFile, content: value || '' } } : s));
  };

  const handleEditorSave = (sessionId: string) => {
    const s = sessions.find(x => x.id === sessionId);
    if (s && s.editingFile && socket) {
      socket.emit('sftp-write', { sessionId, path: s.editingFile.path, content: s.editingFile.content });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeSessionId || !socket) return;
    const s = sessions.find(x => x.id === activeSessionId);
    if (!s) return;

    const files: File[] = Array.from(e.dataTransfer.files);
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        socket.emit('sftp-upload', { sessionId: activeSessionId, path: `${s.currentPath}/${file.name}`, data: ev.target?.result as ArrayBuffer });
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const handleDockerAction = (containerId: string, action: string) => {
    if (!activeSessionId || !socket) return;
    socket.emit('docker-action', { sessionId: activeSessionId, containerId, action });
  };

  const handleAskAI = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSessionId || !socket || !aiPrompt.trim()) return;
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, aiChat: [...(s.aiChat || []), { role: 'user', text: aiPrompt }] } : s));
    socket.emit('ai-ask', { sessionId: activeSessionId, prompt: aiPrompt });
    setAiPrompt('');
  };

  const handleNetPing = () => {
    if (!activeSessionId || !socket || !netTarget.trim()) return;
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, netResult: 'Pinging...' } : s));
    socket.emit('net-ping', { sessionId: activeSessionId, target: netTarget });
  };

  const handleNetPortScan = () => {
    if (!activeSessionId || !socket || !netTarget.trim() || !netPort.trim()) return;
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, netResult: 'Scanning...' } : s));
    socket.emit('net-port-scan', { sessionId: activeSessionId, target: netTarget, port: netPort });
  };

  const fetchAuditLogs = async (sessionId: string) => {
    try {
      const res = await fetch('/api/audit-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const logs = await res.json();
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, auditLogs: logs } : s));
      }
    } catch (e) {}
  };

  const fetchAdminData = async () => {
    if (!token || user?.role !== 'admin') return;
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (usersRes.ok) setAdminUsers(await usersRes.json());
      if (statsRes.ok) setAdminStats(await statsRes.json());
    } catch (e) {}
  };

  const updateUserRole = async (userId: number, role: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role })
      });
      if (res.ok) {
        setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
        showNotification('User role updated', 'success');
      }
    } catch (e) {}
  };

  const deleteUser = async (userId: number) => {
    if (!confirm('Delete this user?')) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setAdminUsers(prev => prev.filter(u => u.id !== userId));
        showNotification('User deleted', 'success');
      }
    } catch (e) {}
  };

  const changeTheme = (t: keyof typeof THEMES) => {
    setTheme(t);
    localStorage.setItem('webssh_theme', t);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans">
        <TerminalIcon className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
        <p className="text-slate-400 text-sm">Loading WebTerminal...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-blue-600 rounded-xl mx-auto flex items-center justify-center mb-3">
              <TerminalIcon className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">WebTerminal</h1>
            <p className="text-slate-500 text-sm mt-1">SSH Terminal Manager</p>
          </div>
          
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <div className="flex gap-2 mb-6">
              <button 
                onClick={() => {setAuthMode('login'); setAuthError('');}} 
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${authMode === 'login' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                Login
              </button>
              <button 
                onClick={() => {setAuthMode('register'); setAuthError('');}} 
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${authMode === 'register' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                Register
              </button>
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <input 
                  type="text" 
                  required 
                  value={authUsername} 
                  onChange={e => setAuthUsername(e.target.value)} 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none" 
                  placeholder="Username"
                />
              </div>
              <div>
                <input 
                  type="password" 
                  required 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)} 
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none" 
                  placeholder="Password"
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm font-medium">
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const activeSession = sessions.find(s => s.id === activeSessionId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex flex-col font-sans">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map(n => (
          <div key={n.id} className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-pulse ${
            n.type === 'error' ? 'bg-red-600 text-white' : 
            n.type === 'success' ? 'bg-green-600 text-white' : 
            'bg-blue-600 text-white'
          }`}>
            {n.type === 'error' && <AlertCircle className="w-4 h-4" />}
            {n.type === 'success' && <Check className="w-4 h-4" />}
            {n.type === 'info' && <Bell className="w-4 h-4" />}
            <span className="text-sm">{n.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <TerminalIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white">WebTerminal</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {user && (
            <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-1 bg-slate-800 rounded-lg">
              <span className="font-medium text-slate-200">{user.username}</span>
            </div>
          )}
          
          <button onClick={() => setShowPalette(true)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" title="Command Palette (Ctrl+K)">
            <Command className="w-4 h-4" />
          </button>
          <button onClick={() => setShowSettings(true)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" title="Settings">
            <Settings className="w-4 h-4" />
          </button>
          {user?.role === 'admin' && (
            <button onClick={() => { fetchAdminData(); setShowAdmin(true); }} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" title="Admin Panel">
              <Shield className="w-4 h-4" />
            </button>
          )}
          {activeSessionId && (
            <button onClick={() => setShowTunnelModal(true)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" title="SSH Tunnels">
              <Wifi className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setShowNewConnection(true)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> New
          </button>
          <button onClick={handleLogout} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Command Palette Modal */}
      {showPalette && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-24 z-50" onClick={() => setShowPalette(false)}>
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-slate-800">
              <input
                type="text"
                autoFocus
                value={paletteQuery}
                onChange={e => setPaletteQuery(e.target.value)}
                placeholder="Type a command..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 outline-none"
              />
            </div>
            <div className="max-h-80 overflow-y-auto">
              {/* Quick Actions */}
              <div className="p-2">
                <div className="text-xs font-medium text-slate-500 px-2 py-1">Quick Actions</div>
                <button onClick={() => { setShowNewConnection(true); setShowPalette(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-left">
                  <Plus className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-white">New Connection</span>
                </button>
                <button onClick={() => { setShowSettings(true); setShowPalette(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-left">
                  <Settings className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-white">Settings</span>
                </button>
              </div>
              
              {/* Saved Servers */}
              {savedServers.length > 0 && (
                <div className="p-2 border-t border-slate-800">
                  <div className="text-xs font-medium text-slate-500 px-2 py-1">Saved Servers</div>
                  {savedServers.filter(s => s.name.toLowerCase().includes(paletteQuery.toLowerCase()) || s.host.includes(paletteQuery)).map(s => (
                    <button key={s.id} onClick={() => { connectToServer(s); setShowPalette(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-left">
                      <Server className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="text-sm text-white">{s.name}</div>
                        <div className="text-xs text-slate-500">{s.username}@{s.host}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {/* Custom Commands */}
              {customCommands.length > 0 && (
                <div className="p-2 border-t border-slate-800">
                  <div className="text-xs font-medium text-slate-500 px-2 py-1">Commands</div>
                  {customCommands.filter(c => c.name.toLowerCase().includes(paletteQuery.toLowerCase()) || c.command.toLowerCase().includes(paletteQuery.toLowerCase())).map(c => (
                    <button key={c.id} onClick={() => { executeCommand(c.command); setShowPalette(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-left">
                      <Command className="w-4 h-4 text-green-400" />
                      <div>
                        <div className="text-sm text-white">{c.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{c.command}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Connection History */}
              {connectionHistory.length > 0 && (
                <div className="p-2 border-t border-slate-800">
                  <div className="text-xs font-medium text-slate-500 px-2 py-1">Recent</div>
                  {connectionHistory.filter(h => h.host.includes(paletteQuery)).slice(0, 5).map((h, i) => (
                    <button key={i} onClick={() => { setHost(h.host); setUsername(h.username); setPort(h.port); setShowNewConnection(true); setShowPalette(false); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-left">
                      <History className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-sm text-white">{h.host}</div>
                        <div className="text-xs text-slate-500">{h.username}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>↑↓ navigate • Enter select • Esc close</span>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Settings</h2>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-800 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm text-slate-400 block mb-2">Font Size: {settings.fontSize}px</label>
                <input type="range" min="10" max="20" value={settings.fontSize} onChange={e => setSettings({...settings, fontSize: parseInt(e.target.value)})} className="w-full" />
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-2">Cursor Style</label>
                <div className="flex gap-2">
                  <button onClick={() => setSettings({...settings, cursorStyle: 'block'})} className={`flex-1 py-2 rounded text-sm ${settings.cursorStyle === 'block' ? 'bg-blue-600' : 'bg-slate-800'}`}>Block</button>
                  <button onClick={() => setSettings({...settings, cursorStyle: 'underline'})} className={`flex-1 py-2 rounded text-sm ${settings.cursorStyle === 'underline' ? 'bg-blue-600' : 'bg-slate-800'}`}>Underline</button>
                  <button onClick={() => setSettings({...settings, cursorStyle: 'bar'})} className={`flex-1 py-2 rounded text-sm ${settings.cursorStyle === 'bar' ? 'bg-blue-600' : 'bg-slate-800'}`}>Bar</button>
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-2">Scrollback Lines: {settings.scrollback}</label>
                <input type="range" min="500" max="5000" step="500" value={settings.scrollback} onChange={e => setSettings({...settings, scrollback: parseInt(e.target.value)})} className="w-full" />
              </div>
              <div className="pt-4 border-t border-slate-800">
                <button onClick={() => { setShowSettings(false); setShowImportExport(true); }} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-sm">
                  Import / Export Profiles
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {showAdmin && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAdmin(false)}>
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Admin Panel</h2>
              <button onClick={() => setShowAdmin(false)} className="p-1 hover:bg-slate-800 rounded"><X className="w-5 h-5" /></button>
            </div>
            
            {/* Stats */}
            {adminStats && (
              <div className="p-4 border-b border-slate-800 grid grid-cols-3 gap-4">
                <div className="bg-slate-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-white">{adminStats.users}</div>
                  <div className="text-xs text-slate-400">Users</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-white">{adminStats.servers}</div>
                  <div className="text-xs text-slate-400">Servers</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-white">{adminStats.totalLogs}</div>
                  <div className="text-xs text-slate-400">Audit Logs</div>
                </div>
              </div>
            )}
            
            {/* Users Table */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-sm font-medium text-slate-400 mb-3">Users</h3>
              <div className="space-y-2">
                {adminUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-slate-800 rounded-lg p-3">
                    <div>
                      <div className="text-sm font-medium text-white">{u.username}</div>
                      <div className="text-xs text-slate-500">Joined: {new Date(u.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select 
                        value={u.role} 
                        onChange={e => updateUserRole(u.id, e.target.value)}
                        className="bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="operator">Operator</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button onClick={() => deleteUser(u.id)} className="p-1.5 text-red-400 hover:bg-red-500/20 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Recent Activity */}
              {adminStats?.recentActivity?.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-slate-400 mb-3">Recent Activity</h3>
                  <div className="space-y-1">
                    {adminStats.recentActivity.map((log: any, i: number) => (
                      <div key={i} className="text-xs text-slate-400 py-1 border-b border-slate-800">
                        <span className="text-orange-400 font-medium">{log.action}</span> - {log.details} <span className="text-slate-600">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Import/Export Modal */}
      {showImportExport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowImportExport(false)}>
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Import / Export</h2>
              <button onClick={() => setShowImportExport(false)} className="p-1 hover:bg-slate-800 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-white mb-2">Export Profiles</h3>
                <button 
                  onClick={() => {
                    const data = JSON.stringify(savedServers, null, 2);
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'webterminal-profiles.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    showNotification('Profiles exported', 'success');
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm"
                >
                  Download JSON
                </button>
              </div>
              <div>
                <h3 className="text-sm font-medium text-white mb-2">Import Profiles</h3>
                <input 
                  type="file" 
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    try {
                      const imported = JSON.parse(text);
                      if (Array.isArray(imported)) {
                        for (const s of imported) {
                          await fetch('/api/profiles', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify(s)
                          });
                        }
                        const res = await fetch('/api/profiles', { headers: { Authorization: `Bearer ${token}` } });
                        if (res.ok) setSavedServers(await res.json());
                        showNotification(`${imported.length} profiles imported`, 'success');
                      }
                    } catch {
                      showNotification('Invalid file format', 'error');
                    }
                  }}
                  className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SSH Tunnel Modal */}
      {showTunnelModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowTunnelModal(false)}>
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">SSH Tunnels</h2>
              <button onClick={() => setShowTunnelModal(false)} className="p-1 hover:bg-slate-800 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-400">Create local port forwards through the SSH connection</p>
              {tunnels.map(t => (
                <div key={t.id} className="bg-slate-800 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-white">localhost:{t.localPort}</span>
                    <span className="text-slate-500 mx-2">→</span>
                    <span className="text-slate-400">{t.remoteHost}:{t.remotePort}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${t.active ? 'bg-green-500' : 'bg-slate-500'}`}></span>
                    <button onClick={() => setTunnels(prev => prev.filter(x => x.id !== t.id))} className="p-1 text-red-400 hover:bg-red-500/20 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2">
                <input type="number" placeholder="Local Port" className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white" defaultValue={3306} />
                <input type="text" placeholder="Remote Host" className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white" defaultValue="127.0.0.1" />
                <input type="number" placeholder="Remote Port" className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white" defaultValue={3306} />
              </div>
              <button 
                onClick={() => {
                  const localPort = (document.querySelector('input[placeholder="Local Port"]') as HTMLInputElement)?.value;
                  const remoteHost = (document.querySelector('input[placeholder="Remote Host"]') as HTMLInputElement)?.value;
                  const remotePort = (document.querySelector('input[placeholder="Remote Port"]') as HTMLInputElement)?.value;
                  if (localPort && remoteHost && remotePort) {
                    setTunnels(prev => [...prev, { id: Date.now().toString(), localPort: parseInt(localPort), remoteHost, remotePort: parseInt(remotePort), active: true }]);
                    showNotification('Tunnel created', 'success');
                  }
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm"
              >
                Create Tunnel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Playback Modal */}
      {showPlayback && (
        <div className="fixed inset-0 bg-black/80 flex flex-col z-50" onClick={() => { setShowPlayback(false); setPlaybackPlaying(false); }}>
          <div className="p-4 flex items-center justify-between bg-slate-900 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white">Session Replay</h2>
            <button onClick={() => { setShowPlayback(false); setPlaybackPlaying(false); }} className="p-1 hover:bg-slate-800 rounded">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
          
          <div className="flex-1 bg-[#0f172a] p-4 overflow-auto">
            <pre ref={playbackRef} className="font-mono text-sm text-green-400 whitespace-pre-wrap"></pre>
          </div>
          
          <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-center gap-4">
            <button 
              onClick={() => setPlaybackPlaying(!playbackPlaying)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {playbackPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playbackPlaying ? 'Pause' : 'Play'}
            </button>
            <button 
              onClick={() => { setPlaybackIndex(0); setPlaybackPlaying(false); }}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm"
            >
              Restart
            </button>
            <div className="text-sm text-slate-400">
              {Math.round(playbackIndex / playbackData.length * 100)}% • {playbackData.length > 0 ? playbackIndex : 0} / {playbackData.length} events
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-slate-900/50 border-r border-slate-800 flex flex-col">
          {/* Server Groups */}
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Servers</h2>
              <button onClick={() => { const name = prompt('Group name:'); if (name) setServerGroups(prev => [...prev, { id: Date.now().toString(), name, color: 'blue' }]); }} className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-white">
                <Plus className="w-3 h-3" />
              </button>
            </div>
            
            {/* All Servers */}
            <div className="mb-2">
              <button 
                onClick={() => setSelectedGroup(null)} 
                className={`w-full text-left px-2 py-1 rounded text-xs font-medium ${selectedGroup === null ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                All Servers ({savedServers.length})
              </button>
            </div>
            
            {/* Groups */}
            {serverGroups.map(g => (
              <div key={g.id} className="mb-1">
                <button 
                  onClick={() => setSelectedGroup(selectedGroup === g.id ? null : g.id)} 
                  className={`w-full text-left px-2 py-1 rounded text-xs font-medium flex items-center gap-2 ${selectedGroup === g.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <span className={`w-2 h-2 rounded-full bg-${g.color}-500`}></span>
                  {g.name} ({savedServers.filter(s => (s as any).group === g.id).length})
                </button>
              </div>
            ))}
          </div>
          
          {/* Server List */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {(selectedGroup ? savedServers.filter(s => (s as any).group === selectedGroup) : savedServers).length === 0 && (
                <p className="text-sm text-slate-600 italic text-center py-4">No servers{selectedGroup ? ' in this group' : ''}</p>
              )}
              {(selectedGroup ? savedServers.filter(s => (s as any).group === selectedGroup) : savedServers).map(s => (
                <div key={s.id} className="group flex items-center justify-between bg-slate-800/50 hover:bg-slate-800 p-2 rounded cursor-pointer border border-transparent hover:border-slate-700 transition-all" onClick={() => connectToServer(s)}>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Server className="w-4 h-4 text-blue-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-sm font-medium text-slate-200 truncate">{s.name}</div>
                      <div className="text-xs text-slate-500 truncate">{s.username}@{s.host}</div>
                    </div>
                  </div>
                  <button onClick={(e) => deleteServer(s.id, e)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-slate-800">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Commands</h2>
            <div className="space-y-2 mb-4">
              {customCommands.length === 0 && <p className="text-sm text-slate-600 italic">No custom commands</p>}
              {customCommands.map(cmd => (
                <div key={cmd.id} className="group flex items-center justify-between bg-slate-800/50 hover:bg-slate-800 p-2 rounded border border-transparent hover:border-slate-700 transition-all">
                  <button onClick={() => executeCommand(cmd.command)} className="flex items-center gap-2 flex-1 text-left truncate" disabled={!activeSessionId}>
                    <Command className="w-4 h-4 text-green-400 shrink-0" />
                    <span className="text-sm text-slate-300 truncate">{cmd.name}</span>
                  </button>
                  <button onClick={() => deleteCommand(cmd.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            
            <div className="bg-slate-900 p-3 rounded border border-slate-800 space-y-2">
              <input type="text" placeholder="Snippet Name" value={cmdName} onChange={e=>setCmdName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none" />
              <input type="text" placeholder="Command (e.g. pm2 logs)" value={cmdValue} onChange={e=>setCmdValue(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none font-mono" />
              <button onClick={saveCommand} className="w-full bg-slate-800 hover:bg-slate-700 text-white text-sm py-1.5 rounded transition-colors">Add Snippet</button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-[#0f172a]">
          {/* Tabs */}
          {sessions.length > 0 && !splitMode && (
            <div className="flex bg-slate-900 border-b border-slate-800 overflow-x-auto">
              {sessions.map(s => (
                <div key={s.id} onClick={() => { setActiveSessionId(s.id); setShowNewConnection(false); }}
                  className={`flex items-center gap-2 px-4 py-2.5 min-w-[160px] max-w-[240px] cursor-pointer border-r border-slate-800 select-none ${activeSessionId === s.id && !showNewConnection ? 'bg-[#0f172a] border-t-2 border-t-blue-500 text-white' : 'bg-slate-900/50 text-slate-400 hover:bg-slate-800'}`}>
                  <div className="flex-1 truncate flex items-center gap-2">
                    {s.connected ? <div className="w-2 h-2 rounded-full bg-green-500" /> : s.error ? <div className="w-2 h-2 rounded-full bg-red-500" /> : <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                    <span className="text-sm truncate">{s.server.name || s.server.host}</span>
                  </div>
                  <button onClick={(e) => closeSession(s.id, e)} className="p-1 hover:bg-slate-700 rounded-md text-slate-500 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Workspace */}
          {showNewConnection ? (
            <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
              <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-slate-800 bg-slate-800/30">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-400" /> Connect to Server
                  </h2>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-3 space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">Hostname / IP</label>
                      <div className="relative">
                        <Server className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input type="text" value={host} onChange={e => setHost(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="192.168.1.1" />
                      </div>
                    </div>
                    <div className="col-span-1 space-y-1.5">
                      <label className="text-xs font-medium text-slate-400">Port</label>
                      <input type="text" value={port} onChange={e => setPort(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="22" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Username</label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="root" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                      <button onClick={() => setAuthType('password')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${authType === 'password' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>Password</button>
                      <button onClick={() => setAuthType('key')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${authType === 'key' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>SSH Key</button>
                    </div>

                    {authType === 'password' ? (
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" placeholder="••••••••" />
                      </div>
                    ) : (
                      <div className="relative">
                        <Key className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                        <textarea value={privateKey} onChange={e => setPrivateKey(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono h-32 resize-none" placeholder="-----BEGIN RSA PRIVATE KEY-----..." />
                      </div>
                    )}
                  </div>

                  <div className="pt-4 space-y-3">
                    <button onClick={() => connectToServer({ host, port, username, password, privateKey })} disabled={!host || !username} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                      <Play className="w-4 h-4" /> Connect
                    </button>
                    <div className="flex gap-2">
                      <input type="text" value={serverName} onChange={e => setServerName(e.target.value)} placeholder="Save as..." className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" />
                      <button onClick={saveServer} disabled={!host || !username} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                        <Save className="w-4 h-4" /> Save
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 relative flex">
              {/* Terminal Area */}
              <div className={`flex-1 relative p-2 ${splitMode ? 'grid grid-cols-2 gap-2' : ''}`}>
                {splitMode ? (
                  sessions.filter(s => s.connected).map(s => (
                    <div key={s.id} className={`relative border rounded overflow-hidden flex flex-col ${activeSessionId === s.id ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'border-slate-800'}`} onClick={() => setActiveSessionId(s.id)}>
                      <div className={`px-2 py-1 text-xs font-medium flex justify-between items-center ${activeSessionId === s.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        <span>{s.server.name || s.server.host}</span>
                        <button onClick={(e) => closeSession(s.id, e)} className="hover:text-red-400"><X className="w-3 h-3"/></button>
                      </div>
                      <div className="flex-1 relative bg-[#0f172a]">
                        <TerminalInstance session={s} socket={socket} isActive={true} theme={theme} settings={settings} />
                      </div>
                    </div>
                  ))
                ) : (
                  sessions.map(s => (
                    <div key={s.id} className={`absolute inset-0 p-2 ${activeSessionId === s.id ? 'block' : 'hidden'}`}>
                      {!s.connected && !s.error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f172a] z-10">
                          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                          <p className="text-slate-400">Establishing SSH connection...</p>
                        </div>
                      )}
                      {s.error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f172a] z-10">
                          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                          <p className="text-white text-lg font-medium mb-2">Connection Failed</p>
                          <p className="text-slate-400 text-sm max-w-md text-center bg-slate-900 p-4 rounded-lg border border-slate-800 font-mono">{s.error}</p>
                          <button onClick={() => closeSession(s.id, {} as any)} className="mt-6 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">Close Tab</button>
                        </div>
                      )}
                      
                      <div className="flex-1 relative bg-[#0f172a] flex flex-col h-full rounded overflow-hidden border border-slate-800">
                        {s.editingFile && (
                          <div className="flex bg-slate-900 border-b border-slate-800">
                            <button onClick={() => setSessions(prev => prev.map(x => x.id === s.id ? {...x, activeView: 'terminal'} : x))} className={`px-4 py-2 text-sm font-medium transition-colors ${s.activeView === 'terminal' ? 'bg-slate-800 text-white border-b-2 border-blue-500' : 'text-slate-400 hover:bg-slate-800/50'}`}>Terminal</button>
                            <div className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${s.activeView === 'editor' ? 'bg-slate-800 text-white border-b-2 border-blue-500' : 'text-slate-400 hover:bg-slate-800/50'}`}>
                              <button onClick={() => setSessions(prev => prev.map(x => x.id === s.id ? {...x, activeView: 'editor'} : x))} className="flex items-center gap-2">
                                <Code className="w-4 h-4 text-blue-400" /> {s.editingFile.path.split('/').pop()} {s.editingFile.content !== s.editingFile.originalContent ? <span className="text-yellow-400">*</span> : ''}
                              </button>
                              <div className="w-px h-4 bg-slate-700 mx-1"></div>
                              <button onClick={() => handleEditorSave(s.id)} className={`p-1 rounded transition-colors ${s.editingFile.content !== s.editingFile.originalContent ? 'text-blue-400 hover:bg-blue-500/20' : 'text-slate-500 hover:bg-slate-700'}`} title="Save (Ctrl+S)"><Save className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setSessions(prev => prev.map(x => x.id === s.id ? {...x, editingFile: undefined, activeView: 'terminal'} : x))} className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition-colors" title="Close Editor"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        )}
                        <div className={`flex-1 relative ${(!s.editingFile || s.activeView === 'terminal') ? 'block' : 'hidden'}`}>
                           <TerminalInstance session={s} socket={socket} isActive={activeSessionId === s.id && (!s.editingFile || s.activeView === 'terminal')} theme={theme} settings={settings} />
                        </div>
                        {s.editingFile && (
                          <div className={`flex-1 relative ${s.activeView === 'editor' ? 'block' : 'hidden'}`}>
                            <Editor
                              height="100%"
                              theme={theme === 'default' ? 'vs-dark' : 'vs-dark'}
                              path={s.editingFile.path}
                              value={s.editingFile.content}
                              onChange={(val) => handleEditorChange(s.id, val)}
                              options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                                wordWrap: 'on',
                                padding: { top: 16 }
                              }}
                            />
                          </div>
                        )}
                      </div>

                    </div>
                  ))
                )}
              </div>

              {/* Right Panel */}
              {activeSession && activeSession.connected && (
                <div className="w-80 bg-slate-900/80 border-l border-slate-800 flex flex-col">
                  {/* Panel Tabs */}
                  <div className="flex border-b border-slate-800 bg-slate-950">
                    <button 
                      onClick={() => setSessions(prev => prev.map(s => s.id === activeSession.id ? {...s, activeRightPanel: 'sftp'} : s))}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeSession.activeRightPanel === 'sftp' ? 'bg-slate-800 text-white border-b-2 border-blue-500' : 'text-slate-400 hover:text-white'}`}
                    >
                      Files
                    </button>
                    <button 
                      onClick={() => {
                        setSessions(prev => prev.map(s => s.id === activeSession.id ? {...s, activeRightPanel: 'docker'} : s));
                        socket?.emit('docker-list', { sessionId: activeSession.id });
                      }}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeSession.activeRightPanel === 'docker' ? 'bg-slate-800 text-white border-b-2 border-blue-500' : 'text-slate-400 hover:text-white'}`}
                    >
                      Docker
                    </button>
                    <button 
                      onClick={() => {
                        setSessions(prev => prev.map(s => s.id === activeSession.id ? {...s, activeRightPanel: 'logs'} : s));
                        fetchAuditLogs(activeSession.id);
                      }}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeSession.activeRightPanel === 'logs' ? 'bg-slate-800 text-white border-b-2 border-blue-500' : 'text-slate-400 hover:text-white'}`}
                    >
                      Logs
                    </button>
                    <button 
                      onClick={() => {
                        const panels: any = ['net', 'share', 'ai', 'db', 'broadcast', 'recordings'];
                        const current = activeSession.activeRightPanel;
                        const nextIndex = panels.indexOf(current) + 1;
                        const next = panels[nextIndex % panels.length];
                        setSessions(prev => prev.map(s => s.id === activeSession.id ? {...s, activeRightPanel: next} : s));
                      }}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors ${!['sftp', 'docker', 'logs'].includes(activeSession.activeRightPanel || '') ? 'bg-slate-800 text-white border-b-2 border-blue-500' : 'text-slate-400 hover:text-white'}`}
                    >
                      More
                    </button>
                  </div>

                  {/* SFTP Explorer */}
                  {activeSession.activeRightPanel === 'sftp' && (
                    <div 
                      className="flex-1 flex flex-col min-h-0 border-b border-slate-800 relative"
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-transparent data-[dragover=true]:border-blue-500 data-[dragover=true]:bg-blue-500/10 z-10 transition-colors" id="dropzone"></div>
                      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                        <div className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-blue-400" />
                          <span className="text-sm font-semibold text-slate-200">File Explorer</span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={handleMkdir} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors" title="New Folder"><FolderPlus className="w-4 h-4" /></button>
                          <button onClick={handleUpload} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors" title="Upload File (or Drag & Drop)"><Upload className="w-4 h-4" /></button>
                          <button onClick={() => navigateSftp(activeSession.id, activeSession.currentPath, '..')} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors" title="Go Up"><ChevronLeft className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <div className="px-3 py-1.5 bg-slate-950 border-b border-slate-800 text-xs text-slate-500 font-mono truncate">
                        {activeSession.currentPath}
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                        {!activeSession.files ? (
                          <div className="flex items-center justify-center h-full text-slate-500 text-sm gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                          </div>
                        ) : (
                          activeSession.files.filter(f => f.filename !== '.' && f.filename !== '..').sort((a,b) => a.isDirectory === b.isDirectory ? a.filename.localeCompare(b.filename) : a.isDirectory ? -1 : 1).map((f, i) => (
                            <div key={i} className="group flex items-center justify-between p-1.5 hover:bg-slate-800 rounded text-sm text-slate-300 select-none transition-colors">
                              <div className="flex items-center gap-2 overflow-hidden cursor-pointer flex-1" onDoubleClick={() => f.isDirectory ? navigateSftp(activeSession.id, activeSession.currentPath, f.filename) : null}>
                                {f.isDirectory ? <Folder className="w-4 h-4 text-blue-400 shrink-0" /> : <FileText className="w-4 h-4 text-slate-500 shrink-0" />}
                                <span className="truncate">{f.filename}</span>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 bg-slate-800 pl-2 rounded">
                                {!f.isDirectory && <button onClick={() => handleEdit(f)} className="p-1 text-slate-400 hover:text-green-400" title="Edit in Browser"><Code className="w-3.5 h-3.5" /></button>}
                                {!f.isDirectory && <button onClick={() => handleDownload(f)} className="p-1 text-slate-400 hover:text-blue-400" title="Download"><Download className="w-3.5 h-3.5" /></button>}
                                <button onClick={() => handleRename(f)} className="p-1 text-slate-400 hover:text-yellow-400" title="Rename"><Edit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDelete(f)} className="p-1 text-slate-400 hover:text-red-400" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                              <div className="text-[10px] text-slate-600 ml-2 shrink-0 group-hover:hidden">
                                {!f.isDirectory && `${(f.size / 1024).toFixed(1)} KB`}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Docker Dashboard */}
                  {activeSession.activeRightPanel === 'docker' && (
                    <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
                      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                        <div className="flex items-center gap-2">
                          <Box className="w-4 h-4 text-blue-400" />
                          <span className="text-sm font-semibold text-slate-200">Containers</span>
                        </div>
                        <button onClick={() => socket?.emit('docker-list', { sessionId: activeSession.id })} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors" title="Refresh">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {!activeSession.dockerContainers ? (
                          <div className="flex items-center justify-center h-full text-slate-500 text-sm gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Fetching containers...
                          </div>
                        ) : activeSession.dockerContainers.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                            No containers found.
                          </div>
                        ) : (
                          activeSession.dockerContainers.map((c, i) => {
                            const isRunning = c.State === 'running';
                            return (
                              <div key={i} className="bg-slate-950 border border-slate-800 rounded-lg p-2 flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-green-500' : 'bg-slate-600'}`}></div>
                                    <span className="text-sm font-medium text-slate-200 truncate" title={c.Names}>{c.Names}</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isRunning ? (
                                      <>
                                        <button onClick={() => handleDockerAction(c.ID, 'restart')} className="p-1 text-slate-400 hover:text-yellow-400 hover:bg-slate-800 rounded" title="Restart"><RefreshCw className="w-3 h-3" /></button>
                                        <button onClick={() => handleDockerAction(c.ID, 'stop')} className="p-1 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded" title="Stop"><Square className="w-3 h-3 fill-current" /></button>
                                      </>
                                    ) : (
                                      <button onClick={() => handleDockerAction(c.ID, 'start')} className="p-1 text-slate-400 hover:text-green-400 hover:bg-slate-800 rounded" title="Start"><Play className="w-3 h-3 fill-current" /></button>
                                    )}
                                    <button onClick={() => { if(confirm(`Delete container ${c.Names}?`)) handleDockerAction(c.ID, 'rm'); }} className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded ml-1" title="Remove"><Trash2 className="w-3 h-3" /></button>
                                  </div>
                                </div>
                                <div className="text-xs text-slate-500 font-mono truncate" title={c.Image}>{c.Image}</div>
                                <div className="text-[10px] text-slate-600 flex justify-between">
                                  <span>{c.Status}</span>
                                  <span className="truncate max-w-[100px]" title={c.Ports}>{c.Ports || 'No ports'}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* AI Copilot */}
                  {activeSession.activeRightPanel === 'ai' && (
                    <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
                      <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slate-900/50">
                        <Bot className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-semibold text-slate-200">AI Copilot</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {(!activeSession.aiChat || activeSession.aiChat.length === 0) ? (
                          <div className="text-center text-slate-500 text-sm mt-10">
                            Ask me anything about Linux, Docker, or DevOps!
                          </div>
                        ) : (
                          activeSession.aiChat.map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                              <div className={`max-w-[90%] p-2 rounded-lg text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                                {msg.text.split('`').map((part, j) => j % 2 === 1 ? <code key={j} className="bg-slate-950 text-green-400 px-1 rounded font-mono text-xs">{part}</code> : part)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <form onSubmit={handleAskAI} className="p-2 border-t border-slate-800 flex gap-2">
                        <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Ask AI..." className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-white focus:border-purple-500 outline-none" />
                        <button type="submit" disabled={!aiPrompt.trim()} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white p-1.5 rounded transition-colors"><Send className="w-4 h-4" /></button>
                      </form>
                    </div>
                  )}

                  {/* Network Toolbox */}
                  {activeSession.activeRightPanel === 'net' && (
                    <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
                      <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slate-900/50">
                        <Network className="w-4 h-4 text-teal-400" />
                        <span className="text-sm font-semibold text-slate-200">Network Tools</span>
                      </div>
                      <div className="p-3 space-y-3 border-b border-slate-800">
                        <input type="text" value={netTarget} onChange={e => setNetTarget(e.target.value)} placeholder="Target IP or Domain" className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-white focus:border-teal-500 outline-none" />
                        <div className="flex gap-2">
                          <button onClick={handleNetPing} disabled={!netTarget.trim()} className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white py-1.5 rounded text-sm transition-colors">Ping</button>
                          <div className="flex flex-1 gap-1">
                            <input type="text" value={netPort} onChange={e => setNetPort(e.target.value)} placeholder="Port" className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-white focus:border-teal-500 outline-none" />
                            <button onClick={handleNetPortScan} disabled={!netTarget.trim() || !netPort.trim()} className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white py-1.5 rounded text-sm transition-colors">Scan</button>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 bg-slate-950">
                        <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap">
                          {activeSession.netResult || 'Results will appear here...'}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Audit Logs */}
                  {activeSession.activeRightPanel === 'logs' && (
                    <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
                      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                        <div className="flex items-center gap-2">
                          <FileClock className="w-4 h-4 text-orange-400" />
                          <span className="text-sm font-semibold text-slate-200">Audit Logs</span>
                        </div>
                        <button onClick={() => fetchAuditLogs(activeSession.id)} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors" title="Refresh">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-950">
                        {(!activeSession.auditLogs || activeSession.auditLogs.length === 0) ? (
                          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                            No logs found.
                          </div>
                        ) : (
                          activeSession.auditLogs.map((log, i) => (
                            <div key={i} className="bg-slate-900 border border-slate-800 rounded p-2 flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-orange-400">{log.action}</span>
                                <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                              </div>
                              <div className="text-xs text-slate-300 font-mono break-all">{log.details}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Share Panel */}
                  {activeSession.activeRightPanel === 'share' && (
                    <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
                      <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slate-900/50">
                        <Share2 className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-semibold text-slate-200">Share Session</span>
                        {activeSession.isRecording && <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full animate-pulse">REC</span>}
                      </div>
                      <div className="p-3 space-y-3 border-b border-slate-800">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-400">Share with username</label>
                          <input type="text" value={shareUsername} onChange={e => setShareUsername(e.target.value)} placeholder="Enter username" className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-white focus:border-purple-500 outline-none" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setShareMode('view')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${shareMode === 'view' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                            <Eye className="w-3 h-3 inline mr-1" /> View
                          </button>
                          <button onClick={() => setShareMode('interactive')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${shareMode === 'interactive' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                            <Edit3 className="w-3 h-3 inline mr-1" /> Interactive
                          </button>
                        </div>
                        <button onClick={() => shareSession(activeSession.id)} disabled={!shareUsername.trim()} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2">
                          <Share2 className="w-4 h-4" /> Share
                        </button>
                      </div>
                      <div className="p-3 space-y-2">
                        <label className="text-xs font-medium text-slate-400">Join shared session</label>
                        <div className="flex gap-2">
                          <input type="text" placeholder="Paste share token" className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-white focus:border-purple-500 outline-none" id="shareTokenInput" />
                          <button onClick={() => joinSharedSession((document.getElementById('shareTokenInput') as HTMLInputElement)?.value)} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-sm transition-colors">
                            <Users className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Recordings Panel */}
                  {activeSession.activeRightPanel === 'recordings' && (
                    <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
                      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                        <div className="flex items-center gap-2">
                          <Video className="w-4 h-4 text-pink-400" />
                          <span className="text-sm font-semibold text-slate-200">Session Recording</span>
                        </div>
                        <div className="flex gap-1">
                          {activeSession.isRecording ? (
                            <button onClick={() => stopRecording(activeSession.id)} className="p-1.5 bg-red-600 hover:bg-red-700 rounded text-white transition-colors" title="Stop Recording">
                              <Square className="w-3.5 h-3.5 fill-current" />
                            </button>
                          ) : (
                            <button onClick={() => startRecording(activeSession.id)} className="p-1.5 bg-pink-600 hover:bg-pink-700 rounded text-white transition-colors" title="Start Recording">
                              <Video className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => socket?.emit('get-recordings')} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors" title="Refresh">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {recordings.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-3">
                            <Video className="w-8 h-8 opacity-50" />
                            <p>No recordings yet</p>
                            <p className="text-xs">Click the record button to start capturing your terminal session</p>
                          </div>
                        ) : (
                          recordings.map((rec, i) => (
                            <div key={i} className="bg-slate-950 border border-slate-800 rounded p-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <PlayCircle className="w-4 h-4 text-pink-400" />
                                <div>
                                  <div className="text-xs text-slate-200 font-medium truncate max-w-[120px]">{rec.filename}</div>
                                  <div className="text-[10px] text-slate-500">{Math.round(rec.duration / 1000)}s • {new Date(rec.timestamp).toLocaleDateString()}</div>
                                </div>
                              </div>
                              <button onClick={async () => {
                                try {
                                  const res = await fetch(`/data/recordings/${rec.filename}`);
                                  if (res.ok) {
                                    const data = await res.json();
                                    setPlaybackData(data);
                                    setPlaybackIndex(0);
                                    setShowPlayback(true);
                                    setPlaybackPlaying(false);
                                  }
                                } catch {
                                  showNotification('Failed to load recording', 'error');
                                }
                              }} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-pink-400 transition-colors">
                                <Play className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Database Client Panel */}
                  {activeSession.activeRightPanel === 'db' && (
                    <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
                      <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slate-900/50">
                        <Database className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm font-semibold text-slate-200">Database Client</span>
                      </div>
                      <div className="p-3 space-y-3 border-b border-slate-800">
                        <div className="text-xs text-slate-400 bg-slate-950 p-2 rounded border border-slate-800">
                          <p>Supports MySQL & PostgreSQL</p>
                          <p className="text-[10px] mt-1 text-slate-500">Requires mysql2 or pg package on server</p>
                        </div>
                        <textarea 
                          value={dbQuery} 
                          onChange={e => setDbQuery(e.target.value)} 
                          placeholder="SELECT * FROM users LIMIT 10;" 
                          className="w-full h-24 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white font-mono focus:border-cyan-500 outline-none resize-none"
                        />
                        <button onClick={() => executeDbQuery(activeSession.id)} disabled={!dbQuery.trim()} className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2">
                          <Play className="w-4 h-4" /> Execute Query
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2">
                        {dbResult ? (
                          dbResult.error ? (
                            <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded border border-red-500/30">{dbResult.error}</div>
                          ) : (
                            <div className="space-y-2">
                              {dbResult.message && <div className="text-xs text-slate-400 bg-slate-950 p-2 rounded text-center mb-2">{dbResult.message}</div>}
                              {dbResult.columns && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-slate-800">
                                        {dbResult.columns.map((col: string, i: number) => (
                                          <th key={i} className="px-2 py-1 text-left text-slate-300 font-medium">{col}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dbResult.rows?.map((row: any, i: number) => (
                                        <tr key={i} className="border-t border-slate-800">
                                          {Object.values(row).map((val: any, j: number) => (
                                            <td key={j} className="px-2 py-1 text-slate-400">{String(val)}</td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                            <Database className="w-6 h-6 opacity-50" />
                            <p>Query results will appear here</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Broadcast Commands Panel */}
                  {activeSession.activeRightPanel === 'broadcast' && (
                    <div className="flex-1 flex flex-col min-h-0 border-b border-slate-800">
                      <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slate-900/50">
                        <Hash className="w-4 h-4 text-yellow-400" />
                        <span className="text-sm font-semibold text-slate-200">Multi-Server Broadcast</span>
                      </div>
                      <div className="p-3 space-y-3 border-b border-slate-800">
                        <div className="text-xs text-slate-400 bg-slate-950 p-2 rounded border border-slate-800">
                          Send the same command to multiple servers simultaneously
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-400">Select servers</label>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {sessions.filter(s => s.connected).map(s => (
                              <label key={s.id} className="flex items-center gap-2 text-xs text-slate-300 hover:bg-slate-800 p-1 rounded cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={selectedSessions.includes(s.id)}
                                  onChange={e => {
                                    if (e.target.checked) setSelectedSessions([...selectedSessions, s.id]);
                                    else setSelectedSessions(selectedSessions.filter(id => id !== s.id));
                                  }}
                                  className="rounded border-slate-600"
                                />
                                <Server className="w-3 h-3" /> {s.server.name || s.server.host}
                              </label>
                            ))}
                          </div>
                        </div>
                        <textarea 
                          value={broadcastCommand} 
                          onChange={e => setBroadcastCommand(e.target.value)} 
                          placeholder="apt update && apt upgrade -y" 
                          className="w-full h-16 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white font-mono focus:border-yellow-500 outline-none resize-none"
                        />
                        <button onClick={broadcastCommandExecute} disabled={!broadcastCommand.trim() || selectedSessions.length === 0} className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2">
                          <Send className="w-4 h-4" /> Broadcast to {selectedSessions.length} server{selectedSessions.length !== 1 ? 's' : ''}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Server Stats */}
                  <div className="h-48 flex flex-col bg-slate-900/50">
                    <div className="p-3 border-b border-slate-800 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-semibold text-slate-200">Live Stats</span>
                    </div>
                    <div className="flex-1 p-3 overflow-y-auto">
                      {activeSession.stats ? (
                        <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">
                          {activeSession.stats}
                        </pre>
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-600 text-xs">
                          Waiting for stats...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
