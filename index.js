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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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

const LOG_CHANNEL             = '1509250768098693180';
const INCOMING_EVENTS_CHANNEL = '1512002502457954395';
const KILL_RECORDS_CHANNEL    = '1513459945343815850';

const CHANNELS = {
  informal: '1457291933054664734',
  weapons:  '1477022345213513780',
  foundry:  '1477022399932403722',
  bizzwar:  '1457292016395223124',
  rpticket: '1457291980731056271',
  hotel:    '1508847720352317572',
  vineyard: '1509221114851627089',
  ranking:  '1477022260274663608',
};

const FAMILY_ROLE = '1450957322015871077';

const PRIORITY_ROLES = [
  '1193690559341133955',
  '1509596474462179468',
  '1508100262206636125',
  '1509213861205508148',
  '1511994771806359704',
];

const STAFF_ROLES = [
  '1394235201743229023',
  '1394235202968223834',
  '1394367808053448835',
];

const KILL_LOG_ROLES = [
  '1193690559341133955',
  '1509596474462179468',
  '1508100262206636125',
  '1509213861205508148',
];

const ROSTER_PING_ROLES = [
  '1394235201743229023',
  '1394235202968223834',
  '1394367808053448835',
  '1394367783495798895',
];

const COLORS = {
  informal: 0x8B5CF6,
  weapons:  0x94A3B8,
  foundry:  0xFBBF24,
  bizzwar:  0xEF4444,
  rpticket: 0xEC4899,
  hotel:    0x22D3EE,
  vineyard: 0x22C55E,
  ranking:  0xF97316,
};

const TITLES = {
  informal: '📝︱𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗟 𝗦𝗜𝗚𝗡 𝗨𝗣',
  weapons:  '⚔️︱𝗪𝗘𝗔𝗣𝗢𝗡𝗦 𝗦𝗜𝗚𝗡 𝗨𝗣',
  foundry:  '🏭︱𝗙𝗢𝗨𝗡𝗗𝗥𝗬 𝗦𝗜𝗚𝗡 𝗨𝗣',
  bizzwar:  '🛡️︱𝗕𝗜𝗭𝗪𝗔𝗥 𝗦𝗜𝗚𝗡 𝗨𝗣',
  rpticket: '🎟️︱𝗥𝗣 𝗧𝗜𝗖𝗞𝗘𝗧 𝗦𝗜𝗚𝗡 𝗨𝗣',
  hotel:    '🏨︱𝗛𝗢𝗧𝗘𝗟 𝗦𝗜𝗚𝗡 𝗨𝗣',
  vineyard: '🍇︱𝗩𝗜𝗡𝗘𝗬𝗔𝗥𝗗 𝗦𝗜𝗚𝗡 𝗨𝗣',
  ranking:  '🏆︱𝗥𝗔𝗡𝗞𝗜𝗡𝗚 𝗕𝗔𝗧𝗧𝗟𝗘 𝗦𝗜𝗚𝗡 𝗨𝗣',
};

const VCS = {
  informal: '1459573885543645366',
  bizzwar:  '1466952631564898335',
  rpticket: '1466952631564898335',
  default:  '1466952631564898335',
};

function getEventVC(eventName) {
  if (eventName === 'informal') return VCS.informal;
  if (eventName === 'bizzwar')  return VCS.bizzwar;
  if (eventName === 'rpticket') return VCS.rpticket;
  return VCS.default;
}

// ── STATE ─────────────────────────────────────────────────
const activeEvents  = new Map();
const killRecords   = new Map(); // userId -> { name, kills: { eventName: count } }
const killLogData   = new Map(); // msgId -> { roster, eventName, killsMap }
let incomingPanelMessage = null;
let killRecordMessage    = null;

// ── HELPERS ───────────────────────────────────────────────

