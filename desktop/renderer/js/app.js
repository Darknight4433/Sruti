// ==================== SCIFY MUSIC DESKTOP APPLICATION ====================

const state = {
  activeScreen: 'home',
  outputTarget: 'discord', // default is 'discord' (Discord VC Bot ecosystem)
  currentTrack: null,
  isPlaying: false,
  isPaused: false,
  currentTime: 0,
  duration: 0,
  volume: 85,
  isMuted: false,
  loopMode: 'off', // 'off', 'track', 'queue'
  isShuffled: false,
  localQueue: [],
  localHistory: [],
  favorites: [],
  library: [],
  playlists: [],
  selectedGuildId: null,
  savedDiscordUser: localStorage.getItem('scify_discord_username') || '',
  userVoiceLocation: null,
  discordStatus: { online: false, guilds: [], activeSessions: [] },
  searchDebounceTimer: null,
  botConfig: {},
  audioCtx: null,
  analyser: null,
  audioSourceNode: null,
};

// Helper to route Discord actions to the selected or active server session
async function sendDiscordAction(action, params = {}) {
  const guildId = params.guildId || state.selectedGuildId;
  return await window.scifyApi?.discordAction(action, { ...params, guildId });
}

// DOM Elements Cache
const el = {
  audio: document.getElementById('localAudioPlayer'),
  botBadge: document.getElementById('botBadge'),
  btnUserVcBadge: document.getElementById('btnUserVcBadge'),
  userVcAvatar: document.getElementById('userVcAvatar'),
  userVcAvatarPlaceholder: document.getElementById('userVcAvatarPlaceholder'),
  userVcName: document.getElementById('userVcName'),
  userVcChannelTag: document.getElementById('userVcChannelTag'),
  btnOutputLocal: document.getElementById('btnOutputLocal'),
  btnOutputDiscord: document.getElementById('btnOutputDiscord'),
  barTargetPill: document.getElementById('barTargetPill'),
  // Screens
  screens: document.querySelectorAll('.screen-view'),
  navItems: document.querySelectorAll('.nav-item'),
  // Search
  searchInput: document.getElementById('searchInput'),
  btnSearchClear: document.getElementById('btnSearchClear'),
  searchResultsList: document.getElementById('searchResultsList'),
  searchResultsHeader: document.getElementById('searchResultsHeader'),
  searchResultsCount: document.getElementById('searchResultsCount'),
  searchHistoryTags: document.getElementById('searchHistoryTags'),
  // Player
  playerServerSelect: document.getElementById('playerServerSelect'),
  queueServerSelect: document.getElementById('queueServerSelect'),
  playerLargeArt: document.getElementById('playerLargeArt'),
  playerArtPlaceholder: document.getElementById('playerArtPlaceholder'),
  playerTitle: document.getElementById('playerTitle'),
  playerArtist: document.getElementById('playerArtist'),
  playerTargetBadge: document.getElementById('playerTargetBadge'),
  playerSummonerBadge: document.getElementById('playerSummonerBadge'),
  playerSummonerAvatar: document.getElementById('playerSummonerAvatar'),
  playerSummonerName: document.getElementById('playerSummonerName'),
  playerScrubber: document.getElementById('playerScrubber'),
  playerScrubberFill: document.getElementById('playerScrubberFill'),
  playerTimeCurrent: document.getElementById('playerTimeCurrent'),
  playerTimeTotal: document.getElementById('playerTimeTotal'),
  btnPlayerPlayPause: document.getElementById('btnPlayerPlayPause'),
  playerPlayPauseIcon: document.getElementById('playerPlayPauseIcon'),
  btnPlayerPrev: document.getElementById('btnPlayerPrev'),
  btnPlayerSkip: document.getElementById('btnPlayerSkip'),
  btnPlayerRewind: document.getElementById('btnPlayerRewind'),
  btnPlayerForward: document.getElementById('btnPlayerForward'),
  btnPlayerShuffle: document.getElementById('btnPlayerShuffle'),
  btnPlayerLoop: document.getElementById('btnPlayerLoop'),
  playerLoopBadge: document.getElementById('playerLoopBadge'),
  btnPlayerFavorite: document.getElementById('btnPlayerFavorite'),
  playerVolumeSlider: document.getElementById('playerVolumeSlider'),
  btnPlayerMute: document.getElementById('btnPlayerMute'),
  // Bottom Player Bar
  barArtwork: document.getElementById('barArtwork'),
  barArtPlaceholder: document.getElementById('barArtPlaceholder'),
  barTitle: document.getElementById('barTitle'),
  barArtist: document.getElementById('barArtist'),
  btnBarFavorite: document.getElementById('btnBarFavorite'),
  btnBarPlayPause: document.getElementById('btnBarPlayPause'),
  barPlayPauseIcon: document.getElementById('barPlayPauseIcon'),
  btnBarPrev: document.getElementById('btnBarPrev'),
  btnBarSkip: document.getElementById('btnBarSkip'),
  btnBarBack15: document.getElementById('btnBarBack15'),
  btnBarFwd15: document.getElementById('btnBarFwd15'),
  btnBarLoop: document.getElementById('btnBarLoop'),
  btnBarStop: document.getElementById('btnBarStop'),
  btnBarShuffle: document.getElementById('btnBarShuffle'),
  barScrubber: document.getElementById('barScrubber'),
  barScrubberFill: document.getElementById('barScrubberFill'),
  barTimeCurrent: document.getElementById('barTimeCurrent'),
  barTimeTotal: document.getElementById('barTimeTotal'),
  barServerSelect: document.getElementById('barServerSelect'),
  barVolumeSlider: document.getElementById('barVolumeSlider'),
  btnBarMute: document.getElementById('btnBarMute'),
  // Queue & Collections
  queueList: document.getElementById('queueList'),
  queueCurrentCard: document.getElementById('queueCurrentCard'),
  queueNavCount: document.getElementById('queueNavCount'),
  queueCountLabel: document.getElementById('queueCountLabel'),
  libNavCount: document.getElementById('libNavCount'),
  libCountLabel: document.getElementById('libCountLabel'),
  libTracksTable: document.getElementById('libTracksTable'),
  libSearchFilter: document.getElementById('libSearchFilter'),
  libSortSelect: document.getElementById('libSortSelect'),
  playlistsGrid: document.getElementById('playlistsGrid'),
  favoritesTable: document.getElementById('favoritesTable'),
  historyTable: document.getElementById('historyTable'),
  // Discord Install & Servers
  oauthUrlInput: document.getElementById('oauthUrlInput'),
  btnLaunchDiscordOAuth: document.getElementById('btnLaunchDiscordOAuth'),
  btnCopyInviteLink: document.getElementById('btnCopyInviteLink'),
  btnOpenDevPortal: document.getElementById('btnOpenDevPortal'),
  discordServersList: document.getElementById('discordServersList'),
  // Settings & Logs
  cfgDiscordToken: document.getElementById('cfgDiscordToken'),
  cfgClientId: document.getElementById('cfgClientId'),
  cfgAccessRole: document.getElementById('cfgAccessRole'),
  cfgPriorityRole: document.getElementById('cfgPriorityRole'),
  cfgYtProxy: document.getElementById('cfgYtProxy'),
  cfgSpotifyId: document.getElementById('cfgSpotifyId'),
  cfgSpotifySecret: document.getElementById('cfgSpotifySecret'),
  btnSaveSettings: document.getElementById('btnSaveSettings'),
  btnSettingsStartBot: document.getElementById('btnSettingsStartBot'),
  btnSettingsStopBot: document.getElementById('btnSettingsStopBot'),
  btnSettingsRestartBot: document.getElementById('btnSettingsRestartBot'),
  logConsole: document.getElementById('logConsole'),
  btnClearLogs: document.getElementById('btnClearLogs'),
  // Stats
  statSongsPlayed: document.getElementById('statSongsPlayed'),
  statListeningTime: document.getElementById('statListeningTime'),
  statServersCount: document.getElementById('statServersCount'),
  statLibraryCount: document.getElementById('statLibraryCount'),
  statsTopTracksTable: document.getElementById('statsTopTracksTable'),
  // Modals
  modalCreatePlaylist: document.getElementById('modalCreatePlaylist'),
  modalSpotifyImport: document.getElementById('modalSpotifyImport'),
  modalSetUser: document.getElementById('modalSetUser'),
  modalInputDiscordUser: document.getElementById('modalInputDiscordUser'),
  modalActiveVoiceUsersList: document.getElementById('modalActiveVoiceUsersList'),
  modalTeleportStatus: document.getElementById('modalTeleportStatus'),
  btnModalTeleportVc: document.getElementById('btnModalTeleportVc'),
  btnModalSaveUserOnly: document.getElementById('btnModalSaveUserOnly'),
  toastContainer: document.getElementById('toastContainer'),
};

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
  applyAccent(localStorage.getItem('sruti_accent') || 'cyan', false);
  setupWindowControls();
  setupNavigation();
  setupAudioEngine();
  setupPlayerControls();
  setupSearch();
  setupModals();
  setupCollectionActions();
  setupSimulatorControls();
  setupSettings();
  setupDiscordInstaller();
  setupUserVcTeleport();

  // Default output target is Discord VC Bot
  setOutputTarget('discord');

  // Load initial data from Scify backend
  await refreshAllData();

  // Start Splash transition
  setTimeout(() => {
    switchScreen('home');
  }, 1000);

  // Subscribe to IPC events from Electron
  if (window.scifyApi) {
    window.scifyApi.onStatus((status) => updateBotStatusUI(status));
    window.scifyApi.onLog((log) => appendLog(log));
    window.scifyApi.onShortcut((action) => handleShortcut(action));
    window.scifyApi.onGuildJoined((guild) => {
      showToast(`🎉 Scify Music joined server: ${guild.name}!`);
      refreshDiscordServers();
    });
    window.scifyApi.onStateUpdate((status) => {
      state.discordStatus = status;
      if (state.outputTarget === 'discord') {
        syncDiscordPlaybackUI(status);
      }
    });

    // Check bot status on startup
    const initialStatus = await window.scifyApi.getBotStatus();
    updateBotStatusUI(initialStatus);

    // Ask user for Discord username upon entering exe, or auto-teleport if already saved
    if (!state.savedDiscordUser) {
      setTimeout(() => {
        openUserVcModal();
      }, 1600);
    } else {
      setTimeout(async () => {
        try {
          const found = await window.scifyApi?.discordAction('findUser', { username: state.savedDiscordUser });
          if (found && found.guildId) {
            showToast(`👤 Commander detected: ${found.displayName || state.savedDiscordUser} in ${found.guildName} (#${found.voiceChannelName})`);
            await teleportToUserVoice(state.savedDiscordUser);
          }
        } catch {}
      }, 2200);
    }
  }
});

// ==================== WINDOW CONTROLS ====================

function setupWindowControls() {
  document.getElementById('btnMinimize')?.addEventListener('click', () => {
    window.scifyApi?.windowControl('minimize');
  });
  document.getElementById('btnMaximize')?.addEventListener('click', () => {
    window.scifyApi?.windowControl('maximize');
  });
  document.getElementById('btnClose')?.addEventListener('click', () => {
    window.scifyApi?.windowControl('close');
  });
}

// ==================== NAVIGATION ====================

function setupNavigation() {
  el.navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const screenId = btn.dataset.screen;
      switchScreen(screenId);
    });
  });

  // Hero actions
  document.getElementById('btnHeroAddDiscord')?.addEventListener('click', () => switchScreen('add-discord'));
  document.getElementById('btnHeroOpenSearch')?.addEventListener('click', () => {
    switchScreen('search');
    el.searchInput?.focus();
  });
  document.getElementById('btnHomeNewPlaylist')?.addEventListener('click', () => openModal('modalCreatePlaylist'));

  // Quick action pills
  document.querySelectorAll('.pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const action = pill.dataset.quick;
      if (action === 'view-queue') switchScreen('queue');
      else if (action === 'my-library') switchScreen('library');
      else if (action === 'my-playlists') switchScreen('playlists');
      else if (action === 'spotify-import') openModal('modalSpotifyImport');
      else if (action === 'discord-servers') switchScreen('discord-servers');
      else if (action === 'play-recent' && state.localHistory.length > 0) {
        playTrack(state.localHistory[0]);
      }
    });
  });

  // Hero interactive vinyl and now playing badge click to open player
  document.getElementById('heroVinylWrapper')?.addEventListener('click', () => switchScreen('player'));
  document.getElementById('heroNowPlayingBadge')?.addEventListener('click', () => switchScreen('player'));

  // Output target toggles (Local vs Discord VC)
  el.btnOutputLocal?.addEventListener('click', () => setOutputTarget('local'));
  el.btnOutputDiscord?.addEventListener('click', () => setOutputTarget('discord'));
  el.barTargetPill?.addEventListener('click', () => {
    setOutputTarget(state.outputTarget === 'local' ? 'discord' : 'local');
  });
}

