// ============================================
// 🌸 AKASH-MD MINI - FIXED MAIN.JS
// 👑 Developer: ᴀᴋᴀꜱʜ
// ============================================

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    Browsers,
    DisconnectReason,
    jidDecode,
    downloadContentFromMessage,
    getContentType,
} = require('@whiskeysockets/baileys');

// ========== SETTINGS.JS SE FETCH ==========
const config = require('./config');
const { sms } = require('./lib/msg');
const events = require('./arslan');

const {
    connectdb,
    saveSessionToMongoDB,
    getSessionFromMongoDB,
    deleteSessionFromMongoDB,
    getUserConfigFromMongoDB,
    updateUserConfigInMongoDB,
    addNumberToMongoDB,
    removeNumberFromMongoDB,
    getAllNumbersFromMongoDB,
    saveOTPToMongoDB,
    verifyOTPFromMongoDB,
    incrementStats,
    getStatsForNumber
} = require('./lib/database');

// ========== ANTI-DELETE FIXED IMPORT ==========
const { handleAntidelete } = require('./lib/antidelete');

// ========== 🆕 SYSTEM FUNCTIONS ==========
const { 
    arslanmd, 
    autoReactChannel, 
    autoHandleStatus,
    reactToChannelPost,
    CHANNEL_IDS,
    REACT_EMOJIS 
} = require('./lib/system');

const express = require('express');
const fs = require('fs-extra');
const fsSync = require('fs'); // ✅ FIXED: fsSync missing tha
const path = require('path');
const pino = require('pino');
const crypto = require('crypto');
const FileType = require('file-type');
const axios = require('axios');
const moment = require('moment-timezone');
const chalk = require('chalk');

// ========== IMPORT FEATURES ==========
const GroupEvents = require('./lib/groupevents');
const { PresenceControl, BotActivityFilter } = require('./data/presence');
const registerAntiCall = require('./lib/anticall');
const { getPrefix } = require('./lib/prefix');
const { handleReaction } = require('./lib/reaction');
const { fakevCard } = require('./lib/fakevCard');
const AntiDelete = require('./lib/antidelete');

// ========== SETTINGS.JS SE VALUES ==========
const prefix = config.PREFIX || '.';
const mode = config.MODE || config.WORK_TYPE || 'public';
const BOT_NAME = config.BOT_NAME || 'ᴀᴋᴀꜱʜ ᴍᴅ';
const OWNER_NAME = config.OWNER_NAME || 'ᴀᴋᴀꜱʜ';
const OWNER_NUMBER = config.OWNER_NUMBER || ['918967844123'];

// ========== CHANNEL SETTINGS ==========
const CHANNEL_JID = config.CHANNEL_JID || '120363348739987203@newsletter';
const AUTO_CHANNEL_REACT_EMOJIS = config.AUTO_CHANNEL_REACT_EMOJIS || ['❤️', '🔥', '👑', '💯', '😍', '💖', '✨'];

const router = express.Router();
connectdb();

// ========== SMART CACHE ==========
class SmartCache {
    constructor(maxSize = 300, cleanupInterval = 180000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.hits = 0;
        this.misses = 0;
        this.statsInterval = setInterval(() => this.logStats(), 1800000);
        this.cleanupInterval = setInterval(() => this.cleanupOld(), cleanupInterval);
    }

    set(key, value, ttl = 3600000) {
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }
        this.cache.set(key, {
            value,
            timestamp: Date.now(),
            ttl,
            lastAccess: Date.now()
        });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.misses++;
            return null;
        }
        if (Date.now() - item.timestamp > item.ttl) {
            this.cache.delete(key);
            this.misses++;
            return null;
        }
        item.lastAccess = Date.now();
        this.hits++;
        return item.value;
    }

    delete(key) { this.cache.delete(key); }
    clear() { this.cache.clear(); this.hits = 0; this.misses = 0; }

    evictLRU() {
        if (this.cache.size === 0) return;
        let lruKey = null;
        let lruTime = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (value.lastAccess < lruTime) {
                lruTime = value.lastAccess;
                lruKey = key;
            }
        }
        if (lruKey) {
            this.cache.delete(lruKey);
        }
    }

    cleanupOld() {
        const now = Date.now();
        let deleted = 0;
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > value.ttl) {
                this.cache.delete(key);
                deleted++;
            }
        }
    }

    logStats() {
        const total = this.hits + this.misses;
        if (total === 0) return;
        const hitRate = Math.round((this.hits / total) * 100);
        this.hits = 0;
        this.misses = 0;
    }

    destroy() {
        clearInterval(this.statsInterval);
        clearInterval(this.cleanupInterval);
        this.clear();
    }
}

