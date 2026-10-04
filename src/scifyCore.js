import 'dotenv/config';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { store } from './store.js';
import { getNextProxy, PROXY_POOL } from './proxy.js';
import { formatTime } from './ui.js';
import { getDefaultToken, getDefaultClientId, isOfficialToken, maskToken } from './vault.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

function resolveYtDlpPath() {
  try {
    const pkgJson = require.resolve('youtube-dl-exec/package.json');
    const pkgDir = path.dirname(pkgJson);
    const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    let binPath = path.join(pkgDir, 'bin', binName);
    if (binPath.includes('app.asar') && !binPath.includes('app.asar.unpacked')) {
      const unpacked = binPath.replace('app.asar', 'app.asar.unpacked');
      if (existsSync(unpacked)) return unpacked;
    }
    return binPath;
  } catch {
    return 'yt-dlp';
  }
}

const YT_DLP = resolveYtDlpPath();

export class ScifyCore extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.music = null;
    this.isBotOnline = false;
    this.envPath = path.resolve(process.cwd(), '.env');
  }

  attachDiscord({ client, music }) {
    this.client = client;
    this.music = music;
    this.isBotOnline = Boolean(client?.isReady?.());

    if (this.isBotOnline) {
      this.emit('botStatusChange', { online: true });
    }

    if (this.music) {
      this.music.on('change', () => {
        this.broadcastState();
      });
    }

    client.on('ready', () => {
      this.isBotOnline = true;
      this.emit('botStatusChange', { online: true });
      this.broadcastState();
    });

    client.on('shardDisconnect', () => {
      this.isBotOnline = false;
      this.emit('botStatusChange', { online: false });
      this.broadcastState();
    });

    client.on('guildCreate', (guild) => {
      this.emit('guildJoined', { id: guild.id, name: guild.name });
      this.broadcastState();
    });

    client.on('voiceStateUpdate', () => {
      this.broadcastState();
    });

    // Periodic state broadcast (every 1s) when playing
    setInterval(() => {
      if (this.isBotOnline && this.music) {
        let hasActive = false;
        for (const [, state] of this.music.states ?? []) {
          if (state.playing) {
            hasActive = true;
            break;
          }
        }
        if (hasActive) {
          this.broadcastState();
        }
      }
    }, 1000);
  }

  broadcastState() {
    const status = this.getDiscordStatus();
    this.emit('stateUpdate', status);
  }

  getDiscordStatus() {
    if (!this.client || !this.client.isReady()) {
      return {
        online: false,
        ping: 0,
        user: null,
        guilds: [],
        activeSessions: [],
      };
    }

    const guilds = [...this.client.guilds.cache.values()].map((g) => {
      const voiceChannels = g.channels.cache
        .filter((c) => c.type === 2) // GuildVoice
        .map((c) => ({
          id: c.id,
          name: c.name,
          membersCount: c.members.size,
        }));

      const textChannels = g.channels.cache
        .filter((c) => c.type === 0) // GuildText
        .map((c) => ({
          id: c.id,
          name: c.name,
        }));

      return {
        id: g.id,
        name: g.name,
        icon: g.iconURL() || null,
        voiceChannels,
        textChannels,
      };
    });

    const activeSessions = [];
    if (this.music?.states) {
      for (const [guildId, state] of this.music.states.entries()) {
        const guild = this.client.guilds.cache.get(guildId);
        const vc = state.voiceChannelId ? guild?.channels.cache.get(state.voiceChannelId) : null;
        const listeners = vc ? [...vc.members.values()]
          .filter((m) => !m.user.bot)
          .map((m) => ({
            id: m.id,
            username: m.user.username,
            displayName: m.displayName || m.user.username,
            avatar: m.user.displayAvatarURL(),
          })) : [];

        const playbackState = state.isPaused() ? 'paused' : (state.playing ? 'playing' : 'idle');
        const history = store.getHistory(guildId) || [];

        activeSessions.push({
          guildId,
          serverId: guildId,
          serverName: guild?.name || 'Discord Server',
          voiceChannelId: state.voiceChannelId,
          voiceChannelName: vc?.name || null,
          playing: state.playing,
          playbackState,
          current: state.current,
          currentTrack: state.current,
          position: state.getPosition(),
          duration: state.getDuration(),
          paused: state.isPaused(),
          queue: state.queue,
          loopMode: state.loopMode,
          shuffle: Boolean(state.isShuffled),
          volume: state.volume ?? 1.0,
          history,
          listeners,
          starterUser: state.starterUser ? {
            id: state.starterUser.id,
            username: state.starterUser.username,
            displayName: state.starterUser.displayName || state.starterUser.username,
            avatar: typeof state.starterUser.displayAvatarURL === 'function' ? state.starterUser.displayAvatarURL() : null,
          } : null,
          lastActivity: state.lastActivity || 0,
        });
      }

      // Sort activeSessions: currently playing first, then most recent activity
      activeSessions.sort((a, b) => {
        const aPlaying = a.playing && !a.paused;
        const bPlaying = b.playing && !b.paused;
        if (aPlaying && !bPlaying) return -1;
        if (!aPlaying && bPlaying) return 1;
        return (b.lastActivity || 0) - (a.lastActivity || 0);
      });
    }

    return {
      online: true,
      ping: Math.round(this.client.ws.ping || 0),
      user: {
        id: this.client.user.id,
        username: this.client.user.username,
        tag: this.client.user.tag,
        avatar: this.client.user.displayAvatarURL(),
      },
      guilds,
      activeSessions,
      activeVoiceUsers: this.getActiveVoiceUsers(),
    };
  }

  /**
   * List all human users currently in voice channels across connected servers.
   */
  getActiveVoiceUsers() {
    if (!this.client?.guilds?.cache) return [];
    const users = [];
    const seen = new Set();

    for (const guild of this.client.guilds.cache.values()) {
      // 1. Direct scan of voice channels (most accurate in Discord.js)
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased()) continue;
        for (const [memberId, member] of channel.members) {
          if (!member || member.user?.bot || seen.has(member.user.id)) continue;
          seen.add(member.user.id);
          users.push({
            id: member.user.id,
            username: member.user.username,
            tag: member.user.tag,
            displayName: member.displayName || member.user.username,
            avatar: member.user.displayAvatarURL(),
            guildId: guild.id,
            guildName: guild.name,
            voiceChannelId: channel.id,
            voiceChannelName: channel.name,
          });
        }
      }

      // 2. Supplementary scan via voiceStates
      for (const [userId, voiceState] of guild.voiceStates.cache.entries()) {
        if (!voiceState.channelId || seen.has(userId)) continue;
        const member = voiceState.member || guild.members.cache.get(userId);
        if (!member || member.user?.bot) continue;
        seen.add(member.user.id);
        const vc = guild.channels.cache.get(voiceState.channelId);
        users.push({
          id: member.user.id,
          username: member.user.username,
          tag: member.user.tag,
          displayName: member.displayName || member.user.username,
          avatar: member.user.displayAvatarURL(),
          guildId: guild.id,
          guildName: guild.name,
          voiceChannelId: voiceState.channelId,
          voiceChannelName: vc?.name || 'Voice Channel',
        });
      }
    }
    return users;
  }

  /**
   * Find a specific user in voice channels across connected servers by username/tag/ID.
   */
  findUserVoiceChannel(usernameOrQuery) {
    const voiceUsers = this.getActiveVoiceUsers();
    if (!usernameOrQuery || !usernameOrQuery.trim()) {
      // If no query specified, automatically return the currently active voice user!
      return voiceUsers[0] || null;
    }
    const query = usernameOrQuery.trim().toLowerCase();
    // 1. Exact match on username or displayName or id or tag
    let found = voiceUsers.find((u) =>
      u.username.toLowerCase() === query ||
      u.displayName.toLowerCase() === query ||
      (u.tag && u.tag.toLowerCase() === query) ||
      u.id === query
    );
    // 2. Partial match if not exact
    if (!found) {
      found = voiceUsers.find((u) =>
        u.username.toLowerCase().includes(query) ||
        u.displayName.toLowerCase().includes(query) ||
        (u.tag && u.tag.toLowerCase().includes(query)) ||
        query.includes(u.username.toLowerCase()) ||
        query.includes(u.displayName.toLowerCase())
      );
    }
    return found || null;
  }

  /**
   * Dynamically generate the official Discord OAuth2 install URL.
   */
  generateInviteUrl() {
    let customUrl = process.env.DISCORD_INVITE_URL;
    if (customUrl && customUrl.startsWith('https://discord.com')) {
      return {
        url: customUrl,
        hasClientId: true,
        clientId: 'custom',
      };
    }

    let clientId = process.env.DISCORD_CLIENT_ID;

    if (!clientId && this.client?.user?.id) {
      clientId = this.client.user.id;
    }

    // Try reading from process.env or .env file directly
    let token = process.env.DISCORD_TOKEN;
    if (!token && existsSync(this.envPath)) {
      try {
        const content = readFileSync(this.envPath, 'utf8');
        const match = content.match(/DISCORD_TOKEN=([^\r\n]+)/);
        if (match) token = match[1].trim();
      } catch {}
    }

    if (!clientId && token) {
      try {
        const part = token.split('.')[0];
        const decoded = Buffer.from(part, 'base64').toString('utf8');
        if (/^\d{17,21}$/.test(decoded)) {
          clientId = decoded;
        }
      } catch {}
    }

    // Guarantee a valid Client ID (Scify Music project bot ID)
    if (!clientId) {
      clientId = '1515023402350547015';
    }

    const permissions = '36727808';
    const standardUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=${permissions}&integration_type=0`;

    return {
      url: standardUrl,
      hasClientId: true,
      clientId,
    };
  }

  /**
   * Search YouTube for songs with rich metadata.
   */
  async searchTracks(query, maxResults = 10) {
    if (!query || !query.trim()) return [];
    const proxy = getNextProxy();
    const args = [
      '--dump-json',
      '--no-warnings',
      '--no-playlist',
      '--default-search', `ytsearch${maxResults}`,
    ];
    if (proxy) args.push('--proxy', proxy);
    if (process.env.YT_COOKIES_FILE && existsSync(process.env.YT_COOKIES_FILE)) {
      args.push('--cookies', process.env.YT_COOKIES_FILE);
    }
    args.push(query);

    try {
      const { stdout } = await execFileAsync(YT_DLP, args, {
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
      });

      const lines = stdout.trim().split('\n').filter(Boolean);
      return lines.map((l) => {
        try {
          const v = JSON.parse(l);
          return {
            url: v.webpage_url || v.url || `https://www.youtube.com/watch?v=${v.id}`,
            title: v.title || 'Unknown Title',
            artist: v.uploader || v.channel || v.artist || 'YouTube',
            durationInSec: v.duration ?? 0,
            duration: formatTime(v.duration ?? 0),
            thumbnail: v.thumbnail || (v.thumbnails && v.thumbnails[0]?.url) || (v.id ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : null),
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch (err) {
      console.error('Search error:', err.message);
      return [];
    }
  }

  /**
   * Get direct streaming audio URL for local HTML5 desktop player.
   */
  async getDirectStreamUrl(youtubeUrl) {
    const proxy = getNextProxy();
    const args = ['-g', '-f', 'bestaudio', '--no-warnings'];
    if (proxy) args.push('--proxy', proxy);
    if (process.env.YT_COOKIES_FILE && existsSync(process.env.YT_COOKIES_FILE)) {
      args.push('--cookies', process.env.YT_COOKIES_FILE);
    }
    args.push(youtubeUrl);

    try {
      const { stdout } = await execFileAsync(YT_DLP, args, { windowsHide: true });
      const streamUrl = stdout.trim().split('\n')[0];
      return streamUrl;
    } catch (err) {
      console.error('Direct stream URL resolution failed:', err.message);
      throw err;
    }
  }

  /**
   * Control Discord bot playback and sessions from Desktop GUI.
   */
  async controlDiscord(action, params = {}) {
    if (!this.music) throw new Error('Discord bot is not currently running.');

    let guildId = params.guildId;
    if (!guildId) {
      const activeEntries = [...(this.music.states?.entries() || [])];
      const playingEntry = activeEntries.find(([_, s]) => s.playing && !s.isPaused());
      if (playingEntry) {
        guildId = playingEntry[0];
      }
      // Priority 2: Check where human members are currently active in voice across all guilds
      if (!guildId) {
        const activeVoiceUser = this.getActiveVoiceUsers()[0];
        if (activeVoiceUser) {
          guildId = activeVoiceUser.guildId;
        }
      }
      // Priority 3: Guild with most recent activity
      if (!guildId && activeEntries.length > 0) {
        activeEntries.sort((a, b) => (b[1].lastActivity || 0) - (a[1].lastActivity || 0));
        guildId = activeEntries[0][0];
      }
      // Fallback
      if (!guildId) {
        guildId = this.client?.guilds?.cache?.first()?.id;
      }
    }
    if (!guildId && !['join', 'followUser', 'findUser', 'getVoiceUsers'].includes(action)) {
      throw new Error('No active Discord server session found.');
    }

    const state = guildId ? this.music.get(guildId) : null;

    switch (action) {
      case 'getVoiceUsers': {
        return this.getActiveVoiceUsers();
      }

      case 'findUser': {
        const { username } = params;
        return this.findUserVoiceChannel(username);
      }

      case 'followUser': {
        const { username } = params;
        const location = this.findUserVoiceChannel(username);
        if (!location) {
          throw new Error(`Could not find "${username || 'you'}" in any voice channel.\nPlease join a voice channel in your Discord server first!`);
        }
        const guild = this.client.guilds.cache.get(location.guildId);
        const vc = guild?.channels.cache.get(location.voiceChannelId);
        if (!vc) throw new Error('Voice channel not accessible.');

        // Disconnect from any other server where bot is alone or idle
        for (const [gId, gState] of this.music.states.entries()) {
          if (gId !== location.guildId && gState.connection) {
            const currentVc = this.client.guilds.cache.get(gId)?.channels.cache.get(gState.connection.joinConfig?.channelId);
            const humanCount = currentVc ? currentVc.members.filter((m) => !m.user.bot).size : 0;
            if (humanCount === 0) {
              gState.destroy();
              this.music.states.delete(gId);
            }
          }
        }

        const gState = this.music.get(location.guildId);
        gState.connect(vc);
        gState.starterUser = {
          id: location.id,
          username: location.username,
          displayName: location.displayName,
          avatar: location.avatar,
        };
        this.broadcastState();
        return {
          success: true,
          guildId: location.guildId,
          guildName: location.guildName,
          voiceChannelId: location.voiceChannelId,
          voiceChannelName: location.voiceChannelName,
          user: location,
          message: `Teleported bot to ${location.guildName} (#${location.voiceChannelName})!`,
        };
      }

      case 'join': {
        const { targetGuildId, voiceChannelId } = params;
        const guild = this.client.guilds.cache.get(targetGuildId);
        if (!guild) throw new Error('Guild not found.');
        const vc = guild.channels.cache.get(voiceChannelId);
        if (!vc) throw new Error('Voice channel not found.');
        const gState = this.music.get(targetGuildId);
        gState.connect(vc);
        this.broadcastState();
        return { success: true, message: `Connected to ${vc.name}` };
      }

      case 'leave': {
        if (state) {
          state.persistSession();
          state.destroy();
          this.music.states.delete(guildId);
          this.broadcastState();
        }
        return { success: true };
      }

      case 'play': {
        const { query, voiceChannelId, requester = 'Windows Desktop', playNow = true, clearQueue = false } = params;
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) throw new Error('Guild not found.');

        if (!state.isConnected()) {
          let vc = voiceChannelId ? guild.channels.cache.get(voiceChannelId) : null;
          if (!vc) {
            // Priority 1: Check if a voice channel has human members currently in it
            vc = guild.channels.cache.find((c) => c.isVoiceBased() && c.members.some((m) => !m.user.bot));

            // Priority 2: Check other connected guilds if this guild has no one in VC!
            if (!vc) {
              const activeVoiceUser = this.getActiveVoiceUsers()[0];
              if (activeVoiceUser && activeVoiceUser.guildId !== guildId) {
                const targetGuild = this.client.guilds.cache.get(activeVoiceUser.guildId);
                const targetVc = targetGuild?.channels.cache.get(activeVoiceUser.voiceChannelId);
                if (targetGuild && targetVc) {
                  const targetState = this.music.get(targetGuild.id);
                  targetState.connect(targetVc);
                  const { resolveTracks } = await import('./musicManager.js');
                  const { tracks } = await resolveTracks(query, requester);
                  if (!tracks || tracks.length === 0) throw new Error('Could not find any tracks matching your request.');
                  if (clearQueue) targetState.queue = [];
                  if (playNow || !targetState.playing) {
                    await targetState.playTrackNow(tracks[0]);
                    if (tracks.length > 1) {
                      targetState.enqueue(tracks.slice(1));
                    }
                  } else {
                    targetState.enqueue(tracks);
                    await targetState.start();
                  }
                  this.broadcastState();
                  return { success: true, queued: tracks.length, track: tracks[0], guildId: targetGuild.id };
                }
              }
            }

            if (!vc) {
              throw new Error(`Nobody is currently in a voice channel in ${guild.name}. Please join a voice channel in Discord first!`);
            }
          }
          if (vc) {
            state.connect(vc);
          }
        }
        if (!state.isConnected()) {
          throw new Error('Please join a voice channel in your Discord server.');
        }

        const { resolveTracks } = await import('./musicManager.js');
        const { tracks } = await resolveTracks(query, requester);
        if (!tracks || tracks.length === 0) {
          throw new Error('Could not find any tracks matching your request.');
        }

        if (clearQueue) state.queue = [];
        if (playNow || !state.playing) {
          await state.playTrackNow(tracks[0]);
          if (tracks.length > 1) {
            state.enqueue(tracks.slice(1));
          }
        } else {
          state.enqueue(tracks);
          await state.start();
        }
        this.broadcastState();
        return { success: true, queued: tracks.length, track: tracks[0], guildId };
      }

      case 'pause': {
        if (state) state.pause();
        this.broadcastState();
        return { success: true };
      }

      case 'resume': {
        if (state) state.resume();
        this.broadcastState();
        return { success: true };
      }

      case 'playpause': {
        if (state) {
          if (state.isPaused()) state.resume();
          else state.pause();
        }
        this.broadcastState();
        return { success: true };
      }

      case 'skip': {
        if (state) state.skip();
        this.broadcastState();
        return { success: true };
      }

      case 'previous': {
        if (state) await state.previous();
        this.broadcastState();
        return { success: true };
      }

      case 'seek': {
        const { seconds } = params;
        if (state) await state.seek(seconds);
        this.broadcastState();
        return { success: true };
      }

      case 'stop': {
        if (state) state.stop();
        this.broadcastState();
        return { success: true };
      }

      case 'shuffle': {
        if (state) state.shuffle();
        this.broadcastState();
        return { success: true };
      }

      case 'loop': {
        if (state) {
          if (params.mode) state.loopMode = params.mode;
          else state.cycleLoop();
        }
        this.broadcastState();
        return { success: true, mode: state?.loopMode };
      }

      case 'volume': {
        const { volume } = params;
        if (state) state.setVolume(volume);
        this.broadcastState();
        return { success: true, volume: state?.volume };
      }

      case 'removeQueue': {
        const { index } = params;
        if (state) state.removeAt(index);
        this.broadcastState();
        return { success: true };
      }

      case 'jumpQueue': {
        const { index } = params;
        if (state) await state.jumpTo(index);
        this.broadcastState();
        return { success: true };
      }

      case 'moveQueue': {
        const { fromIndex, toIndex } = params;
        if (state && typeof state.moveQueue === 'function') {
          const success = state.moveQueue(fromIndex, toIndex);
          this.broadcastState();
          return { success };
        }
        return { success: false };
      }

      case 'sendPanel': {
        const { textChannelId } = params;
        const guild = this.client.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(textChannelId);
        if (!channel) throw new Error('Text channel not found.');
        const { buildPanelEmbed, buildPanelComponents } = await import('./ui.js');
        await channel.send({
          embeds: [buildPanelEmbed(state)],
          components: buildPanelComponents({
            paused: state.isPaused(),
            loopMode: state.loopMode,
          }),
        });
        return { success: true, message: `Panel sent to #${channel.name}` };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  // ==================== ENVIRONMENT CONFIGURATION ====================

  getEnvConfig() {
    const rawToken = process.env.DISCORD_TOKEN || getDefaultToken();
    const isOfficial = isOfficialToken(rawToken);
    const config = {
      DISCORD_TOKEN: isOfficial ? maskToken(rawToken) : rawToken,
      isOfficialToken: isOfficial,
      DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || getDefaultClientId(),
      ACCESS_ROLE_ID: process.env.ACCESS_ROLE_ID || '',
      PRIORITY_ROLE_ID: process.env.PRIORITY_ROLE_ID || '',
      YT_PROXY: process.env.YT_PROXY || '',
      YT_COOKIES_FILE: process.env.YT_COOKIES_FILE || '',
      SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || '',
      SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || '',
    };
    return config;
  }

  saveEnvConfig(newConfig) {
    const currentRawToken = process.env.DISCORD_TOKEN || getDefaultToken();
    let tokenToSave = newConfig.DISCORD_TOKEN?.trim() || '';

    // If token is masked or unchanged, keep current / official token
    if (!tokenToSave || tokenToSave.includes('•')) {
      tokenToSave = isOfficialToken(currentRawToken) ? '' : currentRawToken;
    }

    const merged = {
      DISCORD_TOKEN: tokenToSave,
      DISCORD_CLIENT_ID: newConfig.DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID || getDefaultClientId(),
      ACCESS_ROLE_ID: newConfig.ACCESS_ROLE_ID || '',
      PRIORITY_ROLE_ID: newConfig.PRIORITY_ROLE_ID || '',
      YT_PROXY: newConfig.YT_PROXY || '',
      YT_COOKIES_FILE: newConfig.YT_COOKIES_FILE || '',
      SPOTIFY_CLIENT_ID: newConfig.SPOTIFY_CLIENT_ID || '',
      SPOTIFY_CLIENT_SECRET: newConfig.SPOTIFY_CLIENT_SECRET || '',
    };

    // Update in-memory process.env
    if (merged.DISCORD_TOKEN) {
      process.env.DISCORD_TOKEN = merged.DISCORD_TOKEN;
    } else {
      process.env.DISCORD_TOKEN = getDefaultToken();
    }

    for (const [key, val] of Object.entries(merged)) {
      if (key !== 'DISCORD_TOKEN' && val) process.env[key] = val;
    }

    // Write to .env file
    const lines = [
      '# Scify Music Ecosystem Configuration',
      `DISCORD_TOKEN=${merged.DISCORD_TOKEN || ''}`,
      `DISCORD_CLIENT_ID=${merged.DISCORD_CLIENT_ID || ''}`,
      `ACCESS_ROLE_ID=${merged.ACCESS_ROLE_ID || ''}`,
      `PRIORITY_ROLE_ID=${merged.PRIORITY_ROLE_ID || ''}`,
      `YT_PROXY=${merged.YT_PROXY || ''}`,
      `YT_COOKIES_FILE=${merged.YT_COOKIES_FILE || ''}`,
      `SPOTIFY_CLIENT_ID=${merged.SPOTIFY_CLIENT_ID || ''}`,
      `SPOTIFY_CLIENT_SECRET=${merged.SPOTIFY_CLIENT_SECRET || ''}`,
    ];

    try {
      writeFileSync(this.envPath, lines.join('\n') + '\n', 'utf8');
      return { success: true, config: merged };
    } catch (err) {
      console.error('Failed to write .env:', err.message);
      return { success: false, error: err.message };
    }
  }
}

export const scifyCore = new ScifyCore();
