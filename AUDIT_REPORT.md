# KnightBot-Mini repair audit

## Summary

This is a source-code repair, not a live WhatsApp certification. The original `session/` folder was not included in or modified by this repair, and the supplied local JSON files were retained. No Supabase credentials were added.

## Changes made

- **Multiple WhatsApp accounts:** added `WHATSAPP_ACCOUNTS=main,second,...` supervisor mode. Each account runs in a separate Node process and gets an isolated auth directory. The first account continues to use the original `session/` directory; later accounts use `session-<id>/`. Only the first account can consume `SESSION_ID`.
- **Local environment loading:** added `dotenv` and loads `.env` before bot configuration. Added `.env.example` and `.gitignore` so real environment files, sessions and dependencies are not committed accidentally.
- **Supabase safety:** the database startup merge now preserves local-only JSON records and imports them to Supabase; existing Supabase records take precedence on matching keys. Startup distinguishes a healthy Supabase connection from a configured-but-failing connection and disables background Supabase writes when startup health/migration fails.
- **YouTube fallback:** `.song` and `.ytvideo` still try existing API providers, then fall back to a local `yt-dlp` executable. `.tiktok`, `.facebook`, `.instagram`, `.twitter` and `.pinterest` also have a guarded `yt-dlp` fallback for public media URLs. URL host validation, timeouts, temp directory cleanup and file-size limits are included.
- **Welcome/goodbye messages:** configured templates are now used directly and support `@user`, `@group`, `#memberCount`/`memberCount`, `groupDesc`, `botName`, and `time`. The join/leave event no longer waits on a third-party welcome-image API, which improves speed and makes `.setwelcome`/`.setgoodbye` take effect consistently.
- **Photo forwarding:** optional photo-only forwarding to the owner chat is available with `PHOTO_ARCHIVE=true`; no AI analysis is performed. It is off by default and has a file-size cap.
- **Menu:** removed newsletter-forwarding attribution from the menu message and added editable WhatsApp, GitHub and Facebook links. Values can be set in `.env` or `config.js`.
- **Safety/performance:** autonomous self-editing is off by default (`ALLOW_SELF_EVOLVE=true` is required to enable it). Startup no longer deletes the Puppeteer cache, avoiding unnecessary disk I/O.
- **Setup docs:** added `DEPLOYMENT.md`, Supabase setup guidance, Windows steps, VPS steps and PM2 example. SQL enables RLS on the tables and documents that only a server-side privileged key should be used by the bot.

## Validation performed

- JavaScript syntax checks were run across project JS files.
- Automated tests: **10 passed, 0 failed**. This includes existing deletion-audit, command UI, download-command and reset-warning tests, plus new YouTube URL validation tests.
- ZIP integrity was checked after packaging.

## Not live-tested / remaining blockers

- No real WhatsApp QR pairing or multi-account session test was possible in this environment. Pair each account separately and do not run the same session simultaneously on local PC and VPS.
- No live Supabase credentials were provided. Run `supabase_setup.sql`, configure `.env`, and verify startup reports `Supabase (healthy)` before relying on cloud persistence.
- No live YouTube/Instagram/TikTok/etc. download was performed. Public download APIs may be offline or blocked. The new fallback requires `yt-dlp` on PATH. Public-post support varies by platform, and private/login-protected content may need cookies or may not be downloadable. Instagram sticker-specific commands still depend on their scraper.
- The photo-forwarding feature was syntax-checked but not tested against a live media message. It is opt-in and forwards incoming images to the configured owner number; enable only when appropriate.
- The rest of the 100+ commands were not individually integration-tested. API-key-dependent features still need their own credentials.
- Existing dependency versions include old or prerelease packages. Do not run a blind dependency upgrade on a live bot; test upgrades separately and keep a backup.

## Recommended first run

1. Back up the existing `session/`, `database/`, and `.env` before replacing files.
2. Copy `.env.example` to `.env`, fill in owner number, Supabase URL/key and social links.
3. Run the SQL in Supabase SQL Editor.
4. Install `yt-dlp` and verify `yt-dlp --version`.
5. Run `npm install`, `npm test`, then `npm start`.
6. Confirm `Database: Supabase (healthy)` appears. If not, fix Supabase schema/key/network errors before relying on cloud storage.
7. For multiple accounts, set `WHATSAPP_ACCOUNTS=main,second` and pair each account in turn. Keep all session directories persistent on the VPS.