function formatTime(seconds) {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function isStaff(member)      { return STAFF_ROLES.some(r => member.roles.cache.has(r)); }
function canKillLog(member)   { return KILL_LOG_ROLES.some(r => member.roles.cache.has(r)); }
function canRosterPing(member){ return ROSTER_PING_ROLES.some(r => member.roles.cache.has(r)); }
function isFamilyMember(member){ return member.roles.cache.has(FAMILY_ROLE) || isStaff(member); }

function getPriorityScore(member) {
  for (let i = 0; i < PRIORITY_ROLES.length; i++) {
    if (member.roles.cache.has(PRIORITY_ROLES[i])) return i;
  }
  return PRIORITY_ROLES.length;
}

function getVcStatus(guild, userId, eventName) {
  try {
    const member = guild.members.cache.get(userId);
    if (!member || !member.voice.channelId) return '*(not in vc)*';
    return member.voice.channelId === getEventVC(eventName) ? '✅ *(in vc)*' : '⚠️ *(wrong vc)*';
  } catch { return '*(not in vc)*'; }
}

async function sendLog(guild, staffUser, action, targetUser, eventName) {
  const channel = guild.channels.cache.get(LOG_CHANNEL);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setThumbnail(STORMY_LOGO)
    .setTitle('🛡️ HC Event Activity')
    .addFields(
      { name: 'Staff',  value: `<@${staffUser.id}>`, inline: true },
      { name: 'Action', value: action,                inline: true },
      { name: 'Event',  value: eventName,             inline: true },
      { name: 'Target', value: targetUser ? `<@${targetUser.id}>` : 'None', inline: true },
      { name: 'Time',   value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
    )
    .setFooter({ text: 'Stormy | En03', iconURL: STORMY_LOGO });
  channel.send({ embeds: [embed] });
}

// ── EMBED BUILDER ─────────────────────────────────────────

function createEmbed(eventName, slots, roster, waitlist, timeLeft, note, locked, guild, killsMap) {
  const filled     = roster.length;
  const filledBar  = '🟨'.repeat(Math.min(filled, slots)) + '⬜'.repeat(Math.max(0, slots - filled));
  const isEnded    = timeLeft <= 0;

  const rosterText = filled > 0
    ? roster.map((id, i) => {
        const vc    = guild ? getVcStatus(guild, id, eventName) : '';
        const kills = killsMap && killsMap[id] !== undefined ? `  💀 **${killsMap[id]}** kills` : '';
        return `🟢 **${i+1}.** <@${id}> ${vc}${kills}`;
      }).join('\n')
    : Array.from({ length: Math.min(slots, 10) }, (_, i) => `⬛ **${i+1}.** *empty slot*`).join('\n');

  const waitlistText = waitlist.length > 0
    ? waitlist.map((id, i) => `**${i+1}.** <@${id}>`).join('\n')
    : '*No players in waitlist.*';

  const statusLine = isEnded ? '𝗦𝗶𝗴𝗻 𝗨𝗽 𝗖𝗹𝗼𝘀𝗲𝗱' : locked ? '🔒 **SIGNUPS LOCKED**' : '✅ **Signups Open**';

  const fields = [
    { name: '⏳ Starts In',     value: `\`${formatTime(timeLeft)}\``,          inline: true  },
    { name: '👥 Slots',         value: `\`${filled} / ${slots}\``,              inline: true  },
    { name: '📊 Status',        value: statusLine,                               inline: true  },
    { name: '📊 Slot Tracker',  value: filledBar || '⬜'.repeat(slots),          inline: false },
    { name: '👑 Roster',        value: rosterText,                               inline: false },
    { name: '📋 Waitlist',      value: waitlistText,                             inline: false },
  ];

  if (!isEnded && note) {
    fields.push({ name: '📌 Note', value: note, inline: false });
  }

  return new EmbedBuilder()
    .setColor(COLORS[eventName])
    .setAuthor({ name: 'Stormy | En03 — Event Management', iconURL: STORMY_LOGO })
    .setThumbnail(STORMY_LOGO)
    .setTitle(TITLES[eventName])
    .addFields(fields)
    .setFooter({ text: 'Stormy | En03', iconURL: STORMY_LOGO });
}

async function updateEventMessage(data) {
  if (!data || !data.message) return;
  const embed = createEmbed(
    data.eventName, data.slots, data.roster, data.waitlist,
    data.timeLeft, data.note, data.locked, data.message.guild, data.killsMap
  );
  await data.message.edit({ embeds: [embed] }).catch(() => {});
}

// ── BUTTONS ───────────────────────────────────────────────

function getEventButtons(ended) {
  if (ended) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('killlogs').setLabel('💀 Kill Logs').setStyle(ButtonStyle.Danger),
    )];
  }
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('signup').setLabel('Sign Up').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('addplayer').setLabel('Add Player').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lock').setLabel('Lock').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('unlock').setLabel('Unlock').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('end').setLabel('End').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('removeplayer').setLabel('Remove Player').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('swapplayer').setLabel('Swap Player').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rosterpingdm').setLabel('📢 Roster Ping').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dragall').setLabel('🎤 Drag All to VC').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ── DRAG TO VC ────────────────────────────────────────────

