const path = require('path');
const express = require('express');
const session = require('express-session');
const { GoogleGenAI } = require('@google/genai');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  ActivityType
} = require('discord.js');
const templates = require('./templates');

const app = express();
const PORT = process.env.PORT || 3000;

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  CLIENT_SECRET,
  SESSION_SECRET,
  REDIRECT_URI,
  GEMINI_API_KEY,
  ADMIN_PASSWORD
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error('Missing one or more required environment variables: DISCORD_TOKEN, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI');
  process.exit(1);
}

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const EXPECTED_ADMIN_PASS = ADMIN_PASSWORD || '6767';

const DEFAULT_SETTINGS = {
  maintenanceMode: false,
  maintenanceMessage: 'The AI Discord Server Builder is currently under maintenance. Please check back shortly!',
  useGemini: true,
  allowFallback: true,
  defaultPermissions: '8',
  maxCategoriesPerBuild: 0,
  maxChannelsPerCategory: 0,
  botStatusText: 'AI Server Builder',
  botPresenceStatus: 'online',
  buildsCompleted: 0
};

const adminSettings = { ...DEFAULT_SETTINGS };
const adminActionLogs = [];

function logAdminAction(action) {
  adminActionLogs.unshift({
    time: new Date().toISOString(),
    action
  });
  if (adminActionLogs.length > 25) {
    adminActionLogs.length = 25;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

function applyBotPresence() {
  if (!client.user) return;
  const validStatuses = ['online', 'idle', 'dnd'];
  const status = validStatuses.includes(adminSettings.botPresenceStatus)
    ? adminSettings.botPresenceStatus
    : 'online';
  const activityName = String(adminSettings.botStatusText || 'AI Server Builder').slice(0, 120);

  client.user.setPresence({
    status,
    activities: [
      {
        name: activityName,
        type: ActivityType.Playing
      }
    ]
  });
}

client.once('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
  applyBotPresence();
});

client.on('error', (err) => {
  console.error('Discord client error:', err);
});

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: SESSION_SECRET || 'fallback-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      sameSite: 'lax'
    }
  })
);

function sanitizeChannelName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);
}

function limitList(arr, max) {
  return Number.isFinite(max) && max > 0 ? arr.slice(0, max) : arr;
}

