import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActivityType,
} from 'discord.js';
import { MusicManager, resolveTracks } from './musicManager.js';
import { fetchSpotifyPlaylist } from './spotify.js';
import { buildPanelEmbed, buildPanelComponents, buildQueueView, buildLibraryView, buildUserLibraryView, buildSpotifyImportView, buildStatusEmbed, formatTime } from './ui.js';
import { store } from './store.js';
import { scifyCore } from './scifyCore.js';
import { getDefaultToken } from './vault.js';

const TOKEN = (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'your-bot-token-here' && process.env.DISCORD_TOKEN.length > 20)
  ? process.env.DISCORD_TOKEN
  : getDefaultToken();

const ACCESS_ROLE_ID = process.env.ACCESS_ROLE_ID;
const PRIORITY_ROLE_ID = process.env.PRIORITY_ROLE_ID;

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN.');
  if (!process.versions.electron) {
    process.exit(1);
  }
}
if (!ACCESS_ROLE_ID) console.warn('ACCESS_ROLE_ID is not set — everyone will be allowed to use the bot.');
if (!PRIORITY_ROLE_ID) console.warn('PRIORITY_ROLE_ID is not set — the priority lock is disabled.');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

const music = new MusicManager();
music.client = client;
scifyCore.attachDiscord({ client, music });

// ---------- Permission helpers ----------

function hasAccess(member) {
  // Server owner always has access.
  if (member.id === member.guild.ownerId) return true;
  if (!ACCESS_ROLE_ID) return true;
  return member.roles.cache.has(ACCESS_ROLE_ID);
}

function isPriority(member) {
  if (!PRIORITY_ROLE_ID) return false;
  return member.roles.cache.has(PRIORITY_ROLE_ID);
}

/**
 * Decide whether `member` is allowed to control playback right now.
 * In Scify Music's shared session architecture, all server members share queue and controls.
 */
function canControl(state, member) {
  if (!hasAccess(member)) {
    return { allowed: false, reason: 'You do not have the role required to use this bot.' };
  }
  return { allowed: true };
}

// ---------- Slash command definitions ----------

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or queue multiple (comma-separated)')
    .addStringOption((o) =>
      o.setName('query').setDescription('Song name, URL, or multiple separated by commas').setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('See what\'s playing and what\'s coming up next')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('history')
    .setDescription('Recently played songs & resume where you stopped')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('controls')
    .setDescription('Open your personal music control panel')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('library')
    .setDescription('Your personal music library')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('View your library and play it'),
    )
    .addSubcommand((sub) =>
      sub.setName('add').setDescription('Add songs to your library (comma-separated)')
        .addStringOption((o) =>
          o.setName('songs').setDescription('Song name, URL, or multiple separated by commas').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Remove a song by its number')
        .addIntegerOption((o) =>
          o.setName('number').setDescription('Song number to remove').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('import').setDescription('Import a Spotify playlist')
        .addStringOption((o) =>
          o.setName('url').setDescription('Spotify playlist URL').setRequired(true),
        ),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('View Sruti system status, latency, uptime, and stats')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart the Sruti bot (Server Owner only)')
    .toJSON(),
];

async function registerCommands(guildId) {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
}

// ---------- Ready ----------

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  try {
    if (c.user.username !== 'Sruti') {
      await c.user.setUsername('Sruti').catch((err) => {
        console.log('Bot username could not be set via API:', err.message);
      });
    }
  } catch {}
  try {
    c.user.setActivity('Sruti | /play', { type: ActivityType.Listening });
  } catch {}
  // Register guild commands and ensure bot server nickname is Sruti
  for (const [, guild] of c.guilds.cache) {
    try {
      const me = await guild.members.fetchMe().catch(() => null);
      if (me && me.nickname !== 'Sruti') {
        await me.setNickname('Sruti').catch(() => {});
      }
    } catch {}
    try {
      await registerCommands(guild.id);
      console.log(`Registered commands in ${guild.name}`);
    } catch (err) {
      console.error(`Failed to register commands in ${guild.id}:`, err.message);
    }
  }
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    const me = await guild.members.fetchMe().catch(() => null);
    if (me && me.nickname !== 'Sruti') {
      await me.setNickname('Sruti').catch(() => {});
    }
  } catch {}
  try {
    await registerCommands(guild.id);
  } catch (err) {
    console.error('Failed to register commands on join:', err.message);
  }
});