async function dragRosterToVC(data, guild) {
  const targetVC = getEventVC(data.eventName);
  for (const userId of data.roster) {
    try {
      const member = guild.members.cache.get(userId);
      if (member && member.voice.channelId && member.voice.channelId !== targetVC) {
        await member.voice.setChannel(targetVC).catch(() => {});
      }
    } catch {}
  }
}

// ── CREATE EVENT ──────────────────────────────────────────

async function createEvent(eventName, slots, duration, note) {
  const channel = await client.channels.fetch(CHANNELS[eventName]).catch(() => null);
  if (!channel) return;
  if (Array.from(activeEvents.values()).find(x => x.eventName === eventName)) return;

  const roster = [], waitlist = [], killsMap = {};
  const embed   = createEmbed(eventName, slots, roster, waitlist, duration, note, false, channel.guild, killsMap);
  const message = await channel.send({ content: `<@&${FAMILY_ROLE}>`, embeds: [embed], components: getEventButtons(false) });

  const eventData = { eventName, slots, roster, waitlist, timeLeft: duration, signupOpen: true, locked: false, message, note, killsMap };
  activeEvents.set(message.id, eventData);

  const interval = setInterval(async () => {
    const data = activeEvents.get(message.id);
    if (!data) { clearInterval(interval); return; }

    data.timeLeft -= 5;

    if (eventName === 'rpticket') {
      if (data.timeLeft <= 1800) data.note = '⚠️ RP Ticket Zone Started. Hurry before XX:45.';
      if (data.timeLeft <= 900)  { data.signupOpen = false; data.note = ''; }
    }

    // VC drag at last 5 min every 60s (every 12 ticks)
    if (data.timeLeft <= 300 && data.timeLeft > 0 && (data.timeLeft / 5) % 12 === 0) {
      await dragRosterToVC(data, message.guild).catch(() => {});
    }

    if (data.timeLeft <= 0) {
      data.signupOpen = false;
      clearInterval(interval);
      const components = eventName !== 'rpticket' ? getEventButtons(true) : [];
      const finishedEmbed = createEmbed(eventName, slots, data.roster, data.waitlist, 0, '', false, message.guild, data.killsMap);
      await message.edit({ embeds: [finishedEmbed], components }).catch(() => {});

      // Store kill log data for the Kill Logs button
      killLogData.set(message.id, {
        roster:    [...data.roster],
        eventName: data.eventName,
        killsMap:  data.killsMap,
        message:   message,
        guild:     message.guild,
      });

      activeEvents.delete(message.id);
      return;
    }

    await updateEventMessage(data);
  }, 5000);
}

// ── KILL RECORDS PANEL ────────────────────────────────────