function setOutputTarget(target) {
  state.outputTarget = target;
  if (target === 'discord') {
    el.btnOutputDiscord?.classList.add('active');
    el.btnOutputLocal?.classList.remove('active');
    if (el.barTargetPill) el.barTargetPill.innerHTML = '🎙️ Discord Session';
    if (el.playerTargetBadge) el.playerTargetBadge.innerHTML = '🎙️ Discord Server VC';
    if (el.audio && !el.audio.paused) {
      el.audio.pause();
    }
    showToast('Switched output to Shared Discord Server Session');
    if (state.discordStatus) {
      syncDiscordPlaybackUI(state.discordStatus);
    }
  } else {
    el.btnOutputLocal?.classList.add('active');
    el.btnOutputDiscord?.classList.remove('active');
    if (el.barTargetPill) el.barTargetPill.innerHTML = '🎧 Desktop Audio';
    if (el.playerTargetBadge) el.playerTargetBadge.innerHTML = '🎧 Local Desktop';
    showToast('Switched output to Desktop Audio');
    renderQueue();
  }
}

function switchScreen(screenId) {
  if (!screenId) return;
  state.activeScreen = screenId;

  el.screens.forEach((s) => s.classList.remove('active-screen'));
  const targetScreen = document.getElementById(`screen-${screenId}`);
  if (targetScreen) targetScreen.classList.add('active-screen');

  el.navItems.forEach((btn) => {
    if (btn.dataset.screen === screenId) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  // Refresh view-specific content
  if (screenId === 'library') renderLibrary();
  else if (screenId === 'queue') renderQueue();
  else if (screenId === 'playlists') renderPlaylists();
  else if (screenId === 'favorites') renderFavorites();
  else if (screenId === 'history') renderHistory();
  else if (screenId === 'discord-servers') refreshDiscordServers();
  else if (screenId === 'discord-simulator') refreshDiscordSimulator();
  else if (screenId === 'statistics') renderStatistics();
  else if (screenId === 'add-discord') loadOAuthUrl();
}

// ==================== AUDIO ENGINE & VISUALIZER ====================

function setupAudioEngine() {
  const audio = el.audio;
  if (!audio) return;

  audio.volume = state.volume / 100;

  audio.addEventListener('timeupdate', () => {
    if (state.outputTarget !== 'local') return;
    state.currentTime = audio.currentTime;
    state.duration = audio.duration || state.currentTrack?.durationInSec || 0;
    updateProgressUI(state.currentTime, state.duration);
  });

  audio.addEventListener('play', () => {
    state.isPlaying = true;
    state.isPaused = false;
    updatePlayPauseIcons(true);
    initAudioVisualizer();
  });

  audio.addEventListener('pause', () => {
    state.isPlaying = false;
    state.isPaused = true;
    updatePlayPauseIcons(false);
  });

  audio.addEventListener('ended', () => {
    handleTrackEnded();
  });

  audio.addEventListener('error', (e) => {
    console.warn('Audio element error:', e);
    showToast('Audio playback error — attempting recovery…');
  });
}

function initAudioVisualizer() {
  if (state.audioCtx) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    state.audioCtx = new AudioCtx();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 64;

    state.audioSourceNode = state.audioCtx.createMediaElementSource(el.audio);
    state.audioSourceNode.connect(state.analyser);
    state.analyser.connect(state.audioCtx.destination);

    drawVisualizer();
  } catch (err) {
    console.warn('Visualizer setup error:', err.message);
  }
}

function drawVisualizer() {
  const canvas = document.getElementById('audioVisualizerCanvas');
  if (!canvas || !state.analyser) return;
  const ctx = canvas.getContext('2d');
  const bufferLength = state.analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function renderFrame() {
    requestAnimationFrame(renderFrame);
    if (!state.isPlaying) return;

    state.analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 1.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#00f0ff');
      gradient.addColorStop(1, '#b5179e');

      ctx.fillStyle = gradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 3, barHeight);
      x += barWidth;
    }
  }

  renderFrame();
}

// ==================== PLAYBACK CONTROLLER ====================

async function playTrack(track, targetMode = state.outputTarget) {
  if (!track || !track.url) return;
  state.currentTrack = track;

  // Add to History & Record Play
  if (window.scifyApi) {
    await window.scifyApi.storeAction('addHistory', 'desktop', track);
    await window.scifyApi.storeAction('recordPlay', track, track.durationInSec || 0);
  }

  updateTrackDisplay(track);

  if (targetMode === 'discord') {
    showToast(`Streaming "${track.title}" to Discord VC…`);
    try {
      const res = await sendDiscordAction('play', {
        query: track.url,
        requester: 'Scify Desktop',
        playNow: true,
        clearQueue: true,
      });
      if (res?.error) showToast(`⚠️ Discord VC: ${res.error}`);
    } catch (err) {
      showToast(`⚠️ Error: ${err.message}`);
    }
    return;
  }

  // Local Playback via HTML5 Audio
  showToast(`Resolving stream for "${track.title}"…`);
  try {
    const streamUrl = await window.scifyApi?.getStreamUrl(track.url);
    if (streamUrl) {
      el.audio.src = streamUrl;
      await el.audio.play();
      showToast(`▶ Playing: ${track.title}`);

      // Native desktop notification if enabled
      window.scifyApi?.notify('Now Playing', `${track.title} - ${track.artist || 'Scify Music'}`);
    } else {
      throw new Error('Could not resolve direct audio stream.');
    }
  } catch (err) {
    console.error('Play error:', err);
    showToast(`⚠️ Playback error: ${err.message}`);
  }
}

function handleTrackEnded() {
  if (state.loopMode === 'track') {
    el.audio.currentTime = 0;
    el.audio.play();
    return;
  }

  if (state.localQueue.length > 0) {
    const nextTrack = state.localQueue.shift();
    if (state.loopMode === 'queue') {
      state.localQueue.push(state.currentTrack);
    }
    renderQueue();
    playTrack(nextTrack);
  } else {
    state.isPlaying = false;
    state.isPaused = false;
    updatePlayPauseIcons(false);
  }
}

function updateTrackDisplay(track) {
  const title = track?.title || 'No song playing';
  const artist = track?.artist || 'Unknown Artist';
  const thumb = track?.thumbnail || '';

  // Main Player
  el.playerTitle.textContent = title;
  el.playerArtist.textContent = artist;
  if (thumb) {
    el.playerLargeArt.src = thumb;
    el.playerLargeArt.style.display = 'block';
    el.playerArtPlaceholder.style.display = 'none';
  } else {
    el.playerLargeArt.style.display = 'none';
    el.playerArtPlaceholder.style.display = 'flex';
  }

  // Bottom Bar
  el.barTitle.textContent = title;
  el.barArtist.textContent = artist;
  if (thumb) {
    el.barArtwork.src = thumb;
    el.barArtwork.style.display = 'block';
    el.barArtPlaceholder.style.display = 'none';
  } else {
    el.barArtwork.style.display = 'none';
    el.barArtPlaceholder.style.display = 'flex';
  }

  // Favorite star state
  const isFav = state.favorites.some((f) => f.url === track?.url);
  el.btnPlayerFavorite?.classList.toggle('active', isFav);
  el.btnBarFavorite?.classList.toggle('active', isFav);

  // Hero Interactive Vinyl & Now Playing Badge
  const heroVinylCover = document.getElementById('heroVinylCover');
  const heroBadgeTitle = document.getElementById('heroBadgeTitle');
  const heroNowPlayingBadge = document.getElementById('heroNowPlayingBadge');

  if (heroBadgeTitle) {
    heroBadgeTitle.textContent = track ? `${title}` : 'Ready to stream';
  }
  if (heroNowPlayingBadge) {
    heroNowPlayingBadge.style.display = track ? 'inline-flex' : 'none';
  }
  if (heroVinylCover) {
    if (thumb) {
      heroVinylCover.src = thumb;
      heroVinylCover.style.display = 'block';
    } else {
      heroVinylCover.style.display = 'none';
    }
  }

  // Update simulator display if present
  const simTitle = document.getElementById('simTrackTitle');
  if (simTitle) simTitle.textContent = title;
  const simDesc = document.getElementById('simTrackDesc');
  if (simDesc) simDesc.textContent = `▶️ Playing • ${formatDuration(track?.durationInSec || 0)}`;
}

function updatePlayPauseIcons(playing) {
  const playPath = '<polygon points="5 3 19 12 5 21 5 3"/>';
  const pausePath = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';

  if (el.playerPlayPauseIcon) el.playerPlayPauseIcon.innerHTML = playing ? pausePath : playPath;
  if (el.barPlayPauseIcon) el.barPlayPauseIcon.innerHTML = playing ? pausePath : playPath;

  const heroVinyl = document.getElementById('heroVinyl');
  const heroPulseRing = document.getElementById('heroPulseRing');
  if (heroVinyl) heroVinyl.classList.toggle('playing', !!playing);
  if (heroPulseRing) heroPulseRing.classList.toggle('playing', !!playing);
}

function updateProgressUI(current, total) {
  const percent = total > 0 ? (current / total) * 100 : 0;
  if (el.playerScrubberFill) el.playerScrubberFill.style.width = `${percent}%`;
  if (el.barScrubberFill) el.barScrubberFill.style.width = `${percent}%`;

  const curFormatted = formatDuration(current);
  const totFormatted = formatDuration(total);

  if (el.playerTimeCurrent) el.playerTimeCurrent.textContent = curFormatted;
  if (el.playerTimeTotal) el.playerTimeTotal.textContent = totFormatted;
  if (el.barTimeCurrent) el.barTimeCurrent.textContent = curFormatted;
  if (el.barTimeTotal) el.barTimeTotal.textContent = totFormatted;
}

// ==================== CONTROLS (PLAYER & BAR) ====================

