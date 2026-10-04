import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchor data directory to persistent user profile (AppData/Roaming on Windows)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getStorePaths() {
  const baseDir = process.env.APPDATA || (process.platform === 'darwin'
    ? path.join(process.env.HOME || '', 'Library', 'Application Support')
    : path.join(process.env.HOME || '', '.config'));
  const persistentDir = path.join(baseDir, 'Scify Music', 'data');
  const persistentFile = path.join(persistentDir, 'library.json');
  const persistentBackup = path.join(persistentDir, 'library.backup.json');

  // Fallback workspace dir
  const workspaceDir = path.resolve(__dirname, '..', 'data');
  const workspaceFile = path.join(workspaceDir, 'library.json');

  // Legacy scify-music config file
  const legacyFile = process.env.APPDATA ? path.join(process.env.APPDATA, 'scify-music', 'config.json') : null;

  return {
    DATA_DIR: persistentDir,
    DATA_FILE: persistentFile,
    BACKUP_FILE: persistentBackup,
    WORKSPACE_FILE: workspaceFile,
    LEGACY_FILE: legacyFile,
  };
}

const { DATA_DIR, DATA_FILE, BACKUP_FILE, WORKSPACE_FILE, LEGACY_FILE } = getStorePaths();

const MAX_HISTORY = 50;
const MAX_USER_LIBRARY = 300;

/**
 * Persistent Scify store for:
 *  - guilds: per-guild history, sessions, and user libraries (Discord bot)
 *  - playlists: user-created and imported playlists
 *  - favorites: favorited tracks
 *  - desktopLibrary: desktop user's collection (max 300)
 *  - settings: audio & UI configuration
 *  - stats: listening statistics
 *
 * Data is safely kept in data/library.json with automatic backup.
 */
class Store {
  constructor() {
    this.data = {
      guilds: {},
      playlists: {},
      favorites: [],
      desktopLibrary: [],
      userFavorites: {},
      userPlaylists: {},
      settings: {
        audioQuality: 'high',
        volume: 85,
        theme: 'dark',
        accentColor: '#00f0ff',
        minimizeToTray: true,
        startupBehavior: 'window',
        notifications: true,
        normalizeVolume: true,
        bassBoost: false,
        eqPreset: 'flat',
      },
      stats: {
        songsPlayed: 0,
        totalListeningTimeSec: 0,
        mostPlayed: {},
      },
    };
    this._load();
  }

  _load() {
    try {
      if (existsSync(DATA_FILE)) {
        const raw = readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        this._mergeData(parsed);
      } else if (existsSync(BACKUP_FILE)) {
        console.warn('Primary library.json missing — restoring from backup');
        const raw = readFileSync(BACKUP_FILE, 'utf8');
        this._mergeData(JSON.parse(raw));
      } else if (existsSync(WORKSPACE_FILE)) {
        console.log('Loading initial data from workspace library.json');
        const raw = readFileSync(WORKSPACE_FILE, 'utf8');
        this._mergeData(JSON.parse(raw));
      }
    } catch (err) {
      console.error('Failed to load library store:', err.message);
    }

    // Always check for legacy data to migrate (favorites & playlists from scify-music config.json)
    this._migrateLegacyData();

    // Ensure persistent file is saved
    this._save();
  }

  _mergeData(parsed) {
    if (!parsed) return;
    this.data = {
      ...this.data,
      ...parsed,
      guilds: { ...this.data.guilds, ...(parsed.guilds || {}) },
      playlists: { ...this.data.playlists, ...(parsed.playlists || {}) },
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : this.data.favorites,
      desktopLibrary: Array.isArray(parsed.desktopLibrary) ? parsed.desktopLibrary : this.data.desktopLibrary,
      userFavorites: { ...this.data.userFavorites, ...(parsed.userFavorites || {}) },
      userPlaylists: { ...this.data.userPlaylists, ...(parsed.userPlaylists || {}) },
      settings: { ...this.data.settings, ...(parsed.settings || {}) },
      stats: { ...this.data.stats, ...(parsed.stats || {}) },
    };
  }

