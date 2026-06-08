require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

const TOKEN = process.env.TOKEN;
const STORMY_LOGO = 'https://i.postimg.cc/ydzDms8N/stormy-1.png';

const LOG_CHANNEL = '1509250768098693180';
const INCOMING_EVENTS_CHANNEL = '1512002502457954395';

const CHANNELS = {
  informal:   '1508092919301804102',
  weapons:    '1508093012494909470',
  foundary:   '1508093240916705289',
  bizzwar:    '1508093399100821564',
  rpticket:   '1508093533632860200',
  hotel:      '1508847720352317572',
  vineyard:   '1509221114851627089',
  ranking:    '1509221320020463768',
};

const FAMILY_ROLE = '1508101062161207437';

const PRIORITY_ROLES = [
  '1193690559341133955',
  '1509596474462179468',
  '1508100262206636125',
  '1509213861205508148',
  '1511994771806359704',
];

const STAFF_ROLES = [
  '1508100262206636125',
  '1509213861205508148',
  '1193690559341133955',
];

const ROSTER_PING_ROLES = [
  '1193690559341133955',
  '1509596474462179468',
  '1508100262206636125',
  '1509213861205508148',
];

const COLORS = {
  informal: 0x8B5CF6,
  weapons:  0x94A3B8,
  foundary: 0xFBBF24,
  bizzwar:  0xEF4444,
  rpticket: 0xEC4899,
  hotel:    0x22D3EE,
  vineyard: 0x22C55E,
  ranking:  0xF97316,
};

const TITLES = {
  informal: '📝 INFORMAL SIGN UP',
  weapons:  '⚔️ WEAPONS SIGN UP',
  foundary: '🏭 FOUNDARY SIGN UP',
  bizzwar:  '🛡️ BIZWAR SIGN UP',
  rpticket: '🎟️ RP TICKET SIGN UP',
  hotel:    '🏨 HOTEL SIGN UP',
  vineyard: '🍇 VINEYARD SIGN UP',
  ranking:  '🏆 RANKING BATTLE SIGN UP',
};

const VCS = {
  informal: '1508091694590070784',
  bizzwar:  '1508091729495068772',
  rpticket: '1508091763951407255',
  default:  '1508091802111049888',
};

const activeEvents = new Map();
let incomingPanelMessage = null;

// ── HELPERS ───────────────────────────────────────────────

function formatTime(seconds) {
  if (seconds < 0) seconds = 0;
  const hrs  = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

function isStaff(member) {
  return STAFF_ROLES.some(r => member.roles.cache.has(r));
}

function canRosterPing(member) {
  return ROSTER_PING_ROLES.some(r => member.roles.cache.has(r));
}

function isFamilyMember(member) {
  return member.roles.cache.has(FAMILY_ROLE) || isStaff(member);
}

function getPriorityScore(member) {
  for (let i = 0; i < PRIORITY_ROLES.length; i++) {
    if (member.roles.cache.has(PRIORITY_ROLES[i])) return i;
  }
  return PRIORITY_ROLES.length;
}

async function sendLog(guild, staffUser, action, targetUser, eventName) {
  const channel = guild.channels.cache.get(LOG_CHANNEL);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: 'Stormy | En03', iconURL: STORMY_LOGO })
    .setThumbnail(STORMY_LOGO)
    .setTitle('🛡️ Event Activity Log')
    .addFields(
      { name: 'Staff', value: `<@${staffUser.id}>`, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'Event', value: eventName, inline: true },
      { name: 'Target', value: targetUser ? `<@${targetUser.id}>` : 'None', inline: true },
      { name: 'Time', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
    )
    .setFooter({ text: 'Stormy | En03 — Event Management', iconURL: STORMY_LOGO });
  channel.send({ embeds: [embed] });
}

// ── PREMIUM EMBED BUILDER ─────────────────────────────────