async function updateKillRecordsPanel() {
  const channel = client.channels.cache.get(KILL_RECORDS_CHANNEL);
  if (!channel) return;

  let description = killRecords.size === 0
    ? '*No kill records yet. Records will appear here after events finish.*'
    : null;

  const fields = [];

  if (killRecords.size > 0) {
    // Total leaderboard
    const totals = Array.from(killRecords.entries()).map(([id, rec]) => ({
      id, name: rec.name, total: Object.values(rec.kills).reduce((a,b) => a+b, 0)
    })).sort((a,b) => b.total - a.total);

    fields.push({
      name: '🏆 Total Kills Leaderboard',
      value: totals.slice(0,10).map((p,i) => `**${i+1}.** ${p.name} — 💀 ${p.total}`).join('\n'),
      inline: false
    });

    // Per event
    const eventNames = ['informal','weapons','foundry','bizzwar','hotel','vineyard','ranking'];
    for (const ev of eventNames) {
      const rows = [];
      for (const [id, rec] of killRecords.entries()) {
        if (rec.kills[ev] !== undefined) rows.push({ name: rec.name, kills: rec.kills[ev] });
      }
      if (rows.length > 0) {
        rows.sort((a,b) => b.kills - a.kills);
        fields.push({
          name: TITLES[ev],
          value: rows.map((r,i) => `**${i+1}.** ${r.name} — 💀 ${r.kills}`).join('\n'),
          inline: false
        });
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setAuthor({ name: 'Stormy | En03 — Kill Records', iconURL: STORMY_LOGO })
    .setThumbnail(STORMY_LOGO)
    .setTitle('💀 Kill Records — All Events')
    .setFooter({ text: 'Stormy | En03 — Updates every 5 seconds', iconURL: STORMY_LOGO })
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields.slice(0, 25));

  if (killRecordMessage) {
    await killRecordMessage.edit({ embeds: [embed] }).catch(async () => {
      killRecordMessage = await channel.send({ embeds: [embed] });
    });
  } else {
    killRecordMessage = await channel.send({ embeds: [embed] });
  }
}

// ── INCOMING EVENTS PANEL ─────────────────────────────────

function getUKNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
}

function secsUntil(h, m) {
  const now = getUKNow();
  const t   = new Date(now); t.setHours(h, m, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return Math.max(0, Math.floor((t - now) / 1000));
}

function secsUntilNext(slots) {
  let min = Infinity;
  for (const s of slots) { const v = secsUntil(s.h, s.m); if (v < min) min = v; }
  return min;
}

function secsUntilNextInformal() {
  const now = getUKNow();
  const t   = new Date(now);
  if (now.getMinutes() < 30) { t.setMinutes(30, 0, 0); }
  else { t.setHours(now.getHours() + 1, 30, 0, 0); }
  return Math.max(0, Math.floor((t - now) / 1000));
}

function isOngoing(eventName) {
  return Array.from(activeEvents.values()).some(e => e.eventName === eventName);
}

async function updateIncomingPanel() {
  const channel = client.channels.cache.get(INCOMING_EVENTS_CHANNEL);
  if (!channel) return;

  const events = [
    { key: 'informal', name: '📝 Informal',      secs: secsUntilNextInformal() },
    { key: 'weapons',  name: '⚔️ Weapons',        secs: secsUntilNext([{h:3,m:0},{h:7,m:0},{h:10,m:0},{h:22,m:0}]) },
    { key: 'bizzwar',  name: '🛡️ Bizwar',         secs: secsUntilNext([{h:18,m:35},{h:0,m:35}]) },
    { key: 'rpticket', name: '🎟️ RP Ticket',      secs: secsUntilNext([{h:9,m:30},{h:15,m:30},{h:21,m:30}]) },
    { key: 'hotel',    name: '🏨 Hotel',           secs: secsUntil(2,0) },
    { key: 'foundry',  name: '🏭 Foundry',         secs: secsUntil(14,0) },
    { key: 'vineyard', name: '🍇 Vineyard',        secs: secsUntil(20,0) },
    { key: 'ranking',  name: '🏆 Ranking Battle',  secs: secsUntil(20,30) },
  ];

  const fields = events.map(e => ({
    name:  e.name,
    value: isOngoing(e.key) ? '🔴 **Ongoing**' : `⏳ \`${formatTime(e.secs)}\``,
    inline: true,
  }));

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setAuthor({ name: 'Stormy | En03 — Event Schedule', iconURL: STORMY_LOGO })
    .setThumbnail(STORMY_LOGO)
    .setTitle('📅 Upcoming Events')
    .setDescription('Countdown updates every 5 seconds • Times in your local timezone')
    .addFields(fields)
    .setFooter({ text: 'Stormy | En03', iconURL: STORMY_LOGO })
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

  // SIGN UP
  if (interaction.isButton() && interaction.customId === 'signup') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!data.signupOpen || data.locked) return interaction.reply({ content: '❌ Signups are closed.', flags: 64 });
    if (!isFamilyMember(interaction.member)) return interaction.reply({ content: '❌ Family members only.', flags: 64 });
    if (data.roster.includes(interaction.user.id)) return interaction.reply({ content: '❌ Already signed up.', flags: 64 });
    const score = getPriorityScore(interaction.member);
    if (data.roster.length < data.slots) {
      let idx = data.roster.length;
      for (let i = 0; i < data.roster.length; i++) {
        const m = interaction.guild.members.cache.get(data.roster[i]);
        if (m && getPriorityScore(m) > score) { idx = i; break; }
      }
      data.roster.splice(idx, 0, interaction.user.id);
    } else {
      if (!data.waitlist.includes(interaction.user.id)) data.waitlist.push(interaction.user.id);
    }
    await updateEventMessage(data);
    await interaction.deferUpdate();
    return;
  }

  // LEAVE
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

  // ADD PLAYER
  if (interaction.isButton() && interaction.customId === 'addplayer') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isFamilyMember(interaction.member)) return interaction.reply({ content: '❌ Family members only.', flags: 64 });
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId(`addplayer_select_${interaction.message.id}`).setPlaceholder('Search and select a member...').setMinValues(1).setMaxValues(1)
    );
    await interaction.reply({ content: '👤 Select a member to add:', components: [row], flags: 64 });
    return;
  }

  // ADD PLAYER SELECT
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('addplayer_select_')) {
    const msgId = interaction.customId.split('_')[2];
    const data  = activeEvents.get(msgId);
    if (!data) return;
    const userId = interaction.values[0];
    if (data.roster.includes(userId) || data.waitlist.includes(userId)) return interaction.update({ content: '❌ Already in roster/waitlist.', components: [] });
    const m = interaction.guild.members.cache.get(userId);
    const score = m ? getPriorityScore(m) : PRIORITY_ROLES.length;
    if (data.roster.length < data.slots) {
      let idx = data.roster.length;
      for (let i = 0; i < data.roster.length; i++) {
        const em = interaction.guild.members.cache.get(data.roster[i]);
        if (em && getPriorityScore(em) > score) { idx = i; break; }
      }
      data.roster.splice(idx, 0, userId);
    } else {
      data.waitlist.push(userId);
    }
    await updateEventMessage(data);
    await interaction.update({ content: `✅ <@${userId}> added!`, components: [] });
    sendLog(interaction.guild, interaction.user, 'Added Player', { id: userId }, data.eventName);
    return;
  }

  // REMOVE PLAYER
  if (interaction.isButton() && interaction.customId === 'removeplayer') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    if (!data.roster.length && !data.waitlist.length) return interaction.reply({ content: '❌ No players.', flags: 64 });
    const options = [];
    if (data.roster.length) {
      options.push(new StringSelectMenuOptionBuilder().setLabel('── ROSTER ──').setValue('header_roster').setDescription('Roster players').setEmoji('👥'));
      for (const id of data.roster) {
        const m = interaction.guild.members.cache.get(id);
        options.push(new StringSelectMenuOptionBuilder().setLabel(`[ROSTER] ${m ? m.displayName : id}`).setValue(`roster_${id}`).setEmoji('🟢'));
      }
    }
    if (data.waitlist.length) {
      options.push(new StringSelectMenuOptionBuilder().setLabel('── WAITLIST ──').setValue('header_waitlist').setDescription('Waitlist players').setEmoji('📋'));
      for (const id of data.waitlist) {
        const m = interaction.guild.members.cache.get(id);
        options.push(new StringSelectMenuOptionBuilder().setLabel(`[WAITLIST] ${m ? m.displayName : id}`).setValue(`waitlist_${id}`).setEmoji('🟡'));
      }
    }
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`remove_select_${interaction.message.id}`).setPlaceholder('Select player to remove...').addOptions(options.slice(0, 25))
    );
    await interaction.reply({ content: '🗑️ Select a player to remove:', components: [row], flags: 64 });
    return;
  }

  // REMOVE SELECT
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('remove_select_')) {
    const msgId = interaction.customId.split('_')[2];
    const data  = activeEvents.get(msgId);
    if (!data) return;
    const value = interaction.values[0];
    if (value.startsWith('header_')) return interaction.update({ content: '❌ Select a player, not a header.', components: [] });
    const [list, userId] = value.split('_');
    if (list === 'roster') {
      data.roster = data.roster.filter(x => x !== userId);
      if (data.waitlist.length && data.roster.length < data.slots) data.roster.push(data.waitlist.shift());
    } else {
      data.waitlist = data.waitlist.filter(x => x !== userId);
    }
    await updateEventMessage(data);
    await interaction.update({ content: `✅ <@${userId}> removed from ${list}!`, components: [] });
    sendLog(interaction.guild, interaction.user, `Removed from ${list}`, { id: userId }, data.eventName);
    return;
  }

  // SWAP PLAYER
  if (interaction.isButton() && interaction.customId === 'swapplayer') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId(`swap_new_${interaction.message.id}`).setPlaceholder('Step 1: Select member to ADD...').setMinValues(1).setMaxValues(1)
    );
    await interaction.reply({ content: '🔄 **Step 1/2** — Select member to **add**:', components: [row], flags: 64 });
    return;
  }

  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('swap_new_')) {
    const msgId     = interaction.customId.replace('swap_new_', '');
    const data      = activeEvents.get(msgId);
    if (!data) return;
    const newUserId = interaction.values[0];
    if (!data.roster.length) return interaction.update({ content: '❌ Roster is empty.', components: [] });
    const options = data.roster.map(id => {
      const m = interaction.guild.members.cache.get(id);
      return new StringSelectMenuOptionBuilder().setLabel(m ? m.displayName : id).setValue(id).setEmoji('🔴');
    });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`swap_rem_${msgId}_${newUserId}`).setPlaceholder('Step 2: Select member to REMOVE...').addOptions(options.slice(0, 25))
    );
    await interaction.update({ content: `✅ Adding <@${newUserId}>\n\n🔄 **Step 2/2** — Select member to **remove**:`, components: [row] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('swap_rem_')) {
    const parts        = interaction.customId.replace('swap_rem_', '').split('_');
    const msgId        = parts[0];
    const newUserId    = parts[1];
    const data         = activeEvents.get(msgId);
    if (!data) return;
    const removeUserId = interaction.values[0];
    data.roster = data.roster.filter(x => x !== removeUserId);
    data.roster.push(newUserId);
    data.waitlist = data.waitlist.filter(x => x !== newUserId);
    await updateEventMessage(data);
    await interaction.update({ content: `✅ Swap done!\n➕ <@${newUserId}>\n➖ <@${removeUserId}>`, components: [] });
    sendLog(interaction.guild, interaction.user, `Swapped`, { id: removeUserId }, data.eventName);
    return;
  }

  // DRAG ALL TO VC
  if (interaction.isButton() && interaction.customId === 'dragall') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    await interaction.reply({ content: '🎤 Dragging all roster members to event VC...', flags: 64 });
    await dragRosterToVC(data, interaction.guild);
    sendLog(interaction.guild, interaction.user, 'Dragged All to VC', null, data.eventName);
    return;
  }

  // ROSTER PING DM
  if (interaction.isButton() && interaction.customId === 'rosterpingdm') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!canRosterPing(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
    await interaction.reply({ content: `📢 Sending DMs to **${data.roster.length}** roster members...`, flags: 64 });
    for (const userId of data.roster) {
      const member = interaction.guild.members.cache.get(userId);
      if (member) { try { await member.send(`📢 **${data.eventName.toUpperCase()} — JOIN NOW!**\n\nYou are signed up for **${TITLES[data.eventName]}**.\n\nPlease join the event VC immediately!\n\n— **Stormy | En03 Management**`); } catch {} }
    }
    sendLog(interaction.guild, interaction.user, 'Sent Roster Ping DMs', null, data.eventName);
    return;
  }

  // LOCK
  if (interaction.isButton() && interaction.customId === 'lock') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    data.locked = true;
    await updateEventMessage(data);
    sendLog(interaction.guild, interaction.user, 'Locked', null, data.eventName);
    await interaction.deferUpdate();
    return;
  }

  // UNLOCK
  if (interaction.isButton() && interaction.customId === 'unlock') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    data.locked = false;
    await updateEventMessage(data);
    sendLog(interaction.guild, interaction.user, 'Unlocked', null, data.eventName);
    await interaction.deferUpdate();
    return;
  }

  // END
  if (interaction.isButton() && interaction.customId === 'end') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    data.signupOpen = false;
    const components  = data.eventName !== 'rpticket' ? getEventButtons(true) : [];
    const finishedEmbed = createEmbed(data.eventName, data.slots, data.roster, data.waitlist, 0, '', false, interaction.guild, data.killsMap);
    await data.message.edit({ embeds: [finishedEmbed], components }).catch(() => {});
    killLogData.set(data.message.id, { roster: [...data.roster], eventName: data.eventName, killsMap: data.killsMap, message: data.message, guild: interaction.guild });
    sendLog(interaction.guild, interaction.user, 'Ended Event', null, data.eventName);
    activeEvents.delete(data.message.id);
    await interaction.deferUpdate();
    return;
  }

  // ── KILL LOGS BUTTON ──
  if (interaction.isButton() && interaction.customId === 'killlogs') {
    if (!canKillLog(interaction.member)) return interaction.reply({ content: '❌ No permission.', flags: 64 });
    const session = killLogData.get(interaction.message.id);
    if (!session || !session.roster.length) return interaction.reply({ content: '❌ No roster data found.', flags: 64 });

    // Build modal with up to 5 players (Discord modal limit is 5 inputs)
    // We show all players listed, staff fill in kills for each in batches of 5
    const roster    = session.roster;
    const batchSize = 5;
    const batch     = roster.slice(0, batchSize);

    const modal = new ModalBuilder()
      .setCustomId(`killog_batch_${interaction.message.id}_0`)
      .setTitle(`Kill Logs (1-${Math.min(batchSize, roster.length)} of ${roster.length})`);

    for (const userId of batch) {
      const m = interaction.guild.members.cache.get(userId);
      const name = m ? m.displayName.substring(0, 20) : userId.substring(0, 20);
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`kills_${userId}`)
            .setLabel(`${name} — Kills`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter kill count e.g. 5')
            .setRequired(false)
            .setMaxLength(3)
        )
      );
    }

    await interaction.showModal(modal);
    return;
  }

  // ── KILL LOG MODAL SUBMIT ──
  if (interaction.isModalSubmit() && interaction.customId.startsWith('killog_batch_')) {
    const parts   = interaction.customId.replace('killog_batch_', '').split('_');
    const msgId   = parts[0];
    const batchIndex = parseInt(parts[1]);
    const session = killLogData.get(msgId);
    if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });

    const batchSize = 5;
    const roster    = session.roster;

    // Save kills from this batch
    for (const [key, value] of interaction.fields.fields) {
      const userId = key.replace('kills_', '');
      const kills  = parseInt(value.value);
      if (!isNaN(kills) && kills >= 0) {
        session.killsMap[userId] = kills;
        const m    = interaction.guild.members.cache.get(userId);
        const name = m ? m.displayName : `User ${userId}`;
        if (!killRecords.has(userId)) killRecords.set(userId, { name, kills: {} });
        killRecords.get(userId).kills[session.eventName] = kills;
        killRecords.get(userId).name = name;
      }
    }

    const nextBatchStart = (batchIndex + 1) * batchSize;

    // If more players remain, show next batch
    if (nextBatchStart < roster.length) {
      const nextBatch = roster.slice(nextBatchStart, nextBatchStart + batchSize);
      const modal = new ModalBuilder()
        .setCustomId(`killog_batch_${msgId}_${batchIndex + 1}`)
        .setTitle(`Kill Logs (${nextBatchStart+1}-${Math.min(nextBatchStart+batchSize, roster.length)} of ${roster.length})`);

      for (const userId of nextBatch) {
        const m    = interaction.guild.members.cache.get(userId);
        const name = m ? m.displayName.substring(0, 20) : userId.substring(0, 20);
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(`kills_${userId}`)
              .setLabel(`${name} — Kills`)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Enter kill count e.g. 5')
              .setRequired(false)
              .setMaxLength(3)
          )
        );
      }
      await interaction.showModal(modal);
      return;
    }

    // All batches done — update embed with kills
    const embed = interaction.message.embeds[0];
    if (embed && session.message) {
      const updatedEmbed = new EmbedBuilder(embed.data);
      const rosterField  = updatedEmbed.data.fields?.find(f => f.name === '👑 Roster');
      if (rosterField) {
        rosterField.value = roster.map((id, i) => {
          const m      = interaction.guild.members.cache.get(id);
          const name   = m ? `<@${id}>` : `<@${id}>`;
          const kills  = session.killsMap[id] !== undefined ? `  💀 **${session.killsMap[id]}** kills` : '';
          const vc     = getVcStatus(interaction.guild, id, session.eventName);
          return `🟢 **${i+1}.** ${name} ${vc}${kills}`;
        }).join('\n');
      }
      await session.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }

    // Log kills to log channel
    const logCh = interaction.guild.channels.cache.get(LOG_CHANNEL);
    if (logCh) {
      const killText = roster.map(id => {
        const m = interaction.guild.members.cache.get(id);
        return `• ${m ? m.displayName : id} — 💀 ${session.killsMap[id] ?? 0} kills`;
      }).join('\n');

      const logEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setThumbnail(STORMY_LOGO)
        .setTitle(`💀 Kill Log — ${TITLES[session.eventName]}`)
        .setDescription(killText)
        .addFields({ name: 'Logged By', value: `<@${interaction.user.id}>`, inline: true })
        .setFooter({ text: 'Stormy | En03', iconURL: STORMY_LOGO })
        .setTimestamp();
      await logCh.send({ embeds: [logEmbed] });
    }

    await interaction.reply({ content: '✅ **Kill logs saved!** Embed and records updated.', flags: 64 });
    return;
  }
});