function setupPlayerControls() {
  const togglePlayPause = () => {
    if (state.outputTarget === 'discord') {
      sendDiscordAction('playpause');
      return;
    }
    if (el.audio.paused) {
      if (el.audio.src) el.audio.play();
      else if (state.currentTrack) playTrack(state.currentTrack);
    } else {
      el.audio.pause();
    }
  };

  el.btnPlayerPlayPause?.addEventListener('click', togglePlayPause);
  el.btnBarPlayPause?.addEventListener('click', togglePlayPause);

  // Rewind / Forward 15s
  const seekDelta = (seconds) => {
    if (state.outputTarget === 'discord') {
      const newPos = Math.max(0, state.currentTime + seconds);
      sendDiscordAction('seek', { seconds: newPos });
      return;
    }
    el.audio.currentTime = Math.max(0, Math.min(el.audio.duration || 0, el.audio.currentTime + seconds));
  };

  el.btnPlayerRewind?.addEventListener('click', () => seekDelta(-15));
  el.btnPlayerForward?.addEventListener('click', () => seekDelta(15));
  el.btnBarBack15?.addEventListener('click', () => seekDelta(-15));
  el.btnBarFwd15?.addEventListener('click', () => seekDelta(15));

  // Skip / Previous
  const skipTrack = () => {
    if (state.outputTarget === 'discord') {
      sendDiscordAction('skip');
      return;
    }
    handleTrackEnded();
  };

  const prevTrack = () => {
    if (state.outputTarget === 'discord') {
      sendDiscordAction('previous');
      return;
    }
    if (el.audio.currentTime > 5) {
      el.audio.currentTime = 0;
    } else if (state.localHistory.length > 1) {
      playTrack(state.localHistory[1]);
    }
  };

  el.btnPlayerSkip?.addEventListener('click', skipTrack);
  el.btnBarSkip?.addEventListener('click', skipTrack);
  el.btnPlayerPrev?.addEventListener('click', prevTrack);
  el.btnBarPrev?.addEventListener('click', prevTrack);

  // Stop
  const stopPlayback = () => {
    if (state.outputTarget === 'discord') {
      sendDiscordAction('stop');
      return;
    }
    el.audio.pause();
    el.audio.currentTime = 0;
    state.isPlaying = false;
    updatePlayPauseIcons(false);
    updateProgressUI(0, 0);
  };
  el.btnBarStop?.addEventListener('click', stopPlayback);

  // Scrubber seeking
  const handleScrub = (e, bar) => {
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * (state.duration || 0);

    if (state.outputTarget === 'discord') {
      sendDiscordAction('seek', { seconds: targetSec });
    } else {
      el.audio.currentTime = targetSec;
    }
  };

  el.playerScrubber?.addEventListener('click', (e) => handleScrub(e, el.playerScrubber));
  el.barScrubber?.addEventListener('click', (e) => handleScrub(e, el.barScrubber));

  // Volume
  const updateVolume = (val) => {
    state.volume = val;
    el.audio.volume = val / 100;
    if (el.playerVolumeSlider) el.playerVolumeSlider.value = val;
    if (el.barVolumeSlider) el.barVolumeSlider.value = val;
    if (state.outputTarget === 'discord') {
      sendDiscordAction('volume', { volume: val / 100 });
    }
  };

  el.playerVolumeSlider?.addEventListener('input', (e) => updateVolume(e.target.value));
  el.barVolumeSlider?.addEventListener('input', (e) => updateVolume(e.target.value));

  // Loop toggle
  const toggleLoop = () => {
    const modes = ['off', 'track', 'queue'];
    const next = modes[(modes.indexOf(state.loopMode) + 1) % modes.length];
    state.loopMode = next;
    if (el.playerLoopBadge) el.playerLoopBadge.textContent = next.toUpperCase();
    if (state.outputTarget === 'discord') {
      sendDiscordAction('loop', { mode: next });
    }
    showToast(`Loop Mode: ${next.toUpperCase()}`);
  };

  el.btnPlayerLoop?.addEventListener('click', toggleLoop);
  el.btnBarLoop?.addEventListener('click', toggleLoop);

  // Shuffle toggle
  const toggleShuffle = () => {
    state.isShuffled = !state.isShuffled;
    if (state.outputTarget === 'discord') {
      sendDiscordAction('shuffle');
    } else {
      shuffleArray(state.localQueue);
      renderQueue();
    }
    showToast(state.isShuffled ? 'Queue Shuffled 🔀' : 'Queue Sequential ➡️');
  };

  el.btnPlayerShuffle?.addEventListener('click', toggleShuffle);
  el.btnBarShuffle?.addEventListener('click', toggleShuffle);

  // Server & VC Session Selectors
  const handleServerSelectChange = (e) => {
    state.selectedGuildId = e.target.value;
    if (el.playerServerSelect) el.playerServerSelect.value = state.selectedGuildId;
    if (el.barServerSelect) el.barServerSelect.value = state.selectedGuildId;
    if (el.queueServerSelect) el.queueServerSelect.value = state.selectedGuildId;
    if (state.discordStatus) {
      syncDiscordPlaybackUI(state.discordStatus);
    }
  };
  el.playerServerSelect?.addEventListener('change', handleServerSelectChange);
  el.barServerSelect?.addEventListener('change', handleServerSelectChange);
  el.queueServerSelect?.addEventListener('change', handleServerSelectChange);

  // Favorites toggle
  const handleToggleFav = async () => {
    if (!state.currentTrack) return;
    const isFav = await window.scifyApi?.storeAction('toggleFavorite', state.currentTrack);
    await refreshFavorites();
    el.btnPlayerFavorite?.classList.toggle('active', isFav);
    el.btnBarFavorite?.classList.toggle('active', isFav);
    showToast(isFav ? 'Added to Favorites ⭐' : 'Removed from Favorites');
  };

  el.btnPlayerFavorite?.addEventListener('click', handleToggleFav);
  el.btnBarFavorite?.addEventListener('click', handleToggleFav);

  // Queue screen actions
  document.getElementById('btnQueueShuffle')?.addEventListener('click', () => toggleShuffle());
  document.getElementById('btnQueueClear')?.addEventListener('click', () => {
    if (state.outputTarget === 'discord') {
      sendDiscordAction('stop');
      showToast('Cleared Discord queue & stopped playback');
    } else {
      state.localQueue = [];
      renderQueue();
      showToast('Cleared local queue');
    }
  });

  document.getElementById('btnQueueSavePlaylist')?.addEventListener('click', async () => {
    const isDiscord = state.outputTarget === 'discord' || (state.serverQueue && state.serverQueue.length > 0);
    const queueToSave = isDiscord && state.serverQueue ? state.serverQueue : state.localQueue;
    if (!queueToSave || queueToSave.length === 0) {
      showToast('Queue is empty! Nothing to save.');
      return;
    }
    const name = `Queue Mix (${new Date().toLocaleDateString()})`;
    const pl = await window.scifyApi?.storeAction('createPlaylist', name, `Saved queue with ${queueToSave.length} tracks`);
    if (pl?.id) {
      await window.scifyApi?.storeAction('addTracksToPlaylist', pl.id, queueToSave);
      await refreshPlaylists();
      showToast(`Saved ${queueToSave.length} tracks to playlist "${name}"! 🎉`);
    }
  });

  // Player extras (Add to Lib / Add to Playlist)
  document.getElementById('btnPlayerAddToLib')?.addEventListener('click', async () => {
    if (!state.currentTrack) {
      showToast('No song is currently playing.');
      return;
    }
    await window.scifyApi?.storeAction('addToDesktopLibrary', [state.currentTrack]);
    await refreshLibrary();
    showToast(`Added "${state.currentTrack.title}" to Library! 📚`);
  });

  document.getElementById('btnBarAddToLib')?.addEventListener('click', async () => {
    if (!state.currentTrack) {
      showToast('No song is currently playing.');
      return;
    }
    await window.scifyApi?.storeAction('addToDesktopLibrary', [state.currentTrack]);
    await refreshLibrary();
    showToast(`Added "${state.currentTrack.title}" to Library! 📚`);
  });

  document.getElementById('btnPlayerAddToPlaylist')?.addEventListener('click', async () => {
    if (!state.currentTrack) {
      showToast('No song is currently playing.');
      return;
    }
    if (state.playlists && state.playlists.length > 0) {
      const pl = state.playlists[0];
      await window.scifyApi?.storeAction('addTracksToPlaylist', pl.id, [state.currentTrack]);
      await refreshPlaylists();
      showToast(`Added "${state.currentTrack.title}" to "${pl.name}"! 🎵`);
    } else {
      openModal('modalCreatePlaylist');
    }
  });
}

// ==================== SEARCH ====================

function setupSearch() {
  el.searchInput?.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(state.searchDebounceTimer);
    if (!query) {
      el.searchResultsList.innerHTML = '<div class="empty-state">Type above to search tracks.</div>';
      el.searchResultsHeader.style.display = 'none';
      return;
    }

    state.searchDebounceTimer = setTimeout(() => {
      executeSearch(query);
    }, 400);
  });

  el.btnSearchClear?.addEventListener('click', () => {
    el.searchInput.value = '';
    el.searchResultsList.innerHTML = '';
    el.searchResultsHeader.style.display = 'none';
  });
}

async function executeSearch(query) {
  el.searchResultsList.innerHTML = '<div class="empty-state">⚡ Searching high-fidelity sources…</div>';
  el.searchResultsHeader.style.display = 'none';

  try {
    const results = await window.scifyApi?.searchTracks(query);
    if (!results || results.length === 0) {
      el.searchResultsList.innerHTML = '<div class="empty-state">No tracks found. Try a different query.</div>';
      return;
    }

    el.searchResultsHeader.style.display = 'flex';
    el.searchResultsCount.textContent = `${results.length} tracks`;
    el.searchResultsList.innerHTML = '';

    results.forEach((track) => {
      const item = document.createElement('div');
      item.className = 'search-item-row';
      item.innerHTML = `
        <img src="${track.thumbnail || ''}" class="search-thumb" alt="">
        <div class="search-meta">
          <div class="search-title">${escapeHtml(track.title)}</div>
          <div class="search-artist">${escapeHtml(track.artist)} • ${track.duration}</div>
        </div>
        <div class="search-actions">
          <button class="btn btn-sm btn-primary btn-play-now">▶ Play</button>
          <button class="btn btn-sm btn-secondary btn-add-q">+ Queue</button>
          <button class="btn btn-sm btn-secondary btn-add-lib">+ Library</button>
        </div>
      `;

      item.querySelector('.btn-play-now').addEventListener('click', () => playTrack(track));
      item.querySelector('.btn-add-q').addEventListener('click', async () => {
        if (state.outputTarget === 'discord') {
          showToast(`Queuing "${track.title}" to Discord server…`);
          await sendDiscordAction('play', { query: track.url, requester: 'Windows Desktop', playNow: false });
          showToast(`Queued "${track.title}" to Discord!`);
        } else {
          state.localQueue.push({ ...track, requestedBy: 'Windows Desktop' });
          renderQueue();
          showToast(`Added "${track.title}" to Queue`);
        }
      });
      item.querySelector('.btn-add-lib').addEventListener('click', async () => {
        await window.scifyApi?.storeAction('addToDesktopLibrary', [track]);
        await refreshLibrary();
        showToast(`Added "${track.title}" to Library`);
      });

      el.searchResultsList.appendChild(item);
    });
  } catch (err) {
    el.searchResultsList.innerHTML = `<div class="empty-state">Search error: ${err.message}</div>`;
  }
}

// ==================== DISCORD OAUTH2 INSTALLER ====================

const DIRECT_DISCORD_OAUTH_URL = 'https://discord.com/oauth2/authorize?client_id=1515023402350547015&scope=bot+applications.commands&permissions=36727808&integration_type=0';

async function setupDiscordInstaller() {
  el.btnLaunchDiscordOAuth?.addEventListener('click', async () => {
    let inviteUrl = DIRECT_DISCORD_OAUTH_URL;
    try {
      const res = await window.scifyApi?.getDiscordInvite();
      if (res?.url && res.url.includes('/oauth2/authorize')) {
        inviteUrl = res.url;
      }
    } catch {}
    window.scifyApi?.openExternal(inviteUrl);
    showToast('Opening Discord server authorization in browser…');
  });

  el.btnCopyInviteLink?.addEventListener('click', async () => {
    let inviteUrl = DIRECT_DISCORD_OAUTH_URL;
    try {
      const res = await window.scifyApi?.getDiscordInvite();
      if (res?.url && res.url.includes('/oauth2/authorize')) {
        inviteUrl = res.url;
      }
    } catch {}
    navigator.clipboard.writeText(inviteUrl);
    showToast('Invite link copied to clipboard! 📋');
  });

  document.getElementById('btnAboutAddDiscord')?.addEventListener('click', () => switchScreen('add-discord'));
  document.getElementById('btnServersAddDiscord')?.addEventListener('click', () => switchScreen('add-discord'));
}

async function loadOAuthUrl() {
  const res = await window.scifyApi?.getDiscordInvite();
  if (res?.url && el.oauthUrlInput) {
    el.oauthUrlInput.value = res.url;
  }
}

// ==================== DISCORD SERVERS & VOICE ====================