function createEmbed(eventName, slots, roster, waitlist, timeLeft, note, locked) {
  const filled = roster.length;

  // Slot tracker bar
  const filledBar = '🟨'.repeat(filled) + '⬜'.repeat(Math.max(0, slots - filled));

  // Roster list
  const rosterText = filled > 0
    ? roster.map((id, i) => `🟢 **${i+1}.** <@${id}>`).join('\n')
    : Array.from({ length: Math.min(slots, 10) }, (_, i) => `⬛ **${i+1}.** *empty slot*`).join('\n');

  // Waitlist
  const waitlistText = waitlist.length > 0
    ? waitlist.map((id, i) => `**${i+1}.** <@${id}>`).join('\n')
    : '*No players in waitlist.*';

  const statusLine = locked
    ? '🔒 **SIGNUPS LOCKED**'
    : (timeLeft <= 0 ? '🏁 **EVENT FINISHED**' : '✅ **Signups Open**');

  return new EmbedBuilder()
    .setColor(COLORS[eventName])
    .setAuthor({ name: 'Stormy | En03 — Event Management', iconURL: STORMY_LOGO })
    .setThumbnail(STORMY_LOGO)
    .setTitle(TITLES[eventName])
    .addFields(
      { name: '⏳ Starts In', value: `\`${formatTime(timeLeft)}\``, inline: true },
      { name: '👥 Slots', value: `\`${filled} / ${slots}\``, inline: true },
      { name: '📊 Status', value: statusLine, inline: true },
      { name: '📊 Slot Tracker', value: filledBar || '⬜'.repeat(slots), inline: false },
      { name: '👑 Roster', value: rosterText, inline: false },
      { name: '📋 Waitlist', value: waitlistText, inline: false },
      { name: '📌 Note', value: note, inline: false },
    )
    .setFooter({ text: 'Stormy | En03 — Event Management', iconURL: STORMY_LOGO });
}

async function updateEventMessage(data) {
  if (!data || !data.message) return;
  const updatedEmbed = createEmbed(
    data.eventName, data.slots, data.roster,
    data.waitlist, data.timeLeft, data.note, data.locked
  );
  await data.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
}

function getEventButtons() {
  const playerButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('signup').setLabel('Sign Up').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('addplayer').setLabel('Add Player').setStyle(ButtonStyle.Primary),
  );
  const staffButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lock').setLabel('Lock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('unlock').setLabel('Unlock').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('end').setLabel('End').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('removeplayer').setLabel('Remove Player').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('swapplayer').setLabel('Swap Player').setStyle(ButtonStyle.Primary),
  );
  const extraButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rosterpingdm').setLabel('📢 Roster Ping').setStyle(ButtonStyle.Primary),
  );
  return [playerButtons, staffButtons, extraButtons];
}

