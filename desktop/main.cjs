const { app, BrowserWindow, ipcMain, shell, Tray, Menu, Notification, globalShortcut } = require('electron');
const path = require('node:path');
const { fork } = require('node:child_process');
const { existsSync } = require('node:fs');

const ROOT_DIR = path.resolve(__dirname, '..');

// Look for .env across multiple potential locations (source, packaged, userData)
const candidateEnvPaths = [
  path.join(ROOT_DIR, '.env'),
  path.join(process.cwd(), '.env'),
  path.join(path.dirname(process.execPath), '.env'),
  process.resourcesPath ? path.join(process.resourcesPath, '.env') : null,
  process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', '.env') : null,
].filter(Boolean);

for (const p of candidateEnvPaths) {
  if (existsSync(p)) {
    try {
      require('dotenv').config({ path: p });
      break;
    } catch {}
  }
}

// Ensure secure vault token fallback
async function ensureCredentials() {
  if (!process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN === 'your-bot-token-here' || process.env.DISCORD_TOKEN.length < 20) {
    try {
      const { getDefaultToken, getDefaultClientId } = await import('../src/vault.js');
      process.env.DISCORD_TOKEN = getDefaultToken();
      if (!process.env.DISCORD_CLIENT_ID) {
        process.env.DISCORD_CLIENT_ID = getDefaultClientId();
      }
    } catch {}
  }
}
ensureCredentials();

// Set app name
app.name = 'Sruti';

let mainWindow = null;
let tray = null;
let botProcess = null;
let botStatus = {
  online: false,
  starting: false,
  ping: 0,
  user: null,
  guilds: [],
  activeSessions: [],
};

// Helper to send events to renderer
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'Sruti',
      body: body || '',
      silent: true,
    }).show();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 700,
    frame: false, // Custom sleek glassmorphic titlebar
    backgroundColor: '#0a0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    // If user chose minimize to tray in settings
    if (!app.isQuitting) {
      // e.preventDefault();
      // mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Simple tray setup
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    if (existsSync(iconPath)) {
      tray = new Tray(iconPath);
    } else {
      // Fallback without tray if icon not present yet
      return;
    }

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Sruti', enabled: false },
      { type: 'separator' },
      { label: 'Open Sruti', click: () => { if (mainWindow) mainWindow.show(); } },
      { label: 'Play / Pause', click: () => { sendToRenderer('scify:shortcut', 'playpause'); } },
      { label: 'Next Track', click: () => { sendToRenderer('scify:shortcut', 'next'); } },
      { label: 'Previous Track', click: () => { sendToRenderer('scify:shortcut', 'prev'); } },
      { type: 'separator' },
      { label: 'Add to Discord', click: async () => {
        try {
          const { scifyCore } = await import('../src/scifyCore.js');
          const invite = scifyCore.generateInviteUrl();
          if (invite?.url) shell.openExternal(invite.url);
        } catch (err) {
          shell.openExternal('https://discord.com/oauth2/authorize?client_id=1515023402350547015&scope=bot+applications.commands&permissions=36727808&integration_type=0');
        }
      }},
      { type: 'separator' },
      { label: 'Quit', click: () => {
        app.isQuitting = true;
        app.quit();
      }},
    ]);

    tray.setToolTip('Sruti — Desktop & Discord');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.show();
      }
    });
  } catch (err) {
    console.warn('Tray init skipped:', err.message);
  }
}

// ==================== BOT PROCESS MANAGER ====================

let botStarted = false;

async function startBotProcess() {
  if (botStatus.online) {
    return { success: true, message: 'Bot process is already running.' };
  }

  sendToRenderer('scify:log', { level: 'info', text: 'Starting Discord bot engine…' });
  botStatus.starting = true;
  sendToRenderer('scify:status', botStatus);

  try {
    const { scifyCore } = await import('../src/scifyCore.js');

    // Wire up events from scifyCore to renderer
    scifyCore.on('botStatusChange', (data) => {
      botStatus.online = data.online;
      botStatus.starting = false;
      sendToRenderer('scify:status', {
        ...botStatus,
        ...scifyCore.getDiscordStatus(),
      });
    });

    scifyCore.on('stateUpdate', (status) => {
      sendToRenderer('scify:stateUpdate', status);
      sendToRenderer('scify:status', {
        ...botStatus,
        ...status,
      });
    });

    scifyCore.on('guildJoined', (guild) => {
      sendToRenderer('scify:guildJoined', guild);
    });

    if (!botStarted) {
      await import('../src/index.js');
      botStarted = true;
    } else if (scifyCore.client && !scifyCore.client.isReady()) {
      await scifyCore.client.login(process.env.DISCORD_TOKEN);
    }

    botStatus.online = true;
    botStatus.starting = false;
    sendToRenderer('scify:status', {
      ...botStatus,
      ...scifyCore.getDiscordStatus(),
    });
    sendToRenderer('scify:log', { level: 'info', text: 'Discord bot connected successfully!' });

    return { success: true };
  } catch (err) {
    console.error('Failed to start bot in main process:', err);
    botStatus.online = false;
    botStatus.starting = false;
    sendToRenderer('scify:status', botStatus);
    sendToRenderer('scify:log', { level: 'error', text: `Bot startup error: ${err.message}` });
    return { success: false, error: err.message };
  }
}

