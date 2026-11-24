const path = require('path');
const express = require('express');
const session = require('express-session');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const templates = require('./templates');

const app = express();
const PORT = process.env.PORT || 3000;

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  CLIENT_SECRET,
  SESSION_SECRET,
  REDIRECT_URI
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error('Missing one or more required environment variables: DISCORD_TOKEN, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

client.once('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
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

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user || !req.session.accessToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

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

    res.redirect('/');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication error.');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/session', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
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
      botInviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`
    });
  } catch (error) {
    console.error('Error loading guilds:', error);
    res.status(500).json({ error: 'Internal error while loading servers.' });
  }
});

app.post('/api/apply-template', requireAuth, async (req, res) => {
  const { guildId, templateId } = req.body;
  const template = templates[templateId];

  if (!guildId || !template) {
    return res.status(400).json({ error: 'Please select a valid server and template.' });
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return res.status(404).json({ error: 'Bot is not in this server yet. Invite the bot first.' });
  }

  try {
    const createdRoles = [];
    for (const roleDef of template.roles) {
      const existing = guild.roles.cache.find((r) => r.name === roleDef.name);
      if (existing) {
        createdRoles.push(existing);
      } else {
        const role = await guild.roles.create({
          name: roleDef.name,
          color: roleDef.color,
          permissions: roleDef.permissions,
          reason: `Applied template: ${template.name}`
        });
        createdRoles.push(role);
      }
    }

    let createdChannels = 0;
    for (const catDef of template.categories) {
      const category = await guild.channels.create({
        name: catDef.name,
        type: 4, // GuildCategory
        reason: `Applied template: ${template.name}`
      });

      for (const chDef of catDef.channels) {
        await guild.channels.create({
          name: chDef.name,
          type: chDef.type,
          parent: category.id,
          reason: `Applied template: ${template.name}`
        });
        createdChannels += 1;
      }
    }

    res.json({
      success: true,
      message: `Applied "${template.name}" to ${guild.name}: ${createdRoles.length} roles ready and ${createdChannels} channels created.`
    });
  } catch (error) {
    console.error('Template apply error:', error);
    res.status(500).json({
      error: 'Failed to apply template. Make sure the bot role has Administrator permission and sits above roles it manages.'
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