async function createEvent(eventName, slots, duration, note) {
  const channel = await client.channels.fetch(CHANNELS[eventName]).catch(() => null);
  if (!channel) return;

  const existing = Array.from(activeEvents.values()).find(x => x.eventName === eventName);
  if (existing) return;

  const roster = [];
  const waitlist = [];
  const embed = createEmbed(eventName, slots, roster, waitlist, duration, note, false);

  const message = await channel.send({
    content: `<@&${FAMILY_ROLE}>`,
    embeds: [embed],
    components: getEventButtons(),
  });

  const eventData = {
    eventName, slots, roster, waitlist,
    timeLeft: duration, signupOpen: true,
    locked: false, message, note,
  };

  activeEvents.set(message.id, eventData);

  const interval = setInterval(async () => {
    const data = activeEvents.get(message.id);
    if (!data) { clearInterval(interval); return; }

    data.timeLeft -= 5;

    if (eventName === 'rpticket') {
      if (data.timeLeft <= 1800) data.note = '⚠️ RP Ticket Zone Started. Hurry before XX:45.';
      if (data.timeLeft <= 900) { data.signupOpen = false; data.note = '🔴 RP Ticket Signups Closed.'; }
    }

    if (data.timeLeft === 300) {
      let vcId = VCS.default;
      if (eventName === 'informal') vcId = VCS.informal;
      if (eventName === 'bizzwar')  vcId = VCS.bizzwar;
      if (eventName === 'rpticket') vcId = VCS.rpticket;
      for (const userId of data.roster) {
        const member = message.guild.members.cache.get(userId);
        if (!member?.voice?.channel || member.voice.channel.id !== vcId) {
          try { await member.send(`⚠️ **EVENT VC WARNING**\n\nYou signed up for **${eventName}**\n\nPlease join the required VC immediately!`); } catch {}
        }
      }
    }

    if (data.timeLeft <= 0) {
      data.signupOpen = false;
      clearInterval(interval);
      const finishedEmbed = createEmbed(eventName, slots, data.roster, data.waitlist, 0, '🏁 Sign up closed or event finished.', false);
      await message.edit({ embeds: [finishedEmbed], components: [] }).catch(() => {});
      activeEvents.delete(message.id);
      return;
    }

    await updateEventMessage(data);
  }, 5000);
}

// ── INCOMING EVENTS PANEL ─────────────────────────────────

function getNextEventTime(hour, minute) {
  const now = new Date();
  const ukNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const next = new Date(ukNow);
  next.setHours(hour, minute, 0, 0);
  if (next <= ukNow) next.setDate(next.getDate() + 1);
  return Math.floor(next.getTime() / 1000);
}

function getNextInformalTime() {
  const now = new Date();
  const ukNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const next = new Date(ukNow);
  if (ukNow.getMinutes() < 30) { next.setMinutes(30, 0, 0); }
  else { next.setHours(ukNow.getHours() + 1, 30, 0, 0); }
  return Math.floor(next.getTime() / 1000);
}

function getNextMultiTime(slots) {
  const now = new Date();
  const ukNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  let earliest = null;
  for (const s of slots) {
    const t = new Date(ukNow);
    t.setHours(s.h, s.m, 0, 0);
    if (t <= ukNow) t.setDate(t.getDate() + 1);
    if (!earliest || t < earliest) earliest = t;
  }
  return Math.floor(earliest.getTime() / 1000);
}

async function updateIncomingPanel() {
  const channel = client.channels.cache.get(INCOMING_EVENTS_CHANNEL);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setAuthor({ name: 'Stormy | En03 — Event Schedule', iconURL: STORMY_LOGO })
    .setThumbnail(STORMY_LOGO)
    .setTitle('📅 Upcoming Events')
    .setDescription('All times shown automatically in your local timezone!')
    .addFields(
      { name: '📝 Informal',       value: `<t:${getNextInformalTime()}:R>`, inline: true },
      { name: '⚔️ Weapons',        value: `<t:${getNextMultiTime([{h:3,m:0},{h:7,m:0},{h:10,m:0},{h:22,m:0}])}:R>`, inline: true },
      { name: '🛡️ Bizwar',         value: `<t:${getNextMultiTime([{h:18,m:35},{h:0,m:35}])}:R>`, inline: true },
      { name: '🎟️ RP Ticket',      value: `<t:${getNextMultiTime([{h:9,m:30},{h:15,m:30},{h:21,m:30}])}:R>`, inline: true },
      { name: '🏨 Hotel',          value: `<t:${getNextEventTime(2,0)}:R>`, inline: true },
      { name: '🏭 Foundary',       value: `<t:${getNextEventTime(14,0)}:R>`, inline: true },
      { name: '🍇 Vineyard',       value: `<t:${getNextEventTime(20,0)}:R>`, inline: true },
      { name: '🏆 Ranking Battle', value: `<t:${getNextEventTime(20,30)}:R>`, inline: true },
    )
    .setFooter({ text: 'Stormy | En03 — Updates every 5 minutes', iconURL: STORMY_LOGO })
    .setTimestamp();

  if (incomingPanelMessage) {
    await incomingPanelMessage.edit({ embeds: [embed] }).catch(async () => {
      incomingPanelMessage = await channel.send({ embeds: [embed] });
    });
  } else {
    incomingPanelMessage = await channel.send({ embeds: [embed] });
  }
}