async function refreshDiscordServers() {
  if (!el.discordServersList) return;
  const status = await window.scifyApi?.getBotStatus();
  if (!status || !status.guilds || status.guilds.length === 0) {
    el.discordServersList.innerHTML = `
      <div class="empty-state">
        <h3>No Connected Discord Servers</h3>
        <p>The bot is currently not in any Discord servers. Click below to add it!</p>
        <button class="btn btn-discord btn-lg" style="margin-top: 14px;" onclick="document.querySelector('[data-screen=add-discord]').click()">
          + Add Scify Music to Discord
        </button>
      </div>
    `;
    return;
  }

  const activeSessions = status.activeSessions || [];
  el.discordServersList.innerHTML = '';
  status.guilds.forEach((guild) => {
    const session = activeSessions.find((s) => s.guildId === guild.id);
    const isPlaying = session?.playing && !session?.paused;

    const card = document.createElement('div');
    card.className = 'discord-server-card';
    card.innerHTML = `
      <div class="server-header-row" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${guild.icon || 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png'}" class="server-icon" alt="">
          <div>
            <h3 style="display: flex; align-items: center; gap: 8px;">
              ${escapeHtml(guild.name)}
              ${session ? `<span class="badge ${isPlaying ? 'badge-success' : 'badge-primary'}" style="font-size: 0.68rem; padding: 2px 6px;">${isPlaying ? '▶ LIVE STREAMING' : 'CONNECTED'}</span>` : ''}
            </h3>
            <span class="sub-label">ID: ${guild.id} • ${guild.voiceChannels.length} Voice Channels</span>
          </div>
        </div>
        ${session ? `
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm btn-primary btn-focus-server" data-guild="${guild.id}">🎵 Focus Player</button>
            <button class="btn btn-sm btn-danger btn-leave-server" data-guild="${guild.id}">Disconnect</button>
          </div>
        ` : ''}
      </div>
      ${session?.current ? `
        <div style="margin: 10px 0; padding: 8px 12px; background: rgba(0, 240, 255, 0.08); border: 1px solid rgba(0, 240, 255, 0.2); border-radius: 6px; font-size: 0.82rem; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <div>
            <span>🎶 Now Playing:</span>
            <strong style="color: #00f0ff; margin-left: 6px;">${escapeHtml(session.current.title)}</strong>
          </div>
          ${session.starterUser ? `
            <div style="display: flex; align-items: center; gap: 6px; color: #ff70ec; font-size: 0.75rem; background: rgba(181, 23, 158, 0.2); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(181, 23, 158, 0.4);">
              ${session.starterUser.avatar ? `<img src="${escapeHtml(session.starterUser.avatar)}" style="width:14px; height:14px; border-radius:50%;">` : '👤'}
              <span>Summoned by: <strong style="color: #fff;">${escapeHtml(session.starterUser.displayName || session.starterUser.username)}</strong></span>
            </div>
          ` : ''}
        </div>
      ` : ''}
      <div class="vc-channels-list">
        ${guild.voiceChannels.map((vc) => {
          const isThisVcActive = session && session.voiceChannelId === vc.id;
          return `
          <div class="vc-channel-row" style="${isThisVcActive ? 'background: rgba(0, 240, 255, 0.12); border-color: rgba(0, 240, 255, 0.4);' : ''}">
            <span>🔊 ${escapeHtml(vc.name)} (${vc.membersCount} in VC) ${isThisVcActive ? '<span style="color:#00f0ff; font-weight:600; margin-left:6px;">← BOT IS HERE</span>' : ''}</span>
            <div style="display:flex; gap: 8px;">
              <button class="btn btn-sm ${isThisVcActive ? 'btn-success' : 'btn-primary'} btn-join-vc" data-guild="${guild.id}" data-vc="${vc.id}">
                ${isThisVcActive ? 'Reconnect / Join' : 'Join & Stream'}
              </button>
            </div>
          </div>
        `;
        }).join('')}
      <div class="server-quick-play-box" style="margin-top: 12px; padding: 10px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px;">
        <div style="font-size: 0.76rem; color: #94a3b8; margin-bottom: 6px; font-weight: 500;">⚡ Quick Play to this Server:</div>
        <div style="display: flex; gap: 8px;">
          <input type="text" class="input-field input-server-play" placeholder="Search track, Spotify song, or YouTube URL…" style="flex: 1; padding: 6px 12px; font-size: 0.8rem; background: rgba(10, 13, 20, 0.8); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 6px; color: #fff;">
          <button class="btn btn-sm btn-primary btn-server-play" data-guild="${guild.id}">▶ Play Here</button>
        </div>
      </div>
    `;

    card.querySelectorAll('.btn-server-play').forEach((btn) => {
      const executePlay = async () => {
        const input = card.querySelector('.input-server-play');
        const query = input?.value.trim();
        if (!query) {
          showToast('Please type a song name or URL.');
          return;
        }
        const guildId = btn.dataset.guild;
        state.selectedGuildId = guildId;
        setOutputTarget('discord');
        showToast(`Streaming to ${guild.name}… 🎵`);
        try {
          const res = await sendDiscordAction('play', { query, guildId, requester: 'Server Manager', playNow: true });
          if (res?.error) showToast(`⚠️ ${res.error}`);
          else {
            showToast(`🎶 Playing "${res.track?.title || query}" in ${guild.name}!`);
            input.value = '';
            await refreshDiscordServers();
            switchScreen('player');
          }
        } catch (err) {
          showToast(`Error: ${err.message}`);
        }
      };

      btn.addEventListener('click', executePlay);
      card.querySelector('.input-server-play')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') executePlay();
      });
    });

    card.querySelectorAll('.btn-join-vc').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const guildId = btn.dataset.guild;
        const vcId = btn.dataset.vc;
        state.selectedGuildId = guildId;
        setOutputTarget('discord');
        showToast('Connecting bot to voice channel…');
        await window.scifyApi?.discordAction('join', { targetGuildId: guildId, voiceChannelId: vcId, guildId });
        await refreshDiscordServers();
      });
    });

    card.querySelectorAll('.btn-focus-server').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedGuildId = btn.dataset.guild;
        setOutputTarget('discord');
        switchScreen('player');
        if (state.discordStatus) syncDiscordPlaybackUI(state.discordStatus);
      });
    });

    card.querySelectorAll('.btn-leave-server').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const guildId = btn.dataset.guild;
        showToast('Disconnecting bot from server…');
        await window.scifyApi?.discordAction('leave', { guildId });
        if (state.selectedGuildId === guildId) {
          state.selectedGuildId = null;
        }
        await refreshDiscordServers();
      });
    });

    el.discordServersList.appendChild(card);
  });
}

function updateServerSessionSelectors(sessions, currentGuildId) {
  const selects = [el.playerServerSelect, el.barServerSelect, el.queueServerSelect].filter(Boolean);
  if (selects.length === 0) return;

  selects.forEach((sel) => {
    sel.style.display = 'inline-block';

    const optionsHtml = sessions.map((s) => {
      const isPlaying = s.playing && !s.paused;
      const statusIcon = isPlaying ? '▶ ' : (s.paused ? '⏸ ' : '⏹ ');
      const songPreview = s.current ? ` - ${s.current.title.slice(0, 22)}…` : '';
      const label = `${statusIcon}${s.serverName} (${s.voiceChannelName || 'VC'})${songPreview}`;
      const isSelected = s.guildId === currentGuildId ? 'selected' : '';
      return `<option value="${escapeHtml(s.guildId)}" ${isSelected}>${escapeHtml(label)}</option>`;
    }).join('');

    if (sel.innerHTML !== optionsHtml) {
      sel.innerHTML = optionsHtml;
      sel.value = currentGuildId;
    }
  });
}

function syncDiscordPlaybackUI(status) {
  if (!status || !status.activeSessions || status.activeSessions.length === 0) {
    state.serverQueue = [];
    if (el.playerServerSelect) el.playerServerSelect.style.display = 'none';
    if (el.barServerSelect) el.barServerSelect.style.display = 'none';
    if (el.queueServerSelect) el.queueServerSelect.style.display = 'none';
    return;
  }

  const sessions = status.activeSessions;

  // Find currently selected session or pick the best one
  let active = sessions.find((s) => s.guildId === state.selectedGuildId);

  // If none selected, or if user started playing in another VC/server:
  const currentlyPlayingSession = sessions.find((s) => s.playing && !s.paused);
  if (!active) {
    active = currentlyPlayingSession || sessions[0];
    state.selectedGuildId = active.guildId;
  } else if (!active.playing && currentlyPlayingSession && currentlyPlayingSession.guildId !== active.guildId) {
    // If current selection is stopped/paused and another session just began playing, switch focus to it
    active = currentlyPlayingSession;
    state.selectedGuildId = active.guildId;
  }

  // Update session dropdown selectors
  updateServerSessionSelectors(sessions, state.selectedGuildId);

  state.serverQueue = active.queue || [];

  if (active.current) {
    state.currentTrack = active.current;
    state.currentTime = active.position || 0;
    state.duration = active.duration || 0;
    state.isPlaying = active.playing && !active.paused;
    state.isPaused = active.paused;

    updateTrackDisplay(active.current);
    updateProgressUI(state.currentTime, state.duration);
    updatePlayPauseIcons(state.isPlaying);
  } else if (!active.playing) {
    state.isPlaying = false;
    state.isPaused = false;
    updatePlayPauseIcons(false);
  }

  // Update target badges with Server & VC info
  if (el.playerTargetBadge) {
    const vcName = active.voiceChannelName ? `#${active.voiceChannelName}` : 'Voice Channel';
    el.playerTargetBadge.innerHTML = `🎙️ DISCORD VC: <strong style="color: var(--color-neon-cyan);">${escapeHtml(active.serverName)}</strong> (${escapeHtml(vcName)})`;
  }
  if (el.barTargetPill) {
    const textEl = el.barTargetPill.querySelector('.target-text');
    if (textEl) {
      textEl.textContent = `${active.serverName} (${active.voiceChannelName || 'VC'})`;
    }
  }

  // Update Summoner / Requester Badge
  const summonerUser = active.starterUser;
  const summonerName = summonerUser?.displayName || summonerUser?.username || active.current?.requestedBy || state.currentTrack?.requestedBy;
  if (el.playerSummonerBadge) {
    if (summonerName && summonerName !== 'default' && summonerName !== 'Windows Desktop' && summonerName !== 'Local Desktop') {
      el.playerSummonerBadge.style.display = 'inline-flex';
      if (el.playerSummonerName) el.playerSummonerName.textContent = summonerName;
      if (el.playerSummonerAvatar) {
        if (summonerUser?.avatar) {
          el.playerSummonerAvatar.innerHTML = `<img src="${escapeHtml(summonerUser.avatar)}" style="width:16px; height:16px; border-radius:50%; vertical-align:middle;">`;
        } else {
          el.playerSummonerAvatar.textContent = '👤';
        }
      }
    } else {
      el.playerSummonerBadge.style.display = 'none';
    }
  }

  // Update User VC Badge live location
  if (state.savedDiscordUser && status.activeVoiceUsers) {
    const query = state.savedDiscordUser.toLowerCase();
    const userInVc = status.activeVoiceUsers.find((u) => 
      u.username.toLowerCase() === query ||
      u.displayName.toLowerCase() === query ||
      u.username.toLowerCase().includes(query) ||
      u.displayName.toLowerCase().includes(query)
    );
    if (userInVc) {
      if (el.userVcName) el.userVcName.textContent = userInVc.displayName || userInVc.username;
      if (el.userVcChannelTag) el.userVcChannelTag.textContent = `${userInVc.guildName} #${userInVc.voiceChannelName}`;
      if (el.userVcAvatar && userInVc.avatar) {
        el.userVcAvatar.src = userInVc.avatar;
        el.userVcAvatar.style.display = 'inline-block';
        if (el.userVcAvatarPlaceholder) el.userVcAvatarPlaceholder.style.display = 'none';
      }
      el.btnUserVcBadge?.classList.add('in-vc');
    } else {
      if (el.userVcChannelTag) el.userVcChannelTag.textContent = 'Not in VC';
      el.btnUserVcBadge?.classList.remove('in-vc');
    }
  }

  if (state.outputTarget === 'discord' || state.activeScreen === 'queue') {
    renderQueue();
  }
}

// ==================== COLLECTIONS (LIBRARY, QUEUE, PLAYLISTS, FAVORITES, HISTORY) ====================

async function refreshAllData() {
  await Promise.all([
    refreshLibrary(),
    refreshPlaylists(),
    refreshFavorites(),
    refreshHistory(),
    loadBotConfig(),
  ]);
  renderHomeSections();
}

async function refreshLibrary() {
  const lib = await window.scifyApi?.storeAction('getDesktopLibrary');
  state.library = lib || [];
  if (el.libNavCount) el.libNavCount.textContent = state.library.length;
  if (el.libCountLabel) el.libCountLabel.textContent = state.library.length;
  renderLibrary();
}

function renderLibrary() {
  if (!el.libTracksTable) return;
  const filterText = document.getElementById('libSearchFilter')?.value.trim().toLowerCase() || '';
  const sortMode = document.getElementById('libSortSelect')?.value || 'recent';

  let tracks = [...state.library];

  if (filterText) {
    tracks = tracks.filter((t) => 
      (t.title && t.title.toLowerCase().includes(filterText)) || 
      (t.artist && t.artist.toLowerCase().includes(filterText))
    );
  }

  if (sortMode === 'title') {
    tracks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sortMode === 'duration') {
    tracks.sort((a, b) => (b.durationInSec || 0) - (a.durationInSec || 0));
  }

  if (tracks.length === 0) {
    el.libTracksTable.innerHTML = `<div class="empty-state">${filterText ? 'No songs match your filter.' : 'Your library is empty. Click "+ Add Song" to add music.'}</div>`;
    return;
  }

  el.libTracksTable.innerHTML = '';
  tracks.forEach((track, i) => {
    const row = createTrackRow(track, i + 1, { source: 'library' });
    el.libTracksTable.appendChild(row);
  });
}

