const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const http = require('http'); 
const WebSocket = require('ws'); 
const path = require('path'); // ДОБАВЛЕНО: для работы с путями к файлам

process.on('uncaughtException', (err) => console.error('Критическая ошибка:', err));
process.on('unhandledRejection', (reason, promise) => console.error('Необработанный промис:', reason));

const app = express();
app.use(express.json());
app.use(cors());

// =========================================================
// 🚀 РАЗДАЧА ИГРЫ (ОТДАЕМ index.html)
// =========================================================
// Когда Telegram открывает корень сайта, мы отправляем ему файл игры
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Если у тебя есть картинки или звуки в папке проекта, раскомментируй строку ниже:
// app.use(express.static(__dirname));

const server = http.createServer(app);

let wss;
try {
    wss = new WebSocket.Server({ server });
    console.log('✅ WebSocket сервер успешно инициализирован');
} catch (e) {
    console.error('❌ Ошибка инициализации WebSocket:', e);
}

const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8", 
    CRYPTO_BOT_TOKEN: "535127:AAviaEd5s4fdrTrHuHpXARM04OXIa7XsEjV", 
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416,
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(e => console.error('❌ MongoDB Connection Error:', e));

const UserSchema = new mongoose.Schema({ telegramId: { type: Number, required: true, unique: true }, balance: { type: Number, default: 0 }, highScores: { sonic: { type: Number, default: 999999 }, tetris: { type: Number, default: 0 }, snake: { type: Number, default: 0 }, battleCity: { type: Number, default: 0 }, bomber: { type: Number, default: 0 }, gold: { type: Number, default: 0 }, roadFighter: { type: Number, default: 0 }, spaceInvaders: { type: Number, default: 0 }, airHockey: { type: Number, default: 0 } }, createdAt: { type: Date, default: Date.now } });
const LobbySchema = new mongoose.Schema({ lobbyId: { type: String, required: true, unique: true }, creatorId: { type: Number, required: true }, player1Id: Number, player2Id: Number, gameType: String, betAmount: { type: Number, default: 0 }, isPrivate: { type: Boolean, default: false }, status: { type: String, default: 'waiting' }, scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } }, createdAt: { type: Date, default: Date.now } });
const MatchHistorySchema = new mongoose.Schema({ winnerId: Number, loserId: Number, gameType: String, betAmount: Number, prize: Number, date: { type: Date, default: Date.now } });

const User = mongoose.model('User', UserSchema);
const Lobby = mongoose.model('Lobby', LobbySchema);
const MatchHistory = mongoose.model('MatchHistory', MatchHistorySchema);

// =========================================================
// 🚀 NEURAL ENGINE: WEBSOCKET СЕРВЕР
// =========================================================
if (wss) {
    wss.on('connection', function connection(ws) {
        console.log('🎮 [AI ENGINE] Игрок подключился к потоку!');

        ws.on('error', console.error); 

        ws.on('message', function incoming(message) {
            console.log('[AI ENGINE] Ввод от игрока:', message.toString());
        });

        const interval = setInterval(() => {
            const dummyFrame = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(dummyFrame);
            }
        }, 100);

        ws.on('close', () => {
            console.log('❌ [AI ENGINE] Игрок отключился от потока');
            clearInterval(interval);
        });
    });
}

// ================= API И ПЛАТЕЖИ =================
app.post('/api/buy-stars', async (req, res) => {
    try {
        const { telegramId, amount } = req.body;
        const response = await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
            title: `Пополнение ${amount} ⭐️`, description: `Звезды для арены`, payload: `${telegramId}_${amount}`,
            provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount }]
        });
        if (response.data.ok) res.json({ invoiceUrl: response.data.result }); else res.status(400).json({ error: 'TG Error' });
    } catch (e) { res.status(500).json({ error: 'Server Error' }); }
});

app.post('/api/telegram-webhook', async (req, res) => {
    try {
        if (req.body.pre_checkout_query) await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/answerPreCheckoutQuery`, { pre_checkout_query_id: req.body.pre_checkout_query.id, ok: true });
        if (req.body.message?.successful_payment) {
            const [userId, stars] = req.body.message.successful_payment.invoice_payload.split('_');
            if (userId && stars) await User.findOneAndUpdate({ telegramId: Number(userId) }, { $inc: { balance: Number(stars) } }, { upsert: true });
        }
    } catch (e) {} res.sendStatus(200);
});

app.post('/api/deposit', async (req, res) => {
    try {
        const response = await axios.post('https://pay.crypt.bot/api/createInvoice', { asset: req.body.asset, amount: req.body.amount.toString(), payload: `${req.body.telegramId}_${req.body.stars}` }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_BOT_TOKEN } });
        if (response.data.ok) res.json({ payUrl: response.data.result.mini_app_invoice_url });
    } catch (e) { res.status(500).json({ error: 'Crypto Error' }); }
});

app.post('/api/crypto-webhook', async (req, res) => {
    try {
        if (req.body?.update_type === 'invoice_paid') {
