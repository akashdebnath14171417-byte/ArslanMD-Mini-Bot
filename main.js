// ============================================
// 🌸 ᴀᴋᴀꜱʜ ᴍᴅ ᴍɪɴɪ - FIXED MAIN.JS
// 👑 Developer: ᴀᴋᴀꜱʜ
// ============================================

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    fetchLatestBaileysVersion, // ✅ Aapke code se add kiya
    DisconnectReason,
    jidDecode,
    downloadContentFromMessage,
    getContentType,
} = require('@whiskeysockets/baileys');

const config = require('./config');
const { sms } = require('./lib/msg');
const events = require('./arslan');

const {
    connectdb, saveSessionToMongoDB, getSessionFromMongoDB, deleteSessionFromMongoDB,
    getUserConfigFromMongoDB, updateUserConfigInMongoDB, addNumberToMongoDB,
    removeNumberFromMongoDB, getAllNumbersFromMongoDB, saveOTPToMongoDB,
    verifyOTPFromMongoDB, incrementStats, getStatsForNumber
} = require('./lib/database');

const { handleAntidelete } = require('./lib/antidelete');
const { arslanmd, autoReactChannel, autoHandleStatus } = require('./lib/system');

const express = require('express');
const fs = require('fs-extra');
const fsSync = require('fs'); 
const path = require('path');
const pino = require('pino');
const crypto = require('crypto');
const FileType = require('file-type');
const axios = require('axios');
const moment = require('moment-timezone');
const chalk = require('chalk');

const GroupEvents = require('./lib/groupevents');
const { PresenceControl, BotActivityFilter } = require('./data/presence');
const registerAntiCall = require('./lib/anticall');
const { getPrefix } = require('./lib/prefix');
const { handleReaction } = require('./lib/reaction');
const { fakevCard } = require('./lib/fakevCard');
const AntiDelete = require('./lib/antidelete');

// ========== SETTINGS ==========
const prefix = config.PREFIX || '.';
const mode = config.MODE || 'public';
const BOT_NAME = 'ᴀᴋᴀꜱʜ ᴍᴅ ᴍɪɴɪ'; // ✅ Naam change
const OWNER_NAME = 'ᴀᴋᴀꜱʜ'; 
const OWNER_NUMBER = config.OWNER_NUMBER || ['918967844123'];
const CHANNEL_JID = config.CHANNEL_JID || '120363348739987203@newsletter';

const router = express.Router();
connectdb();

// ========== CACHE & SESSIONS ==========
class SmartCache {
    constructor(maxSize = 300, cleanupInterval = 180000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.statsInterval = setInterval(() => this.logStats(), 1800000);
        this.cleanupInterval = setInterval(() => this.cleanupOld(), cleanupInterval);
    }
    set(key, value, ttl = 3600000) { this.cache.set(key, { value, timestamp: Date.now(), ttl }); }
    get(key) { const item = this.cache.get(key); if (!item || Date.now() - item.timestamp > item.ttl) { this.cache.delete(key); return null; } return item.value; }
    delete(key) { this.cache.delete(key); }
    cleanupOld() { const now = Date.now(); for (const [key, value] of this.cache.entries()) { if (now - value.timestamp > value.ttl) this.cache.delete(key); } }
    logStats() {}
}
const messageCache = new SmartCache(300, 180000);
const groupMetaCache = new SmartCache(100, 300000);

const activeSockets = new Map();
const socketCreationTime = new Map();

function cleanNumber(number) { return String(number || "").replace(/[^0-9]/g, ""); }
function getBotNumber(socket) { try { const id = socket?.user?.id; return id ? cleanNumber(id.includes(":") ? id.split(":")[0] : id.split("@")[0]) : ""; } catch { return ""; } }
function getBotJid(socket) { const num = getBotNumber(socket); return num ? `${num}@s.whatsapp.net` : ""; }
function arslanLog(message, type = 'info') {
    const icons = { info: '📝', success: '✅', error: '❌', warning: '⚠️', debug: '🐛' };
    console.log(`${icons[type]} [ᴀᴋᴀꜱʜ ᴍᴅ ᴍɪɴɪ] ${new Date().toISOString()}: ${message}`); // ✅ Logs me naam
}

// ========== LOAD PLUGINS ==========
const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
const pluginFiles = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
arslanLog(`Loading ${pluginFiles.length} plugins...`, 'info');
for (const file of pluginFiles) {
    try { require(path.join(pluginsDir, file)); } catch (e) { arslanLog(`Failed to load plugin ${file}: ${e.message}`, 'error'); }
}

function createStore() { return { messages: {}, bind(ev) { ev.on('messages.upsert', ({ messages }) => { for (const msg of messages) { const jid = msg.key?.remoteJid; if (!jid) continue; if (!this.messages[jid]) this.messages[jid] = []; this.messages[jid].push(msg); if (this.messages[jid].length > 200) this.messages[jid].shift(); } }); }, async loadMessage(jid, id) { return this.messages[jid]?.find(m => m.key?.id === id) || null; } }; }

