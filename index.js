require('dotenv').config();

const {
Client,
GatewayIntentBits,
EmbedBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
Events
} = require('discord.js');

const cron = require('node-cron');

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildVoiceStates,
GatewayIntentBits.MessageContent
]
});

const TOKEN = process.env.TOKEN;

/*
==================================
LOG CHANNEL
==================================
*/

const LOG_CHANNEL =
'1509250768098693180';

/*
==================================
ROLES
==================================
*/

const FAMILY_ROLE =
'1508101062161207437';

const STAFF_ROLES = [

'1508100262206636125',
'1509213861205508148',
'1193690559341133955'
];

/*
==================================
CHANNEL IDS
==================================
*/

const CHANNELS = {

informal:
'1508092919301804102',

weapons:
'1508093012494909470',

foundary:
'1508093240916705289',

bizzwar:
'1508093399100821564',

rpticket:
'1508093533632860200',

hotel:
'1508847720352317572',

vineyard:
'1509221114851627089',

ranking:
'1509221320020463768'
};

/*
==================================
VC IDS
==================================
*/

const VCS = {

informal:
'1508091694590070784',

bizzwar:
'1508091729495068772',

rpticket:
'1508091763951407255',

default:
'1508091802111049888'
};

/*
==================================
COLORS
==================================
*/

const COLORS = {

informal: 0x8B5CF6,
weapons: 0x94A3B8,
foundary: 0xFBBF24,
bizzwar: 0xEF4444,
rpticket: 0xEC4899,
hotel: 0x22D3EE,
vineyard: 0x22C55E,
ranking: 0xF97316
};

/*
==================================
TITLES
==================================
*/

const TITLES = {

informal:
'📝︱𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗟 𝗦𝗜𝗚𝗡 𝗨𝗣',

weapons:
'⚔️︱𝗪𝗘𝗔𝗣𝗢𝗡𝗦 𝗦𝗜𝗚𝗡 𝗨𝗣',

foundary:
'🏭︱𝗙𝗢𝗨𝗡𝗗𝗔𝗥𝗬 𝗦𝗜𝗚𝗡 𝗨𝗣',

bizzwar:
'🛡️︱𝗕𝗜𝗭𝗪𝗔𝗥 𝗦𝗜𝗚𝗡 𝗨𝗣',

rpticket:
'🎟️︱𝗥𝗣 𝗧𝗜𝗖𝗞𝗘𝗧 𝗦𝗜𝗚𝗡 𝗨𝗣',

hotel:
'🏨︱𝗛𝗢𝗧𝗘𝗟 𝗦𝗜𝗚𝗡 𝗨𝗣',

vineyard:
'🍇︱𝗩𝗜𝗡𝗘𝗬𝗔𝗥𝗗 𝗦𝗜𝗚𝗡 𝗨𝗣',

ranking:
'🏆︱𝗥𝗔𝗡𝗞𝗜𝗡𝗚 𝗕𝗔𝗧𝗧𝗟𝗘 𝗦𝗜𝗚𝗡 𝗨𝗣'
};

const activeEvents = new Map();

/*
==================================
FORMAT TIME
==================================
*/

