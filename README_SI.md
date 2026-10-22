# KnightBot-Mini — සිංහල ස්ථාපන මාර්ගෝපදේශය

## 📋 අන්තර්ගතය
1. [අවශ්‍ය Software](#1-අවශ්‍ය-software)
2. [ZIP Extract](#2-zip-extract-කිරීම)
3. [Dependencies Install](#3-dependencies-install-කිරීම)
4. [Configuration](#4-configuration-සකස්-කිරීම)
5. [Owner Details](#5-owner-details-සහ-bot-name-වෙනස්-කිරීම)
6. [QR Code Connect](#6-qr-code-එකෙන්-connect-කිරීම)
7. [Pairing Code Connect](#7-pairing-code-එකෙන්-connect-කිරීම)
8. [Multiple Accounts](#8-accounts-කිහිපයක්-එකතු-කිරීම)
9. [Private/Public Mode](#9-privatepublic-mode-මාරු-කිරීම)
10. [Commands සහ Downloader](#10-commands-සහ-downloader)
11. [Windows Local Run](#11-windows-local-run)
12. [VPS Deploy](#12-vps-deploy)
13. [Restart සහ Logs](#13-restart-සහ-logs)
14. [Backup සහ Restore](#14-backup-සහ-restore)
15. [පොදු Errors](#15-පොදු-errors-සහ-නිවැරදි-කිරීම)

---

## 1. අවශ්‍ය Software

### Windows PC සඳහා
| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | v20 හෝ ඊට ඉහල | [nodejs.org](https://nodejs.org) |
| **yt-dlp** | Latest | [github.com/yt-dlp](https://github.com/yt-dlp/yt-dlp/releases) |
| **FFmpeg** | Latest | [ffmpeg.org](https://ffmpeg.org/download.html) |

**Node.js install කිරීමෙන් පසු verify කරන්න:**
```powershell
node --version   # v20.x.x හෝ ඊට ඉහල ලැබිය යුතුය
npm --version    # 9.x.x හෝ ඊට ඉහල
```

**yt-dlp install (Windows):**
```powershell
# Method 1 - Direct download (winget)
winget install yt-dlp

# Method 2 - Manual
# yt-dlp.exe file download කර C:\Windows\System32 ෆෝල්ඩරයේ paste කරන්න
yt-dlp --version  # verify
```

---

## 2. ZIP Extract කිරීම

```powershell
# Downloads ෆෝල්ඩරයේ ZIP extract කරන්න
Expand-Archive -Path "KnightBot-Mini-repaired.zip" -DestinationPath "C:\KnightBot"

# ෆෝල්ඩරය open කරන්න
cd "C:\KnightBot\KnightBot-Mini"
```

**Project structure:**
```
KnightBot-Mini/
├── index.js          # Bot main entry point
├── config.js         # Bot configuration
├── handler.js        # Message handler
├── database.js       # Database (Supabase + JSON)
├── commands/         # Bot commands
│   ├── admin/        # Group admin commands
│   ├── ai/           # AI commands
│   ├── general/      # General commands
│   ├── media/        # Downloader commands
│   ├── owner/        # Owner-only commands
│   ├── textmaker/    # Text effect commands
│   └── utility/      # Utility commands
├── utils/            # Helper utilities
├── database/         # Local JSON storage
├── session/          # WhatsApp session files
├── .env.example      # Environment variables template
├── setup.bat         # Windows setup script
├── run.bat           # Windows run script
└── stop.bat          # Windows stop script
```

---

## 3. Dependencies Install කිරීම

### Method 1 — Setup Script (Recommended)
```powershell
# Project ෆෝල්ඩරය තුළ:
.\setup.bat
```

### Method 2 — Manual
```powershell
# Project ෆෝල්ඩරය open කරන්න
cd "C:\KnightBot\KnightBot-Mini"

# .env file create කරන්න
Copy-Item ".env.example" ".env"

# Dependencies install කරන්න
npm install --legacy-peer-deps

# Tests run කරන්න
npm test
```

---

## 4. Configuration සකස් කිරීම

`.env` file notepad හෝ VS Code හරහා edit කරන්න:

```env
# Bot Identity
BOT_NAME=MY-WHATSAPP-BOT
OWNER_NAME=YOUR_NAME
OWNER_NUMBER=94XXXXXXXXX    # Country code සමඟ, + නොතිබිය යුතු

# Supabase (Optional - cloud storage)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_KEY=YOUR_SERVICE_ROLE_KEY

# WhatsApp Accounts
WHATSAPP_ACCOUNTS=main

# Social Links (menu හි දිස්වේ)
BOT_WHATSAPP_LINK=https://wa.me/94XXXXXXXXX
BOT_GITHUB_LINK=https://github.com/YOUR_GITHUB
BOT_FACEBOOK_LINK=https://facebook.com/YOUR_PAGE
```

> **⚠️ වැදගත්:** `.env` file Git repository-ට upload නොකරන්න. `.gitignore` ෆයිල් එකේ දැනටමත් exclude කර ඇත.

---

## 5. Owner Details සහ Bot Name වෙනස් කිරීම

**`.env` file හරහා (Recommended):**
```env
BOT_NAME=THARUN-WA-BOT          # ඔබේ bot නම
OWNER_NAME=THARUN PRABASHWARA   # ඔබේ නම
OWNER_NUMBER=94775585251         # ඔබේ WhatsApp number
```

**`config.js` file හරහා (Permanent defaults):**
```javascript
ownerNumber: ['94XXXXXXXXX'],    // ඔබේ number
ownerName: ['YOUR NAME'],
botName: 'MY-BOT-NAME',
prefix: '.',                     // Command prefix (. , / # etc.)
selfMode: true,                  // Private=true, Public=false
```

**Bot Prefix වෙනස් කිරීම:**
```env
# .env file-ෙ add කරන්න (config.js edit කළ නොහැකි නම් .mode command use කරන්න)
```
Bot start-ෙ ම prefix config.js-ෙ සකස් කළ හැකිය. Runtime-ෙ `.setprefix <prefix>` command use කරන්න.

---

## 6. QR Code එකෙන් Connect කිරීම

1. **Bot start කරන්න:**
   ```powershell
   .\run.bat
   # හෝ
   node index.js
   ```

2. **Terminal-ෙ QR code දිස්වේ:**
   ```
   📱 Scan this QR code with WhatsApp:
   
   [QR CODE WILL APPEAR HERE]
   ```

3. **WhatsApp-ෙ connect:**
   - WhatsApp Mobile app open කරන්න
   - Settings → Linked Devices → Link a Device
   - QR code scan කරන්න

4. **Success message:**
   ```
   ✅ Bot connected successfully!
   📱 Bot Number: 94XXXXXXXXX
   🤖 Bot Name: MY-BOT
   ```

> **Note:** QR code expire වූ විට automatically refresh වේ. නව QR code terminal-ෙ දිස්වේ.

---

## 7. Pairing Code එකෙන් Connect කිරීම

Baileys v7 (දැනටමත් install කර ඇති version) QR scan-ට alternative ලෙස phone number pairing support කරයි:

1. **Bot start කරන්න** (QR code screen-ෙ)
2. **Pairing mode activate:**
   - Bot start-ෙ QR code terminal-ෙ දිස්වේ
   - QR code scan කිරීමට ඒ script පමණ ඇත; pairing code API ස්ථාවරව ලබාගන්නේ Baileys version-ෙ requestPairingCode() function හරහා

3. **WhatsApp-ෙ:**
   - Settings → Linked Devices → Link with phone number
   - Pairing code ඇතුළු කරන්න

> **Note:** Pairing code feature Baileys v7 RC14 -ෙ experimental stage-ෙ. Connection error ලැබුනොත් QR code method use කරන්න.

---

## 8. Accounts කිහිපයක් එකතු කිරීම

**`.env` file-ෙ:**
```env
WHATSAPP_ACCOUNTS=main,shop,backup
```

**Bot start කළ විට:**
- `main` account → `session/` ෆෝල්ඩර use කරයි
- `shop` account → `session-shop/` ෆෝල්ඩර use කරයි
- `backup` account → `session-backup/` ෆෝල්ඩර use කරයි

**Setup steps:**
1. `.env` file-ෙ accounts list කරන්න
2. `npm start` run කරන්න
3. **First account** QR scan කරන්න → connect වූ විට second account-ෙ QR appear වේ
4. Each account separately scan/pair කරන්න

**⚠️ වැදගත් සීමා:**
- Same WhatsApp session PC-ෙ සහ VPS-ෙ **එකවරම** run **නොකරන්න**
- Account ID (main, shop) change කළ විට session ෆෝල්ඩරය change වේ (reconnect required)
- Multiple accounts use කිරීමේදී Supabase database strongly recommended

---

## 9. Private/Public Mode මාරු කිරීම

**Default mode:** `config.js` හෝ `.env`-ෙ `selfMode: true` (Private)

**Runtime change (Owner WhatsApp-ෙ):**
```
.mode private    # Private mode - owner පමණක්
.mode public     # Public mode - everyone
.mode            # Current mode check
```

**Private Mode:**
- Owner-ගේ Self Chat (Message Yourself) හරහා පමණක් commands
- Group messages, DMs from others — ignored

**Public Mode:**
- ඕනෑම user-ට allowed commands use කළ හැකිය
- Owner-only commands (`ownerOnly: true`) — owner-ට පමණක්

---

## 10. Commands සහ Downloader

### Command List
```
.menu           # Full command menu
.help <cmd>     # Specific command help
.list           # Detailed list with descriptions
```

### Media Downloaders
| Command | Platform | Usage |
|---------|----------|-------|
| `.song <query/URL>` | YouTube Audio | `.song shape of you` |
| `.ytvideo <query/URL>` | YouTube Video | `.ytvideo funny cats` |
| `.tiktok <URL>` | TikTok | `.tiktok https://vm.tiktok.com/...` |
| `.facebook <URL>` | Facebook | `.fb https://www.facebook.com/...` |
| `.instagram <URL>` | Instagram | `.ig https://www.instagram.com/p/...` |
| `.twitter <URL>` | Twitter/X | `.twitter https://x.com/...` |
| `.pinterest <URL>` | Pinterest | `.pin https://pin.it/...` |

### AI Commands
```
.ai <query>      # AI chat
.gemini <text>   # Gemini AI
.imagine <text>  # AI image generation
```

### Admin Commands (Group Admin only)
```
.welcome on/off     # Welcome message
.goodbye on/off     # Goodbye message
.antilink on/off    # Anti-link protection
.tagall             # Tag all members
.kick @user         # Kick member
.warn @user         # Warn member
```

---

## 11. Windows Local Run

### Quick Start
```powershell
# 1. Setup (first time only)
.\setup.bat

# 2. Start bot
.\run.bat

# 3. Stop bot
.\stop.bat

# 4. Restart
.\restart.bat
```

### Manual Run
```powershell
cd "C:\KnightBot\KnightBot-Mini"
node index.js
```

### Auto-restart on crash
`run.bat` ෆයිල් automatically restart loop include කර ඇත. Bot crash වුවහොත් 5 seconds-කින් restart වේ.

---

## 12. VPS Deploy

### Requirements
- Ubuntu 20.04+ / Debian 11+
- 1GB RAM minimum
- Node.js v20+

### Installation
```bash
# 1. System update
sudo apt update && sudo apt upgrade -y

# 2. Node.js 20 install
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. yt-dlp install
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# 4. FFmpeg install
sudo apt install -y ffmpeg

# 5. Project upload
# SCP හෝ SFTP හරහා project ෆෝල්ඩරය upload කරන්න
scp -r ./KnightBot-Mini user@your-vps-ip:/home/user/

# 6. Dependencies install
cd ~/KnightBot-Mini
npm install --legacy-peer-deps

# 7. .env setup
cp .env.example .env
nano .env   # Edit with your settings

# 8. Test
npm test
npm start
```

### PM2 (24/7 Process Manager)
```bash
# PM2 install
npm install -g pm2

# Bot start
pm2 start index.js --name knightbot

# Auto-start on server restart
pm2 save
pm2 startup    # Run the command it shows

# Useful PM2 commands
pm2 status          # Status check
pm2 logs knightbot  # View logs
pm2 restart knightbot  # Restart
pm2 stop knightbot     # Stop
```

### systemd (Alternative)
```bash
# Service file create කරන්න
sudo nano /etc/systemd/system/knightbot.service
```
```ini
[Unit]
Description=KnightBot-Mini WhatsApp Bot
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/KnightBot-Mini
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable knightbot
sudo systemctl start knightbot
sudo systemctl status knightbot
```

---

## 13. Restart සහ Logs

### Windows
```powershell
.\restart.bat           # Restart
Get-Content -Tail 50 logs\bot.log   # Recent logs (if logging enabled)
```

### VPS (PM2)
```bash
pm2 restart knightbot   # Restart
pm2 logs knightbot      # Live logs
pm2 logs knightbot --lines 100  # Last 100 lines
```

### VPS (systemd)
```bash
sudo systemctl restart knightbot
journalctl -u knightbot -f    # Live logs
journalctl -u knightbot -n 100  # Last 100 lines
```

---

## 14. Backup සහ Restore

### Backup
```bash
# Session files backup (most important!)
cp -r session/ ~/backup/session-$(date +%Y%m%d)/

# Database backup
cp -r database/ ~/backup/database-$(date +%Y%m%d)/

# .env backup
cp .env ~/backup/.env.bak
```

### Windows PowerShell Backup
```powershell
$date = Get-Date -Format "yyyyMMdd"
Copy-Item -Recurse "session" "backup\session-$date"
Copy-Item -Recurse "database" "backup\database-$date"
Copy-Item ".env" "backup\.env.bak"
```

### Restore
```bash
# Session restore
cp -r ~/backup/session-YYYYMMDD/ session/

# Database restore
cp -r ~/backup/database-YYYYMMDD/ database/
```

> **⚠️ Warning:** Session restore කිරීමෙන් පසු **PC-ෙ සහ VPS-ෙ** একवरम run **නොකරන්න**.

---

## 15. පොදු Errors සහ නිවැරදි කිරීම

### Error: Cannot find module 'dotenv'
```powershell
npm install --legacy-peer-deps
```

### Error: Cannot find module '@whiskeysockets/baileys'
```powershell
npm install --legacy-peer-deps
# node_modules ෆෝල්ඩරය delete කර නැවත install කිරීම
Remove-Item -Recurse -Force node_modules
npm install --legacy-peer-deps
```

### Error: QR code not appearing
- Internet connection check කරන්න
- `session/` ෆෝල්ඩරය delete කර නැවත try කරන්න
- Baileys WebSocket connection blocked නොවන බව confirm කරන්න

### Error: Bot disconnected after scan
- Session expire — නැවත QR scan කරන්න
- WhatsApp account ban/restricted — different number use කරන්න
- Same session PC+VPS concurrent run නොකිරීමට confirm කරන්න

### Error: Database connection failed
- `.env` ෆයිල් SUPABASE_URL හා SUPABASE_KEY correct ද?
- Supabase project active ද? (free tier pause වේ)
- `supabase_setup.sql` run කළේ ද?

### Error: yt-dlp not found
```powershell
# Windows
winget install yt-dlp

# verify
yt-dlp --version
```

### Error: ffmpeg not found (sticker commands fail)
```powershell
# Windows - Chocolatey
choco install ffmpeg

# Verify
ffmpeg -version
```

### Commands not working
1. Prefix correct ද? Default: `.` (full stop)
2. Private mode-ෙ ද? Owner Self Chat-ෙ try කරන්න
3. Owner number `.env` හෝ `config.js`-ෙ correct ද?
4. Group admin commands group-ෙ try කරන්නද?

### Bot not responding to anyone
- `selfMode: true` → Owner Self Chat-ෙ only
- `.mode public` command run කරන්න (Owner-ගේ Self Chat-ෙ)

---

## 📌 Quick Reference

| Action | Command/File |
|--------|-------------|
| Bot start | `.\run.bat` හෝ `node index.js` |
| Bot stop | `.\stop.bat` |
| Bot restart | `.\restart.bat` |
| Change mode | `.mode private/public` |
| Change prefix | `.setprefix <prefix>` |
| Change bot name | `.setbotname <name>` |
| Check menu | `.menu` |
| See all commands | `.list` |
| Owner settings | Edit `.env` |

---

*KnightBot-Mini — Built with ❤️ by THARUN PRABASHWARA*