// ========== MAIN PAIR FUNCTION ==========
async function arslanPair(number, res = null) {
    let connectionLockKey;
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    try {
        const sessionPath = path.join(__dirname, 'session', `session_${sanitizedNumber}`);
        if (activeSockets.has(sanitizedNumber)) {
            return res?.json({ status: 'already_connected' });
        }

        connectionLockKey = `arslan_lock_${sanitizedNumber}`;
        if (global[connectionLockKey]) return res?.json({ status: 'connection_in_progress' });
        global[connectionLockKey] = true;

        const existingSession = await getSessionFromMongoDB(sanitizedNumber);
        if (!existingSession) {
            if (fs.existsSync(sessionPath)) await fs.remove(sessionPath);
        } else {
            fs.ensureDirSync(sessionPath);
            fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(existingSession, null, 2));
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion(); // ✅ Aapke logic se version fetch
        const store = createStore();

        // ✅ EXACT LOGIC JO AAPNE DIYA THA (Browser & Version)
        const conn = makeWASocket({
            version, // ✅ Version add kiya
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: ["Ubuntu", "Chrome", "20.0.04"], // ✅ Working Browser config
            generatePairingCode: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: false,
            fireInitQueries: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            markOnlineOnConnect: true,
            getMessage: async (key) => {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg?.message || { conversation: BOT_NAME };
            }
        });

        socketCreationTime.set(sanitizedNumber, Date.now());
        activeSockets.set(sanitizedNumber, conn);
        store.bind(conn.ev);
        setupCallHandlers(conn, number);
        setupAutoRestart(conn, number);

        conn.decodeJid = jid => { if (!jid) return jid; if (/:\d+@/gi.test(jid)) { const decode = jidDecode(jid) || {}; return decode.user && decode.server ? decode.user + '@' + decode.server : jid; } return jid; };
        conn.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
            const quoted = message.msg ? message.msg : message; const mime = (message.msg || message).mimetype || '';
            const messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
            const stream = await downloadContentFromMessage(quoted, messageType);
            let buffer = Buffer.from([]); for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            const type = await FileType.fromBuffer(buffer); const trueFileName = attachExtension ? (filename + '.' + type.ext) : filename;
            await fs.writeFileSync(trueFileName, buffer); return trueFileName;
        };

        if (!conn.authState.creds.registered) {
            arslanLog(`🔐 Starting NEW pairing process for ${sanitizedNumber}`, 'info');
            try {
                await delay(6000); // ✅ Aapke code jaisa 6 second ka delay
                let code = await conn.requestPairingCode(sanitizedNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code; // ✅ Hyphen format
                
                arslanLog(`🔑 Pairing Code: ${code}`, 'success');
                if (res && !res.headersSent) res.send({ code, status: 'new_pairing' });
            } catch (error) {
                arslanLog(`Failed to request pairing code: ${error.message}`, 'error');
                if (res && !res.headersSent) res.status(500).send({ error: 'Failed to get pairing code', message: error.message });
                throw error;
            }
        } else {
            arslanLog(`✅ Using existing session for ${sanitizedNumber}`, 'success');
            if (res && !res.headersSent) res.json({ status: 'reconnecting' });
        }

        conn.ev.on('creds.update', async () => {
            await saveCreds();
            const creds = JSON.parse(await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8'));
            await saveSessionToMongoDB(sanitizedNumber, creds);
        });

        conn.ev.on('messages.update', async (updates) => {
            try { if (config.ANTIDELETE === 'true') await handleAntidelete(conn, updates, store, getBotNumber(conn)); } catch (error) {}
        });

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                arslanLog(`Connected: ${sanitizedNumber}`, 'success');
                const userJid = jidNormalizedUser(conn.user.id);
                await addNumberToMongoDB(sanitizedNumber);
                try { await arslanmd(conn); } catch (e) {}
                
                const connectedMsg = `╭────────────────────◇
│✦ *${BOT_NAME} — CONNECTED* 🔥
│✦ Type *${prefix}menu* to see all commands 💫
│✦ Prefix 『 ${prefix} 』  Mode 〔${mode}〕
╰────────────────────○
*© Powered by ${OWNER_NAME}*`;

                if (!existingSession) {
                    try { await conn.sendMessage(userJid, { image: { url: config.IMAGE_PATH || 'https://i.ibb.co/tPBqm8Pj/file-00000000faa8820892863f11bf1c1adc.png' }, caption: connectedMsg }); } catch (e) {}
                }
            }
            if (connection === 'close') {
                if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) arslanLog(`Session logged out.`, 'error');
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
                            await conn.sendMessage(mek.key.remoteJid, { react: { text: emojis[Math.floor(Math.random() * emojis.length)], key: mek.key } }, { statusJidList: [mek.key.participant, botJid] });
                        } catch (e) {}
                    }
                    return;
                }

                if (config.READ_MESSAGE === "true") await conn.readMessages([mek.key]);
                const body = mek.message?.conversation || mek.message?.extendedTextMessage?.text || mek.message?.imageMessage?.caption || mek.message?.videoMessage?.caption || '';
                const from = mek.key.remoteJid;
                const isGroup = from.endsWith("@g.us");
                const sender = mek.key.fromMe ? getBotJid(conn) : (mek.key.participant || mek.key.remoteJid);
                const isOwner = OWNER_NUMBER.includes(cleanNumber(sender)) || mek.key.fromMe;
                const m = sms(conn, mek);

                if (body.startsWith(prefix)) {
                    const cmdName = body.slice(prefix.length).trim().split(" ")[0].toLowerCase();
                    const cmd = events.commands.find(c => c.pattern === cmdName || (c.alias && c.alias.includes(cmdName)));
                    if (cmd) {
                        if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                        try {
                            const args = body.trim().split(/ +/).slice(1);
                            await cmd.function(conn, mek, m, { from, body, isCmd: true, command: cmdName, args, q: args.join(" "), text: args.join(" "), isGroup, sender, isOwner, reply: (text) => conn.sendMessage(from, { text }, { quoted: mek }) });
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        });

    } catch (err) {
        arslanLog(`ᴀᴋᴀꜱʜ ᴍᴅ ᴍɪɴɪ Pair error: ${err.message}`, 'error');
        if (res && !res.headersSent) return res.json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (connectionLockKey) global[connectionLockKey] = false;
    }
}

