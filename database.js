/**
 * Supabase-backed Database for Group Settings
 *
 * Keeps the exact same synchronous function signatures the rest of the bot
 * already relies on (getGroupSettings, updateGroupSettings, getUser, etc).
 * Internally, everything lives in an in-memory cache that is:
 *   1. Loaded from Supabase once at startup (index.js awaits database.ready())
 *   2. Kept in sync - every write updates the cache immediately (so callers
 *      get instant, synchronous results) and is pushed to Supabase in the
 *      background (fire-and-forget, with console logging on failure).
 *
 * If Supabase is not configured (no URL/key in config or env vars), this
 * module transparently falls back to the original local JSON file storage,
 * so the bot still works without Supabase set up.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

// ---------------------------------------------------------------------------
// Supabase client setup
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || (config.supabase && config.supabase.url) || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || (config.supabase && config.supabase.key) || '';

let supabase = null;
let supabaseEnabled = false; // credentials/client configured
let supabaseHealthy = false; // schema/connection/migration verified at startup

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
    supabaseEnabled = true;
  } catch (error) {
    console.error('Supabase client could not be initialized, falling back to local JSON storage:', error.message);
  }
} else {
  console.log('Supabase not configured (SUPABASE_URL / SUPABASE_KEY missing) - using local JSON storage.');
}

// ---------------------------------------------------------------------------
// Local JSON fallback (unchanged from the original implementation)
// ---------------------------------------------------------------------------

const DB_PATH = path.join(__dirname, 'database');
const GROUPS_DB = path.join(DB_PATH, 'groups.json');
const USERS_DB = path.join(DB_PATH, 'users.json');
const WARNINGS_DB = path.join(DB_PATH, 'warnings.json');
const MODS_DB = path.join(DB_PATH, 'mods.json');
const SUDO_DB = path.join(DB_PATH, 'sudo.json');

if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(DB_PATH, { recursive: true });
}

const initDB = (filePath, defaultData = {}) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
};

initDB(GROUPS_DB, {});
initDB(USERS_DB, {});
initDB(WARNINGS_DB, {});
initDB(MODS_DB, { moderators: [] });
initDB(SUDO_DB, { sudoUsers: [] });

const readDB = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading database: ${error.message}`);
    return {};
  }
};

const writeDB = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing database: ${error.message}`);
    return false;
  }
};

// ---------------------------------------------------------------------------
// In-memory cache (source of truth for every synchronous read)
// ---------------------------------------------------------------------------

const cache = {
  groups: {},
  users: {},
  warnings: {},
  moderators: [],
  sudoUsers: []
};

let loadedFromLocal = false;

const loadLocalIntoCache = () => {
  if (loadedFromLocal) return;
  cache.groups = readDB(GROUPS_DB);
  cache.users = readDB(USERS_DB);
  cache.warnings = readDB(WARNINGS_DB);
  cache.moderators = (readDB(MODS_DB).moderators) || [];
  cache.sudoUsers = (readDB(SUDO_DB).sudoUsers) || [];
  loadedFromLocal = true;
};

loadLocalIntoCache();

/**
 * Pulls everything from Supabase into the in-memory cache.
 * Call this once at startup (index.js awaits database.ready()).
 * Safe to call even if Supabase isn't configured (it's a no-op then).
 */