// ── INTERACTIONS ──────────────────────────────────────────

client.on(Events.InteractionCreate, async interaction => {

  if (interaction.isButton() && interaction.customId === 'signup') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!data.signupOpen || data.locked) return interaction.reply({ content: '❌ Signups are closed.', flags: 64 });
    if (!isFamilyMember(interaction.member)) return interaction.reply({ content: '❌ Only family members can sign up.', flags: 64 });
    if (data.roster.includes(interaction.user.id)) return interaction.reply({ content: '❌ You are already signed up.', flags: 64 });

    const score = getPriorityScore(interaction.member);
    if (data.roster.length < data.slots) {
      let insertIndex = data.roster.length;
      for (let i = 0; i < data.roster.length; i++) {
        const m = interaction.guild.members.cache.get(data.roster[i]);
        if (m && getPriorityScore(m) > score) { insertIndex = i; break; }
      }
      data.roster.splice(insertIndex, 0, interaction.user.id);
    } else {
      if (!data.waitlist.includes(interaction.user.id)) data.waitlist.push(interaction.user.id);
    }
    await updateEventMessage(data);
    await interaction.deferUpdate();
    return;
  }

  if (interaction.isButton() && interaction.customId === 'leave') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    data.roster   = data.roster.filter(x => x !== interaction.user.id);
    data.waitlist = data.waitlist.filter(x => x !== interaction.user.id);
    if (data.waitlist.length > 0 && data.roster.length < data.slots) data.roster.push(data.waitlist.shift());
    await updateEventMessage(data);
    await interaction.deferUpdate();
    return;
  }

  if (interaction.isButton() && interaction.customId === 'addplayer') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isFamilyMember(interaction.member)) return interaction.reply({ content: '❌ Only family members can use this.', flags: 64 });
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`addplayer_select_${interaction.message.id}`)
        .setPlaceholder('Search and select a member to add...')
        .setMinValues(1).setMaxValues(1)
    );
    await interaction.reply({ content: '👤 Select a member to add:', components: [row], flags: 64 });
    return;
  }

  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('addplayer_select_')) {
    const msgId = interaction.customId.split('_')[2];
    const data  = activeEvents.get(msgId);
    if (!data) return;
    const userId = interaction.values[0];
    if (data.roster.includes(userId) || data.waitlist.includes(userId)) {
      return interaction.update({ content: '❌ This member is already in the roster or waitlist.', components: [] });
    }
    const targetMember = interaction.guild.members.cache.get(userId);
    const score = targetMember ? getPriorityScore(targetMember) : PRIORITY_ROLES.length;
    if (data.roster.length < data.slots) {
      let insertIndex = data.roster.length;
      for (let i = 0; i < data.roster.length; i++) {
        const m = interaction.guild.members.cache.get(data.roster[i]);
        if (m && getPriorityScore(m) > score) { insertIndex = i; break; }
      }
      data.roster.splice(insertIndex, 0, userId);
    } else {
      data.waitlist.push(userId);
    }
    await updateEventMessage(data);
    await interaction.update({ content: `✅ <@${userId}> has been added!`, components: [] });
    sendLog(interaction.guild, interaction.user, 'Added Player', { id: userId }, data.eventName);
    return;
  }

  if (interaction.isButton() && interaction.customId === 'removeplayer') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    if (data.roster.length === 0 && data.waitlist.length === 0) return interaction.reply({ content: '❌ No players to remove.', flags: 64 });

    const options = [];
    if (data.roster.length > 0) {
      options.push(new StringSelectMenuOptionBuilder().setLabel('── ROSTER ──').setValue('header_roster').setDescription('Players in roster').setEmoji('👥'));
      for (const id of data.roster) {
        const m = interaction.guild.members.cache.get(id);
        options.push(new StringSelectMenuOptionBuilder().setLabel(`[ROSTER] ${m ? m.displayName : id}`).setValue(`roster_${id}`).setEmoji('🟢'));
      }
    }
    if (data.waitlist.length > 0) {
      options.push(new StringSelectMenuOptionBuilder().setLabel('── WAITLIST ──').setValue('header_waitlist').setDescription('Players in waitlist').setEmoji('📋'));
      for (const id of data.waitlist) {
        const m = interaction.guild.members.cache.get(id);
        options.push(new StringSelectMenuOptionBuilder().setLabel(`[WAITLIST] ${m ? m.displayName : id}`).setValue(`waitlist_${id}`).setEmoji('🟡'));
      }
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`remove_select_${interaction.message.id}`).setPlaceholder('Select a player to remove...').addOptions(options.slice(0, 25))
    );
    await interaction.reply({ content: '🗑️ Select a player to remove:', components: [row], flags: 64 });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('remove_select_')) {
    const msgId = interaction.customId.split('_')[2];
    const data  = activeEvents.get(msgId);
    if (!data) return;
    const value = interaction.values[0];
    if (value.startsWith('header_')) return interaction.update({ content: '❌ Select a player, not a header.', components: [] });
    const [list, userId] = value.split('_');
    if (list === 'roster') {
      data.roster = data.roster.filter(x => x !== userId);
      if (data.waitlist.length > 0 && data.roster.length < data.slots) data.roster.push(data.waitlist.shift());
    } else {
      data.waitlist = data.waitlist.filter(x => x !== userId);
    }
    await updateEventMessage(data);
    await interaction.update({ content: `✅ <@${userId}> removed from ${list}!`, components: [] });
    sendLog(interaction.guild, interaction.user, `Removed from ${list}`, { id: userId }, data.eventName);
    return;
  }

  if (interaction.isButton() && interaction.customId === 'swapplayer') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId(`swap_newmember_${interaction.message.id}`).setPlaceholder('Step 1: Select member to ADD...').setMinValues(1).setMaxValues(1)
    );
    await interaction.reply({ content: '🔄 **Swap — Step 1/2:** Select the member to **add**:', components: [row], flags: 64 });
    return;
  }

  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('swap_newmember_')) {
    const msgId    = interaction.customId.split('_')[2];
    const data     = activeEvents.get(msgId);
    if (!data) return;
    const newUserId = interaction.values[0];
    if (data.roster.length === 0) return interaction.update({ content: '❌ Roster is empty.', components: [] });
    const options = data.roster.map(id => {
      const m = interaction.guild.members.cache.get(id);
      return new StringSelectMenuOptionBuilder().setLabel(m ? m.displayName : id).setValue(id).setEmoji('🔴');
    });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`swap_remove_${msgId}_${newUserId}`).setPlaceholder('Step 2: Select member to REMOVE...').addOptions(options.slice(0, 25))
    );
    await interaction.update({ content: `✅ Adding <@${newUserId}>\n\n🔄 **Swap — Step 2/2:** Select the member to **remove**:`, components: [row] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('swap_remove_')) {
    const parts     = interaction.customId.split('_');
    const msgId     = parts[2];
    const newUserId = parts[3];
    const data      = activeEvents.get(msgId);
    if (!data) return;
    const removeUserId = interaction.values[0];
    data.roster = data.roster.filter(x => x !== removeUserId);
    data.roster.push(newUserId);
    data.waitlist = data.waitlist.filter(x => x !== newUserId);
    await updateEventMessage(data);
    await interaction.update({ content: `✅ Swap complete!\n➕ Added: <@${newUserId}>\n➖ Removed: <@${removeUserId}>`, components: [] });
    sendLog(interaction.guild, interaction.user, `Swapped ${removeUserId} → ${newUserId}`, null, data.eventName);
    return;
  }

  if (interaction.isButton() && interaction.customId === 'rosterpingdm') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!canRosterPing(interaction.member)) return interaction.reply({ content: '❌ You don\'t have permission.', flags: 64 });
    await interaction.reply({ content: `📢 Sending DMs to **${data.roster.length}** roster members...`, flags: 64 });
    for (const userId of data.roster) {
      const member = interaction.guild.members.cache.get(userId);
      if (member) {
        try { await member.send(`📢 **${data.eventName.toUpperCase()} — JOIN NOW!**\n\nYou are signed up for **${TITLES[data.eventName]}**.\n\nPlease join the event VC immediately!\n\n— **Stormy | En03 Management**`); } catch {}
      }
    }
    sendLog(interaction.guild, interaction.user, 'Sent Roster Ping DMs', null, data.eventName);
    return;
  }

  if (interaction.isButton() && interaction.customId === 'lock') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    data.locked = true;
    await updateEventMessage(data);
    sendLog(interaction.guild, interaction.user, 'Locked Event', null, data.eventName);
    await interaction.deferUpdate();
    return;
  }

  if (interaction.isButton() && interaction.customId === 'unlock') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    data.locked = false;
    await updateEventMessage(data);
    sendLog(interaction.guild, interaction.user, 'Unlocked Event', null, data.eventName);
    await interaction.deferUpdate();
    return;
  }

  if (interaction.isButton() && interaction.customId === 'end') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    data.signupOpen = false;
    const endEmbed = createEmbed(data.eventName, data.slots, data.roster, data.waitlist, 0, '🔴 Sign up ended by management.', false);
    await data.message.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
    sendLog(interaction.guild, interaction.user, 'Ended Event', null, data.eventName);
    activeEvents.delete(data.message.id);
    await interaction.deferUpdate();
    return;
  }
});