async function refreshFavorites() {
  let favs = await window.scifyApi?.storeAction('getFavorites');
  if ((!favs || favs.length === 0) && window.localStorage) {
    try {
      const local = JSON.parse(window.localStorage.getItem('scify_favorites') || '[]');
      if (local && local.length > 0) favs = local;
    } catch {}
  }
  state.favorites = favs || [];
  if (window.localStorage && state.favorites.length > 0) {
    try { window.localStorage.setItem('scify_favorites', JSON.stringify(state.favorites)); } catch {}
  }
  renderFavorites();
}

function renderFavorites() {
  if (!el.favoritesTable) return;
  if (state.favorites.length === 0) {
    el.favoritesTable.innerHTML = '<div class="empty-state">No favorited tracks yet. Click the heart icon on any song.</div>';
    return;
  }
  el.favoritesTable.innerHTML = '';
  state.favorites.forEach((track, i) => {
    const row = createTrackRow(track, i + 1, { source: 'favorites' });
    el.favoritesTable.appendChild(row);
  });
}

async function refreshHistory() {
  const hist = await window.scifyApi?.storeAction('getHistory', 'desktop');
  state.localHistory = hist || [];
  renderHistory();
}

function renderHistory() {
  if (!el.historyTable) return;
  if (state.localHistory.length === 0) {
    el.historyTable.innerHTML = '<div class="empty-state">No recently played tracks.</div>';
    return;
  }
  el.historyTable.innerHTML = '';
  state.localHistory.forEach((track, i) => {
    const row = createTrackRow(track, i + 1, { source: 'history' });
    el.historyTable.appendChild(row);
  });
}

async function refreshPlaylists() {
  let pls = await window.scifyApi?.storeAction('getAllPlaylists');
  if ((!pls || pls.length === 0) && window.localStorage) {
    try {
      const local = JSON.parse(window.localStorage.getItem('scify_playlists') || '[]');
      if (local && local.length > 0) pls = local;
    } catch {}
  }
  state.playlists = pls || [];
  if (window.localStorage && state.playlists.length > 0) {
    try { window.localStorage.setItem('scify_playlists', JSON.stringify(state.playlists)); } catch {}
  }
  renderPlaylists();
}

function renderPlaylists() {
  if (!el.playlistsGrid) return;
  if (state.playlists.length === 0) {
    el.playlistsGrid.innerHTML = '<div class="empty-state">No playlists yet. Click "+ Create Playlist" to start.</div>';
    return;
  }

  el.playlistsGrid.innerHTML = '';
  state.playlists.forEach((pl) => {
    const card = document.createElement('div');
    card.className = 'music-card';
    card.innerHTML = `
      <div class="card-art-box">
        <img src="${pl.cover || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop'}" class="card-art" alt="">
        <button class="card-overlay-btn btn-play-pl" title="Play Playlist">
          <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
      </div>
      <div class="card-title">${escapeHtml(pl.name)}</div>
      <div class="card-sub">${pl.tracks?.length || 0} tracks</div>
    `;

    card.querySelector('.btn-play-pl').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (pl.tracks && pl.tracks.length > 0) {
        if (state.outputTarget === 'discord') {
          showToast(`Playing playlist "${pl.name}" in Discord VC…`);
          for (let i = 0; i < pl.tracks.length; i++) {
            await sendDiscordAction('play', { query: pl.tracks[i].url, requester: pl.name, playNow: i === 0 });
          }
        } else {
          state.localQueue = [...pl.tracks.slice(1)];
          renderQueue();
          playTrack(pl.tracks[0]);
        }
        showToast(`Playing "${pl.name}"!`);
      } else {
        showToast('Playlist is empty.');
      }
    });

    card.addEventListener('click', () => {
      openPlaylistModal(pl.id);
    });

    el.playlistsGrid.appendChild(card);
  });
}

async function openPlaylistModal(playlistId) {
  const pl = await window.scifyApi?.storeAction('getPlaylist', playlistId);
  if (!pl) return;

  const titleEl = document.getElementById('viewPlaylistTitle');
  const subEl = document.getElementById('viewPlaylistSub');
  const listEl = document.getElementById('viewPlaylistTracksList');

  if (titleEl) titleEl.textContent = pl.name;
  if (subEl) subEl.textContent = `${pl.tracks?.length || 0} tracks • ${pl.description || 'Custom Playlist'}`;

  const renderModalTracks = () => {
    if (!listEl) return;
    if (!pl.tracks || pl.tracks.length === 0) {
      listEl.innerHTML = '<div class="empty-state">This playlist has no tracks.</div>';
      return;
    }
    listEl.innerHTML = '';
    pl.tracks.forEach((track, i) => {
      const row = createTrackRow(track, i + 1, {
        source: 'playlist',
        onDelete: async () => {
          await window.scifyApi?.storeAction('removeTrackFromPlaylist', pl.id, i);
          pl.tracks.splice(i, 1);
          if (subEl) subEl.textContent = `${pl.tracks.length} tracks • ${pl.description || 'Custom Playlist'}`;
          renderModalTracks();
          await refreshPlaylists();
          showToast('Removed track from playlist');
        },
      });
      listEl.appendChild(row);
    });
  };

  renderModalTracks();

  const btnPlayAll = document.getElementById('btnViewPlaylistPlayAll');
  if (btnPlayAll) {
    btnPlayAll.onclick = async () => {
      if (!pl.tracks || pl.tracks.length === 0) {
        showToast('Playlist is empty.');
        return;
      }
      closeModal('modalViewPlaylist');
      if (state.outputTarget === 'discord') {
        showToast(`Playing "${pl.name}" (${pl.tracks.length} songs) in Discord VC…`);
        for (let i = 0; i < pl.tracks.length; i++) {
          await sendDiscordAction('play', { query: pl.tracks[i].url, requester: pl.name, playNow: i === 0 });
        }
      } else {
        state.localQueue = [...pl.tracks.slice(1)];
        renderQueue();
        playTrack(pl.tracks[0]);
      }
      showToast(`Playing playlist "${pl.name}"!`);
    };
  }

  const btnQueueAll = document.getElementById('btnViewPlaylistQueueAll');
  if (btnQueueAll) {
    btnQueueAll.onclick = async () => {
      if (!pl.tracks || pl.tracks.length === 0) {
        showToast('Playlist is empty.');
        return;
      }
      closeModal('modalViewPlaylist');
      if (state.outputTarget === 'discord') {
        showToast(`Queuing ${pl.tracks.length} songs to Discord server…`);
        for (let i = 0; i < pl.tracks.length; i++) {
          await sendDiscordAction('play', { query: pl.tracks[i].url, requester: pl.name, playNow: false });
        }
      } else {
        state.localQueue.push(...pl.tracks);
        renderQueue();
      }
      showToast(`Added ${pl.tracks.length} tracks to queue!`);
    };
  }

  const btnDelete = document.getElementById('btnViewPlaylistDelete');
  if (btnDelete) {
    btnDelete.onclick = async () => {
      if (confirm(`Are you sure you want to delete playlist "${pl.name}"?`)) {
        await window.scifyApi?.storeAction('deletePlaylist', pl.id);
        closeModal('modalViewPlaylist');
        await refreshPlaylists();
        showToast(`Deleted playlist "${pl.name}"`);
      }
    };
  }

  openModal('modalViewPlaylist');
}

function renderQueue() {
  if (!el.queueList) return;

  const isDiscord = state.outputTarget === 'discord' || (state.serverQueue && state.serverQueue.length > 0);
  const queueToRender = isDiscord && state.serverQueue ? state.serverQueue : state.localQueue;

  if (el.queueNavCount) el.queueNavCount.textContent = queueToRender.length;
  if (el.queueCountLabel) el.queueCountLabel.textContent = `${queueToRender.length}${isDiscord ? ' (Shared Discord Server)' : ''}`;

  if (state.currentTrack && el.queueCurrentCard) {
    const requester = state.currentTrack.requestedBy || (isDiscord ? 'Discord User' : 'Local User');
    el.queueCurrentCard.innerHTML = `
      <div class="track-row" style="background: rgba(0, 240, 255, 0.08); border-color: var(--border-glow);">
        <span class="track-index" style="color: var(--accent-color);">▶</span>
        <img src="${state.currentTrack.thumbnail || ''}" class="track-thumb" alt="">
        <div class="track-info">
          <div class="track-name">${escapeHtml(state.currentTrack.title)}</div>
          <div class="track-artist-sub">
            ${escapeHtml(state.currentTrack.artist || 'YouTube')} • 
            <span style="color: var(--accent-color); font-weight: 500;">👤 Added by ${escapeHtml(requester)}</span>
          </div>
        </div>
        <span class="track-dur">${formatDuration(state.currentTrack.durationInSec || 0)}</span>
        <div class="track-actions">
          <button class="btn btn-xs btn-secondary btn-cur-add-lib" title="Add currently playing track to Library">📚 + Library</button>
          <button class="btn btn-xs btn-outline btn-cur-fav" title="Add to Favorites">❤️ Favorite</button>
        </div>
      </div>
    `;
    el.queueCurrentCard.querySelector('.btn-cur-add-lib')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.scifyApi?.storeAction('addToDesktopLibrary', [state.currentTrack]);
      await refreshLibrary();
      showToast(`Added "${state.currentTrack.title}" to Library! 📚`);
    });
    el.queueCurrentCard.querySelector('.btn-cur-fav')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(state.currentTrack);
    });
  }

  if (queueToRender.length === 0) {
    el.queueList.innerHTML = `<div class="empty-state">Queue is empty.${isDiscord ? ' Songs added from Discord (/play) or Desktop will appear here immediately!' : ' Add songs from Search or Playlists.'}</div>`;
    return;
  }

  el.queueList.innerHTML = '';
  queueToRender.forEach((track, i) => {
    const row = document.createElement('div');
    row.className = 'track-row queue-draggable-row';
    row.draggable = true;
    row.dataset.index = i;
    const requester = track.requestedBy || (isDiscord ? 'Discord User' : 'Local User');

    row.innerHTML = `
      <span class="track-drag-handle" title="Drag to reorder queue">⠿</span>
      <span class="track-index">${i + 1}</span>
      <img src="${track.thumbnail || ''}" class="track-thumb" alt="">
      <div class="track-info">
        <div class="track-name">${escapeHtml(track.title)}</div>
        <div class="track-artist-sub">
          ${escapeHtml(track.artist || 'YouTube')} • 
          <span style="color: var(--accent-color);">👤 Added by ${escapeHtml(requester)}</span>
        </div>
      </div>
      <span class="track-dur">${formatDuration(track.durationInSec || 0)}</span>
      <div class="track-actions">
        <button class="btn btn-xs btn-primary btn-q-play" title="Play Now">▶ Play</button>
        <button class="btn btn-xs btn-secondary btn-q-lib" title="Add to Library">📚 +Lib</button>
        <button class="btn btn-xs btn-danger btn-remove-q" title="Remove from queue">&times;</button>
      </div>
    `;

    // Drag & Drop handlers for Queue Reordering
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
      row.classList.add('is-dragging');
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      document.querySelectorAll('.queue-draggable-row').forEach((r) => {
        r.classList.remove('drag-over-above', 'drag-over-below');
      });
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        row.classList.add('drag-over-above');
        row.classList.remove('drag-over-below');
      } else {
        row.classList.add('drag-over-below');
        row.classList.remove('drag-over-above');
      }
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over-above', 'drag-over-below');
    });

    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('drag-over-above', 'drag-over-below');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      let toIndex = i;
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY >= midY && toIndex < queueToRender.length - 1) {
        toIndex += 1;
      }
      if (isNaN(fromIndex) || fromIndex === toIndex) return;

      if (isDiscord) {
        showToast(`Reordering queue track #${fromIndex + 1} → #${toIndex + 1}…`);
        await sendDiscordAction('moveQueue', { fromIndex, toIndex });
      } else {
        const [movedItem] = state.localQueue.splice(fromIndex, 1);
        state.localQueue.splice(toIndex, 0, movedItem);
        renderQueue();
        showToast(`Queue reordered (#${fromIndex + 1} → #${toIndex + 1})`);
      }
    });

    row.querySelector('.btn-q-play').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isDiscord) {
        await sendDiscordAction('jumpQueue', { index: i });
      } else {
        state.localQueue.splice(i, 1);
        renderQueue();
        playTrack(track);
      }
    });

    row.querySelector('.btn-q-lib').addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.scifyApi?.storeAction('addToDesktopLibrary', [track]);
      await refreshLibrary();
      showToast(`Added "${track.title}" to Library! 📚`);
    });

    row.querySelector('.btn-remove-q').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isDiscord) {
        await sendDiscordAction('removeQueue', { index: i });
      } else {
        state.localQueue.splice(i, 1);
        renderQueue();
      }
    });

    row.addEventListener('click', async () => {
      if (isDiscord) {
        await sendDiscordAction('jumpQueue', { index: i });
      } else {
        state.localQueue.splice(i, 1);
        renderQueue();
        playTrack(track);
      }
    });

    el.queueList.appendChild(row);
  });
}

