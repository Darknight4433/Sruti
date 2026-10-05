import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import { setGlobalDispatcher, Agent } from 'undici';
try {
  setGlobalDispatcher(new Agent({ connect: { timeout: 30_000 } }));
} catch {}

import { EventEmitter } from 'node:events';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  VoiceUDPSocket,
} from '@discordjs/voice';

// Prevent UDP discovery packet drops on Windows
if (VoiceUDPSocket?.prototype?.performIPDiscovery) {
  const origPerformIPDiscovery = VoiceUDPSocket.prototype.performIPDiscovery;
  VoiceUDPSocket.prototype.performIPDiscovery = async function (ssrc) {
    const discoveryBuffer = Buffer.alloc(74);
    discoveryBuffer.writeUInt16BE(1, 0);
    discoveryBuffer.writeUInt16BE(70, 2);
    discoveryBuffer.writeUInt32BE(ssrc, 4);

    const retryInterval = setInterval(() => {
      try {
        this.send(discoveryBuffer);
      } catch {}
    }, 400);

    try {
      return await origPerformIPDiscovery.call(this, ssrc);
    } finally {
      clearInterval(retryInterval);
    }
  };
}
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createOpusStream } from './stream.js';
import { store } from './store.js';
import { getNextProxy, PROXY_POOL } from './proxy.js';

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
const COOKIES_FILE = process.env.YT_COOKIES_FILE;

function baseArgs(proxy) {
  const args = [];
  if (proxy) args.push('--proxy', proxy);
  if (COOKIES_FILE && existsSync(COOKIES_FILE)) args.push('--cookies', COOKIES_FILE);
  // Let yt-dlp use the default player client — restricting to ios/android
  // causes "Requested format is not available" on some videos.
  return args;
}

/**
 * faaaaah Run yt-dlpp with JSON output and return parsed result(s).
 * Retries automatically using the proxy pool if it fails and if fails hit vig's head.
 */
async function ytDlpJson(args) {
  const maxAttempts = PROXY_POOL.length > 0 ? Math.min(5, PROXY_POOL.length) : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const proxy = getNextProxy();
    try {
      const { stdout } = await execFileAsync(YT_DLP, [
        '--dump-json',
        '--no-warnings',
        '--no-playlist',
        ...baseArgs(proxy),
        ...args,
      ], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
      
      const lines = stdout.trim().split('\n').filter(Boolean);
      return lines.map((l) => JSON.parse(l));
    } catch (err) {
      console.warn(`[ytDlpJson] Attempt ${attempt}/${maxAttempts} failed using proxy ${proxy || 'Direct/None'}: ${err.message}`);
      lastError = err;
      
      if (attempt === maxAttempts) {
        throw new Error(`Failed to resolve video metadata after ${maxAttempts} attempts: ${lastError.message}`);
      }
    }
  }
}

async function ytDlpPlaylist(url) {
  const maxAttempts = PROXY_POOL.length > 0 ? Math.min(5, PROXY_POOL.length) : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const proxy = getNextProxy();
    try {
      const { stdout } = await execFileAsync(YT_DLP, [
        '--dump-json',
        '--flat-playlist',
        '--no-warnings',
        ...baseArgs(proxy),
        url,
      ], { windowsHide: true, maxBuffer: 50 * 1024 * 1024 });
      
      const lines = stdout.trim().split('\n').filter(Boolean);
      return lines.map((l) => JSON.parse(l));
    } catch (err) {
      console.warn(`[ytDlpPlaylist] Attempt ${attempt}/${maxAttempts} failed using proxy ${proxy || 'Direct/None'}: ${err.message}`);
      lastError = err;
      
      if (attempt === maxAttempts) {
        throw new Error(`Failed to resolve playlist metadata after ${maxAttempts} attempts: ${lastError.message}`);
      }
    }
  }
}

/**
 * Resolve a YouTube / YouTube Music URL or search term into a track.
 * Strictly guarantees that searching or picking a single song only resolves THAT single song.
 */
export async function resolveTracks(query, requestedBy) {
  const trimmed = (query || '').trim();
  return resolveSingle(trimmed, requestedBy);
}