function buildStructureFromPromptFallback(promptText) {
  const cleanPrompt = String(promptText || '').trim();
  const lower = cleanPrompt.toLowerCase();

  const roles = [
    { name: 'Admin', color: '#e74c3c', permissions: [PermissionsBitField.Flags.Administrator] },
    { name: 'Moderator', color: '#3498db', permissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.KickMembers] },
    { name: 'Member', color: '#2ecc71', permissions: [] }
  ];

  const infoChannels = [{ name: 'welcome', type: ChannelType.GuildText }];
  if (/rule|regel|info|announce|aankondig/.test(lower)) {
    infoChannels.push({ name: 'rules', type: ChannelType.GuildText });
    infoChannels.push({ name: 'announcements', type: ChannelType.GuildText });
  }

  const mainChannels = [{ name: 'general', type: ChannelType.GuildText }];
  const extraChannels = [];
  const voiceChannels = [{ name: 'General Voice', type: ChannelType.GuildVoice }];

  const keywordMap = [
    { regex: /\b(meme|memes|funny|joke)\b/i, channel: 'memes', type: ChannelType.GuildText },
    { regex: /\b(clip|clips|highlight|highlights|media|photo|photos|image|images)\b/i, channel: 'media-and-clips', type: ChannelType.GuildText },
    { regex: /\b(game|gaming|gamer|squad|team|match|lfg|ranked)\b/i, channel: 'gaming-chat', type: ChannelType.GuildText },
    { regex: /\b(study|studie|homework|school|exam|notes|project|work)\b/i, channel: 'study-and-projects', type: ChannelType.GuildText },
    { regex: /\b(code|coding|dev|developer|programming|bot|tech)\b/i, channel: 'dev-and-tech', type: ChannelType.GuildText },
    { regex: /\b(art|design|draw|drawing|creative|music|muziek)\b/i, channel: 'creative-corner', type: ChannelType.GuildText },
    { regex: /\b(bot|command|commands)\b/i, channel: 'bot-commands', type: ChannelType.GuildText },
    { regex: /\b(suggest|suggestion|suggestions|idea|ideas|feedback)\b/i, channel: 'suggestions', type: ChannelType.GuildText }
  ];

  for (const item of keywordMap) {
    if (item.regex.test(lower)) {
      extraChannels.push({ name: item.channel, type: item.type });
    }
  }

  const quotedMatches = [...cleanPrompt.matchAll(/"([^"]{2,30})"/g)];
  for (const m of quotedMatches) {
    const slug = sanitizeChannelName(m[1]);
    if (slug && !extraChannels.some((c) => c.name === slug)) {
      extraChannels.push({ name: slug, type: ChannelType.GuildText });
    }
  }

  if (/\b(music|muziek|dj|radio)\b/i.test(lower)) {
    voiceChannels.push({ name: 'Music Lounge', type: ChannelType.GuildVoice });
  }
  if (/\b(game|gaming|squad|team|vc|voice|call|calls)\b/i.test(lower)) {
    voiceChannels.push({ name: 'Squad VC 1', type: ChannelType.GuildVoice });
    voiceChannels.push({ name: 'Squad VC 2', type: ChannelType.GuildVoice });
  }
  if (/\b(study|studie|focus|meeting|meetings)\b/i.test(lower)) {
    voiceChannels.push({ name: 'Focus Room', type: ChannelType.GuildVoice });
  }

  if (/\b(vip|friend|friends|vrienden|artist|creator|creators|mod|mods|staff)\b/i.test(lower)) {
    roles.splice(2, 0, { name: 'VIP / Friends', color: '#f1c40f', permissions: [] });
  }

  if (extraChannels.length === 0) {
    extraChannels.push(
      { name: 'chat', type: ChannelType.GuildText },
      { name: 'media', type: ChannelType.GuildText },
      { name: 'bot-commands', type: ChannelType.GuildText }
    );
  }

  const maxCats = Number(adminSettings.maxCategoriesPerBuild) || 0;
  const maxCh = Number(adminSettings.maxChannelsPerCategory) || 0;

  const allCategories = [
    { name: 'Information', channels: limitList(infoChannels, maxCh) },
    { name: 'Community', channels: limitList([...mainChannels, ...extraChannels], maxCh) },
    { name: 'Voice Channels', channels: limitList(voiceChannels, maxCh) }
  ];

  return {
    name: `Custom Prompt: "${cleanPrompt.slice(0, 50)}${cleanPrompt.length > 50 ? '...' : ''}"`,
    roles,
    categories: limitList(allCategories, maxCats)
  };
}

