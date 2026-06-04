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

// ── CHANNELS ──────────────────────────────────────────────
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

// ── ROLES ─────────────────────────────────────────────────
const FAMILY_ROLE = '1508101062161207437';

const PRIORITY_ROLES = [
  '1193690559341133955', // Founder
  '1509596474462179468', // Co-owner
  '1508100262206636125', // Managing Admin
  '1509213861205508148', // Boss Rank
  '1511994771806359704', // Prior Rank
];

const STAFF_ROLES = [
  '1508100262206636125',
  '1509213861205508148',
  '1193690559341133955',
];

const ROSTER_PING_ROLES = [
  '1193690559341133955', // Founder
  '1509596474462179468', // Co-owner
  '1508100262206636125', // Managing Admin
  '1509213861205508148', // Boss Rank
];

// ── COLORS ────────────────────────────────────────────────
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
  informal: '📝︱𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗟 𝗦𝗜𝗚𝗡 𝗨𝗣',
  weapons:  '⚔️︱𝗪𝗘𝗔𝗣𝗢𝗡𝗦 𝗦𝗜𝗚𝗡 𝗨𝗣',
  foundary: '🏭︱𝗙𝗢𝗨𝗡𝗗𝗔𝗥𝗬 𝗦𝗜𝗚𝗡 𝗨𝗣',
  bizzwar:  '🛡️︱𝗕𝗜𝗭𝗪𝗔𝗥 𝗦𝗜𝗚𝗡 𝗨𝗣',
  rpticket: '🎟️︱𝗥𝗣 𝗧𝗜𝗖𝗞𝗘𝗧 𝗦𝗜𝗚𝗡 𝗨𝗣',
  hotel:    '🏨︱𝗛𝗢𝗧𝗘𝗟 𝗦𝗜𝗚𝗡 𝗨𝗣',
  vineyard: '🍇︱𝗩𝗜𝗡𝗘𝗬𝗔𝗥𝗗 𝗦𝗜𝗚𝗡 𝗨𝗣',
  ranking:  '🏆︱𝗥𝗔𝗡𝗞𝗜𝗡𝗚 𝗕𝗔𝗧𝗧𝗟𝗘 𝗦𝗜𝗚𝗡 𝗨𝗣',
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
    .setThumbnail(STORMY_LOGO)
    .setDescription(
      `# 🛡️ HC EVENT ACTIVITY\n\n**Name** - <@${staffUser.id}>\n**Action** - ${action}\n**Event** - ${eventName}\n**Target** - ${targetUser ? `<@${targetUser.id}>` : 'None'}\n**Time** - <t:${Math.floor(Date.now()/1000)}:F>`
    );
  channel.send({ embeds: [embed] });
}

// ── EMBED BUILDER ─────────────────────────────────────────

function createEmbed(eventName, slots, roster, waitlist, timeLeft, note, locked) {
  const rosterText = roster.length
    ? roster.map((id, i) => `${i+1}. <@${id}>`).join('\n')
    : Array.from({ length: slots }, (_, i) => `${i+1}.`).join('\n');

  const waitlistText = waitlist.length
    ? waitlist.map((id, i) => `${i+1}. <@${id}>`).join('\n')
    : 'No players in waitlist.';

  return new EmbedBuilder()
    .setColor(COLORS[eventName])
    .setThumbnail(STORMY_LOGO)
    .setDescription(
      `# ${TITLES[eventName]}\n\n## ⏳ Starts In\n\`${formatTime(timeLeft)}\`\n\n## 👥 Members Signed Up\n\`${roster.length} / ${slots}\`\n\n${rosterText}\n\n## 📋 Waitlist\n\n${waitlistText}\n\n## 📌 Note\n\n${note}${locked ? '\n\n🔒 SIGNUPS LOCKED' : ''}`
    );
}

// ── UPDATE MESSAGE ────────────────────────────────────────

async function updateEventMessage(data) {
  if (!data || !data.message) return;
  const updatedEmbed = createEmbed(
    data.eventName, data.slots, data.roster,
    data.waitlist, data.timeLeft, data.note, data.locked
  );
  await data.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
}

// ── BUTTONS ───────────────────────────────────────────────

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

// ── CREATE EVENT ──────────────────────────────────────────

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

  // ── LIVE TIMER ──
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
          try { await member.send(`⚠️ EVENT VC WARNING\n\nYou signed up for **${eventName}**\n\nPlease join the required VC immediately.`); } catch {}
        }
      }
    }

    if (data.timeLeft <= 0) {
      data.signupOpen = false;
      clearInterval(interval);
      const finishedEmbed = createEmbed(eventName, slots, data.roster, data.waitlist, 0, '🏁 SIGN UP CLOSED OR EVENT FINISHED', false);
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
  if (ukNow.getMinutes() < 30) {
    next.setMinutes(30, 0, 0);
  } else {
    next.setHours(ukNow.getHours() + 1, 30, 0, 0);
  }
  return Math.floor(next.getTime() / 1000);
}

