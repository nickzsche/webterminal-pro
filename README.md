# WebTerminal Pro

Modern web tabanlı SSH terminali. Sunucularınıza her yerden güvenli bir şekilde bağlanın.

## Özellikler

- 🔐 **Güvenli Kimlik Doğrulama** - JWT tabanlı kimlik doğrulama, 2FA desteği
- 🖥️ **Çoklu Oturum** - Aynı anda birden fazla sunucuya bağlanın
- 📁 **SFTP Dosya Yönetimi** - Dosya yükleme, indirme, düzenleme
- 🐳 **Docker Yönetimi** - Container'ları web arayüzünden yönetin
- 📊 **Ağ Araçları** - Ping, port tarama
- 🎬 **Oturum Kaydı** - Terminal oturumlarını kaydetme
- 👥 **Ekip Paylaşımı** - Terminal oturumlarını ekip arkadaşlarınızla paylaşın
- 📱 **PWA Desteği** - Mobil cihazlarda native uygulama gibi çalışır
- ⚡ **Komut Paleti** - Ctrl+K ile hızlı erişim

## Kurulum

### Gereksinimler

- Node.js 18+

### Yerel Geliştirme

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın
npm run dev

# Tarayıcıda açın
# http://localhost:3001
```

### Docker ile Çalıştırma

```bash
# Docker Compose ile başlatın
docker-compose up -d
```

### Production Deployment

```bash
# Production build
npm run build

# PM2 ile çalıştırın
pm2 start dist/server.js --name webterminal
```

## Yapılandırma

`.env` dosyası oluşturun:

```env
PORT=3001
NODE_ENV=production
JWT_SECRET=your-super-secret-key-here
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
```

## API Endpoints

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/health` | Sunucu sağlık kontrolü |
| `POST /api/auth/register` | Yeni kullanıcı kaydı |
| `POST /api/auth/login` | Giriş |
| `GET /api/profiles` | Kayıtlı sunucuları listele |
| `POST /api/profiles` | Sunucu ekle |
| `DELETE /api/profiles/:id` | Sunucu sil |
| `GET /api/audit-logs` | Denetim kayıtları |
| `GET /api/admin/users` | Kullanıcı yönetimi (Admin) |
| `GET /api/admin/stats` | İstatistikler (Admin) |

## Klavye Kısayolları

| Kısayol | Açıklama |
|---------|----------|
| `Ctrl+K` | Komut paletini aç |
| `Ctrl+Shift+T` | Yeni bağlantı |
| `Ctrl+Shift+W` | Sekmeyi kapat |
| `Ctrl+Shift+\` | Split view toggle |
| `F11` | Tam ekran |

## Güvenlik

- Tüm şifreler bcrypt ile hashlenir
- JWT token ile oturum yönetimi
- Rate limiting ile brute-force koruması
- Helmet.js ile HTTP güvenlik başlıkları
- 2FA (TOTP) desteği

## Lisans

MIT License