function renderHomeSections() {
  const recentGrid = document.getElementById('homeRecentGrid');
  const libraryGrid = document.getElementById('homeLibraryGrid');
  const homePlaylistsGrid = document.getElementById('homePlaylistsGrid');

  if (recentGrid) {
    recentGrid.innerHTML = '';
    const slice = state.localHistory.slice(0, 6);
    if (slice.length === 0) {
      recentGrid.innerHTML = '<div class="empty-state">No recent tracks yet. Search above to play!</div>';
    } else {
      slice.forEach((track) => {
        recentGrid.appendChild(createMusicCard(track, () => playTrack(track)));
      });
    }
  }

  if (libraryGrid) {
    libraryGrid.innerHTML = '';
    const slice = state.library.slice(0, 6);
    if (slice.length === 0) {
      libraryGrid.innerHTML = '<div class="empty-state">Your library is empty. Add songs from Search.</div>';
    } else {
      slice.forEach((track) => {
        libraryGrid.appendChild(createMusicCard(track, () => playTrack(track)));
      });
    }
  }

  if (homePlaylistsGrid) {
    homePlaylistsGrid.innerHTML = '';
    if (state.playlists.length === 0) {
      homePlaylistsGrid.innerHTML = '<div class="empty-state">No playlists created yet.</div>';
    } else {
      state.playlists.slice(0, 6).forEach((pl) => {
        const card = document.createElement('div');
        card.className = 'music-card';
        card.innerHTML = `
          <div class="card-art-box">
            <div class="artwork-placeholder" style="width:100%; height:100%; border-radius:8px;">
              <svg viewBox="0 0 24 24" style="width:36px; height:36px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
            <button class="card-overlay-btn btn-play-pl">
              <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          </div>
          <div class="card-title">${escapeHtml(pl.name)}</div>
          <div class="card-sub">${pl.tracks?.length || 0} tracks</div>
        `;
        card.querySelector('.btn-play-pl').addEventListener('click', (e) => {
          e.stopPropagation();
          if (pl.tracks && pl.tracks.length > 0) {
            state.localQueue = [...pl.tracks.slice(1)];
            renderQueue();
            playTrack(pl.tracks[0]);
          } else {
            showToast('Playlist is empty.');
          }
        });
        homePlaylistsGrid.appendChild(card);
      });
    }
  }
}

function createTrackRow(track, index, options = {}) {
  const row = document.createElement('div');
  row.className = 'track-row';
  const thumbHtml = track.thumbnail
    ? `<img src="${escapeHtml(track.thumbnail)}" class="track-thumb" alt="">`
    : `<div class="track-thumb-placeholder" style="width:48px; height:32px; border-radius:4px; background:rgba(0,240,255,0.1); display:flex; align-items:center; justify-content:center; color:var(--accent-color); font-size:0.8rem;">🎵</div>`;

  const isLibrary = options.source === 'library';
  const isPlaylist = options.source === 'playlist';

  row.innerHTML = `
    <span class="track-index">${index}</span>
    ${thumbHtml}
    <div class="track-info">
      <div class="track-name">${escapeHtml(track.title)}</div>
      <div class="track-artist-sub">
        ${escapeHtml(track.artist || 'YouTube')}
        ${track.addedBy && track.addedBy !== 'default' ? ` • <span style="color:var(--accent-color); font-size:0.75rem;">👤 ${escapeHtml(track.addedBy)}</span>` : ''}
      </div>
    </div>
    <span class="track-dur">${formatDuration(track.durationInSec || 0)}</span>
    <div class="track-actions">
      <button class="btn btn-xs btn-primary btn-track-play" title="Play Now">▶ Play</button>
      <button class="btn btn-xs btn-secondary btn-track-queue" title="Add to Queue">+ Queue</button>
      ${!isLibrary ? `<button class="btn btn-xs btn-secondary btn-track-lib" title="Add to Library">📚 +Lib</button>` : ''}
      ${isLibrary ? `<button class="btn btn-xs btn-danger btn-track-del-lib" title="Remove from Library">&times;</button>` : ''}
      ${isPlaylist ? `<button class="btn btn-xs btn-danger btn-track-del-pl" title="Remove from Playlist">&times;</button>` : ''}
    </div>
  `;

  row.querySelector('.btn-track-play')?.addEventListener('click', (e) => {
    e.stopPropagation();
    playTrack(track);
  });

  row.querySelector('.btn-track-queue')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (state.outputTarget === 'discord') {
      showToast(`Queuing "${track.title}" to Discord server…`);
      await sendDiscordAction('play', { query: track.url, requester: 'Windows Desktop', playNow: false });
      showToast(`Queued "${track.title}" to Discord!`);
    } else {
      state.localQueue.push({ ...track, requestedBy: 'Windows Desktop' });
      renderQueue();
      showToast(`Added "${track.title}" to Queue`);
    }
  });

  row.querySelector('.btn-track-lib')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.scifyApi?.storeAction('addToDesktopLibrary', [track]);
    await refreshLibrary();
    showToast(`Added "${track.title}" to Library! 📚`);
  });

  row.querySelector('.btn-track-del-lib')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.scifyApi?.storeAction('removeFromDesktopLibrary', track.url);
    await refreshLibrary();
    showToast(`Removed "${track.title}" from Library`);
  });

  if (isPlaylist && typeof options.onDelete === 'function') {
    row.querySelector('.btn-track-del-pl')?.addEventListener('click', (e) => {
      e.stopPropagation();
      options.onDelete();
    });
  }

  row.addEventListener('click', () => playTrack(track));
  return row;
}

function createMusicCard(track, onPlay) {
  const card = document.createElement('div');
  card.className = 'music-card';
  card.innerHTML = `
    <div class="card-art-box">
      <img src="${track.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=400&auto=format&fit=crop'}" class="card-art" alt="">
      <button class="card-overlay-btn" title="Play Now">
        <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </button>
    </div>
    <div class="card-title">${escapeHtml(track.title)}</div>
    <div class="card-sub">${escapeHtml(track.artist || 'YouTube')}</div>
    <div class="card-quick-actions">
      <button class="btn btn-xs btn-outline btn-card-queue" title="Add to Queue">+ Queue</button>
      <button class="btn btn-xs btn-outline btn-card-lib" title="Add to Library">📚 +Lib</button>
    </div>
  `;
  card.querySelector('.card-overlay-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    onPlay();
  });
  card.querySelector('.btn-card-queue')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (state.outputTarget === 'discord') {
      showToast(`Queuing "${track.title}" to Discord server…`);
      await sendDiscordAction('play', { query: track.url, requester: 'Windows Desktop', playNow: false });
      showToast(`Queued "${track.title}" to Discord!`);
    } else {
      state.localQueue.push({ ...track, requestedBy: 'Windows Desktop' });
      renderQueue();
      showToast(`Added "${track.title}" to Queue`);
    }
  });
  card.querySelector('.btn-card-lib')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.scifyApi?.storeAction('addToDesktopLibrary', [track]);
    await refreshLibrary();
    showToast(`Added "${track.title}" to Library! 📚`);
  });
  card.addEventListener('click', onPlay);
  return card;
}

// ==================== ACCENT THEMES & CUSTOMIZATION ====================

const ACCENT_THEMES = {
  cyan: { color: '#00f0ff', glow: 'rgba(0, 240, 255, 0.4)', border: 'rgba(0, 240, 255, 0.25)', name: 'Electric Cyan' },
  emerald: { color: '#00ff88', glow: 'rgba(0, 255, 136, 0.4)', border: 'rgba(0, 255, 136, 0.25)', name: 'Matrix Emerald' },
  violet: { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)', border: 'rgba(168, 85, 247, 0.25)', name: 'Cyber Violet' },
  rose: { color: '#ff2e93', glow: 'rgba(255, 46, 147, 0.4)', border: 'rgba(255, 46, 147, 0.25)', name: 'Sunset Rose' },
  amber: { color: '#ffb703', glow: 'rgba(255, 183, 3, 0.4)', border: 'rgba(255, 183, 3, 0.25)', name: 'Solar Amber' },
  ruby: { color: '#ff3366', glow: 'rgba(255, 51, 102, 0.4)', border: 'rgba(255, 51, 102, 0.25)', name: 'Neon Ruby' },
};

function applyAccent(accentKey, notify = true) {
  const theme = ACCENT_THEMES[accentKey] || ACCENT_THEMES.cyan;
  document.documentElement.style.setProperty('--accent-color', theme.color);
  document.documentElement.style.setProperty('--accent-glow', theme.glow);
  document.documentElement.style.setProperty('--border-glow', theme.border);
  localStorage.setItem('sruti_accent', accentKey);

  // Sync titlebar mini accent buttons
  document.querySelectorAll('.accent-mini-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.accent === accentKey);
  });

  // Sync Settings accent swatches
  document.querySelectorAll('.accent-swatch').forEach((swatch) => {
    swatch.classList.toggle('active', swatch.dataset.accent === accentKey);
  });

  const nameEl = document.getElementById('currentAccentName');
  if (nameEl) nameEl.textContent = theme.name;

  if (notify) showToast(`🎨 Theme Accent: ${theme.name}`);
}

// ==================== STATISTICS ====================

async function renderStatistics() {
  const stats = await window.scifyApi?.storeAction('getStats');
  const botStatus = await window.scifyApi?.getBotStatus();
  const history = (await window.scifyApi?.storeAction('getHistory', 'desktop')) || state.localHistory || [];

  if (el.statSongsPlayed) el.statSongsPlayed.textContent = stats?.songsPlayed || 0;
  if (el.statListeningTime) {
    const hours = Math.floor((stats?.totalListeningTimeSec || 0) / 3600);
    const mins = Math.floor(((stats?.totalListeningTimeSec || 0) % 3600) / 60);
    el.statListeningTime.textContent = `${hours}h ${mins}m`;
  }
  if (el.statServersCount) el.statServersCount.textContent = botStatus?.guilds?.length || 0;
  if (el.statLibraryCount) el.statLibraryCount.textContent = state.library?.length || 0;

  // Diagnostics
  const diagPing = document.getElementById('diagPing');
  if (diagPing) {
    const ping = botStatus?.ping ?? 0;
    diagPing.textContent = ping ? `${ping} ms` : 'Active';
  }

  // Populate Top Played Tracks leaderboard
  const topTracksTable = document.getElementById('statsTopTracksTable');
  if (topTracksTable) {
    const topTracks = stats?.topTracks || [];
    if (topTracks.length > 0) {
      topTracksTable.innerHTML = '';
      topTracks.slice(0, 8).forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'track-row';
        row.innerHTML = `
          <span class="track-index" style="font-weight: 700; color: var(--accent-color);">#${index + 1}</span>
          <img src="${item.track?.thumbnail || ''}" class="track-thumb" alt="">
          <div class="track-info">
            <div class="track-name">${escapeHtml(item.track?.title || 'Unknown Title')}</div>
            <div class="track-artist-sub">${escapeHtml(item.track?.artist || 'YouTube')} • <strong style="color: var(--accent-color);">${item.playCount || 1} plays</strong></div>
          </div>
          <span class="track-dur">${formatDuration(item.track?.durationInSec || 0)}</span>
          <button class="btn btn-sm btn-primary btn-play-stat" style="margin-left: 10px;">▶ Play</button>
        `;
        row.querySelector('.btn-play-stat').addEventListener('click', (e) => {
          e.stopPropagation();
          playTrack(item.track);
        });
        row.addEventListener('click', () => playTrack(item.track));
        topTracksTable.appendChild(row);
      });
    } else if (history.length > 0) {
      topTracksTable.innerHTML = '';
      history.slice(0, 8).forEach((track, index) => {
        const row = document.createElement('div');
        row.className = 'track-row';
        row.innerHTML = `
          <span class="track-index" style="font-weight: 700; color: var(--accent-color);">#${index + 1}</span>
          <img src="${track.thumbnail || ''}" class="track-thumb" alt="">
          <div class="track-info">
            <div class="track-name">${escapeHtml(track.title || 'Unknown Title')}</div>
            <div class="track-artist-sub">${escapeHtml(track.artist || 'YouTube')}</div>
          </div>
          <span class="track-dur">${formatDuration(track.durationInSec || 0)}</span>
          <button class="btn btn-sm btn-primary btn-play-stat" style="margin-left: 10px;">▶ Play</button>
        `;
        row.querySelector('.btn-play-stat').addEventListener('click', (e) => {
          e.stopPropagation();
          playTrack(track);
        });
        row.addEventListener('click', () => playTrack(track));
        topTracksTable.appendChild(row);
      });
    } else {
      topTracksTable.innerHTML = `
        <div class="empty-state" style="padding: 28px;">
          <div style="font-size: 2rem;">🎶</div>
          <h3>No Top Tracks Recorded Yet</h3>
          <p>Play tracks from Search, Library, or Discord VC to build your listening leaderboard.</p>
        </div>
      `;
    }
  }
}