function getNextBizzwarTime() {
  const now = new Date();
  const ukNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const slots = [{ h: 18, m: 35 }, { h: 0, m: 35 }];
  let earliest = null;
  for (const s of slots) {
    const t = new Date(ukNow);
    t.setHours(s.h, s.m, 0, 0);
    if (t <= ukNow) t.setDate(t.getDate() + 1);
    if (!earliest || t < earliest) earliest = t;
  }
  return Math.floor(earliest.getTime() / 1000);
}

function getNextRpTicketTime() {
  const now = new Date();
  const ukNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const slots = [{ h: 9, m: 30 }, { h: 15, m: 30 }, { h: 21, m: 30 }];
  let earliest = null;
  for (const s of slots) {
    const t = new Date(ukNow);
    t.setHours(s.h, s.m, 0, 0);
    if (t <= ukNow) t.setDate(t.getDate() + 1);
    if (!earliest || t < earliest) earliest = t;
  }
  return Math.floor(earliest.getTime() / 1000);
}

function getNextWeaponsTime() {
  const now = new Date();
  const ukNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const slots = [{ h: 3, m: 0 }, { h: 7, m: 0 }, { h: 10, m: 0 }, { h: 22, m: 0 }];
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
    .setThumbnail(STORMY_LOGO)
    .setTitle('📅 Upcoming Events')
    .setDescription('All times shown in your local time automatically!')
    .addFields(
      { name: '📝 Informal',        value: `<t:${getNextInformalTime()}:R>`,              inline: false },
      { name: '⚔️ Weapons',         value: `<t:${getNextWeaponsTime()}:R>`,               inline: false },
      { name: '🛡️ Bizwar',          value: `<t:${getNextBizzwarTime()}:R>`,               inline: false },
      { name: '🎟️ RP Ticket',       value: `<t:${getNextRpTicketTime()}:R>`,              inline: false },
      { name: '🏨 Hotel',           value: `<t:${getNextEventTime(2, 0)}:R>`,             inline: false },
      { name: '🏭 Foundary',        value: `<t:${getNextEventTime(14, 0)}:R>`,            inline: false },
      { name: '🍇 Vineyard',        value: `<t:${getNextEventTime(20, 0)}:R>`,            inline: false },
      { name: '🏆 Ranking Battle',  value: `<t:${getNextEventTime(20, 30)}:R>`,           inline: false },
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

// ── INTERACTION HANDLER ───────────────────────────────────

client.on(Events.InteractionCreate, async interaction => {

  // ── SIGN UP BUTTON ──
  if (interaction.isButton() && interaction.customId === 'signup') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;

    if (!data.signupOpen || data.locked) {
      return interaction.reply({ content: '❌ Signups are closed.', flags: 64 });
    }
    if (!isFamilyMember(interaction.member)) {
      return interaction.reply({ content: '❌ Only family members can sign up.', flags: 64 });
    }
    if (data.roster.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ You are already signed up.', flags: 64 });
    }

    const member = interaction.member;
    const score  = getPriorityScore(member);

    if (data.roster.length < data.slots) {
      // Find insertion point based on priority
      let insertIndex = data.roster.length;
      for (let i = 0; i < data.roster.length; i++) {
        const existingMember = interaction.guild.members.cache.get(data.roster[i]);
        if (existingMember && getPriorityScore(existingMember) > score) {
          insertIndex = i;
          break;
        }
      }
      data.roster.splice(insertIndex, 0, interaction.user.id);
    } else {
      if (!data.waitlist.includes(interaction.user.id)) {
        data.waitlist.push(interaction.user.id);
      }
    }

    await updateEventMessage(data);
    await interaction.deferUpdate();
    return;
  }

  // ── LEAVE BUTTON ──
  if (interaction.isButton() && interaction.customId === 'leave') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;

    data.roster   = data.roster.filter(x => x !== interaction.user.id);
    data.waitlist = data.waitlist.filter(x => x !== interaction.user.id);

    if (data.waitlist.length > 0 && data.roster.length < data.slots) {
      data.roster.push(data.waitlist.shift());
    }

    await updateEventMessage(data);
    await interaction.deferUpdate();
    return;
  }

  // ── ADD PLAYER BUTTON (all family) ──
  if (interaction.isButton() && interaction.customId === 'addplayer') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isFamilyMember(interaction.member)) {
      return interaction.reply({ content: '❌ Only family members can use this.', flags: 64 });
    }

    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`addplayer_select_${interaction.message.id}`)
        .setPlaceholder('Search and select a member to add...')
        .setMinValues(1)
        .setMaxValues(1)
    );

    await interaction.reply({ content: '👤 Select a member to add:', components: [row], flags: 64 });
    return;
  }

  // ── ADD PLAYER SELECT ──
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
        const existingMember = interaction.guild.members.cache.get(data.roster[i]);
        if (existingMember && getPriorityScore(existingMember) > score) {
          insertIndex = i;
          break;
        }
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

  // ── REMOVE PLAYER BUTTON (staff only) ──
  if (interaction.isButton() && interaction.customId === 'removeplayer') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    }

    if (data.roster.length === 0 && data.waitlist.length === 0) {
      return interaction.reply({ content: '❌ No players to remove.', flags: 64 });
    }

    const options = [];

    if (data.roster.length > 0) {
      options.push(new StringSelectMenuOptionBuilder()
        .setLabel('── ROSTER ──')
        .setValue('header_roster')
        .setDescription('Players currently in roster')
        .setEmoji('👥')
      );
      for (const id of data.roster) {
        const m = interaction.guild.members.cache.get(id);
        const name = m ? m.displayName : id;
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`[ROSTER] ${name}`)
          .setValue(`roster_${id}`)
          .setEmoji('🟢')
        );
      }
    }

    if (data.waitlist.length > 0) {
      options.push(new StringSelectMenuOptionBuilder()
        .setLabel('── WAITLIST ──')
        .setValue('header_waitlist')
        .setDescription('Players currently in waitlist')
        .setEmoji('📋')
      );
      for (const id of data.waitlist) {
        const m = interaction.guild.members.cache.get(id);
        const name = m ? m.displayName : id;
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`[WAITLIST] ${name}`)
          .setValue(`waitlist_${id}`)
          .setEmoji('🟡')
        );
      }
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`remove_select_${interaction.message.id}`)
        .setPlaceholder('Select a player to remove...')
        .addOptions(options.slice(0, 25))
    );

    await interaction.reply({ content: '🗑️ Select a player to remove:', components: [row], flags: 64 });
    return;
  }

  // ── REMOVE SELECT ──
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('remove_select_')) {
    const msgId = interaction.customId.split('_')[2];
    const data  = activeEvents.get(msgId);
    if (!data) return;

    const value = interaction.values[0];
    if (value.startsWith('header_')) {
      return interaction.update({ content: '❌ That is a header, not a player. Please select a player.', components: [] });
    }

    const [list, userId] = value.split('_');

    if (list === 'roster') {
      data.roster = data.roster.filter(x => x !== userId);
      if (data.waitlist.length > 0 && data.roster.length < data.slots) {
        data.roster.push(data.waitlist.shift());
      }
    } else {
      data.waitlist = data.waitlist.filter(x => x !== userId);
    }

    await updateEventMessage(data);
    await interaction.update({ content: `✅ <@${userId}> has been removed from ${list}!`, components: [] });
    sendLog(interaction.guild, interaction.user, `Removed from ${list}`, { id: userId }, data.eventName);
    return;
  }

  // ── SWAP PLAYER BUTTON ──
  if (interaction.isButton() && interaction.customId === 'swapplayer') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Staff only.', flags: 64 });
    }

    // Step 1: select any server member to ADD
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`swap_newmember_${interaction.message.id}`)
        .setPlaceholder('Step 1: Select the member to ADD to roster...')
        .setMinValues(1)
        .setMaxValues(1)
    );

    await interaction.reply({ content: '🔄 **Swap Player — Step 1/2**\nSelect the member you want to **add** to the roster:', components: [row], flags: 64 });
    return;
  }

  // ── SWAP STEP 1: new member selected ──
  if (interaction.isUserSelectMenu() && interaction.customId.startsWith('swap_newmember_')) {
    const msgId    = interaction.customId.split('_')[2];
    const data     = activeEvents.get(msgId);
    if (!data) return;

    const newUserId = interaction.values[0];

    if (data.roster.length === 0) {
      return interaction.update({ content: '❌ Roster is empty, nothing to swap.', components: [] });
    }

    // Step 2: select who to REMOVE from roster
    const options = data.roster.map(id => {
      const m    = interaction.guild.members.cache.get(id);
      const name = m ? m.displayName : id;
      return new StringSelectMenuOptionBuilder()
        .setLabel(name)
        .setValue(id)
        .setEmoji('🔴');
    });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`swap_remove_${msgId}_${newUserId}`)
        .setPlaceholder('Step 2: Select the member to REMOVE from roster...')
        .addOptions(options.slice(0, 25))
    );

    await interaction.update({ content: `✅ Adding <@${newUserId}>\n\n🔄 **Swap Player — Step 2/2**\nNow select the member to **remove** from the roster:`, components: [row] });
    return;
  }

  // ── SWAP STEP 2: remove selected ──
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
    await interaction.update({
      content: `✅ Swap complete!\n➕ Added: <@${newUserId}>\n➖ Removed: <@${removeUserId}>`,
      components: []
    });

    sendLog(interaction.guild, interaction.user, `Swapped ${removeUserId} → ${newUserId}`, null, data.eventName);
    return;
  }

  // ── ROSTER PING DM ──
  if (interaction.isButton() && interaction.customId === 'rosterpingdm') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;

    if (!canRosterPing(interaction.member)) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this.', flags: 64 });
    }

    await interaction.reply({ content: `📢 Sending DMs to **${data.roster.length}** roster members...`, flags: 64 });

    let sent = 0;
    let failed = 0;

    for (const userId of data.roster) {
      const member = interaction.guild.members.cache.get(userId);
      if (member) {
        try {
          await member.send(
            `📢 **${data.eventName.toUpperCase()} EVENT — JOIN NOW!**\n\nYou are signed up for the **${TITLES[data.eventName]}** event.\n\nPlease join the event VC immediately!\n\n— **Stormy | En03 Management**`
          );
          sent++;
        } catch { failed++; }
      }
    }

    sendLog(interaction.guild, interaction.user, 'Sent Roster Ping DMs', null, data.eventName);
    return;
  }

  // ── LOCK ──
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

  // ── UNLOCK ──
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

  // ── END ──
  if (interaction.isButton() && interaction.customId === 'end') {
    const data = activeEvents.get(interaction.message.id);
    if (!data) return;
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Staff only.', flags: 64 });

    data.signupOpen = false;
    const endEmbed = createEmbed(data.eventName, data.slots, data.roster, data.waitlist, 0, '🔴 SIGN UP ENDED BY MANAGEMENT', false);
    await data.message.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
    sendLog(interaction.guild, interaction.user, 'Ended Event', null, data.eventName);
    activeEvents.delete(data.message.id);
    await interaction.deferUpdate();
    return;
  }
});

