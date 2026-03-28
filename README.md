# WebTerminal Pro / WebTerminal Pro

[English](#english) | [Türkçe](#türkçe)

---

## English

WebTerminal Pro is a modern, enterprise-grade web-based SSH terminal manager. Connect to your servers securely from anywhere in the world.

### Features

- 🔐 **Secure Authentication** - JWT-based auth with 2FA support
- 🖥️ **Multi-Session** - Connect to multiple servers simultaneously
- 📁 **SFTP File Management** - Upload, download, edit files with drag & drop
- 🐳 **Docker Management** - Manage containers from the web interface
- 📊 **Network Tools** - Built-in ping, port scanner
- 🎬 **Session Recording** - Record terminal sessions for playback
- 👥 **Team Collaboration** - Share terminal sessions with teammates
- 🔌 **SSH Tunnels** - Create local/remote port forwards
- 📱 **PWA Support** - Install as a native app on mobile
- ⚡ **Command Palette** - Quick access with Ctrl+K
- 🎨 **Customizable** - Multiple themes, font sizes, cursor styles
- 🛡️ **Enterprise Security** - RBAC, audit logs, rate limiting

### Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3001
```

### Docker

```bash
docker-compose up -d
```

### Configuration

Create a `.env` file:

```env
PORT=3001
NODE_ENV=production
JWT_SECRET=your-super-secret-key
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_MAX_REQUESTS=100
```

### Keyboard Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Ctrl+K` | Command palette |
| `Ctrl+Shift+T` | New connection |
| `Ctrl+Shift+W` | Close tab |
| `Ctrl+Shift+\` | Split view |
| `F11` | Fullscreen |

### Security

- bcrypt password hashing
- JWT session management
- Rate limiting (brute-force protection)
- Helmet.js HTTP headers
- 2FA (TOTP) support
- Role-based access control (RBAC)
- Audit logging

### Tech Stack

- **Frontend:** React, TypeScript, TailwindCSS, xterm.js
- **Backend:** Node.js, Express, Socket.IO
- **Database:** SQLite (better-sqlite3)
- **Deployment:** Docker, Docker Compose, PM2

---

## Türkçe

WebTerminal Pro, modern, kurumsal düzeyde bir web tabanlı SSH terminal yöneticisidir. Dünyanın her yerinden sunucularınıza güvenli bir şekilde bağlanın.

### Özellikler

- 🔐 **Güvenli Kimlik Doğrulama** - JWT tabanlı kimlik doğrulama, 2FA desteği
- 🖥️ **Çoklu Oturum** - Aynı anda birden fazla sunucuya bağlanın
- 📁 **SFTP Dosya Yönetimi** - Sürükle-bırak ile dosya yükleme, indirme, düzenleme
- 🐳 **Docker Yönetimi** - Container'ları web arayüzünden yönetin
- 📊 **Ağ Araçları** - Yerleşik ping, port tarayıcı
- 🎬 **Oturum Kaydı** - Terminal oturumlarını kaydetme ve oynatma
- 👥 **Ekip İşbirliği** - Terminal oturumlarını ekip arkadaşlarınızla paylaşın
- 🔌 **SSH Tüneli** - Local/remote port yönlendirme
- 📱 **PWA Desteği** - Mobil cihazlarda native uygulama olarak kurun
- ⚡ **Komut Paleti** - Ctrl+K ile hızlı erişim
- 🎨 **Özelleştirilebilir** - Birden fazla tema, yazı tipi boyutu, imleç stili
- 🛡️ **Kurumsal Güvenlik** - RBAC, denetim günlükleri, hız sınırlama

### Hızlı Başlangıç

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın
npm run dev

# http://localhost:3001 adresini açın
```

### Docker

```bash
docker-compose up -d
```

### Yapılandırma

Bir `.env` dosyası oluşturun:

```env
PORT=3001
NODE_ENV=production
JWT_SECRET=gizli-anahtarınız
CORS_ORIGIN=https://alan-adiniz.com
RATE_LIMIT_MAX_REQUESTS=100
```

### Klavye Kısayolları

| Kısayol | Açıklama |
|---------|----------|
| `Ctrl+K` | Komut paleti |
| `Ctrl+Shift+T` | Yeni bağlantı |
| `Ctrl+Shift+W` | Sekmeyi kapat |
| `Ctrl+Shift+\` | Bölünmüş görünüm |
| `F11` | Tam ekran |

### Güvenlik

- bcrypt şifre hashleme
- JWT oturum yönetimi
- Hız sınırlama (brute-force koruması)
- Helmet.js HTTP başlıkları
- 2FA (TOTP) desteği
- Rol tabanlı erişim kontrolü (RBAC)
- Denetim günlükleri

### Teknoloji Stack

- **Frontend:** React, TypeScript, TailwindCSS, xterm.js
- **Backend:** Node.js, Express, Socket.IO
- **Veritabanı:** SQLite (better-sqlite3)
- **Deployment:** Docker, Docker Compose, PM2

---

## License / Lisans

MIT License
