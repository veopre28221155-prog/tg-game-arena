const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- НАСТРОЙКИ СИСТЕМЫ ---
const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8", 
    CRYPTO_BOT_TOKEN: "535127:AAviaEd5s4fdrTrHuHpXARM04OXIa7XsEjV", 
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, // Сюда падает комиссия 5%
    PORT: process.env.PORT || 3000
};

const RATES = {
    STAR_TO_COIN: 100,    // 1 Звезда = 100 🪙
    USDT_TO_COIN: 5000,   // 1 USDT = 5000 🪙
    MIN_WITHDRAW: 5000    // Минимум для вывода
};

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ DB Connected'));

// МОДЕЛИ
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number,
    username: String,
    balance: { type: Number, default: 0 },
    highScores: { sonic: { type: Number, default: 0 } }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player1Id: Number, player2Id: Number,
    gameType: String, betAmount: { type: Number, default: 0 },
    status: { type: String, default: 'waiting' },
    isFree: { type: Boolean, default: false },
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } }
}));

// МУЛЬТИПЛЕЕР (SOCKET.IO)
io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => socket.join(roomId));

    // Синхронизация кнопок
    socket.on('emu-input', (data) => {
        socket.to(data.roomId).emit('partner-input', data);
    });

    // Финал матча
    socket.on('emu-game-over', async (data) => {
        const lobby = await Lobby.findOne({ lobbyId: data.roomId, status: 'playing' });
        if (!lobby) return;

        if (lobby.player1Id === data.telegramId) lobby.scores.player1 = data.score;
        else lobby.scores.player2 = data.score;
        await lobby.save();

        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            calculateWinner(lobby);
        }
    });
});

async function calculateWinner(lobby) {
    lobby.status = 'finished';
    await lobby.save();

    let winnerId = lobby.scores.player1 > lobby.scores.player2 ? lobby.player1Id : lobby.player2Id;
    
    if (!lobby.isFree && lobby.betAmount > 0) {
        const totalPool = lobby.betAmount * 2;
        const fee = totalPool * 0.05; // ТВОЯ КОМИССИЯ 5%
        const prize = totalPool - fee;

        await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
        await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee } }); // Деньги тебе
        
        io.to(lobby.lobbyId).emit('match-results', { winnerId, prize });
    } else {
        io.to(lobby.lobbyId).emit('match-results', { winnerId, prize: 0 });
    }
}

// API ЭНДПОИНТЫ
app.post('/api/user-data', async (req, res) => {
    const params = new URLSearchParams(req.body.initData);
    const userData = JSON.parse(params.get('user'));
    let user = await User.findOne({ telegramId: userData.id });
    if (!user) { user = new User({ telegramId: userData.id, username: userData.username }); await user.save(); }
    res.json(user);
});

app.post('/api/lobby/create', async (req, res) => {
    const { telegramId, gameType, betAmount, isFree } = req.body;
    if (!isFree) {
        const user = await User.findOne({ telegramId });
        if (user.balance < betAmount) return res.json({ success: false });
        await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -betAmount } });
    }
    const lobby = new Lobby({ lobbyId: 'L_'+Date.now(), creatorId: telegramId, player1Id: telegramId, gameType, betAmount, isFree });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.get('/api/lobbies', async (req, res) => res.json(await Lobby.find({ status: 'waiting', isFree: false })));

app.post('/api/lobby/join', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    const lobby = await Lobby.findOne({ lobbyId, status: 'waiting' });
    const user = await User.findOne({ telegramId });
    if (!lobby || (!lobby.isFree && user.balance < lobby.betAmount)) return res.json({ success: false });

    if (!lobby.isFree) await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -lobby.betAmount } });
    lobby.player2Id = telegramId;
    lobby.status = 'playing';
    await lobby.save();
    io.to(lobbyId).emit('start-match', { game: lobby.gameType });
    res.json({ success: true, lobby });
});

app.post('/api/deposit-stars', async (req, res) => {
    const { telegramId, amount } = req.body;
    const r = await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
        title: `Пополнение ${amount * RATES.STAR_TO_COIN} 🪙`,
        payload: `${telegramId}_${amount}`,
        currency: "XTR", prices: [{ label: "Stars", amount }]
    });
    res.json({ url: r.data.result });
});

app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount } = req.body;
    const user = await User.findOne({ telegramId });
    if (user.balance >= amount && amount >= RATES.MIN_WITHDRAW) {
        await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -amount } });
        const usdtAmount = (amount / RATES.USDT_TO_COIN).toFixed(2);
        await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: CONFIG.ADMIN_ID,
            text: `💰 ЗАЯВКА НА ВЫВОД\nЮзер: ${telegramId}\nСумма: ${amount} 🪙\nК выплате: ${usdtAmount} USDT`
        });
        res.json({ success: true });
    } else res.json({ success: false });
});

httpServer.listen(CONFIG.PORT, () => console.log('🚀 Server running on ' + CONFIG.PORT));
