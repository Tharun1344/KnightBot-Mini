/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: (process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER.split(',').map(v => v.trim()).filter(Boolean) : ['94775585251']), // International format, no +
    ownerName: (process.env.OWNER_NAME ? process.env.OWNER_NAME.split(',').map(v => v.trim()).filter(Boolean) : ['THARUN PRABASHWARA']),
    
    // Bot Configuration
    botName: process.env.BOT_NAME || 'THARUN-WA-BOT',
    prefix: '.',
    sessionName: process.env.SESSION_NAME || 'session',
    sessionID: (process.env.BOT_ACCOUNT_CHILD !== '1' || process.env.BOT_ACCOUNT_INDEX === '0') ? (process.env.SESSION_ID || '') : '',
    // Menu links are editable here or through environment variables.
    updateZipUrl: 'https://github.com/tharunprabashwara642-dot/KnightBot-Mini/archive/refs/heads/main.zip', // Prefer the configured owner's repository, not the upstream template
    
    // Sticker Configuration
    packname: 'Knight Bot',
    
    // Bot Behavior
    selfMode: true, // Private mode - only owner can use commands
    autoRead: false,
    autoTyping: false,
    autoBio: false,
    autoSticker: false,
    autoReact: true,
    autoReactMode: 'bot',
    autoDownload: false,
    
    // Group Settings Defaults
    defaultGroupSettings: {
      antilink: false,
      antilinkAction: 'delete', // 'delete', 'kick', 'warn'
      antitag: false,
      antitagAction: 'delete',
      antiall: false, // Owner only - blocks all messages from non-admins
      antiviewonce: true,
      antibot: false,
      antibotAction: 'warn', // 'warn' | 'kick'
      anticall: false, // Anti-call feature
      antigroupmention: false, // Anti-group mention feature
      antigroupmentionAction: 'delete', // 'delete', 'kick'
      antigroupstatus: false, // Block group status posts
      antigroupstatusAction: 'delete', // 'delete', 'kick'
      antisticker: false, // Stickers not allowed in group
      antistickerAction: 'delete', // 'delete', 'kick'
      antibadword: false, // Block bad words in group
      antibadwordAction: 'delete', // 'delete', 'kick', 'warn'
      welcome: true,
      welcomeMessage: '╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @user 👋\n┃Member count: #memberCount\n┃𝚃𝙸𝙼𝙴: time⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@user* Welcome to *@group*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\ngroupDesc\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ botName*',
      goodbye: false,
      goodbyeMessage: 'Goodbye @user, bye bye bro!',
      antiSpam: false,
      antidelete: true,
      nsfw: false,
      detect: false,
      chatbot: true,
      autosticker: false // Auto-convert images/videos to stickers
    },
    
    // Supabase Configuration — used by database.js for persistent storage
    // (group settings, users, warnings, moderators, sudo users). If left
    // blank, the bot automatically falls back to local JSON file storage,
    // so this is optional. Can also be set via env vars (recommended for
    // Railway, so your keys aren't committed to GitHub):
    //   SUPABASE_URL=https://xxxx.supabase.co
    //   SUPABASE_KEY=your_service_role_or_anon_key
    supabase: {
      url: process.env.SUPABASE_URL || 'https://yshfhqnjfwxcmzwqgone.supabase.co',
      key: process.env.SUPABASE_KEY || 'sb_publishable_no7UMKfxGdE0ix4pIolVTg_c-Cmebl9'
    },

    // API Keys (add your own)
    apiKeys: {
      // Add API keys here if needed
      openai: '',
      deepai: '',
      remove_bg: ''
    },

    // Gemini Configuration — used by the .gemini chat command and by the
    // self-evolve agent (see selfEvolve below). You can add as many keys as
    // you want; when the currently active key hits its rate limit, the bot
    // automatically switches to the next one — no restart needed.
    // Keys can also be supplied via env vars instead of editing this file:
    //   GEMINI_API_KEY=single_key
    //   GEMINI_API_KEYS=key_one,key_two,key_three
    gemini: {
      apiKeys: [
        // 'AQ.Ab8RN6If0YuXOFO-v7-tjXe07lmGMFbbV-eo9vkAOb9zRiC6wA',
        // 'AQ.Ab8RN6LFToUyoGrgTRlhRxrD3jMiJaRVbPAq5X0Fg_wYEMGuUw',
      ],
      model: 'gemini-3.6-flash' // or 'gemini-2.5-pro', etc.
    },

    // GitHub integration — used by .repos, .issues, and by .evolve to open
    // a Pull Request for review after making a local change. NEVER put a
    // token here. Set the token only as the GITHUB_TOKEN environment
    // variable (Railway → Variables), scoped to "repo" (Contents +
    // Pull requests: read/write). Do NOT grant "Delete repositories".
    github: {
      owner: 'tharunprabashwara642-dot',
      repo: 'KnightBot-Mini',
      defaultBranch: 'main'
    },

    // Self-Evolve Configuration (autonomous self-code-editing via .evolve).
    // WARNING: When enabled, the bot owner can tell the bot (in Gemini chat)
    // to read and rewrite its OWN source files, then restart itself. It's
    // always owner-only regardless of this flag. Off by default — turn on
    // only if you understand the risk, and keep the project in a git repo
    // so changes can be checked out / rolled back.
    // Can also be enabled via env var: ALLOW_SELF_EVOLVE=true
    selfEvolve: {
      enabled: process.env.ALLOW_SELF_EVOLVE === 'true'
    },
    
    // Message Configuration
    messages: {
      wait: '⏳ Please wait...',
      success: '✅ Success!',
      error: '❌ Error occurred!',
      ownerOnly: '👑 This command is only for bot owner!',
      adminOnly: '🛡️ This command is only for group admins!',
      groupOnly: '👥 This command can only be used in groups!',
      privateOnly: '💬 This command can only be used in private chat!',
      botAdminNeeded: '🤖 Bot needs to be admin to execute this command!',
      invalidCommand: '❓ Invalid command! Type .menu for help'
    },
    
    // Timezone
    timezone: 'Asia/colombo',
    
    // Limits
    maxWarnings: 3,
    
    // Social Links (optional)
    social: {
      whatsapp: process.env.BOT_WHATSAPP_LINK || 'https://wa.me/94707915458',
      github: process.env.BOT_GITHUB_LINK || 'https://www.github.com/tharunprabashwara642-dot',
      facebook: process.env.BOT_FACEBOOK_LINK || 'https://www.facebook.com/share/19VgDmvpR2/?mibextid=wwXIfr'
    },

    // Optional: forward incoming photos to the owner's self-chat (no AI analysis).
    // Enable explicitly with PHOTO_ARCHIVE=true after informing users as appropriate.
    photoArchive: {
      enabled: process.env.PHOTO_ARCHIVE === 'true',
      maxBytes: Number(process.env.PHOTO_ARCHIVE_MAX_BYTES || 8388608)
    }
};
