// ═══════════════════════════════════════════════════════════════════════════
//  █████╗ ██████╗ ███████╗██╗      █████╗  ███╗   ██╗    ███╗   ███╗██████╗ 
// ██╔══██╗██╔══██╗██╔════╝██║     ██╔══██╗████╗  ██║    ████╗ ████║██╔══██╗
// ███████║██████╔╝███████╗██║     ███████║██╔██╗ ██║    ██╔████╔██║██║  ██║
// ██╔══██║██╔══██╗╚════██║██║     ██╔══██║██║╚██╗██║    ██║╚██╔╝██║██║  ██║
// ██║  ██║██║  ██║███████║███████╗██║  ██║██║  ████║     ██║ ╚═╝ ██║██████╔╝
// ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝   ╚═══╝    ╚═╝     ╚═╝╚═════╝ 
// ═══════════════════════════════════════════════════════════════════════════
//                    ARSLAN MD - BOT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const dotenv = require('dotenv');

// ──────────────────────────────────────────────
//  🔄 ENVIRONMENT LOADER
// ──────────────────────────────────────────────
if (fs.existsSync('.env')) {
    dotenv.config({ path: '.env' });
}

// ──────────────────────────────────────────────
//  📦 CONFIGURATION EXPORT
// ──────────────────────────────────────────────
module.exports = {

    // ═══════════════════════════════════════════
    //  🔐 SESSION & DATABASE
    // ═══════════════════════════════════════════

    SESSION_ID: process.env.SESSION_ID || "MINI BOT",

    // ═══════════════════════════════════════════
    //  🔥 DATABASE URL (FIXED)
    // ═══════════════════════════════════════════
    
    // Yahan direct aapka MongoDB URL laga diya gaya hai
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://sujandebnath2578_db_user:07Yhl20Lh3Q0DXH9@cluster0.jablfdh.mongodb.net/arslan_bot?retryWrites=true&w=majority',

    // ═══════════════════════════════════════════
    //  🤖 BOT IDENTITY
    // ═══════════════════════════════════════════
    
    CHANNEL_JID: '120363348739987203@newsletter',
    
    CHANNEL_IDS: [
        '120363348739987203@newsletter'
    ],
    
    REACT_EMOJIS: [
        "🤍", "🥰", "🪸", "🖤", "💜", "💙", "💚", "💛", "🧡", "❤",
        "💝", "⚜️", "〽️", "🍫", "🍧", "🍨", "🍷", "🥃", "😘",
        "🤡", "🤤", "🤠", "🔥", "👑", "💯", "😍", "💖", "✨", "🎉"
    ],

    PREFIX: process.env.PREFIX || '.',

    MODE: process.env.MODE || process.env.WORK_TYPE || 'public',

    BOT_NAME: process.env.BOT_NAME || '💕⃝🕊️ 𝗠𝗶𝘀𝗵𝘂 𝗠𝗗 𝗠𝗶𝗻𝗶 💕⃝🕊️',

    OWNER_NAME: process.env.OWNER_NAME || 'ᴀʀꜱʟᴀɴ-ᴍᴅ',

    OWNER_NUMBER: process.env.OWNER_NUMBER ? 
        process.env.OWNER_NUMBER.split(',') : 
        ['918967844123'],

    BOT_FOOTER: process.env.BOT_FOOTER || '© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴀʀꜱʟᴀɴ-ᴍᴅ',

    // ═══════════════════════════════════════════
    //  👁️ STATUS AUTOMATION
    // ═══════════════════════════════════════════

    AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN || 'true',

    AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT || 'true',

    AUTO_STATUS_EMOJIS: ['❤️', '🔥', '👑', '💯', '😍', '💖', '✨'],

    AUTO_STATUS_REPLY: process.env.AUTO_STATUS_REPLY || 'false',

    AUTO_STATUS_MSG: process.env.AUTO_STATUS_MSG || '❤️ Nice status!',

    // ═══════════════════════════════════════════
    //  💬 PRESENCE & CHAT SETTINGS
    // ═══════════════════════════════════════════

    READ_MESSAGE: process.env.READ_MESSAGE || 'false',

    AUTO_TYPING: process.env.AUTO_TYPING || 'false',

    AUTO_RECORDING: process.env.AUTO_RECORDING || 'false',

    BOT_ONLINE: process.env.BOT_ONLINE || 'true',

    KEEP_ONLINE: process.env.KEEP_ONLINE || 'true',

    // ═══════════════════════════════════════════
    //  🛡️ ANTI-DELETE
    // ═══════════════════════════════════════════

    ANTIDELETE: process.env.ANTIDELETE || 'false',

    ANTIDELETE_NOTIFY: process.env.ANTIDELETE_NOTIFY || 'false',

    // ═══════════════════════════════════════════
    //  📵 ANTI-CALL
    // ═══════════════════════════════════════════

    ANTI_CALL: process.env.ANTI_CALL || 'false',

    REJECT_MSG: process.env.REJECT_MSG || '📵 Call rejected by bot',

    // ═══════════════════════════════════════════
    //  👥 GROUP MANAGEMENT
    // ═══════════════════════════════════════════

    GROUP_WELCOME: process.env.GROUP_WELCOME || 'false',

    GROUP_GOODBYE: process.env.GROUP_GOODBYE || 'false',

    GROUP_PROMOTE: process.env.GROUP_PROMOTE || 'false',

    GROUP_DEMOTE: process.env.GROUP_DEMOTE || 'false',

    WELCOME_MESSAGE: process.env.WELCOME_MESSAGE || '👋 Welcome to the group!',

    GOODBYE_MESSAGE: process.env.GOODBYE_MESSAGE || '👋 Goodbye!',

    // ═══════════════════════════════════════════
    //  📢 CHANNEL SETTINGS
    // ═══════════════════════════════════════════

    AUTO_FOLLOW_CHANNEL: process.env.AUTO_FOLLOW_CHANNEL || 'true',

    AUTO_CHANNEL_REACT: process.env.AUTO_CHANNEL_REACT || 'true',

    AUTO_CHANNEL_REACT_EMOJIS: ['❤️', '🔥', '👑', '💯', '😍', '💖', '✨'],

    // ═══════════════════════════════════════════
    //  🎭 REACTION SETTINGS
    // ═══════════════════════════════════════════

    CUSTOM_REACT: process.env.CUSTOM_REACT || 'false',

    CUSTOM_REACT_EMOJIS: process.env.CUSTOM_REACT_EMOJIS || '💕,👑,♥️,🇵🇰,👑,😘,❤️,🦁,☺️,💫,👍🏻,🙂',

    SEND_UNKNOWN_COMMAND: process.env.SEND_UNKNOWN_COMMAND || 'true',

    // ═══════════════════════════════════════════
    //  🖼️ MEDIA & LINKS
    // ═══════════════════════════════════════════

    IMAGE_PATH: process.env.IMAGE_PATH || 'https://i.ibb.co/tPBqm8Pj/file-00000000faa8820892863f11bf1c1adc.png',

    CHANNEL_LINK: process.env.CHANNEL_LINK || 'https://whatsapp.com/channel/0029VarfjW04tRrmwfb8x306',

    GROUP_LINK: process.env.GROUP_LINK || 'https://chat.whatsapp.com/KCGPeSBdN4d0E7qfQptONd',

    OWNER_LINK: process.env.OWNER_LINK || 'https://wa.me/923237045919',

    REPO: process.env.REPO || 'https://github.com/Arslan-MD/Mishu-MD',

    // ═══════════════════════════════════════════
    //  🐛 DEBUG & LOGGING
    // ═══════════════════════════════════════════

    DEBUG: process.env.DEBUG || 'false',

    LOGGING_ENABLED: process.env.LOGGING_ENABLED || 'true',

    // ═══════════════════════════════════════════
    //  📡 BAILEYS
    // ═══════════════════════════════════════════

    BAILEYS: '@whiskeysockets/baileys',

    // ═══════════════════════════════════════════
    //  🔗 TELEGRAM (Optional)
    // ═══════════════════════════════════════════

    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',

    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || ''

};