async function resolveSingle(query, requestedBy) {
  // Only treat as a playlist if it's explicitly a dedicated playlist URL (contains list= without a specific video watch ID)
  const isPurePlaylist = /[?&]list=/.test(query) && !query.includes('watch?v=') && !query.includes('youtu.be/');

  if (isPurePlaylist) {
    const entries = await ytDlpPlaylist(query);
    const tracks = entries.map((e) => ({
      url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
      title: e.title || 'Unknown',
      artist: e.uploader || e.channel || 'YouTube',
      thumbnail: e.thumbnail || (e.id ? `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg` : null),
      durationInSec: e.duration ?? 0,
      requestedBy,
    }));
    const playlistTitle = entries[0]?.playlist_title || 'playlist';
    return { tracks, label: `${tracks.length} tracks from playlist "${playlistTitle}"` };
  }

  // Strip any extraneous &list= mix/radio tracking parameter from single video URLs (e.g. YouTube mix RD...)
  let targetQuery = query;
  if (/^https?:\/\//.test(targetQuery) && (targetQuery.includes('watch?v=') || targetQuery.includes('youtu.be/'))) {
    targetQuery = targetQuery.replace(/([?&])list=[^&]+(&|$)/, '$1').replace(/[?&]$/, '');
  }

  const isUrl = /^https?:\/\//.test(targetQuery);
  const isSearchPrefix = /^[a-z]+search\d*:/i.test(targetQuery);
  // Strictly enforce --no-playlist so yt-dlp only extracts exactly 1 track
  const args = ['--no-playlist', (isUrl || isSearchPrefix) ? targetQuery : `ytsearch1:${targetQuery}`];

  const results = await ytDlpJson(args);
  if (!results.length) throw new Error('No results found for that query.');

  const v = results[0];
  return {
    tracks: [{
      url: v.webpage_url || v.url || targetQuery,
      title: v.title || 'Unknown',
      artist: v.uploader || v.channel || v.artist || 'YouTube',
      thumbnail: v.thumbnail || (v.thumbnails && v.thumbnails[0]?.url) || (v.id ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : null),
      durationInSec: v.duration ?? 0,
      requestedBy,
    }],
    label: v.title || 'Unknown',
  };
}

/**
 * Holds the playback state for a single guild (server).
 */
class GuildMusicState {
  constructor(guildId, manager = null) {
    this.guildId = guildId;
    this.manager = manager;
    this.queue = []; // upcoming tracks
    this.connection = null;
    this.player = createAudioPlayer();
    this.textChannel = null;
    this.voiceChannelId = null;
    this.playing = false;
    this.previousStack = [];
    this.volume = 1.0;
    this.isShuffled = false;

    // The user who last started playback
    this.starterUser = null;

    // Currently playing track + the audio resource
    this.current = null;
    this.resource = null;
    this.lastActivity = Date.now();

    // Cleanup function for the active FFmpeg/yt-dlp process, if any.
    this.cleanupStream = null;

    // Offset (seconds) applied when the current track was started via seek.
    this.seekOffset = 0;

    // Loop mode: 'off' | 'track' | 'queue'.
    this.loopMode = 'off';

    // Track user-initiated pause so connection events do not randomly resume paused songs
    this.userPaused = false;

    // Abort controller and transition locks to prevent race conditions during rapid play/skip
    this.activeAbortController = null;
    this.isTransitioning = false;
    this.isAdvancing = false;
    this.playId = 0;

    this.player.on(AudioPlayerStatus.Idle, () => {
      if (this.isTransitioning || !this.playing) {
        return;
      }
      this.advance().catch((err) => console.error('advance error:', err));
    });

    this.player.on('stateChange', (oldState, newState) => {
      if (oldState.status !== newState.status) {
        console.log(`[player ${this.guildId}] ${oldState.status} -> ${newState.status}`);
        this.emitChange();
      }
    });

    this.player.on('error', (error) => {
      console.error('Audio player error:', error.message);
      if (this.isTransitioning || !this.playing) {
        return;
      }
      this.advance().catch((err) => console.error('advance error:', err));
    });
  }

