# KnightBot-Mini: Supabase, multi-account and VPS setup

## Important behavior

- The original `session/` directory is retained for the primary WhatsApp account. Do not delete it when updating the code.
- Multiple accounts run as separate Node.js child processes with separate auth directories. Set `WHATSAPP_ACCOUNTS=main,second,third`; the first account uses `session/`, while the other accounts use `session-second/`, `session-third/`, etc. Each account must be paired separately.
- All account processes share the configured Supabase database. For multiple processes, Supabase is strongly recommended over local JSON because local JSON files are not a multi-process database.
- The bot does not use AI to interpret archived photos. `PHOTO_ARCHIVE=true` forwards incoming image messages to the configured owner's WhatsApp chat, limited by `PHOTO_ARCHIVE_MAX_BYTES`. It is off by default. Tell group members when appropriate before enabling message/photo archiving.
- The menu has editable WhatsApp, GitHub and Facebook links. `ADD_YOUR_*` placeholders should be replaced in `.env` or `config.js`.
- `ALLOW_SELF_EVOLVE` defaults to false because autonomous source edits can damage the running bot.

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase_setup.sql`.
3. Copy `.env.example` to `.env` and set `SUPABASE_URL` and `SUPABASE_KEY`.
4. Use a server-only secret key supported by your Supabase project, or the legacy `service_role` key. Never use a privileged key in a browser/client app and never commit `.env` to GitHub. The key bypasses normal row-level access protections.
5. Start the bot and check that startup logs report `Database: Supabase`. If it reports local JSON, the environment variables were not loaded or are incorrect.
6. Confirm records appear in the five `kb_*` tables after using a database-backed command. If table/RLS errors appear, fix them before relying on cloud persistence.

The startup merge keeps local-only JSON records and imports them to Supabase; Supabase records take precedence for keys that already exist in Supabase. Keep a backup of the `database/` directory before the first migration.

## Install and run locally on Windows

Use Node.js 20 or newer. Open PowerShell in the extracted project folder:

```powershell
Copy-Item .env.example .env
notepad .env
npm install
npm test
npm start
```

Install `yt-dlp` and make sure `yt-dlp --version` works in the same terminal if you want the built-in YouTube fallback. Keep the original `session/` folder when updating the bot.

For more than one account, set for example `WHATSAPP_ACCOUNTS=main,second` in `.env`, then run `npm start`. Pair each account when its QR appears. The first account uses the old `session/` folder; the second gets `session-second/`.

## VPS (24/7)

1. Upload/extract the project to persistent disk (not an ephemeral temporary folder).
2. Install Node.js 20+, `yt-dlp`, and FFmpeg (FFmpeg improves audio conversion; the direct video fallback selects a single MP4 format when available).
3. Copy `.env.example` to `.env`, set the Supabase values and account IDs, and lock down file permissions so other users cannot read `.env` or session folders.
4. Upload the existing `session/` folder only if you intend to move the already-paired primary account. Do not run the same WhatsApp session on local PC and VPS simultaneously.
5. Run `npm install`, `npm test`, then `npm start` for an initial QR/pairing test.
6. For 24/7 use, run under `systemd` or PM2 and configure restart-on-failure. Back up session folders securely.

Example PM2 command:

```bash
npm install --global pm2
pm2 start index.js --name knightbot
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup` as instructed by PM2. Keep the project directory and session folders on persistent storage.

## Download command limitations

The existing third-party download APIs are still tried first. If they fail, `.song` and `.ytvideo` use the local `yt-dlp` executable. The `.tiktok`, `.facebook`, `.instagram`, `.twitter` and `.pinterest` media commands also have a `yt-dlp` fallback for supported public posts. This reduces dependence on public API providers, but cannot guarantee downloads for every post: login/cookie requirements, private posts, provider restrictions, age/region restrictions, rate limits, deleted posts and format availability still apply. Instagram sticker-specific commands may still depend on their scraper. Only download content you are allowed to download.

## Multi-account caution

Each account has its own WhatsApp session and reconnecting process, but bot configuration and owner permissions are shared. The same owner number, prefix and feature configuration apply to all accounts. Keep `WHATSAPP_ACCOUNTS` IDs stable; changing an ID changes the session directory name.