// ── CRON ──────────────────────────────────────────────────

cron.schedule('* * * * *', () => {
  const now  = new Date();
  const gt   = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const h    = gt.getHours();
  const m    = gt.getMinutes();

  if (m === 30) {
    const rpHours = [10, 16, 22];
    let note = 'Join Informal VC 5 minutes before the event starts.';
    if (rpHours.includes(h)) note = 'Sign up for RP Ticket first if slots available. Only sign up Informal if RP Ticket is full.';
    createEvent('informal', 10, 600, note);
  }
  if ((h === 3 || h === 7 || h === 10 || h === 22) && m === 0) createEvent('weapons', 25, 1200, 'Join Event VC 5 minutes before the event starts.');
  if ((h === 18 && m === 35) || (h === 0 && m === 35)) createEvent('bizzwar', 25, 1800, 'Join Bizwar VC 5 minutes before the event starts.');
  if ((h === 9 || h === 15 || h === 21) && m === 30) createEvent('rpticket', 25, 3600, 'RP Ticket opens at XX:30.');
  if (h === 2 && m === 0) createEvent('hotel', 25, 1200, 'Join Event VC 5 minutes before the event starts.');
  if (h === 14 && m === 0) createEvent('foundry', 25, 1200, 'Join Event VC 5 minutes before the event starts.');
  if (h === 20 && m === 0) createEvent('vineyard', 25, 900, 'Join Event VC 5 minutes before the event starts.');
  if (h === 20 && m === 30) createEvent('ranking', 25, 1200, 'Join Event VC 5 minutes before the event starts.');
});

// Update panels every 5 seconds
setInterval(async () => {
  await updateIncomingPanel().catch(() => {});
  await updateKillRecordsPanel().catch(() => {});
}, 5000);

// ── BOT READY ─────────────────────────────────────────────

client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} is online`);
  await updateIncomingPanel().catch(() => {});
  await updateKillRecordsPanel().catch(() => {});
});

client.login(TOKEN);