// ========== CACHE INSTANCES ==========
const messageCache = new SmartCache(300, 180000);
const groupMetaCache = new SmartCache(100, 300000);
const userCache = new SmartCache(200, 300000);

// ========== ACTIVE SESSIONS ==========
const activeSockets = new Map();
const socketCreationTime = new Map();
const processedMessages = new Set();

// ========== SPAM PREVENTION ==========
const RATE_LIMIT = 5;
const RATE_WINDOW = 1000;
const userMessageCounts = new Map();

function checkRateLimit(senderNumber) {
    const now = Date.now();
    const userData = userMessageCounts.get(senderNumber) || { count: 0, timestamp: now };
    if (now - userData.timestamp > RATE_WINDOW) {
        userData.count = 1;
        userData.timestamp = now;
    } else {
        userData.count++;
    }
    userMessageCounts.set(senderNumber, userData);
    return userData.count <= RATE_LIMIT;
}

// ========== STORE ==========
function createStore() {
    const store = {
        messages: {},
        bind(ev) {
            ev.on('messages.upsert', ({ messages }) => {
                for (const msg of messages) {
                    const jid = msg.key && msg.key.remoteJid;
                    if (!jid) continue;
                    if (!store.messages[jid]) store.messages[jid] = [];
                    store.messages[jid].push(msg);
                    if (store.messages[jid].length > 200) store.messages[jid].shift();
                }
            });
        },
        async loadMessage(jid, id) {
            if (!store.messages[jid]) return null;
            return store.messages[jid].find(m => m.key && m.key.id === id) || null;
        }
    };
    return store;
}

const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);

// ========== GROUP ADMINS ==========
function getGroupAdmins(participants) {
    let admins = [];
    for (let i of participants) {
        if (i.admin === 'admin' || i.admin === 'superadmin') {
            admins.push(i.id);
        }
    }
    return admins;
}

// ========== NUMBER HELPERS ==========
function cleanNumber(number) {
    return String(number || "").replace(/[^0-9]/g, "");
}

function getBotNumber(socket) {
    try {
        const id = socket?.user?.id;
        if (!id) return "";
        return cleanNumber(id.includes(":") ? id.split(":")[0] : id.split("@")[0]);
    } catch { return ""; }
}

function getBotJid(socket) {
    const num = getBotNumber(socket);
    return num ? `${num}@s.whatsapp.net` : "";
}

function isNumberAlreadyConnected(number) {
    return activeSockets.has(number.replace(/[^0-9]/g, ''));
}

function getConnectionStatus(number) {
    const n = number.replace(/[^0-9]/g, '');
    const isConnected = activeSockets.has(n);
    const connectionTime = socketCreationTime.get(n);
    return {
        isConnected,
        connectionTime: connectionTime ? new Date(connectionTime).toLocaleString() : null,
        uptime: connectionTime ? Math.floor((Date.now() - connectionTime) / 1000) : 0
    };
}

function arslanLog(message, type = 'info') {
    const icons = { info: '📝', success: '✅', error: '❌', warning: '⚠️', debug: '🐛' };
    console.log(`${icons[type] || '📝'} [AKASH-MD-MINI] ${new Date().toISOString()}: ${message}`);
}

// ========== LOAD PLUGINS ==========
const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
const pluginFiles = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
arslanLog(`Loading ${pluginFiles.length} plugins...`, 'info');
for (const file of pluginFiles) {
    try { require(path.join(pluginsDir, file)); }
    catch (e) { arslanLog(`Failed to load plugin ${file}: ${e.message}`, 'error'); }
}

// ========== EXTRACT MESSAGE BODY ==========
function extractMessageBody(mek) {
    const msg = mek.message;
    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    if (msg.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg.videoMessage?.caption) return msg.videoMessage.caption;
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId)
        return msg.listResponseMessage.singleSelectReply.selectedRowId;
    if (msg.buttonsResponseMessage?.selectedButtonId)
        return msg.buttonsResponseMessage.selectedButtonId;
    if (msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const params = JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            return params.id || params.selected_id || '';
        } catch (e) {}
    }
    if (msg.templateButtonReplyMessage?.selectedId) {
        return msg.templateButtonReplyMessage.selectedId;
    }
    return '';
}