// Auto-leave voice channel when everyone leaves
const emptyChannelTimeouts = new Map();

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const state = music.peek(guild.id);
  if (!state || !state.voiceChannelId) return;

  // If the bot itself was disconnected from voice
  if (oldState.member?.id === client.user.id && !newState.channelId) {
    if (emptyChannelTimeouts.has(guild.id)) {
      clearTimeout(emptyChannelTimeouts.get(guild.id));
      emptyChannelTimeouts.delete(guild.id);
    }
    music.remove(guild.id);
    scifyCore.broadcastState();
    return;
  }

  // Check the voice channel Sruti is currently in
  const botVoiceChannel = guild.channels.cache.get(state.voiceChannelId);
  if (!botVoiceChannel || !botVoiceChannel.isVoiceBased()) return;

  const humanMembers = botVoiceChannel.members.filter((m) => !m.user.bot);

  if (humanMembers.size === 0) {
    // Nobody in the voice channel — start a 15-second grace countdown
    if (!emptyChannelTimeouts.has(guild.id)) {
      const timeout = setTimeout(() => {
        emptyChannelTimeouts.delete(guild.id);
        const currentChannel = guild.channels.cache.get(state.voiceChannelId);
        const currentHumans = currentChannel?.members?.filter((m) => !m.user.bot);
        if (!currentHumans || currentHumans.size === 0) {
          if (typeof botVoiceChannel.send === 'function') {
            botVoiceChannel.send('👋 Leaving voice channel because everyone left.').catch(() => {});
          } else if (state.textChannel && typeof state.textChannel.send === 'function') {
            state.textChannel.send('👋 Leaving voice channel because everyone left.').catch(() => {});
          }
          music.remove(guild.id);
          scifyCore.broadcastState();
        }
      }, 15000);
      emptyChannelTimeouts.set(guild.id, timeout);
    }
  } else {
    // Users are present in the VC — cancel any pending leave timer
    if (emptyChannelTimeouts.has(guild.id)) {
      clearTimeout(emptyChannelTimeouts.get(guild.id));
      emptyChannelTimeouts.delete(guild.id);
    }
  }
});

// ---------- Panel rendering for a specific viewer ----------

function renderPanelFor(state, viewer) {
  const isController = hasAccess(viewer);

  return {
    embeds: [buildPanelEmbed(state, { locked: false })],
    components: buildPanelComponents({
      paused: state ? state.isPaused() : false,
      disabled: !isController || !state?.current,
      loopMode: state?.loopMode ?? 'off',
    }),
  };
}

// ---------- Queue list view for a specific viewer ----------

function renderQueueFor(state, viewer) {
  const isController = hasAccess(viewer);
  return buildQueueView(state, { disabled: !isController });
}

