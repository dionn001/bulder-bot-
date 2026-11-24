const { PermissionsBitField, ChannelType } = require('discord.js');

const templates = {
  community: {
    id: 'community',
    name: 'Community Hub',
    description: 'Clean structure for communities with welcome, chat, announcements, and voice channels.',
    roles: [
      { name: 'Admin', color: '#e74c3c', permissions: [PermissionsBitField.Flags.Administrator] },
      { name: 'Moderator', color: '#3498db', permissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.KickMembers, PermissionsBitField.Flags.ManageChannels] },
      { name: 'VIP', color: '#f1c40f', permissions: [] },
      { name: 'Member', color: '#2ecc71', permissions: [] }
    ],
    categories: [
      {
        name: 'Information',
        channels: [
          { name: 'welcome', type: ChannelType.GuildText },
          { name: 'rules', type: ChannelType.GuildText },
          { name: 'announcements', type: ChannelType.GuildText }
        ]
      },
      {
        name: 'General',
        channels: [
          { name: 'general-chat', type: ChannelType.GuildText },
          { name: 'media', type: ChannelType.GuildText },
          { name: 'bot-commands', type: ChannelType.GuildText }
        ]
      },
      {
        name: 'Voice Channels',
        channels: [
          { name: 'Lounge', type: ChannelType.GuildVoice },
          { name: 'Hangout', type: ChannelType.GuildVoice }
        ]
      }
    ]
  },
  gaming: {
    id: 'gaming',
    name: 'Gaming Squad',
    description: 'Built for gaming groups with match coordination, clips, and low-bitrate voice rooms.',
    roles: [
      { name: 'Squad Leader', color: '#e67e22', permissions: [PermissionsBitField.Flags.Administrator] },
      { name: 'Captain', color: '#9b59b6', permissions: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers] },
      { name: 'Roster', color: '#1abc9c', permissions: [] },
      { name: 'Guest', color: '#95a5a6', permissions: [] }
    ],
    categories: [
      {
        name: 'Squad Info',
        channels: [
          { name: 'squad-news', type: ChannelType.GuildText },
          { name: 'match-schedule', type: ChannelType.GuildText }
        ]
      },
      {
        name: 'Text Rooms',
        channels: [
          { name: 'looking-for-group', type: ChannelType.GuildText },
          { name: 'clips-and-highlights', type: ChannelType.GuildText },
          { name: 'strategy', type: ChannelType.GuildText }
        ]
      },
      {
        name: 'Voice Rooms',
        channels: [
          { name: 'Main Lobby', type: ChannelType.GuildVoice },
          { name: 'Team Alpha', type: ChannelType.GuildVoice },
          { name: 'Team Bravo', type: ChannelType.GuildVoice }
        ]
      }
    ]
  },
  project: {
    id: 'project',
    name: 'Project & Studio',
    description: 'Organized workspace for teams building projects, content, or creative work together.',
    roles: [
      { name: 'Lead', color: '#e74c3c', permissions: [PermissionsBitField.Flags.Administrator] },
      { name: 'Contributor', color: '#3498db', permissions: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] },
      { name: 'Reviewer', color: '#f39c12', permissions: [] }
    ],
    categories: [
      {
        name: 'Overview',
        channels: [
          { name: 'project-brief', type: ChannelType.GuildText },
          { name: 'roadmap', type: ChannelType.GuildText },
          { name: 'releases', type: ChannelType.GuildText }
        ]
      },
      {
        name: 'Workspace',
        channels: [
          { name: 'general-work', type: ChannelType.GuildText },
          { name: 'ideas', type: ChannelType.GuildText },
          { name: 'feedback', type: ChannelType.GuildText }
        ]
      },
      {
        name: 'Meetings',
        channels: [
          { name: 'Standup Call', type: ChannelType.GuildVoice },
          { name: 'Co-working', type: ChannelType.GuildVoice }
        ]
      }
    ]
  }
};

module.exports = templates;