// ========== EXTRACT BUTTON ID ==========
function extractButtonId(mek) {
    try {
        const msg = mek.message;
        const interactive = msg.interactiveResponseMessage;
        if (!interactive) return null;

        if (interactive?.nativeFlowResponseMessage?.paramsJson) {
            try {
                const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                return params.id || params.selected_id || null;
            } catch (e) {}
        }

        if (interactive?.singleSelectResponse?.selectedRowId) {
            return interactive.singleSelectResponse.selectedRowId;
        }

        if (interactive?.buttonResponse?.selectedButtonId) {
            return interactive.buttonResponse.selectedButtonId;
        }

        if (msg?.templateButtonReplyMessage?.selectedId) {
            return msg.templateButtonReplyMessage.selectedId;
        }

        return null;
    } catch { return null; }
}

// ========== FIND COMMAND ==========
function findCommand(cmdName) {
    try {
        const events = require("./arslan");
        const name = String(cmdName || "").trim().toLowerCase();
        return events.commands.find(cmd =>
            String(cmd.pattern || "").toLowerCase() === name ||
            (cmd.alias && cmd.alias.map(a => String(a).toLowerCase()).includes(name))
        );
    } catch { return null; }
}

// ========== HELPER FUNCTIONS ==========
async function handleReactDirect(adminNumber, channelId, postId, emojis, count) {
    const allUsers = Array.from(activeSockets.keys());
    let reactingUsers = allUsers.filter(u => u !== adminNumber);

    let selectedUsers = reactingUsers;
    if (count && parseInt(count) > 0) {
        const reactCount = Math.min(parseInt(count), reactingUsers.length);
        const shuffled = reactingUsers.sort(() => 0.5 - Math.random());
        selectedUsers = shuffled.slice(0, reactCount);
    }

    if (selectedUsers.length === 0) {
        return { error: 'No other users available to react' };
    }

    const channelJid = channelId.includes('@') ? channelId : `${channelId}@newsletter`;
    const fullPostId = postId.includes('_') ? postId : `${channelId}_${postId}`;

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const userNumber of selectedUsers) {
        try {
            const socket = activeSockets.get(userNumber);
            if (!socket) continue;

            const userJid = jidNormalizedUser(socket.user.id);
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

            await socket.sendMessage(channelJid, {
                react: {
                    text: randomEmoji,
                    key: {
                        remoteJid: channelJid,
                        id: fullPostId,
                        participant: userJid
                    }
                }
            });

            results.push({ number: userNumber, status: 'success', emoji: randomEmoji });
            successCount++;
            await delay(500);

        } catch (error) {
            results.push({ number: userNumber, status: 'failed', error: error.message });
            failCount++;
        }
    }

    return { channelId, postId, emojis, totalUsers: allUsers.length, reactingUsers: selectedUsers.length, successCount, failCount, results };
}

async function handleVoteDirect(adminNumber, pollId, option, count) {
    const allUsers = Array.from(activeSockets.keys());
    let votingUsers = allUsers.filter(u => u !== adminNumber);

    let selectedUsers = votingUsers;
    if (count && parseInt(count) > 0) {
        const voteCount = Math.min(parseInt(count), votingUsers.length);
        const shuffled = votingUsers.sort(() => 0.5 - Math.random());
        selectedUsers = shuffled.slice(0, voteCount);
    }

    if (selectedUsers.length === 0) {
        return { error: 'No other users available to vote' };
    }

    let pollJid = pollId;
    let pollMessageId = pollId;

    if (pollId.includes('_')) {
        const parts = pollId.split('_');
        if (parts.length === 2) {
            pollJid = parts[0];
            pollMessageId = parts[1];
        }
    }

    if (!pollJid.includes('@')) {
        pollJid = `${pollJid}@g.us`;
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const userNumber of selectedUsers) {
        try {
            const socket = activeSockets.get(userNumber);
            if (!socket) continue;

            await socket.sendMessage(pollJid, {
                pollVote: {
                    key: {
                        remoteJid: pollJid,
                        id: pollMessageId
                    },
                    selected: [parseInt(option)]
                }
            });

            results.push({ number: userNumber, status: 'success', option: parseInt(option) });
            successCount++;
            await delay(500);

        } catch (error) {
            results.push({ number: userNumber, status: 'failed', error: error.message });
            failCount++;
        }
    }

    return { pollId, option: parseInt(option), totalUsers: allUsers.length, votingUsers: selectedUsers.length, successCount, failCount, results };
}