// ==================== SETTINGS & BOT CONTROL ====================

async function loadBotConfig() {
  const cfg = await window.scifyApi?.getEnvConfig();
  if (!cfg) return;
  state.botConfig = cfg;

  const badgeProtection = document.getElementById('badgeTokenProtection');
  const btnSwitch = document.getElementById('btnSwitchCustomToken');
  const fieldHint = document.getElementById('tokenFieldHint');

  if (cfg.isOfficialToken) {
    if (el.cfgDiscordToken) {
      el.cfgDiscordToken.value = '••••••••••••••••••••••••••••••••••••••••';
      el.cfgDiscordToken.readOnly = true;
    }
    if (badgeProtection) {
      badgeProtection.textContent = '🔒 AES-256 Protected';
      badgeProtection.className = 'badge badge-success';
    }
    if (btnSwitch) btnSwitch.textContent = 'Enter Custom Token';
    if (fieldHint) fieldHint.textContent = 'Using official Sruti bot instance (credentials encrypted in vault).';
  } else {
    if (el.cfgDiscordToken) {
      el.cfgDiscordToken.value = cfg.DISCORD_TOKEN || '';
      el.cfgDiscordToken.readOnly = false;
    }
    if (badgeProtection) {
      badgeProtection.textContent = 'Custom Bot Token';
      badgeProtection.className = 'badge badge-primary';
    }
    if (btnSwitch) btnSwitch.textContent = 'Restore Official Bot';
    if (fieldHint) fieldHint.textContent = 'Custom Discord bot token active.';
  }

  if (el.cfgClientId) el.cfgClientId.value = cfg.DISCORD_CLIENT_ID || '';
  if (el.cfgAccessRole) el.cfgAccessRole.value = cfg.ACCESS_ROLE_ID || '';
  if (el.cfgPriorityRole) el.cfgPriorityRole.value = cfg.PRIORITY_ROLE_ID || '';
  if (el.cfgYtProxy) el.cfgYtProxy.value = cfg.YT_PROXY || '';
  if (el.cfgSpotifyId) el.cfgSpotifyId.value = cfg.SPOTIFY_CLIENT_ID || '';
  if (el.cfgSpotifySecret) el.cfgSpotifySecret.value = cfg.SPOTIFY_CLIENT_SECRET || '';
}

function setupSettings() {
  // Custom Token vs Official Token Switcher
  document.getElementById('btnSwitchCustomToken')?.addEventListener('click', () => {
    const btnSwitch = document.getElementById('btnSwitchCustomToken');
    const badgeProtection = document.getElementById('badgeTokenProtection');
    const fieldHint = document.getElementById('tokenFieldHint');

    if (el.cfgDiscordToken.readOnly) {
      // Switch to Custom mode
      el.cfgDiscordToken.readOnly = false;
      el.cfgDiscordToken.value = '';
      el.cfgDiscordToken.placeholder = 'Paste your custom Discord bot token here…';
      el.cfgDiscordToken.focus();
      btnSwitch.textContent = 'Restore Official Bot';
      if (badgeProtection) {
        badgeProtection.textContent = 'Custom Bot Mode';
        badgeProtection.className = 'badge badge-primary';
      }
      if (fieldHint) fieldHint.textContent = 'Enter your own bot token from discord.com/developers/applications';
      showToast('Switched to Custom Bot Mode');
    } else {
      // Restore Official mode
      el.cfgDiscordToken.readOnly = true;
      el.cfgDiscordToken.value = '••••••••••••••••••••••••••••••••••••••••';
      el.cfgDiscordToken.type = 'password';
      btnSwitch.textContent = 'Enter Custom Token';
      if (badgeProtection) {
        badgeProtection.textContent = '🔒 AES-256 Protected';
        badgeProtection.className = 'badge badge-success';
      }
      if (fieldHint) fieldHint.textContent = 'Using official Sruti bot instance (credentials encrypted in vault).';
      showToast('Restored Official Sruti Bot Instance 🔒');
    }
  });

  el.btnSaveSettings?.addEventListener('click', async () => {
    const tokenVal = el.cfgDiscordToken.value.trim();
    const updated = {
      DISCORD_TOKEN: tokenVal.includes('•') ? '' : tokenVal,
      DISCORD_CLIENT_ID: el.cfgClientId.value.trim(),
      ACCESS_ROLE_ID: el.cfgAccessRole.value.trim(),
      PRIORITY_ROLE_ID: el.cfgPriorityRole.value.trim(),
      YT_PROXY: el.cfgYtProxy.value.trim(),
      SPOTIFY_CLIENT_ID: el.cfgSpotifyId.value.trim(),
      SPOTIFY_CLIENT_SECRET: el.cfgSpotifySecret.value.trim(),
    };

    const res = await window.scifyApi?.saveEnvConfig(updated);
    if (res?.success) {
      showToast('Settings saved successfully! ✅');
      await loadBotConfig();
      loadOAuthUrl();
    } else {
      showToast(`⚠️ Error saving: ${res?.error}`);
    }
  });

  el.btnSettingsStartBot?.addEventListener('click', async () => {
    showToast('Starting Discord bot…');
    await window.scifyApi?.startBot();
  });

  el.btnSettingsStopBot?.addEventListener('click', async () => {
    showToast('Stopping Discord bot…');
    await window.scifyApi?.stopBot();
  });

  el.btnSettingsRestartBot?.addEventListener('click', async () => {
    showToast('Restarting Discord bot…');
    await window.scifyApi?.restartBot();
  });

  el.btnClearLogs?.addEventListener('click', () => {
    if (el.logConsole) el.logConsole.innerHTML = '';
  });

  document.getElementById('btnToggleToken')?.addEventListener('click', () => {
    if (el.cfgDiscordToken) {
      if (el.cfgDiscordToken.readOnly && el.cfgDiscordToken.value.includes('•')) {
        showToast('🔒 Official developer token is AES-256 encrypted and protected against extraction.');
        return;
      }
      el.cfgDiscordToken.type = el.cfgDiscordToken.type === 'password' ? 'text' : 'password';
    }
  });

  // Theme Accent Event Listeners (both titlebar mini buttons and settings swatches)
  document.querySelectorAll('.accent-swatch, .accent-mini-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const accent = btn.dataset.accent;
      if (accent) applyAccent(accent);
    });
  });

  // Statistics Refresh & About buttons
  document.getElementById('btnRefreshStats')?.addEventListener('click', async () => {
    showToast('Refreshing statistics…');
    await renderStatistics();
    showToast('Statistics updated! 📊');
  });

  document.getElementById('btnAboutAddDiscord')?.addEventListener('click', () => {
    switchScreen('add-discord');
  });

  document.getElementById('btnAboutOpenSettings')?.addEventListener('click', () => {
    switchScreen('settings');
  });
}

function updateBotStatusUI(status) {
  if (!el.botBadge) return;
  if (status.online) {
    el.botBadge.classList.add('online');
    el.botBadge.querySelector('.status-text').textContent = `DISCORD: ONLINE (${status.user?.tag || 'Connected'})`;
  } else if (status.starting) {
    el.botBadge.classList.remove('online');
    el.botBadge.querySelector('.status-text').textContent = 'DISCORD: CONNECTING…';
  } else {
    el.botBadge.classList.remove('online');
    el.botBadge.querySelector('.status-text').textContent = 'DISCORD: OFFLINE';
  }
}

function appendLog(log) {
  if (!el.logConsole) return;
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = `[${new Date().toLocaleTimeString()}] ${log.text}`;
  if (log.level === 'error') line.style.color = '#ef4444';
  if (log.level === 'warn') line.style.color = '#f59e0b';
  el.logConsole.appendChild(line);
  el.logConsole.scrollTop = el.logConsole.scrollHeight;
}

// ==================== MODALS & HELPERS ====================

function setupModals() {
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.close);
    });
  });

  // Modal Openers
  document.getElementById('btnPlaylistsCreate')?.addEventListener('click', () => {
    const nameInput = document.getElementById('modalPlaylistName');
    const descInput = document.getElementById('modalPlaylistDesc');
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    openModal('modalCreatePlaylist');
  });

  document.getElementById('btnPlaylistsImportSpotify')?.addEventListener('click', () => {
    const urlInput = document.getElementById('modalSpotifyUrl');
    if (urlInput) urlInput.value = '';
    openModal('modalSpotifyImport');
  });

  document.getElementById('btnLibAddSong')?.addEventListener('click', () => {
    const qInput = document.getElementById('modalAddLibQuery');
    if (qInput) qInput.value = '';
    openModal('modalAddLibSong');
  });

  // Submit: Create Playlist
  document.getElementById('btnModalSubmitPlaylist')?.addEventListener('click', async () => {
    const name = document.getElementById('modalPlaylistName').value.trim();
    const desc = document.getElementById('modalPlaylistDesc').value.trim();
    if (!name) {
      showToast('Please enter a playlist name.');
      return;
    }
    await window.scifyApi?.storeAction('createPlaylist', name, desc);
    await refreshPlaylists();
    closeModal('modalCreatePlaylist');
    showToast(`Created playlist "${name}"! 🎵`);
  });

  // Submit: Spotify Import
  document.getElementById('btnModalSubmitSpotify')?.addEventListener('click', async () => {
    const url = document.getElementById('modalSpotifyUrl').value.trim();
    if (!url) return;
    showToast('Fetching Spotify playlist tracks… ⏳');
    closeModal('modalSpotifyImport');
    try {
      const res = await window.scifyApi?.importSpotify(url);
      if (res && res.tracks && res.tracks.length > 0) {
        const plName = res.name || 'Spotify Import';
        const pl = await window.scifyApi?.storeAction('createPlaylist', plName, `Imported from Spotify (${res.tracks.length} tracks)`);
        if (pl?.id) {
          const tracksToAdd = res.tracks.map((t) => ({
            url: t.searchQuery ? `ytsearch1:${t.searchQuery}` : `ytsearch1:${t.title} ${t.artist}`,
            title: t.title,
            artist: t.artist,
            durationInSec: t.durationInSec || 0,
          }));
          await window.scifyApi?.storeAction('addTracksToPlaylist', pl.id, tracksToAdd);
          await refreshPlaylists();
          showToast(`Successfully imported ${res.tracks.length} tracks into "${plName}"! 🎉`);
        }
      } else {
        showToast(`Spotify import failed: ${res?.error || 'No tracks found in playlist'}`);
      }
    } catch (err) {
      showToast(`Spotify import error: ${err.message}`);
    }
  });

  // Submit: Add Song to Library
  document.getElementById('btnModalSubmitAddLib')?.addEventListener('click', async () => {
    const query = document.getElementById('modalAddLibQuery').value.trim();
    if (!query) return;
    closeModal('modalAddLibSong');
    showToast('Searching track for library…');
    try {
      const results = await window.scifyApi?.searchTracks(query);
      if (results && results.length > 0) {
        const track = results[0];
        await window.scifyApi?.storeAction('addToDesktopLibrary', [track]);
        await refreshLibrary();
        showToast(`Added "${track.title}" to Library! 📚`);
      } else {
        showToast('No tracks found for that search query.');
      }
    } catch (err) {
      showToast(`Failed to add song: ${err.message}`);
    }
  });
}