  _migrateLegacyData() {
    if (!LEGACY_FILE || !existsSync(LEGACY_FILE)) return;
    try {
      const raw = readFileSync(LEGACY_FILE, 'utf8');
      const legacy = JSON.parse(raw);
      let migratedAny = false;

      // Migrate likedSongs to favorites & userFavorites
      if (Array.isArray(legacy.likedSongs) && legacy.likedSongs.length > 0) {
        for (const item of legacy.likedSongs) {
          const user = item.artist && item.artist !== 'Scify App' ? item.artist : 'default';
          const track = {
            url: item.query && item.query.startsWith('http') ? item.query : `ytsearch1:${item.query || item.title}`,
            title: item.title || item.query || 'Track',
            artist: item.artist || 'Unknown',
            thumbnail: item.thumbnail || (item.query && item.query.includes('v=') ? `https://i.ytimg.com/vi/${item.query.split('v=')[1]?.split('&')[0]}/mqdefault.jpg` : null),
            durationInSec: Math.floor((item.durationMs || 0) / 1000),
            addedAt: item.addedAt || Date.now(),
            addedBy: user,
          };
          if (!this.data.favorites.some((f) => f.url === track.url || f.title === track.title)) {
            this.data.favorites.unshift(track);
            migratedAny = true;
          }
          if (!this.data.userFavorites) this.data.userFavorites = {};
          if (!this.data.userFavorites[user]) this.data.userFavorites[user] = [];
          if (!this.data.userFavorites[user].some((f) => f.url === track.url || f.title === track.title)) {
            this.data.userFavorites[user].unshift(track);
          }
        }
      }

      // Migrate playlists
      if (Array.isArray(legacy.playlists) && legacy.playlists.length > 0) {
        for (const pl of legacy.playlists) {
          const plId = pl.id || `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          if (!this.data.playlists[plId]) {
            const tracks = (pl.tracks || []).map((t) => ({
              url: t.query && t.query.startsWith('http') ? t.query : `ytsearch1:${t.query || t.title}`,
              title: t.title || t.query || 'Track',
              artist: t.artist || 'Unknown',
              thumbnail: t.thumbnail || null,
              durationInSec: Math.floor((t.durationMs || 0) / 1000),
              addedAt: t.addedAt || Date.now(),
            }));

            this.data.playlists[plId] = {
              id: plId,
              name: pl.name || 'Imported Playlist',
              description: pl.description || 'Imported from previous version',
              createdAt: pl.createdAt || Date.now(),
              tracks,
              creator: pl.creator || 'default',
            };
            migratedAny = true;
          }
        }
      }

      if (migratedAny) {
        console.log(`[Store] Migrated ${this.data.favorites.length} favorites and ${Object.keys(this.data.playlists).length} playlists from legacy config.json!`);
      }
    } catch (err) {
      console.warn('Legacy data migration failed:', err.message);
    }
  }

  _save() {
    try {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
        try { chmodSync(DATA_DIR, 0o700); } catch {}
      }

      // Create automatic backup of previous file if it exists
      if (existsSync(DATA_FILE)) {
        try { copyFileSync(DATA_FILE, BACKUP_FILE); } catch {}
      }

      writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    } catch (err) {
      console.error('Failed to save library store:', err.message);
    }
  }

  // ==================== DISCORD GUILDS ====================

  _guild(guildId) {
    if (!this.data.guilds[guildId]) {
      this.data.guilds[guildId] = { history: [], session: null };
    }
    return this.data.guilds[guildId];
  }

  addHistory(guildId, track) {
    if (!track?.url) return;
    const g = this._guild(guildId);
    g.history = (g.history || []).filter((t) => t.url !== track.url);
    g.history.unshift({
      url: track.url,
      title: track.title,
      thumbnail: track.thumbnail || null,
      durationInSec: track.durationInSec ?? 0,
      timestamp: Date.now(),
    });
    if (g.history.length > MAX_HISTORY) g.history.length = MAX_HISTORY;
    this.recordPlay(track);
    this._save();
  }

  getHistory(guildId) {
    return this._guild(guildId).history || [];
  }

  clearHistory(guildId) {
    this._guild(guildId).history = [];
    this._save();
  }

  saveSession(guildId, session) {
    this._guild(guildId).session = session;
    this._save();
  }

  getSession(guildId) {
    return this._guild(guildId).session;
  }

  clearSession(guildId) {
    this._guild(guildId).session = null;
    this._save();
  }

  _userLibraries(guildId) {
    const g = this._guild(guildId);
    if (!g.userLibraries) g.userLibraries = {};
    return g.userLibraries;
  }

  _userLib(guildId, userId) {
    const libs = this._userLibraries(guildId);
    if (!libs[userId]) libs[userId] = [];
    return libs[userId];
  }

  addToUserLibrary(guildId, userId, tracks) {
    const lib = this._userLib(guildId, userId);
    for (const track of tracks) {
      if (!track?.url) continue;
      const idx = lib.findIndex((t) => t.url === track.url);
      if (idx !== -1) lib.splice(idx, 1);
      lib.push({
        url: track.url,
        title: track.title,
        thumbnail: track.thumbnail || null,
        durationInSec: track.durationInSec ?? 0,
      });
    }
    if (lib.length > MAX_USER_LIBRARY) lib.splice(0, lib.length - MAX_USER_LIBRARY);
    this._userLibraries(guildId)[userId] = lib;
    this._save();
  }

  removeFromUserLibrary(guildId, userId, index) {
    const lib = this._userLib(guildId, userId);
    if (index < 0 || index >= lib.length) return null;
    const [removed] = lib.splice(index, 1);
    this._save();
    return removed;
  }

  getUserLibrary(guildId, userId) {
    return this._userLib(guildId, userId);
  }

  // ==================== SHARED PLAYLISTS ====================

  getAllPlaylists() {
    return Object.values(this.data.playlists || {});
  }

  getPlaylist(id) {
    return this.data.playlists?.[id] || null;
  }

  createPlaylist(name, description = '', cover = '') {
    const id = 'pl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const playlist = {
      id,
      name: name.trim() || 'Untitled Playlist',
      description: description.trim(),
      cover: cover.trim(),
      tracks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!this.data.playlists) this.data.playlists = {};
    this.data.playlists[id] = playlist;
    this._save();
    return playlist;
  }

  renamePlaylist(id, newName, description, cover) {
    const pl = this.data.playlists?.[id];
    if (!pl) return null;
    if (newName !== undefined) pl.name = newName.trim();
    if (description !== undefined) pl.description = description.trim();
    if (cover !== undefined) pl.cover = cover.trim();
    pl.updatedAt = new Date().toISOString();
    this._save();
    return pl;
  }

  deletePlaylist(id) {
    if (!this.data.playlists?.[id]) return false;
    delete this.data.playlists[id];
    this._save();
    return true;
  }

  duplicatePlaylist(id) {
    const orig = this.data.playlists?.[id];
    if (!orig) return null;
    const copy = this.createPlaylist(`${orig.name} (Copy)`, orig.description, orig.cover);
    copy.tracks = [...orig.tracks];
    this._save();
    return copy;
  }

  addTracksToPlaylist(id, tracks) {
    const pl = this.data.playlists?.[id];
    if (!pl) return null;
    for (const track of tracks) {
      if (!track?.url) continue;
      pl.tracks.push({
        url: track.url,
        title: track.title || 'Unknown Title',
        thumbnail: track.thumbnail || null,
        durationInSec: track.durationInSec ?? 0,
        artist: track.artist || 'Unknown Artist',
        addedAt: Date.now(),
      });
    }
    pl.updatedAt = new Date().toISOString();
    this._save();
    return pl;
  }

  removeTrackFromPlaylist(id, index) {
    const pl = this.data.playlists?.[id];
    if (!pl || index < 0 || index >= pl.tracks.length) return null;
    const [removed] = pl.tracks.splice(index, 1);
    pl.updatedAt = new Date().toISOString();
    this._save();
    return removed;
  }

  reorderPlaylist(id, fromIndex, toIndex) {
    const pl = this.data.playlists?.[id];
    if (!pl) return null;
    if (fromIndex < 0 || fromIndex >= pl.tracks.length) return null;
    if (toIndex < 0 || toIndex >= pl.tracks.length) return null;
    const [item] = pl.tracks.splice(fromIndex, 1);
    pl.tracks.splice(toIndex, 0, item);
    pl.updatedAt = new Date().toISOString();
    this._save();
    return pl;
  }

  // ==================== FAVORITES ====================

  getFavorites() {
    return this.data.favorites || [];
  }

  isFavorite(url) {
    if (!url) return false;
    return (this.data.favorites || []).some((t) => t.url === url);
  }

  toggleFavorite(track, userName = 'default') {
    if (!track?.url) return false;
    if (!this.data.favorites) this.data.favorites = [];
    if (!this.data.userFavorites) this.data.userFavorites = {};
    if (!this.data.userFavorites[userName]) this.data.userFavorites[userName] = [];

    const idx = this.data.favorites.findIndex((t) => t.url === track.url || t.title === track.title);
    let isFav = false;
    if (idx !== -1) {
      this.data.favorites.splice(idx, 1);
      this.data.userFavorites[userName] = this.data.userFavorites[userName].filter((t) => t.url !== track.url && t.title !== track.title);
      isFav = false;
    } else {
      const favItem = {
        url: track.url,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        thumbnail: track.thumbnail || null,
        durationInSec: track.durationInSec ?? 0,
        addedAt: Date.now(),
        addedBy: userName,
      };
      this.data.favorites.unshift(favItem);
      this.data.userFavorites[userName].unshift(favItem);
      isFav = true;
    }
    this._save();
    return isFav;
  }

  getUserFavorites(userName = 'default') {
    if (this.data.userFavorites?.[userName]) {
      return this.data.userFavorites[userName];
    }
    return this.data.favorites || [];
  }

  getUserPlaylists(userName = 'default') {
    const all = Object.values(this.data.playlists || {});
    const filtered = all.filter((p) => p.creator === userName);
    return filtered.length > 0 ? filtered : all;
  }

  // ==================== DESKTOP LIBRARY (300 MAX) ====================

  getDesktopLibrary() {
    return this.data.desktopLibrary || [];
  }

  addToDesktopLibrary(tracks) {
    if (!this.data.desktopLibrary) this.data.desktopLibrary = [];
    const lib = this.data.desktopLibrary;
    for (const track of tracks) {
      if (!track?.url) continue;
      const idx = lib.findIndex((t) => t.url === track.url);
      if (idx !== -1) lib.splice(idx, 1);
      lib.unshift({
        url: track.url,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        thumbnail: track.thumbnail || null,
        durationInSec: track.durationInSec ?? 0,
        addedAt: Date.now(),
      });
    }
    if (lib.length > MAX_USER_LIBRARY) {
      lib.splice(MAX_USER_LIBRARY);
    }
    this._save();
    return lib;
  }

  removeFromDesktopLibrary(url) {
    if (!this.data.desktopLibrary) return false;
    const initialLen = this.data.desktopLibrary.length;
    this.data.desktopLibrary = this.data.desktopLibrary.filter((t) => t.url !== url);
    const changed = this.data.desktopLibrary.length !== initialLen;
    if (changed) this._save();
    return changed;
  }

  // ==================== SETTINGS ====================

  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = {
      ...this.data.settings,
      ...newSettings,
    };
    this._save();
    return this.data.settings;
  }

  // ==================== STATISTICS ====================

  getStats() {
    return this.data.stats;
  }

  recordPlay(track, seconds = 0) {
    if (!track?.title) return;
    if (!this.data.stats) {
      this.data.stats = { songsPlayed: 0, totalListeningTimeSec: 0, mostPlayed: {} };
    }
    this.data.stats.songsPlayed = (this.data.stats.songsPlayed || 0) + 1;
    this.data.stats.totalListeningTimeSec = (this.data.stats.totalListeningTimeSec || 0) + Math.max(0, Math.floor(seconds || track.durationInSec || 0));

    const title = track.title;
    if (!this.data.stats.mostPlayed) this.data.stats.mostPlayed = {};
    this.data.stats.mostPlayed[title] = (this.data.stats.mostPlayed[title] || 0) + 1;
    this._save();
  }

  // ==================== SPOTIFY IMPORTS ====================

  saveSpotifyImport(guildId, userId, data) {
    if (!this._spotifyImports) this._spotifyImports = {};
    this._spotifyImports[`${guildId}:${userId}`] = data;
  }

  getSpotifyImport(guildId, userId) {
    if (!this._spotifyImports) return null;
    return this._spotifyImports[`${guildId}:${userId}`] || null;
  }

  clearSpotifyImport(guildId, userId) {
    if (!this._spotifyImports) return;
    delete this._spotifyImports[`${guildId}:${userId}`];
  }
}

export const store = new Store();