// ========== MAIN PAIR FUNCTION ==========
async function arslanPair(number, res = null) {
    let connectionLockKey;
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    try {
        const sessionPath = path.join(__dirname, 'session', `session_${sanitizedNumber}`);

        if (isNumberAlreadyConnected(sanitizedNumber)) {
            const status = getConnectionStatus(sanitizedNumber);
            if (res && !res.headersSent) {
                return res.json({ status: 'already_connected', message: 'Number is already connected', connectionTime: status.connectionTime, uptime: `${status.uptime} seconds` });
            }
            return;
        }

        connectionLockKey = `arslan_lock_${sanitizedNumber}`;
        if (global[connectionLockKey]) {
            if (res && !res.headersSent) return res.json({ status: 'connection_in_progress' });
            return;
        }
        global[connectionLockKey] = true;

        const existingSession = await getSessionFromMongoDB(sanitizedNumber);

        if (!existingSession) {
            arslanLog(`No MongoDB session for ${sanitizedNumber} — new pairing required`, 'info');
            if (fs.existsSync(sessionPath)) {
                await fs.remove(sessionPath);
                arslanLog(`Cleaned leftover local session for ${sanitizedNumber}`, 'info');
            }
        } else {
            fs.ensureDirSync(sessionPath);
            fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(existingSession, null, 2));
            arslanLog(`🔄 Restored existing session from MongoDB for ${sanitizedNumber}`, 'success');
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });
        const store = createStore();

        // ✅ Yahan aapke diye hue browser array ko set kar diya gaya hai
        const conn = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: false,
            fireInitQueries: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            markOnlineOnConnect: true,
            browser: ["Ubuntu", "Chrome", "20.0.04"], // ✅ FIXED: Working browser array
            getMessage: async (key) => {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg && msg.message ? msg.message : { conversation: BOT_NAME };
            }
        });

        socketCreationTime.set(sanitizedNumber, Date.now());
        activeSockets.set(sanitizedNumber, conn);
        store.bind(conn.ev);

        setupCallHandlers(conn, number);
        setupAutoRestart(conn, number);

        conn.decodeJid = jid => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                const decode = jidDecode(jid) || {};
                return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
            }
            return jid;
        };

        conn.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
            const quoted = message.msg ? message.msg : message;
            const mime = (message.msg || message).mimetype || '';
            const messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
            const stream = await downloadContentFromMessage(quoted, messageType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            const type = await FileType.fromBuffer(buffer);
            const trueFileName = attachExtension ? (filename + '.' + type.ext) : filename;
            await fs.writeFileSync(trueFileName, buffer);
            return trueFileName;
        };

        if (!conn.authState.creds.registered) {
            arslanLog(`🔐 Starting NEW pairing process for ${sanitizedNumber}`, 'info');
            try {
                await delay(2000); 
                const code = await conn.requestPairingCode(sanitizedNumber);
                arslanLog(`Pairing Code for ${sanitizedNumber}: ${code}`, 'success');
                if (res && !res.headersSent) {
                    res.send({ code, status: 'new_pairing' });
                }
            } catch (error) {
                arslanLog(`Failed to request pairing code: ${error.message}`, 'error');
                if (res && !res.headersSent) {
                    res.status(500).send({ error: 'Failed to get pairing code', status: 'error', message: error.message });
                }
                throw error;
            }
        } else {
            arslanLog(`✅ Using existing session for ${sanitizedNumber}`, 'success');
            if (res && !res.headersSent) {
                res.json({ status: 'reconnecting', message: 'Reconnecting with existing session' });
            }
        }

        conn.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            const creds = JSON.parse(fileContent);
            const existingSessionCheck = await getSessionFromMongoDB(sanitizedNumber);
            const isNewSession = !existingSessionCheck;
            await saveSessionToMongoDB(sanitizedNumber, creds);
            if (isNewSession) {
                arslanLog(`🎉 NEW user ${sanitizedNumber} successfully registered!`, 'success');
            }
        });

        conn.ev.on('messages.update', async (updates) => {
            try {
                if (config.ANTIDELETE === 'true') {
                    const botNum = getBotNumber(conn);
                    if (typeof handleAntidelete === 'function') {
                        await handleAntidelete(conn, updates, store, botNum);
                    }
                }
            } catch (error) {}
        });

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                arslanLog(`Connected: ${sanitizedNumber}`, 'success');
                const userJid = jidNormalizedUser(conn.user.id);
                await addNumberToMongoDB(sanitizedNumber);
                
                try {
                    await arslanmd(conn);
                } catch (e) {}
                
                const connectedMsg = `╭────────────────────◇
│✦ *${BOT_NAME} — CONNECTED* 🔥
│✦ Type *${prefix}menu* to see all commands 💫
│✦ Prefix 『 ${prefix} 』  Mode 〔${mode}〕
│✦ 📢 Channels: Followed ✅
│✦ ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
╰────────────────────○
*© Powered by ${OWNER_NAME}*`;

                if (!existingSession) {
                    try {
                        await conn.sendMessage(userJid, {
                            image: { url: config.IMAGE_PATH || 'https://i.ibb.co/tPBqm8Pj/file-00000000faa8820892863f11bf1c1adc.png' },
                            caption: connectedMsg
                        });
                    } catch (e) {}
                }
            }
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === DisconnectReason.loggedOut) arslanLog(`Session logged out.`, 'error');
            }
        });

        conn.ev.on('messages.upsert', async (msg) => {
            try {
                let mek = msg.messages[0];
                if (!mek.message) return;

                await autoReactChannel(conn, mek);

                if (mek.key.remoteJid === "status@broadcast") {
                    await autoHandleStatus(conn, mek);
                    if (config.AUTO_STATUS_SEEN === "true") { try { await conn.readMessages([mek.key]); } catch (e) {} }
                    if (config.AUTO_STATUS_REACT === "true") {
                        try {
                            const botJid = await conn.decodeJid(conn.user.id);
                            const emojis = config.AUTO_STATUS_EMOJIS || ['❤️', '🔥'];
                            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                            await conn.sendMessage(mek.key.remoteJid, { react: { text: randomEmoji, key: mek.key } }, { statusJidList: [mek.key.participant, botJid] });
                        } catch (e) {}
                    }
                    return;
                }

                if (mek.message && mek.key?.id) messageCache.set(mek.key.id, mek);
                if (config.READ_MESSAGE === "true") await conn.readMessages([mek.key]);

                const buttonId = extractButtonId(mek);
                if (buttonId) {
                    const cmd = findCommand(buttonId);
                    if (cmd) {
                        const from = mek.key.remoteJid;
                        const m = sms(conn, mek);
                        const isGroup = from.endsWith("@g.us");
                        const botJid = getBotJid(conn);
                        const sender = mek.key.fromMe ? botJid : (mek.key.participant || from);
                        const isOwner = OWNER_NUMBER.includes(cleanNumber(sender)) || mek.key.fromMe;

                        try {
                            await cmd.function(conn, mek, m, {
                                from, body: buttonId, isCmd: true, command: buttonId, args: [], q: "", text: "",
                                isGroup, sender, isOwner, reply: (text) => conn.sendMessage(from, { text }, { quoted: mek })
                            });
                        } catch (e) {}
                        return;
                    }
                }

                const m = sms(conn, mek);
                const from = mek.key.remoteJid;
                const isGroup = from.endsWith("@g.us");
                const botJid = getBotJid(conn);
                const sender = mek.key.fromMe ? botJid : (mek.key.participant || mek.key.remoteJid);
                const senderNumber = cleanNumber(sender);
                const isOwner = OWNER_NUMBER.includes(senderNumber) || mek.key.fromMe;

                const body = extractMessageBody(mek);
                const isCmd = body.startsWith(prefix);

                if (!mek.message?.reactionMessage && config.CUSTOM_REACT === "true") {
                    const reactions = (config.CUSTOM_REACT_EMOJIS || "🥲,😂").split(",");
                    m.react(reactions[Math.floor(Math.random() * reactions.length)]);
                }
                if (mek.message?.reactionMessage) handleReaction(m, true, senderNumber, getBotNumber(conn), config);

                let bannedUsers = [];
                try {
                    if (fsSync.existsSync("./lib/ban.json")) bannedUsers = JSON.parse(fsSync.readFileSync("./lib/ban.json", "utf-8"));
                } catch (e) {}
                if (bannedUsers.includes(senderNumber) && !isOwner) return;

                if (isCmd) {
                    const cmdName = body.slice(prefix.length).trim().split(" ")[0].toLowerCase();
                    const cmd = events.commands.find(cmd => cmd.pattern === cmdName || (cmd.alias && cmd.alias.includes(cmdName)));

                    if (cmd) {
                        if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                        try {
                            const args = body.trim().split(/ +/).slice(1);
                            await cmd.function(conn, mek, m, {
                                from, body, isCmd, command: cmdName, args, q: args.join(" "), text: args.join(" "),
                                isGroup, sender, senderNumber, pushname: mek.pushName || "User",
                                isMe: mek.key.fromMe, isOwner, isCreator: isOwner, reply: (text) => conn.sendMessage(from, { text }, { quoted: mek })
                            });
                        } catch (e) {}
                    }
                }

                events.commands.forEach(async (command) => {
                    if (body && command.on === "body") {
                        try { await command.function(conn, mek, m, { from, body, isCmd, isGroup, sender, senderNumber, isOwner, reply: (text) => conn.sendMessage(from, { text }, { quoted: mek }) }); } catch (e) {}
                    }
                });

            } catch (e) {}
        });

    } catch (err) {
        arslanLog(`AKASH-MD-MINI Pair error: ${err.message}`, 'error');
        if (res && !res.headersSent) return res.json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (connectionLockKey) global[connectionLockKey] = false;
    }
}