async function stopBotProcess() {
  const { scifyCore } = await import('../src/scifyCore.js');
  sendToRenderer('scify:log', { level: 'info', text: 'Disconnecting Discord bot…' });
  try {
    if (scifyCore.client) {
      scifyCore.client.destroy();
    }
  } catch {}
  botStatus.online = false;
  botStatus.starting = false;
  sendToRenderer('scify:status', botStatus);
  return { success: true };
}

async function restartBotProcess() {
  await stopBotProcess();
  setTimeout(async () => {
    await startBotProcess();
  }, 1000);
  return { success: true };
}

// ==================== APP LIFECYCLE ====================

app.whenReady().then(async () => {
  createWindow();
  createTray();

  // Register Global Media Key Shortcuts
  try {
    globalShortcut.register('MediaPlayPause', () => sendToRenderer('scify:shortcut', 'playpause'));
    globalShortcut.register('MediaNextTrack', () => sendToRenderer('scify:shortcut', 'next'));
    globalShortcut.register('MediaPreviousTrack', () => sendToRenderer('scify:shortcut', 'prev'));
  } catch (err) {
    console.warn('Media keys registration failed:', err.message);
  }

  // Auto-start Discord bot process on app readiness
  startBotProcess().catch((err) => {
    console.error('Initial bot start error:', err);
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopBotProcess();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==================== IPC HANDLERS ====================

// Window controls
ipcMain.handle('window-control', (event, action) => {
  if (!mainWindow) return;
  switch (action) {
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'maximize':
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
      break;
    case 'close':
      mainWindow.close();
      break;
  }
});

// Open external browser
ipcMain.handle('open-external', async (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return { success: true };
  }
  return { success: false, error: 'Invalid URL' };
});

// Discord Invite generation
ipcMain.handle('get-discord-invite', async () => {
  const { scifyCore } = await import('../src/scifyCore.js');
  return scifyCore.generateInviteUrl();
});

// Bot controls
ipcMain.handle('bot-start', () => startBotProcess());
ipcMain.handle('bot-stop', () => stopBotProcess());
ipcMain.handle('bot-restart', () => restartBotProcess());
ipcMain.handle('get-bot-status', async () => {
  const { scifyCore } = await import('../src/scifyCore.js');
  const dStatus = scifyCore.getDiscordStatus();
  return {
    ...botStatus,
    ...dStatus,
    online: dStatus.online || botStatus.online,
  };
});

// Search tracks
ipcMain.handle('search-tracks', async (event, query) => {
  const { scifyCore } = await import('../src/scifyCore.js');
  return await scifyCore.searchTracks(query);
});

// Direct stream URL for local HTML5 player
ipcMain.handle('get-stream-url', async (event, url) => {
  const { scifyCore } = await import('../src/scifyCore.js');
  return await scifyCore.getDirectStreamUrl(url);
});

// Discord VC control action
ipcMain.handle('discord-action', async (event, action, params) => {
  const { scifyCore } = await import('../src/scifyCore.js');
  try {
    return await scifyCore.controlDiscord(action, params);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Storage operations
ipcMain.handle('store-action', async (event, method, ...args) => {
  const { store } = await import('../src/store.js');
  if (typeof store[method] === 'function') {
    return store[method](...args);
  }
  throw new Error(`Unknown store method: ${method}`);
});

// Env config
ipcMain.handle('get-env-config', async () => {
  const { scifyCore } = await import('../src/scifyCore.js');
  return scifyCore.getEnvConfig();
});

ipcMain.handle('save-env-config', async (event, newConfig) => {
  const { scifyCore } = await import('../src/scifyCore.js');
  const res = scifyCore.saveEnvConfig(newConfig);
  if (res.success && botProcess) {
    restartBotProcess();
  }
  return res;
});

// Desktop notification
ipcMain.handle('notify', (event, title, body) => {
  showNotification(title, body);
});

// Import Spotify playlist
ipcMain.handle('import-spotify', async (event, url) => {
  const { fetchSpotifyPlaylist } = await import('../src/spotify.js');
  try {
    return await fetchSpotifyPlaylist(url);
  } catch (err) {
    return { error: err.message };
  }
});