async function buildStructureWithGemini(promptText) {
  const maxCats = Number(adminSettings.maxCategoriesPerBuild) || 0;
  const maxCh = Number(adminSettings.maxChannelsPerCategory) || 0;

  if (!adminSettings.useGemini || !ai) {
    if (!adminSettings.allowFallback) {
      throw new Error('Gemini AI is disabled and fallback parser is disabled in Admin Settings.');
    }
    return buildStructureFromPromptFallback(promptText);
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Create a Discord server structure for this user request: "${promptText}".
Build as many roles, categories, and channels as fit the request naturally without artificial caps.
Return ONLY valid JSON matching this schema:
{
  "roles": [
    { "name": "string", "color": "#hex", "admin": false, "mod": false }
  ],
  "categories": [
    {
      "name": "string",
      "channels": [
        { "name": "string", "type": "text" }
      ]
    }
  ]
}
Rules:
- Channel type must be "text" or "voice".
- Text channel names should be lowercase words separated by hyphens (e.g. "general-chat").
- Voice channel names can be clean words (e.g. "General Voice").`,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const parsed = JSON.parse(response.text);
    const roles = Array.isArray(parsed.roles) && parsed.roles.length > 0
      ? parsed.roles.map((r) => ({
          name: String(r.name || 'Member').slice(0, 40),
          color: /^#[0-9a-fA-F]{6}$/.test(r.color || '') ? r.color : '#3498db',
          permissions: r.admin
            ? [PermissionsBitField.Flags.Administrator]
            : r.mod
              ? [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.KickMembers]
              : []
        }))
      : buildStructureFromPromptFallback(promptText).roles;

    const categories = Array.isArray(parsed.categories) && parsed.categories.length > 0
      ? limitList(parsed.categories, maxCats).map((cat) => ({
          name: String(cat.name || 'Channels').slice(0, 60),
          channels: limitList(Array.isArray(cat.channels) ? cat.channels : [], maxCh).map((ch) => {
            const isVoice = String(ch.type || '').toLowerCase() === 'voice';
            return {
              name: isVoice
                ? String(ch.name || 'Voice Room').slice(0, 60)
                : sanitizeChannelName(ch.name || 'channel') || 'channel',
              type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText
            };
          })
        }))
      : buildStructureFromPromptFallback(promptText).categories;

    return {
      name: `Gemini AI: "${promptText.slice(0, 45)}${promptText.length > 45 ? '...' : ''}"`,
      roles,
      categories
    };
  } catch (err) {
    console.error('Gemini generation failed:', err.message || err);
    if (!adminSettings.allowFallback) {
      throw err;
    }
    return buildStructureFromPromptFallback(promptText);
  }
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user || !req.session.accessToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

function getInviteUrl() {
  const perms = /^\d+$/.test(String(adminSettings.defaultPermissions || ''))
    ? String(adminSettings.defaultPermissions)
    : '8';
  return `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=${perms}&integration_type=0&scope=bot`;
}

function getAdminPayload() {
  return {
    settings: adminSettings,
    logs: adminActionLogs,
    botReady: client.isReady(),
    botTag: client.user ? client.user.tag : null,
    connectedGuilds: client.guilds.cache.map((g) => ({ id: g.id, name: g.name, memberCount: g.memberCount })),
    connectedGuildCount: client.guilds.cache.size,
    geminiConfigured: Boolean(ai),
    botInviteUrl: getInviteUrl()
  };
}

app.get('/api/status', (req, res) => {
  res.json({
    maintenanceMode: adminSettings.maintenanceMode,
    maintenanceMessage: adminSettings.maintenanceMessage,
    isAdmin: Boolean(req.session && req.session.isAdmin),
    botReady: client.isReady(),
    botTag: client.user ? client.user.tag : null,
    botInviteUrl: getInviteUrl()
  });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (String(password || '') !== EXPECTED_ADMIN_PASS) {
    return res.status(401).json({ error: 'Invalid admin password.' });
  }
  req.session.isAdmin = true;
  logAdminAction('Admin panel unlocked');
  req.session.save((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to save admin session.' });
    }
    res.json({
      ok: true,
      isAdmin: true,
      ...getAdminPayload()
    });
  });
});

app.post('/api/admin/logout', (req, res) => {
  if (req.session) {
    req.session.isAdmin = false;
  }
  logAdminAction('Admin panel locked');
  res.json({ ok: true, isAdmin: false });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json(getAdminPayload());
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const {
    maintenanceMode,
    maintenanceMessage,
    useGemini,
    allowFallback,
    defaultPermissions,
    maxCategoriesPerBuild,
    maxChannelsPerCategory,
    botStatusText,
    botPresenceStatus
  } = req.body || {};

  if (typeof maintenanceMode === 'boolean') {
    adminSettings.maintenanceMode = maintenanceMode;
    logAdminAction(`Maintenance mode set to ${maintenanceMode ? 'ON' : 'OFF'}`);
  }
  if (typeof maintenanceMessage === 'string' && maintenanceMessage.trim().length > 0) {
    adminSettings.maintenanceMessage = maintenanceMessage.trim().slice(0, 240);
  }
  if (typeof useGemini === 'boolean') {
    adminSettings.useGemini = useGemini;
  }
  if (typeof allowFallback === 'boolean') {
    adminSettings.allowFallback = allowFallback;
  }
  if (typeof defaultPermissions === 'string' && /^\d+$/.test(defaultPermissions.trim())) {
    adminSettings.defaultPermissions = defaultPermissions.trim();
  }
  if (Number.isFinite(Number(maxCategoriesPerBuild))) {
    adminSettings.maxCategoriesPerBuild = Math.max(0, Math.floor(Number(maxCategoriesPerBuild)));
  }
  if (Number.isFinite(Number(maxChannelsPerCategory))) {
    adminSettings.maxChannelsPerCategory = Math.max(0, Math.floor(Number(maxChannelsPerCategory)));
  }
  if (typeof botStatusText === 'string' && botStatusText.trim().length > 0) {
    adminSettings.botStatusText = botStatusText.trim().slice(0, 120);
  }
  if (typeof botPresenceStatus === 'string' && ['online', 'idle', 'dnd'].includes(botPresenceStatus)) {
    adminSettings.botPresenceStatus = botPresenceStatus;
  }

  applyBotPresence();
  logAdminAction('Saved admin settings');

  res.json({
    ok: true,
    ...getAdminPayload()
  });
});

// Extra Admin Commands
app.post('/api/admin/command', requireAdmin, async (req, res) => {
  const { command, targetId, message } = req.body || {};

  try {
    if (command === 'reset-builds') {
      adminSettings.buildsCompleted = 0;
      logAdminAction('Reset completed builds counter to 0');
      return res.json({ ok: true, message: 'Builds counter reset to 0.', ...getAdminPayload() });
    }

    if (command === 'reset-defaults') {
      const currentBuilds = adminSettings.buildsCompleted;
      Object.assign(adminSettings, DEFAULT_SETTINGS, { buildsCompleted: currentBuilds });
      applyBotPresence();
      logAdminAction('Reset all admin settings to defaults');
      return res.json({ ok: true, message: 'All admin settings reset to defaults.', ...getAdminPayload() });
    }

    if (command === 'clear-logs') {
      adminActionLogs.length = 0;
      return res.json({ ok: true, message: 'Admin activity log cleared.', ...getAdminPayload() });
    }

    if (command === 'leave-guild') {
      const guildId = String(targetId || '').trim();
      if (!guildId) {
        return res.status(400).json({ error: 'Provide a Server/Guild ID to leave.' });
      }
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'Bot is not in a server with that ID.' });
      }
      const guildName = guild.name;
      await guild.leave();
      logAdminAction(`Left server "${guildName}" (${guildId})`);
      return res.json({ ok: true, message: `Bot left server "${guildName}" (${guildId}).`, ...getAdminPayload() });
    }

    if (command === 'send-message') {
      const channelId = String(targetId || '').trim();
      const text = String(message || '').trim();
      if (!channelId || !text) {
        return res.status(400).json({ error: 'Provide both a Channel ID and a message.' });
      }
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ error: 'Text channel not found or inaccessible.' });
      }
      await channel.send(text);
      logAdminAction(`Sent message to channel ${channelId}`);
      return res.json({ ok: true, message: `Message sent to channel ${channelId}.`, ...getAdminPayload() });
    }

    return res.status(400).json({ error: 'Unknown admin command.' });
  } catch (err) {
    console.error('Admin command error:', err);
    return res.status(500).json({ error: err.message || 'Admin command failed.' });
  }
});

app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds'
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing authorization code.');
  }

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return res.status(500).send('Failed to authenticate with Discord.');
    }

    const tokenData = await tokenResponse.json();
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!userResponse.ok) {
      return res.status(500).send('Failed to fetch Discord user profile.');
    }

    const userData = await userResponse.json();
    req.session.user = userData;
    req.session.accessToken = tokenData.access_token;

    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
        return res.status(500).send('Failed to save session.');
      }
      res.redirect('/');
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication error.');
  }
});

app.post('/auth/logout', (req, res) => {
  const keepAdmin = Boolean(req.session && req.session.isAdmin);
  req.session.destroy(() => {
    res.json({ ok: true, keepAdmin });
  });
});

app.get('/api/session', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.json({
      loggedIn: false,
      isAdmin: Boolean(req.session && req.session.isAdmin),
      maintenanceMode: adminSettings.maintenanceMode,
      maintenanceMessage: adminSettings.maintenanceMessage
    });
  }
  res.json({
    loggedIn: true,
    isAdmin: Boolean(req.session.isAdmin),
    maintenanceMode: adminSettings.maintenanceMode,
    maintenanceMessage: adminSettings.maintenanceMessage,
    user: {
      id: req.session.user.id,
      username: req.session.user.username,
      globalName: req.session.user.global_name,
      avatar: req.session.user.avatar
    }
  });
});

app.get('/api/templates', requireAuth, (req, res) => {
  const list = Object.values(templates).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    roleCount: t.roles.length,
    categoryCount: t.categories.length
  }));
  res.json({ templates: list });
});

app.get('/api/guilds', requireAuth, async (req, res) => {
  try {
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${req.session.accessToken}` }
    });

    if (!guildsRes.ok) {
      return res.status(500).json({ error: 'Failed to load user servers from Discord.' });
    }

    const userGuilds = await guildsRes.json();
    const manageableGuilds = userGuilds
      .filter((g) => {
        const perms = BigInt(g.permissions || '0');
        return (perms & PermissionsBitField.Flags.ManageGuild) === PermissionsBitField.Flags.ManageGuild || g.owner;
      })
      .map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        botInServer: client.guilds.cache.has(g.id)
      }));

    res.json({
      guilds: manageableGuilds,
      botInviteUrl: getInviteUrl()
    });
  } catch (error) {
    console.error('Error loading guilds:', error);
    res.status(500).json({ error: 'Internal error while loading servers.' });
  }
});