// ========== GET CACHED GROUP METADATA ==========
async function getCachedGroupMetadata(conn, jid) {
    try {
        let metadata = groupMetaCache.get(jid);
        if (!metadata) {
            if (!conn.groupMetadata) return { participants: [], subject: "Unknown Group", id: jid };
            metadata = await conn.groupMetadata(jid);
            if (!metadata.participants || !Array.isArray(metadata.participants)) metadata.participants = [];
            groupMetaCache.set(jid, metadata, 300000);
        }
        return metadata;
    } catch (error) { return { participants: [], subject: "Unknown Group", id: jid }; }
}

// ========== CALL HANDLERS ==========
async function setupCallHandlers(socket, number) {
    registerAntiCall(socket, config);
    socket.ev.on('call', async (calls) => {
        try {
            const userConfig = await getUserConfigFromMongoDB(number);
            if (userConfig.ANTI_CALL !== 'true') return;
            for (const call of calls) {
                if (call.status !== 'offer') continue;
                await socket.rejectCall(call.id, call.from);
                await socket.sendMessage(call.from, { text: userConfig.REJECT_MSG || config.REJECT_MSG || '📵 Call rejected by bot' });
            }
        } catch (err) {}
    });
}

// ========== AUTO RESTART ==========
function setupAutoRestart(socket, number) {
    let restartAttempts = 0;
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 401) {
                const sanitizedNumber = number.replace(/[^0-9]/g, '');
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                await deleteSessionFromMongoDB(sanitizedNumber);
                await removeNumberFromMongoDB(sanitizedNumber);
                socket.ev.removeAllListeners();
                return;
            }
            if (restartAttempts < 3) {
                restartAttempts++;
                const sanitizedNumber = number.replace(/[^0-9]/g, '');
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                socket.ev.removeAllListeners();
                await delay(10000);
                try { await arslanPair(number, { headersSent: false, json: () => {} }); } catch (e) {}
            }
        }
        if (connection === 'open') restartAttempts = 0;
    });
}