  emitChange() {
    if (this.manager) {
      try {
        this.manager.emit('change', this.guildId, this);
      } catch (err) {
        console.warn('emitChange error:', err.message);
      }
    }
  }

  isConnected() {
    return Boolean(
      this.connection &&
      this.connection.state?.status !== VoiceConnectionStatus.Destroyed &&
      this.connection.state?.status !== VoiceConnectionStatus.Disconnected
    );
  }

  isReady() {
    return Boolean(
      this.connection &&
      this.connection.state?.status === VoiceConnectionStatus.Ready
    );
  }

  connect(voiceChannel) {
    if (this.connection) {
      if (
        this.voiceChannelId === voiceChannel.id &&
        this.connection.state?.status === VoiceConnectionStatus.Ready
      ) {
        return this.connection;
      }
      try {
        this.connection.destroy();
      } catch {}
      this.connection = null;
    }

    this.voiceChannelId = voiceChannel.id;
    this.lastActivity = Date.now();
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    this.connection.subscribe(this.player);

    this.connection.on('stateChange', (oldState, newState) => {
      if (oldState.status !== newState.status) {
        console.log(`[voice ${this.guildId}] ${oldState.status} -> ${newState.status}`);
        if (newState.status === VoiceConnectionStatus.Ready && this.playing) {
          if (this.player.state.status === AudioPlayerStatus.AutoPaused && !this.userPaused) {
            console.log(`[voice ${this.guildId}] Connection is ready, unpausing audio player...`);
            this.player.unpause();
          }
        }
      }
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        try { this.connection?.destroy(); } catch {}
        this.connection = null;
        this.voiceChannelId = null;
        this.destroy();
      }
    });

    this.connection.on(VoiceConnectionStatus.Destroyed, () => {
      this.connection = null;
      this.voiceChannelId = null;
    });