// ── CRON SCHEDULES ────────────────────────────────────────

cron.schedule('* * * * *', () => {
  const now      = new Date();
  const gameTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const hour     = gameTime.getHours();
  const minute   = gameTime.getMinutes();

  // Informal — every hour at XX:30
  if (minute === 30) {
    const rpHours = [10, 16, 22];
    let informalNote = 'Join Informal VC 5 minutes before the event starts.';
    if (rpHours.includes(hour)) {
      informalNote = `As prior to RP Ticket,\n\nSign up for RP Ticket first if slots are still available.\n\nOnly sign up Informal if RP Ticket is full.`;
    }
    createEvent('informal', 10, 600, informalNote);
  }

  // Weapons — 03:00, 07:00, 10:00, 22:00
  if ((hour === 3 || hour === 7 || hour === 10 || hour === 22) && minute === 0) {
    createEvent('weapons', 25, 1200, 'Join Event VC 5 minutes before the event starts.');
  }

  // Bizwar — 18:35 and 00:35 (1 hr 25 min = 5100s before event at 20:00 / 02:00)
  if ((hour === 18 && minute === 35) || (hour === 0 && minute === 35)) {
    createEvent('bizzwar', 25, 5100, 'Join Bizwar VC 5 minutes before the event starts.');
  }

  // RP Ticket — 09:30, 15:30, 21:30
  if ((hour === 9 || hour === 15 || hour === 21) && minute === 30) {
    createEvent('rpticket', 25, 3600, 'RP Ticket opens at XX:30.');
  }

  // Hotel — 02:00
  if (hour === 2 && minute === 0) {
    createEvent('hotel', 25, 1800, 'Join Event VC 5 minutes before the event starts.');
  }

  // Foundary — 14:00
  if (hour === 14 && minute === 0) {
    createEvent('foundary', 25, 1200, 'Join Event VC 5 minutes before the event starts.');
  }

  // Vineyard — 20:00
  if (hour === 20 && minute === 0) {
    createEvent('vineyard', 25, 1800, 'Join Event VC 5 minutes before the event starts.');
  }

  // Ranking Battle — 20:30
  if (hour === 20 && minute === 30) {
    createEvent('ranking', 25, 1800, 'Join Event VC 5 minutes before the event starts.');
  }
});

// Update incoming events panel every 5 minutes
cron.schedule('*/5 * * * *', () => {
  updateIncomingPanel();
});

// ── BOT READY ─────────────────────────────────────────────

client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} is online`);
  await updateIncomingPanel();
});

client.login(TOKEN);