// ---------- Interaction handling ----------

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      // Immediate deferral: guarantees Discord's 3-second deadline is NEVER breached
      const isPublic = interaction.commandName === 'play' || interaction.commandName === 'queue';
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral }).catch(() => {});
      }
      await handleSlash(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const payload = { content: `⚠️ ${err.message}` };
    if (interaction.deferred || interaction.replied) {
      interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => {}));
    } else {
      interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

async function handleSlash(interaction) {
  const member = interaction.member;

  if (!hasAccess(member)) {
    return interaction.editReply({
      content: 'You do not have the role required to use this bot.',
    });
  }

  if (interaction.commandName === 'status') {
    return interaction.editReply({
      embeds: [buildStatusEmbed({ client, music, uptime: process.uptime() })],
    });
  }

  if (interaction.commandName === 'restart') {
    if (member.id !== interaction.guild.ownerId) {
      return interaction.editReply({
        content: '⚠️ Only the server owner can trigger a bot restart.',
      });
    }
    await interaction.editReply({
      content: '🔄 Persisting sessions and restarting Scify Music Bot…',
    });
    for (const [, s] of music.states ?? []) {
      try { s.persistSession(); } catch {}
    }
    setTimeout(() => {
      process.exit(0);
    }, 1000);
    return;
  }

  if (interaction.commandName === 'history') {
    const session = store.getSession(interaction.guild.id);
    const history = store.getHistory(interaction.guild.id);
    return interaction.editReply({
      ...buildLibraryView(session, history),
    });
  }

  if (interaction.commandName === 'library') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const userLib = store.getUserLibrary(interaction.guild.id, member.id);
      return interaction.editReply({
        ...buildUserLibraryView(userLib, member.user.username),
      });
    }

    if (sub === 'add') {
      const songs = interaction.options.getString('songs', true);
      if (songs.length > 500) {
        return interaction.editReply({
          content: 'Query is too long. Keep it under 500 characters.',
        });
      }

      try {
        const { tracks, label } = await resolveTracks(songs, member.displayName || member.user.username);
        store.addToUserLibrary(interaction.guild.id, member.id, tracks);
        await interaction.editReply({
          content: `✅ Added to your library: **${label}**\nYou now have **${store.getUserLibrary(interaction.guild.id, member.id).length}** song(s) in your library.`,
        });
      } catch (err) {
        await interaction.editReply({ content: `⚠️ ${err.message}` });
      }
      return;
    }

    if (sub === 'remove') {
      const num = interaction.options.getInteger('number', true);
      const removed = store.removeFromUserLibrary(interaction.guild.id, member.id, num - 1);
      if (!removed) {
        return interaction.editReply({
          content: `Invalid number. Use \`/library view\` to see your library.`,
        });
      }
      return interaction.editReply({
        content: `🗑️ Removed **${removed.title}** from your library.`,
      });
    }

    if (sub === 'import') {
      const url = interaction.options.getString('url', true);

      if (!url.includes('spotify.com/playlist') && !url.includes('spotify:playlist:')) {
        return interaction.editReply({
          content: 'That doesn\'t look like a Spotify playlist URL. Use a link like `https://open.spotify.com/playlist/...`',
        });
      }

      try {
        const { name, tracks } = await fetchSpotifyPlaylist(url);
        store.saveSpotifyImport(interaction.guild.id, member.id, { name, tracks });
        await interaction.editReply({
          ...buildSpotifyImportView(name, tracks),
        });
      } catch (err) {
        await interaction.editReply({ content: `⚠️ ${err.message}` });
      }
      return;
    }
  }

  if (interaction.commandName === 'controls') {
    const state = music.peek(interaction.guild.id);
    return interaction.editReply({
      ...renderPanelFor(state, member),
    });
  }

  if (interaction.commandName === 'queue') {
    const state = music.peek(interaction.guild.id);
    return interaction.editReply({
      ...renderQueueFor(state, member),
    });
  }

  if (interaction.commandName === 'play') {
    const query = interaction.options.getString('query', true);

    // Validate the query: reject excessively long input.
    if (query.length > 500) {
      return interaction.editReply({
        content: 'Query is too long. Keep it under 500 characters.',
      });
    }

    const state = music.get(interaction.guild.id);
    const voiceChannel = member.voice?.channel;

    if (!state.isConnected() && !voiceChannel) {
      return interaction.editReply({
        content: '⚠️ You need to join a voice channel first so Sruti knows where to connect!',
      });
    }

    state.textChannel = interaction.channel;
    state.starterUser = member.user;

    if (voiceChannel && (!state.isConnected() || state.voiceChannelId !== voiceChannel.id)) {
      state.connect(voiceChannel);
    }

    const requesterTag = member.displayName || member.user.username;

    try {
      const { tracks, label } = await resolveTracks(query, requesterTag);
      state.enqueue(tracks);

      await state.start();

      await interaction.editReply({
        content: `✅ Queued: **${label}** • *Added by <@${member.id}>*`,
        ...renderPanelFor(state, member),
      });
    } catch (err) {
      console.error('/play execution error:', err);
      await interaction.editReply({
        content: `⚠️ Failed to play: ${err.message}`,
      });
    }
    return;
  }
}