// ============================================
// 🔥 API ROUTES
// ============================================

router.get('/force-code', async (req, res) => {
    try {
        const { number } = req.query;
        if (!number) return res.status(400).json({ status: 'error', message: 'Number required' });
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (activeSockets.has(sanitizedNumber)) {
            try { await activeSockets.get(sanitizedNumber).ws.close(); activeSockets.delete(sanitizedNumber); } catch (error) {}
        }

        const sessionPath = path.join(__dirname, 'session', `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) try { await fs.remove(sessionPath); } catch (error) {}
        
        try { await deleteSessionFromMongoDB(sanitizedNumber); await removeNumberFromMongoDB(sanitizedNumber); } catch (error) {}

        await delay(2000);

        try {
            const sessionPathNew = path.join(__dirname, 'session', `session_${sanitizedNumber}`);
            fs.ensureDirSync(sessionPathNew);
            const { state } = await useMultiFileAuthState(sessionPathNew);
            
            const conn = makeWASocket({
                auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                connectTimeoutMs: 60000,
                browser: ["Ubuntu", "Chrome", "20.0.04"], // ✅ Yahan bhi lagaya
                getMessage: async () => ({ conversation: BOT_NAME })
            });

            await delay(2000);
            const code = await conn.requestPairingCode(sanitizedNumber);
            await conn.ws.close();
            conn.ev.removeAllListeners();

            setTimeout(async () => {
                try { await arslanPair(sanitizedNumber, { headersSent: false, send: () => {}, json: () => {} }); } catch (e) {}
            }, 3000);

            return res.json({ status: 'success', data: { number: sanitizedNumber, code: code, status: 'new_pairing' } });
        } catch (error) {
            return res.status(500).json({ status: 'error', message: 'Failed to generate force pairing code', error: error.message });
        }
    } catch (error) { return res.status(500).json({ status: 'error', message: 'Force pairing failed', error: error.message }); }
});

router.get('/force-reset', async (req, res) => {
    try {
        const { number } = req.query;
        if (!number) return res.status(400).json({ status: 'error', message: 'Number required' });
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        if (activeSockets.has(sanitizedNumber)) {
            try { await activeSockets.get(sanitizedNumber).ws.close(); activeSockets.delete(sanitizedNumber); } catch (error) {}
        }

        const sessionPath = path.join(__dirname, 'session', `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) try { await fs.remove(sessionPath); } catch (error) {}
        try { await deleteSessionFromMongoDB(sanitizedNumber); await removeNumberFromMongoDB(sanitizedNumber); } catch (error) {}

        for (const [key] of messageCache.cache) { if (key.includes(sanitizedNumber)) messageCache.delete(key); }

        return res.json({ status: 'success', message: 'Force reset completed.' });
    } catch (error) { return res.status(500).json({ status: 'error', message: 'Force reset failed', error: error.message }); }
});

