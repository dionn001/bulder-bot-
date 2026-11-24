const { PermissionsBitField, ChannelType } = require('discord.js');

module.exports = {
  community: {
    id: 'community',
    name: 'Community Hub',
    description: 'Clean community server with info, chat, media, and voice rooms',
    roles: [
      { name: 'Admin', color: '#e74c3c', permissions: [PermissionsBitField.Flags.Administrator] },
      { name: 'Moderator', color: '#3498db', permissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.KickMembers] },
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
        name: 'Community',
        channels: [
          { name: 'general', type: ChannelType.GuildText },
          { name: 'memes', type: ChannelType.GuildText },
          { name: 'media', type: ChannelType.GuildText }
        ]
      },
      {
        name: 'Voice Channels',
        channels: [
          { name: 'General Voice', type: ChannelType.GuildVoice },
          { name: 'Chill Lounge', type: ChannelType.GuildVoice }
        ]
      }
    ]
  },
  gaming: {
    id: 'gaming',
    name: 'Gaming Squad',
    description: 'Built for gaming sessions, clips, LFG, and voice channels',
    roles: [
      { name: 'Owner / Admin', color: '#e74c3c', permissions: [PermissionsBitField.Flags.Administrator] },
      { name: 'Mod', color: '#9b59b6', permissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.KickMembers] },
      { name: 'Gamer', color: '#1abc9c', permissions: [] }
    ],
    categories: [
      {
        name: 'Server Info',
        channels: [
          { name: 'rules', type: ChannelType.GuildText },
          { name: 'patch-notes', type: ChannelType.GuildText }
        ]
      },
      {
        name: 'Gaming',
        channels: [
          { name: 'general-chat', type: ChannelType.GuildText },
          { name: 'looking-for-group', type: ChannelType.GuildText },
          { name: 'clips-and-highlights', type: ChannelType.GuildText }
        ]
      },
      {
        name: 'Voice Rooms',
        channels: [
          { name: 'Squad VC 1', type: ChannelType.GuildVoice },
          { name: 'Squad VC 2', type: ChannelType.GuildVoice }
        ]
      }
    ]
  }
};