const ready = async () => {
  if (!supabaseEnabled) return;

  try {
    const [groupsRes, usersRes, warningsRes, modsRes, sudoRes] = await Promise.all([
      supabase.from('kb_groups').select('group_id, settings'),
      supabase.from('kb_users').select('user_id, data'),
      supabase.from('kb_warnings').select('key, data'),
      supabase.from('kb_moderators').select('user_id'),
      supabase.from('kb_sudo_users').select('jid')
    ]);

    if (groupsRes.error) throw groupsRes.error;
    if (usersRes.error) throw usersRes.error;
    if (warningsRes.error) throw warningsRes.error;
    if (modsRes.error) throw modsRes.error;
    if (sudoRes.error) throw sudoRes.error;

    const groups = {};
    for (const row of groupsRes.data || []) groups[row.group_id] = row.settings;

    const users = {};
    for (const row of usersRes.data || []) users[row.user_id] = row.data;

    const warnings = {};
    for (const row of warningsRes.data || []) warnings[row.key] = row.data;

    // Preserve existing local JSON data. Supabase values win on key conflicts;
    // local-only keys are migrated to Supabase instead of being discarded.
    cache.groups = { ...cache.groups, ...groups };
    cache.users = { ...cache.users, ...users };
    cache.warnings = { ...cache.warnings, ...warnings };
    cache.moderators = [...new Set([...(cache.moderators || []), ...(modsRes.data || []).map(r => r.user_id)])];
    cache.sudoUsers = [...new Set([...(cache.sudoUsers || []), ...(sudoRes.data || []).map(r => r.jid)])];

    // Persist merged records so a first-time/empty Supabase project does not
    // silently lose pre-existing local data. Writes are awaited at startup.
    const migrations = [
      ...Object.entries(cache.groups).map(([group_id, settings]) => supabase.from('kb_groups').upsert({ group_id, settings }, { onConflict: 'group_id' })),
      ...Object.entries(cache.users).map(([user_id, data]) => supabase.from('kb_users').upsert({ user_id, data }, { onConflict: 'user_id' })),
      ...Object.entries(cache.warnings).map(([key, data]) => supabase.from('kb_warnings').upsert({ key, data }, { onConflict: 'key' })),
      ...cache.moderators.map(user_id => supabase.from('kb_moderators').upsert({ user_id }, { onConflict: 'user_id' })),
      ...cache.sudoUsers.map(jid => supabase.from('kb_sudo_users').upsert({ jid }, { onConflict: 'jid' }))
    ];
    const migrationResults = await Promise.all(migrations);
    const migrationError = migrationResults.find(result => result?.error)?.error;
    if (migrationError) throw migrationError;

    writeDB(GROUPS_DB, cache.groups);
    writeDB(USERS_DB, cache.users);
    writeDB(WARNINGS_DB, cache.warnings);
    writeDB(MODS_DB, { moderators: cache.moderators });
    writeDB(SUDO_DB, { sudoUsers: cache.sudoUsers });
    supabaseHealthy = true;
    console.log('Supabase database loaded; local data merged safely.');
  } catch (error) {
    supabaseHealthy = false;
    console.error('Supabase health check/migration failed; using local JSON fallback:', error.message);
  }
};

const bgUpsert = (table, row, onConflict) => {
  if (!supabaseEnabled || !supabaseHealthy) return;
  supabase.from(table).upsert(row, onConflict ? { onConflict } : undefined)
    .then(({ error }) => {
      if (error) console.error(`Supabase upsert failed (${table}):`, error.message);
    });
};

const bgDelete = (table, match) => {
  if (!supabaseEnabled || !supabaseHealthy) return;
  let query = supabase.from(table).delete();
  for (const [col, val] of Object.entries(match)) {
    query = query.eq(col, val);
  }
  query.then(({ error }) => {
    if (error) console.error(`Supabase delete failed (${table}):`, error.message);
  });
};

// ---------------------------------------------------------------------------
// Group Settings
// ---------------------------------------------------------------------------

const getGroupSettings = (groupId) => {
  if (!cache.groups[groupId]) {
    cache.groups[groupId] = { ...config.defaultGroupSettings };
    writeDB(GROUPS_DB, cache.groups);
    bgUpsert('kb_groups', { group_id: groupId, settings: cache.groups[groupId] }, 'group_id');
  }
  return cache.groups[groupId];
};

const updateGroupSettings = (groupId, settings) => {
  cache.groups[groupId] = { ...cache.groups[groupId], ...settings };
  const ok = writeDB(GROUPS_DB, cache.groups);
  bgUpsert('kb_groups', { group_id: groupId, settings: cache.groups[groupId] }, 'group_id');
  return ok;
};

// ---------------------------------------------------------------------------
// User Data
// ---------------------------------------------------------------------------

const getUser = (userId) => {
  if (!cache.users[userId]) {
    cache.users[userId] = {
      registered: Date.now(),
      premium: false,
      banned: false
    };
    writeDB(USERS_DB, cache.users);
    bgUpsert('kb_users', { user_id: userId, data: cache.users[userId] }, 'user_id');
  }
  return cache.users[userId];
};

const updateUser = (userId, data) => {
  cache.users[userId] = { ...cache.users[userId], ...data };
  const ok = writeDB(USERS_DB, cache.users);
  bgUpsert('kb_users', { user_id: userId, data: cache.users[userId] }, 'user_id');
  return ok;
};

// ---------------------------------------------------------------------------
// Warnings System
// ---------------------------------------------------------------------------

const getWarnings = (groupId, userId) => {
  const key = `${groupId}_${userId}`;
  return cache.warnings[key] || { count: 0, warnings: [] };
};

const addWarning = (groupId, userId, reason) => {
  const key = `${groupId}_${userId}`;

  if (!cache.warnings[key]) {
    cache.warnings[key] = { count: 0, warnings: [] };
  }

  cache.warnings[key].count++;
  cache.warnings[key].warnings.push({
    reason,
    date: Date.now()
  });

  writeDB(WARNINGS_DB, cache.warnings);
  bgUpsert('kb_warnings', { key, data: cache.warnings[key] }, 'key');
  return cache.warnings[key];
};