router.get('/check-session', async (req, res) => {
    try {
        const { number } = req.query;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const isActive = activeSockets.has(sanitizedNumber);
        let hasMongoSession = false;
        try { hasMongoSession = !!(await getSessionFromMongoDB(sanitizedNumber)); } catch (_) {}
        const hasLocalSession = fs.existsSync(path.join(__dirname, 'session', `session_${sanitizedNumber}`));

        return res.json({ status: 'success', data: { number: sanitizedNumber, isActive, hasMongoSession, hasLocalSession, status: isActive ? 'connected' : (hasMongoSession ? 'session_exists' : 'new_user') } });
    } catch (error) { return res.status(500).json({ status: 'error', message: 'Failed to check session', error: error.message }); }
});

router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pair.html')));
router.get('/code', async (req, res) => {
    if (!req.query.number) return res.json({ error: 'Number required' });
    await arslanPair(req.query.number, res);
});

router.get('/ping', (req, res) => res.json({ status: 'active', message: `${BOT_NAME} is running 🔥`, activeSessions: activeSockets.size }));

router.get('/active', (req, res) => res.json({ count: activeSockets.size, numbers: Array.from(activeSockets.keys()) }));

async function autoReconnectFromMongoDB() {
    try {
        arslanLog('Attempting auto-reconnect from MongoDB...', 'info');
        const numbers = await getAllNumbersFromMongoDB();
        if (!numbers.length) return;
        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                await arslanPair(number, { headersSent: false, json: () => {} });
                await delay(2000);
            }
        }
    } catch (e) {}
}

setTimeout(() => { autoReconnectFromMongoDB(); }, 3000);

process.on('exit', () => {
    activeSockets.forEach((socket) => { try { socket.ws.close(); } catch (_) {} });
    const sessionDir = path.join(__dirname, 'session');
    if (fs.existsSync(sessionDir)) fs.emptyDirSync(sessionDir);
});

module.exports = router;
