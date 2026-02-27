const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Раздача фронтенда
app.use(express.static(__dirname));

// --- КОНФИГУРАЦИЯ ---
const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8",
    CRYPTO_BOT_TOKEN: "535127:AAviaEd5s4fdrTrHuHpXARM04OXIa7XsEjV",
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416,
    PORT: process.env.PORT || 3000
};

// Подключение БД
mongoose.connect(CONFIG.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(e => console.error('❌ MongoDB Error:', e));

// --- МОДЕЛИ ДАННЫХ ---
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: { type: Number, unique: true },
    balance: { type: Number, default: 100 },
    highScores: {
        sonic: { type: Number, default: 999999 },
        tetris: { type: Number, default: 0 },
        snake: { type: Number, default: 0 },
        bomber: { type: Number, default: 0 },
        gold: { type: Number, default: 0 },
        battleCity: { type: Number, default: 0 },
        roadFighter: { type: Number, default: 0 },
        spaceInvaders: { type: Number, default: 0 },
        airHockey: { type: Number, default: 0 }
    }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String,
    gameType: String,
    betAmount: Number,
    player1Id: Number,
    player2Id: Number,
    score1: { type: Number, default: -1 },
    score2: { type: Number, default: -1 },
    status: { type: String, default: 'waiting' },
    createdAt: { type: Date, default: Date.now }
}));

// --- API ЭНДПОИНТЫ ---

// Получение данных пользователя
app.post('/api/user-data', async (req, res) => {
    try {
        const urlParams = new URLSearchParams(req.body.initData);
        const tgUser = JSON.parse(urlParams.get('user'));
        let user = await User.findOne({ telegramId: tgUser.id });
        if (!user) { user = new User({ telegramId: tgUser.id }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Список лобби
app.get('/api/lobbies', async (req, res) => {
    const lobbies = await Lobby.find({ status: 'waiting' }).sort({ createdAt: -1 });
    res.json(lobbies);
});

// Создание лобби
app.post('/api/lobby/create', async (req, res) => {
    const { telegramId, gameType, betAmount } = req.body;
    const user = await User.findOne({ telegramId });
    if (user.balance < betAmount) return res.json({ success: false, error: 'Недостаточно звезд' });
    
    const lobbyId = 'L' + Date.now();
    const lobby = new Lobby({ lobbyId, gameType, betAmount, player1Id: telegramId });
    await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -betAmount } });
    await lobby.save();
    res.json({ success: true, lobby });
});

// Вход в лобби
app.post('/api/lobby/join', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    const user = await User.findOne({ telegramId });
    const lobby = await Lobby.findOne({ lobbyId, status: 'waiting' });
    if (!lobby || lobby.player1Id === telegramId) return res.json({ success: false });
    if (user.balance < lobby.betAmount) return res.json({ success: false });

    lobby.player2Id = telegramId;
    lobby.status = 'playing';
    await lobby.save();
    await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -lobby.betAmount } });
    res.json({ success: true, lobby });
});

// Статус лобби (для поллинга)
app.post('/api/lobby/status', async (req, res) => {
    const lobby = await Lobby.findOne({ lobbyId: req.body.lobbyId });
    res.json({ lobby });
});

// Сохранение счета
app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;
    const user = await User.findOne({ telegramId });

    // Рекорд
    if (game === 'sonic') {
        if (score < user.highScores.sonic) user.highScores.sonic = score;
    } else {
        if (score > user.highScores[game]) user.highScores[game] = score;
    }
    await user.save();

    // PvP логика
    if (lobbyId) {
        const lobby = await Lobby.findOne({ lobbyId });
        if (lobby.player1Id === telegramId) lobby.score1 = score;
        if (lobby.player2Id === telegramId) lobby.score2 = score;
        
        if (lobby.score1 !== -1 && lobby.score2 !== -1) {
            lobby.status = 'finished';
            let winId = null;
            if (game === 'sonic') { winId = lobby.score1 < lobby.score2 ? lobby.player1Id : lobby.player2Id; }
            else { winId = lobby.score1 > lobby.score2 ? lobby.player1Id : lobby.player2Id; }
            
            const prize = Math.floor(lobby.betAmount * 1.8);
            await User.findOneAndUpdate({ telegramId: winId }, { $inc: { balance: prize } });
        }
        await lobby.save();
    }
    res.json({ success: true });
});

// Запуск
app.listen(CONFIG.PORT, () => console.log(`🚀 Server on port ${CONFIG.PORT}`));