    return this.connection;
  }

  /**
   * Wait until the voice connection is fully ready to transmit audio.
   * Throws if it can't connect within the timeout.
   */
  async waitUntilReady(timeoutMs = 20_000) {
    if (!this.connection) throw new Error('Not connected to a voice channel.');
    if (this.connection.state.status === VoiceConnectionStatus.Ready) return;
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, timeoutMs);
    } catch {
      try { this.connection?.destroy(); } catch {}
      this.connection = null;
      this.voiceChannelId = null;
      throw new Error(
        'Could not establish the voice connection (UDP handshake failed). ' +
          'This is usually caused by a firewall, VPN, or network blocking Discord voice (UDP). ' +
          'Check Windows Firewall / your VPN, or try a different network.',
      );
    }
  }

  enqueue(tracks) {
    this.lastActivity = Date.now();
    for (const track of tracks) {
      const lastInQueue = this.queue[this.queue.length - 1];
      if (lastInQueue && lastInQueue.url === track.url) {
        continue;
      }
      this.queue.push(track);
    }
    this.emitChange();
  }

  moveQueue(fromIndex, toIndex) {
    if (
      fromIndex < 0 ||
      fromIndex >= this.queue.length ||
      toIndex < 0 ||
      toIndex >= this.queue.length ||
      fromIndex === toIndex
    ) {
      return false;
    }
    const [moved] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, moved);
    this.lastActivity = Date.now();
    this.emitChange();
    return true;
  }

  async start() {
    if (!this.playing) {
      await this.waitUntilReady();
      await this.playNext();
    }
  }

  /**
   * Stream a track starting at `seekSeconds` and play it.
   */
  async streamAndPlay(track, seekSeconds = 0) {
    this.isTransitioning = true;

    // Abort any prior in-flight stream setup
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    // Kill any existing stream processes
    if (this.cleanupStream) {
      try { this.cleanupStream(); } catch {}
      this.cleanupStream = null;
    }

    try { this.player.stop(true); } catch {}

    const abortController = new AbortController();
    this.activeAbortController = abortController;

    try {
      const { stream, cleanup } = await createOpusStream(track.url, seekSeconds, {
        signal: abortController.signal,
      });

      if (abortController.signal.aborted || !this.playing) {
        cleanup();
        return;
      }

      this.cleanupStream = cleanup;

      const resource = createAudioResource(stream, { inputType: StreamType.OggOpus, inlineVolume: true });
      if (resource.volume) {
        resource.volume.setVolume(this.volume);
      }

      this.resource = resource;
      this.seekOffset = seekSeconds;
      this.player.play(resource);

      if (this.userPaused) {
        this.player.pause();
      }

      const onPlaying = () => {
        this.isTransitioning = false;
        this.player.off(AudioPlayerStatus.Playing, onPlaying);
      };
      this.player.once(AudioPlayerStatus.Playing, onPlaying);

      setTimeout(() => {
        this.isTransitioning = false;
        this.player.off(AudioPlayerStatus.Playing, onPlaying);
      }, 1500);
    } catch (err) {
      this.isTransitioning = false;
      throw err;
    }
  }

  async notifyNowPlaying(track) {
    if (!track) return;
    try {
      const guild = this.manager?.client?.guilds.cache.get(this.guildId);
      if (!guild) return;

      const requester = track.requestedBy ?? 'Sruti Commander';
      const dur = track.durationInSec ? ` • ⏱️ \`${Math.floor(track.durationInSec / 60)}:${String(Math.floor(track.durationInSec % 60)).padStart(2, '0')}\`` : '';
      const titleLink = track.url ? `[**${track.title}**](${track.url})` : `**${track.title}**`;

      const targets = new Set();

      // 1. Send inside the Voice Channel's text chat where users are listening
      if (this.voiceChannelId) {
        const vc = guild.channels.cache.get(this.voiceChannelId);
        if (vc && typeof vc.send === 'function') {
          targets.add(vc);
        }
      }

      // 2. Also send in the bound text channel (or server default text channel)
      if (this.textChannel && typeof this.textChannel.send === 'function') {
        targets.add(this.textChannel);
      } else if (targets.size === 0) {
        const fallback = guild.systemChannel || guild.channels.cache.find((c) => c.isTextBased && c.isTextBased() && !c.isVoiceBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'));
        if (fallback && typeof fallback.send === 'function') {
          targets.add(fallback);
        }
      }

      const content = `🎶 **Now Playing:** ${titleLink}${dur}\n*Requested by ${requester}*`;

      for (const target of targets) {
        target.send(content).catch(() => {});
      }
    } catch (err) {
      console.warn('notifyNowPlaying error:', err.message);
    }
  }

  async playNext() {
    const currentPlayId = ++this.playId;
    const track = this.queue.shift();
    if (!track) {
      this.playing = false;
      this.current = null;
      this.resource = null;
      if (this.activeAbortController) {
        this.activeAbortController.abort();
        this.activeAbortController = null;
      }
      if (this.cleanupStream) {
        this.cleanupStream();
        this.cleanupStream = null;
      }
      this.lockHolderId = null;
      this.emitChange();
      // Notify that the queue is empty.
      if (this.textChannel) {
        this.textChannel.send('📭 Queue finished — no more tracks to play.').catch(() => {});
      }
      return;
    }

    if (this.current) {
      this.previousStack.unshift(this.current);
      if (this.previousStack.length > 20) this.previousStack.pop();
    }

    this.current = track;
    this.playing = true;
    this.lastActivity = Date.now();
    this.emitChange();
    // Record this track in the guild's history and persist the session.
    store.addHistory(this.guildId, track);

    try {
      await this.streamAndPlay(track, 0);
      if (this.playId !== currentPlayId) return;

      this.failStreak = 0;
      this.persistSession();

      // Send Now Playing notification into voice channel chat and server channel
      await this.notifyNowPlaying(track);
    } catch (err) {
      if (this.playId !== currentPlayId || err.name === 'AbortError' || err.message?.includes('aborted')) {
        return;
      }

      // Extraction failed (e.g. bot check, deleted/age-restricted video).
      this.failStreak = (this.failStreak ?? 0) + 1;
      console.error(`Failed to play "${track.title}": ${err.message}`);

      // Stop after consecutive failures or empty queue
      if (this.failStreak >= 3 || this.queue.length === 0) {
        this.stop();
        throw err;
      }
      // Otherwise skip this track and try the next one.
      await this.playNext();
    }
  }

  /**
   * Save the current playback session (track + position + remaining queue)
   * so it can be resumed after a stop or a restart.
   */
  persistSession() {
    if (!this.current) {
      store.clearSession(this.guildId);
      return;
    }
    store.saveSession(this.guildId, {
      track: {
        url: this.current.url,
        title: this.current.title,
        durationInSec: this.current.durationInSec ?? 0,
      },
      positionSec: this.getPosition(),
      queue: this.queue.map((t) => ({
        url: t.url,
        title: t.title,
        durationInSec: t.durationInSec ?? 0,
      })),
    });
  }

  /**
   * Called when a track finishes naturally or is skipped. Honors the loop mode:
   * - 'track': replay the current track.
   * - 'queue': push the finished track to the back, then play the next.
   * - 'off':   just play the next track.
   */
  async advance() {
    if (this.isAdvancing || !this.playing) return;
    this.isAdvancing = true;
    try {
      if (this.loopMode === 'track' && this.current) {
        await this.streamAndPlay(this.current, 0);
        return;
      }
      if (this.loopMode === 'queue' && this.current) {
        this.queue.push(this.current);
      }
      await this.playNext();
    } finally {
      this.isAdvancing = false;
    }
  }

  /**
   * Cycle the loop mode: off -> track -> queue -> off. Returns the new mode.
   */
  cycleLoop() {
    this.loopMode = this.loopMode === 'off' ? 'track' : this.loopMode === 'track' ? 'queue' : 'off';
    return this.loopMode;
  }

  /**
   * Jump directly to a track in the queue by its index (0-based) and play it.
   */
  async jumpTo(index) {
    if (index < 0 || index >= this.queue.length) {
      throw new Error('That track is no longer in the queue.');
    }
    const [track] = this.queue.splice(index, 1);
    await this.playTrackNow(track);
    return track;
  }

  /**
   * Current playback position in seconds (accounts for any seek offset).
   */
  getPosition() {
    if (!this.resource) return 0;
    return this.seekOffset + Math.floor(this.resource.playbackDuration / 1000);
  }

  getDuration() {
    return this.current?.durationInSec ?? 0;
  }

  /**
   * Seek the current track to an absolute position (seconds).
   */
  async seek(seconds) {
    if (!this.current) throw new Error('Nothing is playing.');
    this.lastActivity = Date.now();
    const duration = this.getDuration();
    let target = Math.max(0, Math.floor(seconds));
    if (duration && target >= duration) target = Math.max(0, duration - 1);

    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    if (this.cleanupStream) {
      this.cleanupStream();
      this.cleanupStream = null;
    }
    await this.streamAndPlay(this.current, target);
    return target;
  }

  async skip() {
    this.lastActivity = Date.now();
    this.isTransitioning = true;
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    if (this.cleanupStream) {
      try { this.cleanupStream(); } catch {}
      this.cleanupStream = null;
    }
    try { this.player.stop(true); } catch {}
    await this.advance();
  }

  async previous() {
    this.isTransitioning = true;
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    if (this.cleanupStream) {
      try { this.cleanupStream(); } catch {}
      this.cleanupStream = null;
    }
    const pos = this.getPosition();
    if (pos > 5 || this.previousStack.length === 0) {
      if (this.current) {
        await this.seek(0);
        return this.current;
      }
      return null;
    }
    const prev = this.previousStack.shift();
    if (!prev) return null;
    if (this.current) {
      this.queue.unshift(this.current);
    }
    await this.playTrackNow(prev);
    return prev;
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    return this.queue;
  }

  removeAt(index) {
    if (index < 0 || index >= this.queue.length) return null;
    const [removed] = this.queue.splice(index, 1);
    return removed;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(2.0, vol));
    if (this.resource?.volume) {
      this.resource.volume.setVolume(this.volume);
    }
    return this.volume;
  }

  pause() {
    this.lastActivity = Date.now();
    this.userPaused = true;
    return this.player.pause();
  }

  resume() {
    this.lastActivity = Date.now();
    this.userPaused = false;
    return this.player.unpause();
  }

  isPaused() {
    return this.player.state.status === AudioPlayerStatus.Paused || this.userPaused;
  }

  stop() {
    this.lastActivity = Date.now();
    this.playing = false;
    this.userPaused = false;
    this.isTransitioning = false;
    this.isAdvancing = false;
    this.loopMode = 'off';

    // Capture the session (track + position + queue) before clearing, so the
    // user can "continue" from where they stopped later.
    if (this.current) {
      store.saveSession(this.guildId, {
        track: {
          url: this.current.url,
          title: this.current.title,
          durationInSec: this.current.durationInSec ?? 0,
        },
        positionSec: this.getPosition(),
        queue: this.queue.map((t) => ({
          url: t.url,
          title: t.title,
          durationInSec: t.durationInSec ?? 0,
        })),
      });
    }

    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    if (this.cleanupStream) {
      try { this.cleanupStream(); } catch {}
      this.cleanupStream = null;
    }

    this.queue = [];
    try { this.player.stop(true); } catch {}
    this.current = null;
    this.resource = null;
    this.lockHolderId = null;
    this.emitChange();
  }

  /**
   * Resume a saved session: load its queue, then play its track at the saved
   * position. `session` comes from the persistent store.
   */
  async resumeSession(session) {
    if (!session?.track) throw new Error('No saved session to continue.');
    await this.waitUntilReady();

    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    if (this.cleanupStream) {
      this.cleanupStream();
      this.cleanupStream = null;
    }

    this.queue = (session.queue ?? []).map((t) => ({ ...t }));
    this.current = { ...session.track };
    this.playing = true;
    store.addHistory(this.guildId, this.current);

    const start = Math.max(0, Math.floor(session.positionSec ?? 0));
    await this.streamAndPlay(this.current, start);
    this.persistSession();
  }

  /**
   * Play a single track immediately (used by the library "replay" buttons),
   * keeping any existing queue intact.
   */
  /**
   * Play a single track immediately (e.g. user clicked Play),
   * smoothly interrupting any current audio without race conditions or duplicates.
   */
  async playTrackNow(track) {
    await this.waitUntilReady();

    const currentPlayId = ++this.playId;
    this.isTransitioning = true;

    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    if (this.cleanupStream) {
      try { this.cleanupStream(); } catch {}
      this.cleanupStream = null;
    }
    try { this.player.stop(true); } catch {}

    if (this.current && this.current.url !== track.url) {
      this.previousStack.unshift(this.current);
      if (this.previousStack.length > 20) this.previousStack.pop();
    }

    // Remove any duplicate instances of this track from the queue
    this.queue = this.queue.filter((t) => t.url !== track.url);

    this.current = { ...track };
    this.playing = true;
    this.lastActivity = Date.now();
    this.emitChange();
    store.addHistory(this.guildId, this.current);

    try {
      await this.streamAndPlay(this.current, 0);
      if (this.playId !== currentPlayId) return;

      this.failStreak = 0;
      this.persistSession();

      // Send Now Playing notification into voice channel chat and server channel
      await this.notifyNowPlaying(this.current);
    } catch (err) {
      if (this.playId !== currentPlayId || err.name === 'AbortError' || err.message?.includes('aborted')) {
        return;
      }

      this.failStreak = (this.failStreak ?? 0) + 1;
      console.error(`Failed to play "${track.title}": ${err.message}`);

      if (this.failStreak >= 3 || this.queue.length === 0) {
        this.stop();
        throw err;
      }
      await this.playNext();
    }
  }

  destroy() {
    this.stop();
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch {
        // already destroyed
      }
      this.connection = null;
    }
    this.voiceChannelId = null;
  }
}

/**
 * Tracks one GuildMusicState per guild.
 */
export class MusicManager extends EventEmitter {
  constructor() {
    super();
    this.states = new Map();
  }

  get(guildId) {
    if (!this.states.has(guildId)) {
      this.states.set(guildId, new GuildMusicState(guildId, this));
    }
    return this.states.get(guildId);
  }

  peek(guildId) {
    return this.states.get(guildId) ?? null;
  }

  remove(guildId) {
    const state = this.states.get(guildId);
    if (state) {
      state.destroy();
      this.states.delete(guildId);
      this.emit('change', guildId, null);
    }
  }
}