function formatTime(seconds) {

if (seconds < 0)
seconds = 0;

const hrs =
Math.floor(seconds / 3600);

const mins =
Math.floor((seconds % 3600) / 60);

const secs =
seconds % 60;

return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

/*
==================================
STAFF CHECK
==================================
*/

function isStaff(member) {

return STAFF_ROLES.some(role =>
member.roles.cache.has(role)
);
}

/*
==================================
STAFF LOG
==================================
*/

async function sendLog(
guild,
staffUser,
action,
targetUser,
eventName
) {

const channel =
guild.channels.cache.get(
LOG_CHANNEL
);

if (!channel) return;

const embed =
new EmbedBuilder()

.setColor(0x5865F2)

.setDescription(

`# 🛡️ HC EVENT ACTIVITY

**Name** - <@${staffUser.id}>
**Action** - ${action}
**Event** - ${eventName}
**Target** - ${
targetUser
? `<@${targetUser.id}>`
: 'None'
}
**Time** - <t:${Math.floor(Date.now()/1000)}:F>`
);

channel.send({
embeds: [embed]
});
}

/*
==================================
CREATE EMBED
==================================
*/

function createEmbed(
eventName,
slots,
roster,
waitlist,
timeLeft,
note,
locked
) {

const rosterText = roster.length

? roster.map((id, i) =>
`${i + 1}. <@${id}>`
).join('\n')

: Array.from(
{ length: slots },
(_, i) => `${i + 1}.`
).join('\n');

const waitlistText = waitlist.length

? waitlist.map((id, i) =>
`${i + 1}. <@${id}>`
).join('\n')

: 'No players in waitlist.';

return new EmbedBuilder()

.setColor(COLORS[eventName])

.setDescription(

`# ${TITLES[eventName]}

## ⏳ Starts In
\`${formatTime(timeLeft)}\`

## 👥 Members Signed Up
\`${roster.length} / ${slots}\`

${rosterText}

## 📋 Waitlist

${waitlistText}

## 📌 Note

${note}

${locked
? '\n🔒 SIGNUPS LOCKED'
: ''}`
);
}

/*
==================================
UPDATE MESSAGE
==================================
*/

async function updateEventMessage(data) {

if (!data || !data.message)
return;

const updatedEmbed =
createEmbed(

data.eventName,
data.slots,
data.roster,
data.waitlist,
data.timeLeft,
data.note,
data.locked
);

await data.message.edit({

embeds: [updatedEmbed]
}).catch(() => {});
}

/*
==================================
CREATE EVENT
==================================
*/

async function createEvent(
eventName,
slots,
duration,
note
) {

const channel =
await client.channels.fetch(
CHANNELS[eventName]
).catch(() => null);

if (!channel) return;

/*
ANTI DUPLICATE
*/

const existing =
Array.from(activeEvents.values())
.find(
x => x.eventName === eventName
);

if (existing) return;

const roster = [];
const waitlist = [];

const embed =
createEmbed(
eventName,
slots,
roster,
waitlist,
duration,
note,
false
);

const playerButtons =
new ActionRowBuilder()

.addComponents(

new ButtonBuilder()

.setCustomId('signup')

.setLabel('Sign Up')

.setStyle(ButtonStyle.Success),

new ButtonBuilder()

.setCustomId('leave')

.setLabel('Leave')

.setStyle(ButtonStyle.Danger)
);

const staffButtons =
new ActionRowBuilder()

.addComponents(

new ButtonBuilder()

.setCustomId('lock')

.setLabel('Lock')

.setStyle(ButtonStyle.Secondary),

new ButtonBuilder()

.setCustomId('unlock')

.setLabel('Unlock')

.setStyle(ButtonStyle.Success),

new ButtonBuilder()

.setCustomId('end')

.setLabel('End')

.setStyle(ButtonStyle.Danger),

new ButtonBuilder()

.setCustomId('forceadd')

.setLabel('Force Add')

.setStyle(ButtonStyle.Primary),

new ButtonBuilder()

.setCustomId('forceremove')

.setLabel('Remove')

.setStyle(ButtonStyle.Secondary)
);

const message =
await channel.send({

content:
`<@&${FAMILY_ROLE}>`,

embeds: [embed],

components: [
playerButtons,
staffButtons
]
});

const eventData = {

eventName,
slots,
roster,
waitlist,
timeLeft: duration,
signupOpen: true,
locked: false,
message,
note
};

activeEvents.set(
message.id,
eventData
);

/*
==================================
LIVE TIMER
==================================
*/

const interval =
setInterval(async () => {

const data =
activeEvents.get(message.id);

if (!data) {

clearInterval(interval);
return;
}

/*
5 SECOND STABLE TIMER
*/

data.timeLeft -= 5;

/*
RP TICKET LOGIC
*/

if (
eventName === 'rpticket'
) {

if (data.timeLeft <= 1800) {

data.note =
'⚠️ RP Ticket Zone Started. Hurry before XX:45.';
}

if (data.timeLeft <= 900) {

data.signupOpen = false;

data.note =
'🔴 RP Ticket Signups Closed.';
}
}

/*
VC WARNING
*/

if (data.timeLeft === 300) {

let vcId =
VCS.default;

if (eventName === 'informal')
vcId = VCS.informal;

if (eventName === 'bizzwar')
vcId = VCS.bizzwar;

if (eventName === 'rpticket')
vcId = VCS.rpticket;

for (const userId of data.roster) {

const member =
message.guild.members.cache.get(userId);

if (
!member?.voice?.channel ||
member.voice.channel.id !== vcId
) {

try {

await member.send(

`⚠️ EVENT VC WARNING

You signed up for ${eventName}

Please join the required VC immediately.`
);

} catch {}
}
}
}

/*
AUTO END
*/

if (data.timeLeft <= 0) {

data.signupOpen = false;

clearInterval(interval);

const finishedEmbed =
createEmbed(

eventName,
slots,
data.roster,
data.waitlist,
0,
'🏁 SIGN UP CLOSED OR EVENT FINISHED',
false
);

await message.edit({

embeds: [finishedEmbed],
components: []
}).catch(() => {});

activeEvents.delete(message.id);

return;
}

/*
UPDATE EMBED
*/

await updateEventMessage(data);

}, 5000);
}

/*
==================================
BUTTON SYSTEM
==================================
*/

client.on(
Events.InteractionCreate,
async interaction => {

if (!interaction.isButton())
return;

const data =
activeEvents.get(
interaction.message.id
);

if (!data) return;

const member =
interaction.member;

const staff =
isStaff(member);

/*
SIGNUP
*/

if (
interaction.customId ===
'signup'
) {

if (
!data.signupOpen ||
data.locked
) {

return interaction.reply({

content:
'❌ Signups closed.',

flags: 64
});
}

if (
data.roster.includes(
interaction.user.id
)
) {

return interaction.reply({

content:
'❌ Already signed up.',

flags: 64
});
}

if (
data.roster.length >=
data.slots
) {

if (
!data.waitlist.includes(
interaction.user.id
)
) {

data.waitlist.push(
interaction.user.id
);
}

await updateEventMessage(data);

await interaction.deferUpdate();

return;
}

data.roster.push(
interaction.user.id
);

await updateEventMessage(data);

await interaction.deferUpdate();

return;
}

/*
LEAVE
*/

if (
interaction.customId ===
'leave'
) {

data.roster =
data.roster.filter(
x => x !== interaction.user.id
);

data.waitlist =
data.waitlist.filter(
x => x !== interaction.user.id
);

/*
AUTO PROMOTE
*/

if (
data.waitlist.length > 0 &&
data.roster.length < data.slots
) {

const promoted =
data.waitlist.shift();

data.roster.push(promoted);
}

await updateEventMessage(data);

await interaction.deferUpdate();

return;
}

/*
STAFF CHECK
*/

if (!staff) {

return interaction.reply({

content:
'❌ You cannot use this feature.',

flags: 64
});
}

/*
LOCK
*/

if (
interaction.customId ===
'lock'
) {

data.locked = true;

await updateEventMessage(data);

sendLog(
interaction.guild,
interaction.user,
'Locked Event',
null,
data.eventName
);

await interaction.deferUpdate();

return;
}

/*
UNLOCK
*/

if (
interaction.customId ===
'unlock'
) {

data.locked = false;

await updateEventMessage(data);

sendLog(
interaction.guild,
interaction.user,
'Unlocked Event',
null,
data.eventName
);

await interaction.deferUpdate();

return;
}

/*
END
*/

if (
interaction.customId ===
'end'
) {

data.signupOpen = false;

const endEmbed =
createEmbed(

data.eventName,
data.slots,
data.roster,
data.waitlist,
0,
'🔴 SIGN UP ENDED BY MANAGEMENT',
false
);

await data.message.edit({

embeds: [endEmbed],
components: []
}).catch(() => {});

sendLog(
interaction.guild,
interaction.user,
'Ended Event',
null,
data.eventName
);

activeEvents.delete(
data.message.id
);

await interaction.deferUpdate();

return;
}

/*
FORCE ADD
*/

if (
interaction.customId ===
'forceadd'
) {

await interaction.reply({

content:
'Use:\n/add @user',

flags: 64
});

return;
}

/*
FORCE REMOVE
*/

if (
interaction.customId ===
'forceremove'
) {

if (data.roster.length === 0) {

return interaction.reply({

content:
'❌ No players in roster.',

flags: 64
});
}

const removedId =
data.roster.pop();

/*
AUTO PROMOTE
*/

if (
data.waitlist.length > 0
) {

const promoted =
data.waitlist.shift();

data.roster.push(promoted);
}

await updateEventMessage(data);

sendLog(
interaction.guild,
interaction.user,
'Force Removed Player',
{ id: removedId },
data.eventName
);

await interaction.deferUpdate();

return;
}
});

/*
==================================
STAFF COMMANDS
==================================
*/

client.on(
Events.MessageCreate,
async message => {

if (message.author.bot)
return;

if (
!isStaff(message.member)
)
return;

const args =
message.content.split(' ');

const cmd =
args[0]?.toLowerCase();

const latest =
Array.from(
activeEvents.values()
).pop();

if (!latest) return;

/*
ADD
*/

if (cmd === '/add') {

const user =
message.mentions.users.first();

await message.delete().catch(() => {});

if (!user) return;

if (
latest.roster.includes(user.id)
)
return;

if (
latest.roster.length >=
latest.slots
) {

latest.waitlist.push(user.id);

await updateEventMessage(latest);

sendLog(
message.guild,
message.author,
'Added To Waitlist',
user,
latest.eventName
);

return;
}

latest.roster.push(user.id);

await updateEventMessage(latest);

sendLog(
message.guild,
message.author,
'Added Player',
user,
latest.eventName
);

return;
}

/*
REMOVE
*/

if (cmd === '/remove') {

const user =
message.mentions.users.first();

await message.delete().catch(() => {});

if (!user) return;

latest.roster =
latest.roster.filter(
x => x !== user.id
);

latest.waitlist =
latest.waitlist.filter(
x => x !== user.id
);

/*
AUTO PROMOTE
*/

if (
latest.waitlist.length > 0 &&
latest.roster.length < latest.slots
) {

const promoted =
latest.waitlist.shift();

latest.roster.push(promoted);
}

await updateEventMessage(latest);

sendLog(
message.guild,
message.author,
'Removed Player',
user,
latest.eventName
);

return;
}
});

/*
==================================
REAL EVENT SCHEDULES
==================================
*/

cron.schedule('* * * * *', () => {

const now = new Date();

/*
UK TIME
*/

const gameTime = new Date(
now.toLocaleString(
'en-US',
{ timeZone: 'Europe/London' }
)
);

const hour =
gameTime.getHours();

const minute =
gameTime.getMinutes();

/*
==================================
INFORMAL
EVERY HOUR XX:40
START 10 MIN BEFORE
==================================
*/

if (minute === 30) {

const rpHours =
[10,16,22];

let informalNote =
'Join Informal VC 5 minutes before the event starts.';

if (
rpHours.includes(hour)
) {

informalNote =

`As prior to RP Ticket,

Sign up for RP Ticket first if slots are still available.

Only sign up Informal if RP Ticket is full.`;
}

createEvent(
'informal',
10,
600,
informalNote
);
}

/*
==================================
WEAPONS
==================================
*/

if (

(hour === 3 && minute === 0) ||
(hour === 7 && minute === 0) ||
(hour === 10 && minute === 0) ||
(hour === 22 && minute === 0)

) {

createEvent(
'weapons',
25,
1200,
'Join Event VC 5 minutes before the event starts.'
);
}

/*
==================================
BIZWAR
19:05
01:05
START 1 HOUR BEFORE
==================================
*/

if (

(hour === 18 && minute === 5) ||
(hour === 0 && minute === 5)

) {

createEvent(
'bizzwar',
25,
3600,
'Join Bizwar VC 5 minutes before the event starts.'
);
}

/*
==================================
RP TICKET
==================================
*/

if (

(hour === 9 && minute === 30) ||
(hour === 15 && minute === 30) ||
(hour === 21 && minute === 30)

) {

createEvent(
'rpticket',
25,
3600,
'RP Ticket opens at XX:30.'
);
}

/*
==================================
HOTEL
==================================
*/

if (
hour === 1 &&
minute === 50
) {

createEvent(
'hotel',
25,
1800,
'Join Event VC 5 minutes before the event starts.'
);
}

/*
==================================
FOUNDARY
==================================
*/

if (
hour === 14 &&
minute === 0
) {

createEvent(
'foundary',
25,
1200,
'Join Event VC 5 minutes before the event starts.'
);
}

/*
==================================
VINEYARD
EVENT 20:15
SIGNUP 19:45
==================================
*/

if (
hour === 19 &&
minute === 45
) {

createEvent(
'vineyard',
25,
1800,
'Join Event VC 5 minutes before the event starts.'
);
}

/*
==================================
RANKING
EVENT 20:50
SIGNUP 20:30
==================================
*/

if (
hour === 20 &&
minute === 20
) {

createEvent(
'ranking',
25,
1800,
'Join Event VC 5 minutes before the event starts.'
);
}

});

client.once(
Events.ClientReady,
() => {

console.log(
`${client.user.tag} is online`
);
});

client.login(TOKEN);