function setupCollectionActions() {
  // Library: Play All
  document.getElementById('btnLibPlayAll')?.addEventListener('click', async () => {
    if (!state.library || state.library.length === 0) {
      showToast('Library is empty!');
      return;
    }
    if (state.outputTarget === 'discord') {
      showToast(`Playing ${state.library.length} library songs on Discord VC…`);
      for (let i = 0; i < state.library.length; i++) {
        await sendDiscordAction('play', { query: state.library[i].url, requester: 'Library', playNow: i === 0 });
      }
    } else {
      state.localQueue = [...state.library.slice(1)];
      renderQueue();
      playTrack(state.library[0]);
    }
    showToast(`Playing ${state.library.length} songs from Library! 🎶`);
  });

  // Library: Live filter and sorting
  document.getElementById('libSearchFilter')?.addEventListener('input', () => {
    renderLibrary();
  });

  document.getElementById('libSortSelect')?.addEventListener('change', () => {
    renderLibrary();
  });

  // Favorites: Play All
  document.getElementById('btnFavoritesPlayAll')?.addEventListener('click', async () => {
    if (!state.favorites || state.favorites.length === 0) {
      showToast('No favorites yet! Click heart on any track.');
      return;
    }
    if (state.outputTarget === 'discord') {
      showToast(`Playing ${state.favorites.length} favorites on Discord VC…`);
      for (let i = 0; i < state.favorites.length; i++) {
        await sendDiscordAction('play', { query: state.favorites[i].url, requester: 'Favorites', playNow: i === 0 });
      }
    } else {
      state.localQueue = [...state.favorites.slice(1)];
      renderQueue();
      playTrack(state.favorites[0]);
    }
    showToast(`Playing ${state.favorites.length} favorite songs! ⭐`);
  });

  // History: Play All & Clear
  document.getElementById('btnHistoryPlayAll')?.addEventListener('click', async () => {
    if (!state.localHistory || state.localHistory.length === 0) {
      showToast('Playback history is empty.');
      return;
    }
    if (state.outputTarget === 'discord') {
      showToast(`Playing ${state.localHistory.length} recent songs on Discord VC…`);
      for (let i = 0; i < state.localHistory.length; i++) {
        await sendDiscordAction('play', { query: state.localHistory[i].url, requester: 'History', playNow: i === 0 });
      }
    } else {
      state.localQueue = [...state.localHistory.slice(1)];
      renderQueue();
      playTrack(state.localHistory[0]);
    }
    showToast(`Playing ${state.localHistory.length} history tracks! 🕒`);
  });

  document.getElementById('btnHistoryClear')?.addEventListener('click', async () => {
    await window.scifyApi?.storeAction('clearHistory', 'desktop');
    state.localHistory = [];
    renderHistory();
    showToast('Playback history cleared! 🗑️');
  });
}

async function refreshDiscordSimulator() {
  const status = await window.scifyApi?.getBotStatus();
  const serverSelect = document.getElementById('panelServerSelect');
  const channelSelect = document.getElementById('panelChannelSelect');

  if (!serverSelect || !channelSelect) return;

  serverSelect.innerHTML = '';
  channelSelect.innerHTML = '';

  if (!status || !status.guilds || status.guilds.length === 0) {
    serverSelect.innerHTML = '<option value="">No Servers Connected</option>';
    channelSelect.innerHTML = '<option value="">No Channels</option>';
    return;
  }

  status.guilds.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    serverSelect.appendChild(opt);
  });

  const updateChannelsForGuild = (guildId) => {
    channelSelect.innerHTML = '';
    const guild = status.guilds.find((g) => g.id === guildId);
    if (!guild || !guild.textChannels || guild.textChannels.length === 0) {
      channelSelect.innerHTML = '<option value="">No text channels found</option>';
      return;
    }
    guild.textChannels.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `# ${c.name}`;
      channelSelect.appendChild(opt);
    });
  };

  serverSelect.onchange = () => {
    updateChannelsForGuild(serverSelect.value);
  };

  updateChannelsForGuild(status.guilds[0].id);
}

function setupSimulatorControls() {
  // Broadcast Control Panel to Discord Text Channel
  document.getElementById('btnBroadcastPanelToDiscord')?.addEventListener('click', async () => {
    const serverSelect = document.getElementById('panelServerSelect');
    const channelSelect = document.getElementById('panelChannelSelect');
    const guildId = serverSelect?.value;
    const textChannelId = channelSelect?.value;

    if (!guildId || !textChannelId) {
      showToast('Please select a Discord server and text channel.');
      return;
    }

    showToast('Broadcasting interactive control panel to Discord…');
    try {
      const res = await window.scifyApi?.discordAction('sendPanel', { guildId, textChannelId });
      if (res?.success === false) {
        showToast(`Error: ${res.error}`);
      } else {
        showToast('Control panel broadcast to channel! 🚀');
      }
    } catch (err) {
      showToast(`Failed: ${err.message}`);
    }
  });

  // Simulated button clicks send real actions to Discord Bot session
  document.querySelectorAll('.sim-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.textContent.trim();
      if (text.includes('Play') || text.includes('Pause')) {
        await sendDiscordAction('playpause');
      } else if (text.includes('Skip')) {
        await sendDiscordAction('skip');
      } else if (text.includes('Prev')) {
        await sendDiscordAction('previous');
      } else if (text.includes('Stop')) {
        await sendDiscordAction('stop');
      } else if (text.includes('Shuffle')) {
        await sendDiscordAction('shuffle');
      } else if (text.includes('Loop')) {
        await sendDiscordAction('loop');
      } else if (text.includes('-15')) {
        const active = state.discordStatus?.activeSessions?.find((s) => s.guildId === state.selectedGuildId) || state.discordStatus?.activeSessions?.[0];
        const cur = active?.position || 0;
        await sendDiscordAction('seek', { seconds: Math.max(0, cur - 15) });
      } else if (text.includes('+15')) {
        const active = state.discordStatus?.activeSessions?.find((s) => s.guildId === state.selectedGuildId) || state.discordStatus?.activeSessions?.[0];
        const cur = active?.position || 0;
        await sendDiscordAction('seek', { seconds: cur + 15 });
      } else if (text.includes('Refresh')) {
        const status = await window.scifyApi?.getBotStatus();
        syncDiscordPlaybackUI(status);
        showToast('Refreshed Discord playback status 🔄');
      }
    });
  });
}

// ==================== USER IDENTIFICATION & VC TELEPORT ====================

function setupUserVcTeleport() {
  if (state.savedDiscordUser) {
    if (el.userVcName) el.userVcName.textContent = state.savedDiscordUser;
    if (el.userVcChannelTag) el.userVcChannelTag.textContent = 'Auto-Follow VC';
  }

  // Click badge in titlebar
  el.btnUserVcBadge?.addEventListener('click', () => {
    openUserVcModal();
  });

  // Quick action pill on home screen
  document.querySelector('[data-quick="teleport-user-vc"]')?.addEventListener('click', () => {
    if (state.savedDiscordUser) {
      teleportToUserVoice(state.savedDiscordUser);
    } else {
      openUserVcModal();
    }
  });

  // Modal: Teleport Bot button
  el.btnModalTeleportVc?.addEventListener('click', async () => {
    let username = el.modalInputDiscordUser?.value.trim();
    if (!username) {
      username = state.savedDiscordUser;
    }
    await teleportToUserVoice(username);
  });

  // Modal: Enter key on input
  el.modalInputDiscordUser?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      el.btnModalTeleportVc?.click();
    }
  });

  // Modal: Save Username Only
  el.btnModalSaveUserOnly?.addEventListener('click', async () => {
    const username = el.modalInputDiscordUser?.value.trim();
    if (!username) {
      showModalTeleportStatus('Please enter a username to save.', 'warn');
      return;
    }
    state.savedDiscordUser = username;
    localStorage.setItem('scify_discord_username', username);
    if (el.userVcName) el.userVcName.textContent = username;
    showToast(`Saved Discord commander: ${username} 👤`);
    closeModal('modalSetUser');
  });
}

function openUserVcModal() {
  if (el.modalInputDiscordUser) {
    el.modalInputDiscordUser.value = state.savedDiscordUser || '';
  }
  if (el.modalTeleportStatus) {
    el.modalTeleportStatus.style.display = 'none';
  }
  renderActiveVoiceUsersInModal();
  openModal('modalSetUser');
  setTimeout(() => el.modalInputDiscordUser?.focus(), 150);
}

function renderActiveVoiceUsersInModal() {
  if (!el.modalActiveVoiceUsersList) return;
  const users = state.discordStatus?.activeVoiceUsers || [];
  if (users.length === 0) {
    el.modalActiveVoiceUsersList.innerHTML = `
      <div style="font-size: 0.78rem; color: #94a3b8; padding: 6px 0;">
        No active voice users detected on connected servers. Join any voice channel in Discord, then click Teleport!
      </div>
    `;
    return;
  }

  el.modalActiveVoiceUsersList.innerHTML = '';
  users.forEach((u) => {
    const chip = document.createElement('div');
    chip.className = 'voice-user-chip';
    chip.innerHTML = `
      ${u.avatar ? `<img src="${escapeHtml(u.avatar)}" alt="">` : '👤'}
      <span><strong>${escapeHtml(u.displayName || u.username)}</strong> <span style="opacity:0.75; font-size:0.72rem;">in ${escapeHtml(u.guildName)} #${escapeHtml(u.voiceChannelName)}</span></span>
    `;
    chip.addEventListener('click', () => {
      if (el.modalInputDiscordUser) {
        el.modalInputDiscordUser.value = u.username;
      }
      teleportToUserVoice(u.username);
    });
    el.modalActiveVoiceUsersList.appendChild(chip);
  });
}

function showModalTeleportStatus(text, type = 'info') {
  if (!el.modalTeleportStatus) return;
  el.modalTeleportStatus.style.display = 'block';
  el.modalTeleportStatus.textContent = text;
  if (type === 'error') {
    el.modalTeleportStatus.style.background = 'rgba(239, 68, 68, 0.15)';
    el.modalTeleportStatus.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    el.modalTeleportStatus.style.color = '#fca5a5';
  } else if (type === 'success') {
    el.modalTeleportStatus.style.background = 'rgba(16, 185, 129, 0.15)';
    el.modalTeleportStatus.style.border = '1px solid rgba(16, 185, 129, 0.4)';
    el.modalTeleportStatus.style.color = '#6ee7b7';
  } else if (type === 'warn') {
    el.modalTeleportStatus.style.background = 'rgba(245, 158, 11, 0.15)';
    el.modalTeleportStatus.style.border = '1px solid rgba(245, 158, 11, 0.4)';
    el.modalTeleportStatus.style.color = '#fcd34d';
  } else {
    el.modalTeleportStatus.style.background = 'rgba(0, 240, 255, 0.12)';
    el.modalTeleportStatus.style.border = '1px solid rgba(0, 240, 255, 0.4)';
    el.modalTeleportStatus.style.color = '#7dd3fc';
  }
}

async function teleportToUserVoice(username) {
  const queryName = username || state.savedDiscordUser || '';
  showModalTeleportStatus(`Searching connected servers for active voice channel… ⏳`, 'info');
  showToast(`Locating active voice channel across Discord servers… 📡`);

  try {
    const res = await window.scifyApi?.discordAction('followUser', { username: queryName });
    if (!res || res.error || !res.success) {
      const errMsg = res?.error || `Could not find any active voice channel.`;
      showModalTeleportStatus(`⚠️ ${errMsg}\nTip: Join a voice channel in your Discord server first!`, 'error');
      showToast(`⚠️ ${errMsg}`);
      return;
    }

    // Success!
    const savedName = res.user?.username || res.user?.displayName || queryName;
    if (savedName) {
      state.savedDiscordUser = savedName;
      localStorage.setItem('scify_discord_username', savedName);
    }
    state.selectedGuildId = res.guildId;
    state.userVoiceLocation = res;
    setOutputTarget('discord');

    // Update titlebar badge
    if (el.userVcName) el.userVcName.textContent = res.user?.displayName || res.user?.username || 'Commander';
    if (el.userVcChannelTag) el.userVcChannelTag.textContent = `${res.guildName} #${res.voiceChannelName}`;
    if (el.userVcAvatar && res.user?.avatar) {
      el.userVcAvatar.src = res.user.avatar;
      el.userVcAvatar.style.display = 'inline-block';
      if (el.userVcAvatarPlaceholder) el.userVcAvatarPlaceholder.style.display = 'none';
    }
    el.btnUserVcBadge?.classList.add('in-vc');

    showModalTeleportStatus(`✅ Teleported bot to ${res.guildName} (#${res.voiceChannelName}) with ${res.user?.displayName || username}!`, 'success');
    showToast(`🚀 Teleported bot to ${res.guildName} (#${res.voiceChannelName})!`);

    setTimeout(() => {
      closeModal('modalSetUser');
      switchScreen('player');
    }, 700);

    // Refresh servers list
    await refreshDiscordServers();
  } catch (err) {
    showModalTeleportStatus(`⚠️ Teleport error: ${err.message}`, 'error');
    showToast(`⚠️ Teleport error: ${err.message}`);
  }
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}

function showToast(text) {
  if (!el.toastContainer) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  el.toastContainer.appendChild(t);
  setTimeout(() => {
    t.remove();
  }, 3200);
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