// ========== HELPER FUNCTIONS ==========
async function setupCallHandlers(socket, number) {
    registerAntiCall(socket, config);
    socket.ev.on('call', async (calls) => {
        try {
            const userConfig = await getUserConfigFromMongoDB(number);
            if (userConfig.ANTI_CALL !== 'true') return;
            for (const call of calls) {
                if (call.status !== 'offer') continue;
                await socket.rejectCall(call.id, call.from);
                await socket.sendMessage(call.from, { text: userConfig.REJECT_MSG || '📵 Call rejected' });
            }
        } catch (err) {}
    });
}

function setupAutoRestart(socket, number) {
    let restartAttempts = 0;
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode === 401) {
                const sanitizedNumber = number.replace(/[^0-9]/g, '');
                activeSockets.delete(sanitizedNumber);
                await deleteSessionFromMongoDB(sanitizedNumber);
                await removeNumberFromMongoDB(sanitizedNumber);
                socket.ev.removeAllListeners();
                return;
            }
            if (restartAttempts < 3) {
                restartAttempts++;
                activeSockets.delete(number.replace(/[^0-9]/g, ''));
                socket.ev.removeAllListeners();
                await delay(10000);
                try { await arslanPair(number, { headersSent: false, json: () => {} }); } catch (e) {}
            }
        }
        if (connection === 'open') restartAttempts = 0;
    });
}

// ========== API ROUTES ==========
router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pair.html')));
router.get('/code', async (req, res) => {
    if (!req.query.number) return res.json({ error: 'Number required' });
    await arslanPair(req.query.number, res);
});

router.get('/ping', (req, res) => res.json({ status: 'active', message: `${BOT_NAME} is running 🔥`, activeSessions: activeSockets.size }));

router.get('/force-code', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: 'Number required' });
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    if (activeSockets.has(sanitizedNumber)) {
        try { await activeSockets.get(sanitizedNumber).ws.close(); activeSockets.delete(sanitizedNumber); } catch (e) {}
    }
    const sessionPath = path.join(__dirname, 'session', `session_${sanitizedNumber}`);
    if (fs.existsSync(sessionPath)) try { await fs.remove(sessionPath); } catch (e) {}
    try { await deleteSessionFromMongoDB(sanitizedNumber); await removeNumberFromMongoDB(sanitizedNumber); } catch (e) {}

    await delay(2000);

    try {
        const sessionPathNew = path.join(__dirname, 'session', `session_${sanitizedNumber}`);
        fs.ensureDirSync(sessionPathNew);
        const { state } = await useMultiFileAuthState(sessionPathNew);
        const { version } = await fetchLatestBaileysVersion();
        
        const conn = makeWASocket({
            version,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            getMessage: async () => ({ conversation: BOT_NAME })
        });

        await delay(6000);
        let code = await conn.requestPairingCode(sanitizedNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        
        await conn.ws.close();
        conn.ev.removeAllListeners();

        setTimeout(async () => {
            try { await arslanPair(sanitizedNumber, { headersSent: false, send: () => {}, json: () => {} }); } catch (e) {}
        }, 3000);

        return res.json({ status: 'success', data: { number: sanitizedNumber, code, status: 'new_pairing' } });
    } catch (error) { return res.status(500).json({ error: error.message }); }
});

// ========== AUTO RECONNECT ==========
setTimeout(async () => {
    try {
        const numbers = await getAllNumbersFromMongoDB();
        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                await arslanPair(number, { headersSent: false, json: () => {} });
                await delay(2000);
            }
        }
    } catch (e) {}
}, 3000);

module.exports = router;