// ── CRON ──────────────────────────────────────────────────

cron.schedule('* * * * *', () => {
  const now      = new Date();
  const gameTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const hour     = gameTime.getHours();
  const minute   = gameTime.getMinutes();

  if (minute === 30) {
    const rpHours = [10, 16, 22];
    let note = 'Join Informal VC 5 minutes before the event starts.';
    if (rpHours.includes(hour)) note = 'Sign up for RP Ticket first if slots available. Only sign up Informal if RP Ticket is full.';
    createEvent('informal', 10, 600, note);
  }
  if ((hour === 3 || hour === 7 || hour === 10 || hour === 22) && minute === 0) createEvent('weapons', 25, 1200, 'Join Event VC 5 minutes before the event starts.');
  if ((hour === 18 && minute === 35) || (hour === 0 && minute === 35)) createEvent('bizzwar', 25, 5100, 'Join Bizwar VC 5 minutes before the event starts.');
  if ((hour === 9 || hour === 15 || hour === 21) && minute === 30) createEvent('rpticket', 25, 3600, 'RP Ticket opens at XX:30.');
  if (hour === 2 && minute === 0) createEvent('hotel', 25, 1800, 'Join Event VC 5 minutes before the event starts.');
  if (hour === 14 && minute === 0) createEvent('foundary', 25, 1200, 'Join Event VC 5 minutes before the event starts.');
  if (hour === 20 && minute === 0) createEvent('vineyard', 25, 1800, 'Join Event VC 5 minutes before the event starts.');
  if (hour === 20 && minute === 30) createEvent('ranking', 25, 1800, 'Join Event VC 5 minutes before the event starts.');
});

cron.schedule('*/5 * * * *', () => { updateIncomingPanel(); });

// ── READY ─────────────────────────────────────────────────

client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} is online`);
  await updateIncomingPanel();
});

client.login(TOKEN);