app.post('/api/apply-template', requireAuth, async (req, res) => {
  const isAdmin = Boolean(req.session && req.session.isAdmin);
  if (adminSettings.maintenanceMode && !isAdmin) {
    return res.status(503).json({ error: adminSettings.maintenanceMessage });
  }

  const { guildId, templateId, prompt } = req.body;
  const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';

  let structure = null;
  if (trimmedPrompt.length > 0) {
    structure = await buildStructureWithGemini(trimmedPrompt);
  } else if (templateId && templates[templateId]) {
    structure = templates[templateId];
  }

  if (!guildId || !structure) {
    return res.status(400).json({ error: 'Please select a server and either type a prompt or choose a template.' });
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return res.status(404).json({ error: 'Bot is not in this server yet. Click "Invite Bot to Server" first.' });
  }

  try {
    const createdRoles = [];
    for (const roleDef of structure.roles) {
      const existing = guild.roles.cache.find((r) => r.name === roleDef.name);
      if (existing) {
        createdRoles.push(existing);
      } else {
        const role = await guild.roles.create({
          name: roleDef.name,
          color: roleDef.color,
          permissions: roleDef.permissions,
          reason: `Applied structure: ${structure.name}`
        });
        createdRoles.push(role);
      }
    }

    let createdChannels = 0;
    for (const catDef of structure.categories) {
      const category = await guild.channels.create({
        name: catDef.name,
        type: ChannelType.GuildCategory,
        reason: `Applied structure: ${structure.name}`
      });

      for (const chDef of catDef.channels) {
        await guild.channels.create({
          name: chDef.name,
          type: chDef.type,
          parent: category.id,
          reason: `Applied structure: ${structure.name}`
        });
        createdChannels += 1;
      }
    }

    adminSettings.buildsCompleted += 1;

    res.json({
      success: true,
      message: `Applied ${structure.name} to ${guild.name}: ${createdRoles.length} roles ready and ${createdChannels} channels created.`
    });
  } catch (error) {
    console.error('Template apply error:', error);
    res.status(500).json({
      error: 'Failed to apply structure. Make sure the bot role has Administrator permission and sits above roles it manages.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Web dashboard listening on port ${PORT}`);
});

client.login(DISCORD_TOKEN).catch((err) => {
  console.error('Failed to login with DISCORD_TOKEN:', err);
  process.exit(1);
});