const removeWarning = (groupId, userId) => {
  const key = `${groupId}_${userId}`;

  if (cache.warnings[key] && cache.warnings[key].count > 0) {
    cache.warnings[key].count--;
    cache.warnings[key].warnings.pop();
    writeDB(WARNINGS_DB, cache.warnings);
    bgUpsert('kb_warnings', { key, data: cache.warnings[key] }, 'key');
    return true;
  }
  return false;
};

const clearWarnings = (groupId, userId) => {
  const key = `${groupId}_${userId}`;
  delete cache.warnings[key];
  const ok = writeDB(WARNINGS_DB, cache.warnings);
  bgDelete('kb_warnings', { key });
  return ok;
};

// ---------------------------------------------------------------------------
// Moderators System
// ---------------------------------------------------------------------------

const getModerators = () => {
  return cache.moderators || [];
};

const addModerator = (userId) => {
  if (!cache.moderators) cache.moderators = [];
  if (!cache.moderators.includes(userId)) {
    cache.moderators.push(userId);
    writeDB(MODS_DB, { moderators: cache.moderators });
    bgUpsert('kb_moderators', { user_id: userId }, 'user_id');
    return true;
  }
  return false;
};

const removeModerator = (userId) => {
  if (cache.moderators) {
    cache.moderators = cache.moderators.filter(id => id !== userId);
    writeDB(MODS_DB, { moderators: cache.moderators });
    bgDelete('kb_moderators', { user_id: userId });
    return true;
  }
  return false;
};

const isModerator = (userId) => {
  const mods = getModerators();
  return mods.includes(userId);
};

// ---------------------------------------------------------------------------
// Sudo Users System - stores full JIDs (e.g. 602455062940@s.whatsapp.net or xyz@lid)
// ---------------------------------------------------------------------------

const toStoredJid = (input) => {
  const s = String(input).trim();
  if (!s) return null;
  if (s.includes('@')) return s;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 10 ? `${digits}@s.whatsapp.net` : null;
};

const getSudoUsers = () => {
  const raw = cache.sudoUsers || [];
  return raw.map((entry) => (entry.includes('@') ? entry : `${entry}@s.whatsapp.net`));
};

const addSudoUser = (userIdOrJid) => {
  if (!cache.sudoUsers) cache.sudoUsers = [];
  const jid = toStoredJid(userIdOrJid);
  if (!jid) return false;
  if (!cache.sudoUsers.includes(jid)) {
    cache.sudoUsers.push(jid);
    writeDB(SUDO_DB, { sudoUsers: cache.sudoUsers });
    bgUpsert('kb_sudo_users', { jid }, 'jid');
    return true;
  }
  return false;
};

const removeSudoUser = (userIdOrJid) => {
  if (!cache.sudoUsers) return false;
  const jid = toStoredJid(userIdOrJid);
  if (!jid) return false;
  const before = cache.sudoUsers.length;
  const jidUser = jid.split('@')[0];
  cache.sudoUsers = cache.sudoUsers.filter((entry) => {
    const entryJid = entry.includes('@') ? entry : `${entry}@s.whatsapp.net`;
    const entryUser = entryJid.split('@')[0];
    return entryJid !== jid && entryUser !== jidUser;
  });
  writeDB(SUDO_DB, { sudoUsers: cache.sudoUsers });
  if (cache.sudoUsers.length < before) {
    bgDelete('kb_sudo_users', { jid });
    return true;
  }
  return false;
};

const isSudoUser = (sender) => {
  const sudo = getSudoUsers();
  if (!sender) return false;
  const senderStr = String(sender).trim();
  const senderUser = senderStr.includes('@')
    ? senderStr.split('@')[0].split(':')[0]
    : (senderStr.replace(/\D/g, '') || senderStr);
  if (!senderUser) return false;
  return sudo.some((jid) => {
    const storedUser = jid.split('@')[0]?.split(':')[0] || '';
    if (!storedUser) return false;
    return (
      storedUser === senderUser ||
      (senderUser.length >= 10 && (storedUser.startsWith(senderUser) || senderUser.startsWith(storedUser)))
    );
  });
};

module.exports = {
  ready,
  isSupabaseEnabled: () => supabaseHealthy,
  isSupabaseConfigured: () => supabaseEnabled,
  getGroupSettings,
  updateGroupSettings,
  getUser,
  updateUser,
  getWarnings,
  addWarning,
  removeWarning,
  clearWarnings,
  getModerators,
  addModerator,
  removeModerator,
  isModerator,
  getSudoUsers,
  addSudoUser,
  removeSudoUser,
  isSudoUser
};