async function handleButton(interaction) {
  if (!interaction.customId.startsWith('mc:')) return;

  const member = interaction.member;
  const state = music.peek(interaction.guild.id);

  const action = interaction.customId.slice(3);

  // Read-only views are allowed for anyone with access (even if locked out).
  if (action === 'refresh' || action === 'panel') {
    if (!hasAccess(member)) {
      return interaction.reply({ content: 'No access.', flags: MessageFlags.Ephemeral });
    }
    return interaction.update(renderPanelFor(state, member));
  }
  if (action === 'list') {
    if (!hasAccess(member)) {
      return interaction.reply({ content: 'No access.', flags: MessageFlags.Ephemeral });
    }
    return interaction.update(renderQueueFor(state, member));
  }
  if (action === 'addlib') {
    if (!hasAccess(member)) {
      return interaction.reply({ content: 'No access.', flags: MessageFlags.Ephemeral });
    }
    if (!state?.currentTrack) {
      return interaction.reply({ content: '⚠️ No song is currently playing.', flags: MessageFlags.Ephemeral });
    }
    store.addToUserLibrary(interaction.guild.id, member.id, [state.currentTrack]);
    return interaction.reply({
      content: `📚 Added **${state.currentTrack.title}** to your library! Use \`/library view\` to play or manage your saved songs.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // --- Approve/Deny permission requests ---
  if (action.startsWith('approve:') || action.startsWith('deny:')) {
    const parts = action.split(':');
    const decision = parts[0]; // 'approve' or 'deny'
    const requestedAction = parts[1]; // 'skip' or 'stop'
    const requesterId = parts[2];

    // Only the controller can approve/deny.
    if (!state?.starterUser || state.starterUser.id !== member.id) {
      return interaction.reply({ content: 'Only the current controller can decide.', flags: MessageFlags.Ephemeral });
    }

    if (decision === 'approve') {
      if (requestedAction === 'skip') state.skip();
      else if (requestedAction === 'stop') state.stop();
      await interaction.update({
        content: `✅ **${member.user.username}** approved the **${requestedAction}** request from <@${requesterId}>.`,
        components: [],
      });
    } else {
      await interaction.update({
        content: `❌ **${member.user.username}** denied the **${requestedAction}** request from <@${requesterId}>.`,
        components: [],
      });
    }
    return;
  }

  // --- Spotify import actions (no playback control needed) ---
  if (action === 'spotifyconfirm' || action === 'spotifycancel') {
    if (action === 'spotifycancel') {
      store.clearSpotifyImport(interaction.guild.id, member.id);
      return interaction.update({ content: '❌ Import cancelled.', embeds: [], components: [] });
    }

    // Confirm: resolve each Spotify track to YouTube and add to user library.
    const importData = store.getSpotifyImport(interaction.guild.id, member.id);
    if (!importData || !importData.tracks.length) {
      return interaction.update({ content: '⚠️ No import data found. Try `/libimport` again.', embeds: [], components: [] });
    }

    await interaction.update({
      content: `⏳ Importing **${importData.tracks.length}** tracks from **${importData.name}**… This may take a moment.`,
      embeds: [],
      components: [],
    });

    const resolved = [];
    const failed = [];

    for (const t of importData.tracks) {
      try {
        const { tracks } = await resolveTracks(t.searchQuery, member.user.username);
        if (tracks.length > 0) {
          resolved.push({
            url: tracks[0].url,
            title: t.title,
            durationInSec: t.durationInSec || tracks[0].durationInSec || 0,
          });
        } else {
          failed.push(t.title);
        }
      } catch {
        failed.push(t.title);
      }
    }

    if (resolved.length > 0) {
      store.addToUserLibrary(interaction.guild.id, member.id, resolved);
    }
    store.clearSpotifyImport(interaction.guild.id, member.id);

    let msg = `✅ Imported **${resolved.length}/${importData.tracks.length}** tracks into your library.`;
    if (failed.length > 0) {
      const showFailed = failed.slice(0, 5).map((f) => `• ${f}`).join('\n');
      msg += `\n\n❌ Couldn't find (${failed.length}):\n${showFailed}`;
      if (failed.length > 5) msg += `\n…and ${failed.length - 5} more`;
    }
    msg += `\n\nUse \`/lib\` to see your library.`;

    await interaction.editReply({ content: msg });
    return;
  }

  // Check role access
  const control = canControl(state, member);
  if (!control.allowed) {
    return interaction.reply({ content: control.reason, flags: MessageFlags.Ephemeral });
  }

  // Library actions (continue / replay) start playback, so they need a voice
  // channel but NOT an already-playing track. Handle them before that guard.
  if (action === 'continue' || action.startsWith('replay:') || action === 'playlib') {
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: 'Join a voice channel first.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const liveState = music.get(interaction.guild.id);
    liveState.textChannel = interaction.channel;
    liveState.starterUser = member.user;
    if (!liveState.isConnected() || liveState.voiceChannelId !== voiceChannel.id) {
      liveState.connect(voiceChannel);
    }
    if (isPriority(member) && !liveState.lockHolderId) {
      liveState.lockHolderId = member.id;
    }

    await interaction.deferUpdate();
    try {
      if (action === 'continue') {
        const session = store.getSession(interaction.guild.id);
        await liveState.resumeSession(session);
      } else if (action === 'playlib') {
        // Play the user's entire personal library as a playlist.
        const userLib = store.getUserLibrary(interaction.guild.id, member.id);
        if (!userLib.length) throw new Error('Your library is empty. Add songs with `/library add`.');
        await liveState.waitUntilReady();
        liveState.queue = userLib.map((t) => ({ ...t, requestedBy: member.user.username }));
        await liveState.playNext();
      } else {
        const index = parseInt(action.slice(7), 10);
        const history = store.getHistory(interaction.guild.id);
        const track = history[index];
        if (!track) throw new Error('That track is no longer in your library.');
        await liveState.playTrackNow(track);
      }
    } catch (err) {
      return interaction.followUp({ content: `⚠️ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
    return interaction.editReply(renderPanelFor(liveState, member));
  }

  if (!state || !state.current) {
    return interaction.reply({ content: 'Nothing is playing.', flags: MessageFlags.Ephemeral });
  }

  // Jump-to-track buttons carry the index: "jump:<n>".
  if (action.startsWith('jump:')) {
    const index = parseInt(action.slice(5), 10);
    await interaction.deferUpdate();
    try {
      await state.jumpTo(index);
    } catch (err) {
      return interaction.followUp({ content: `⚠️ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
    return interaction.editReply(renderPanelFor(state, member));
  }

  switch (action) {
    case 'prev': {
      await interaction.deferUpdate();
      await state.previous();
      setTimeout(() => interaction.editReply(renderPanelFor(state, member)).catch(() => {}), 1200);
      return;
    }
    case 'shuffle': {
      state.shuffle();
      return interaction.update(renderPanelFor(state, member));
    }
    case 'playpause': {
      if (state.isPaused()) state.resume();
      else state.pause();
      return interaction.update(renderPanelFor(state, member));
    }
    case 'loop': {
      state.cycleLoop();
      return interaction.update(renderPanelFor(state, member));
    }
    case 'skip': {
      // Acknowledge first, then advance and re-render once the next track loads.
      await interaction.deferUpdate();
      state.skip();
      setTimeout(() => interaction.editReply(renderPanelFor(state, member)).catch(() => {}), 1200);
      return;
    }
    case 'stop': {
      const wasHolder = state.lockHolderId === member.id;
      state.stop();
      if (wasHolder) state.lockHolderId = null;
      return interaction.update(renderPanelFor(state, member));
    }
    case 'back': {
      // Seeking re-streams the track (spawns yt-dlp/ffmpeg) and can take a few
      // seconds, so acknowledge the interaction first to avoid the 3s deadline.
      await interaction.deferUpdate();
      await state.seek(Math.max(0, state.getPosition() - 15));
      return interaction.editReply(renderPanelFor(state, member));
    }
    case 'forward': {
      await interaction.deferUpdate();
      await state.seek(state.getPosition() + 15);
      return interaction.editReply(renderPanelFor(state, member));
    }
    case 'seek': {
      const modal = new ModalBuilder().setCustomId('mc:seekModal').setTitle('Seek to position');
      const input = new TextInputBuilder()
        .setCustomId('position')
        .setLabel('Position (seconds or mm:ss)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 90 or 1:30')
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }
    default:
      return;
  }
}

function parsePosition(text) {
  const trimmed = text.trim();
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((p) => parseInt(p, 10));
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

async function handleModal(interaction) {
  if (interaction.customId !== 'mc:seekModal') return;

  const member = interaction.member;
  const state = music.peek(interaction.guild.id);

  const control = canControl(state, member);
  if (!control.allowed) {
    return interaction.reply({ content: control.reason, flags: MessageFlags.Ephemeral });
  }
  if (!state || !state.current) {
    return interaction.reply({ content: 'Nothing is playing.', flags: MessageFlags.Ephemeral });
  }

  const seconds = parsePosition(interaction.fields.getTextInputValue('position'));
  if (seconds === null || seconds < 0) {
    return interaction.reply({
      content: 'Invalid position. Use seconds (90) or mm:ss (1:30).',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Acknowledge before the (slow) re-stream so we don't miss the 3s deadline.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const target = await state.seek(seconds);
  await interaction.editReply({
    content: `⏱️ Seeked to \`${formatTime(target)}\`.`,
  });
}

// ---------- Release the lock when the priority user leaves the VC ----------
// ---------- Auto-leave when the VC is empty for 2 minutes ----------

const leaveTimers = new Map(); // guildId -> timeout

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const guildId = oldState.guild.id;
  const state = music.peek(guildId);

  // --- Priority lock release ---
  if (state?.lockHolderId && oldState.id === state.lockHolderId) {
    const left = oldState.channelId === state.voiceChannelId && newState.channelId !== state.voiceChannelId;
    if (left) {
      state.lockHolderId = null;
      if (state.textChannel) {
        state.textChannel.send('🔓 Priority user left — controls are open to everyone again.').catch(() => {});
      }
    }
  }

  // --- Auto-leave if VC is empty (only the bot remains) ---
  if (!state || !state.voiceChannelId) return;

  const voiceChannel = oldState.guild.channels.cache.get(state.voiceChannelId);
  if (!voiceChannel) return;

  // Count human members (exclude bots)
  const humans = voiceChannel.members.filter((m) => !m.user.bot).size;

  if (humans === 0) {
    // Start a 2-minute timer to leave
    if (!leaveTimers.has(guildId)) {
      const timer = setTimeout(() => {
        leaveTimers.delete(guildId);
        const currentState = music.peek(guildId);
        if (!currentState) return;

        // Re-check: still empty?
        const vc = oldState.guild.channels.cache.get(currentState.voiceChannelId);
        const stillEmpty = !vc || vc.members.filter((m) => !m.user.bot).size === 0;

        if (stillEmpty) {
          currentState.persistSession();
          currentState.destroy();
          music.states.delete(guildId);
          console.log(`[${guildId}] Left VC — empty for 2 minutes.`);
        }
      }, 2 * 60 * 1000); // 2 minutes
      leaveTimers.set(guildId, timer);
    }
  } else {
    // Someone joined back — cancel the leave timer
    if (leaveTimers.has(guildId)) {
      clearTimeout(leaveTimers.get(guildId));
      leaveTimers.delete(guildId);
    }
  }
});

// ---------- Graceful shutdown ----------

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully…`);
  // Persist sessions & kill streams for every guild.
  for (const [, state] of music.states ?? []) {
    try { state.persistSession(); } catch {}
    try { state.destroy(); } catch {}
  }
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

client.login(TOKEN).catch((err) => {
  console.error('Failed to log in — is your DISCORD_TOKEN correct?', err.message);
  if (!process.versions.electron) {
    process.exit(1);
  }
});
