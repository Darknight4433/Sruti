const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scifyApi', {
  // Window control
  windowControl: (action) => ipcRenderer.invoke('window-control', action),

  // Browser links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Discord OAuth2 Installation Link
  getDiscordInvite: () => ipcRenderer.invoke('get-discord-invite'),

  // Bot Lifecycle
  startBot: () => ipcRenderer.invoke('bot-start'),
  stopBot: () => ipcRenderer.invoke('bot-stop'),
  restartBot: () => ipcRenderer.invoke('bot-restart'),
  getBotStatus: () => ipcRenderer.invoke('get-bot-status'),

  // Search & Stream
  searchTracks: (query) => ipcRenderer.invoke('search-tracks', query),
  getStreamUrl: (url) => ipcRenderer.invoke('get-stream-url', url),

  // Discord VC & Guild Control
  discordAction: (action, params) => ipcRenderer.invoke('discord-action', action, params),

  // Spotify Playlist Import
  importSpotify: (url) => ipcRenderer.invoke('import-spotify', url),

  // Storage operations
  storeAction: (method, ...args) => ipcRenderer.invoke('store-action', method, ...args),

  // Environment Configuration
  getEnvConfig: () => ipcRenderer.invoke('get-env-config'),
  saveEnvConfig: (config) => ipcRenderer.invoke('save-env-config', config),

  // Native notification
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),

  // Event Listeners
  onStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('scify:status', handler);
    return () => ipcRenderer.removeListener('scify:status', handler);
  },
  onLog: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('scify:log', handler);
    return () => ipcRenderer.removeListener('scify:log', handler);
  },
  onShortcut: (callback) => {
    const handler = (event, action) => callback(action);
    ipcRenderer.on('scify:shortcut', handler);
    return () => ipcRenderer.removeListener('scify:shortcut', handler);
  },
  onGuildJoined: (callback) => {
    const handler = (event, guild) => callback(guild);
    ipcRenderer.on('scify:guildJoined', handler);
    return () => ipcRenderer.removeListener('scify:guildJoined', handler);
  },
  onStateUpdate: (callback) => {
    const handler = (event, state) => callback(state);
    ipcRenderer.on('scify:stateUpdate', handler);
    return () => ipcRenderer.removeListener('scify:stateUpdate', handler);
  },
});
