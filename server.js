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

// КОНФИГУРАЦИЯ
const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8", 
    CRYPTO_BOT_TOKEN: "535127:AAviaEd5s4fdrTrHuHpXARM04OXIa7XsEjV", 
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416,
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ MongoDB Connected'));

// МОДЕЛИ ДАННЫХ
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    balance: { type: Number, default: 0 },
    highScores: { sonic: { type: Number, default: 999999 }, mk: { type: Number, default: 0 } }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player1Id: Number, player2Id: Number,
    gameType: String, betAmount: { type: Number, default: 0 },
    status: { type: String, default: 'waiting' },
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } },
    createdAt: { type: Date, default: Date.now }
}));

// ================= ЛОГИКА МУЛЬТИПЛЕЕРА (SOCKETS) =================
io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`Игрок вошел в комнату: ${roomId}`);
    });

    // Ретрансляция нажатий кнопок (Player 1 <-> Player 2)
    socket.on('emu-input', (data) => {
        socket.to(data.roomId).emit('partner-input', data);
    });

    // Завершение матча и расчет выигрыша
    socket.on('emu-game-over', async (data) => {
        const lobby = await Lobby.findOne({ lobbyId: data.roomId, status: 'playing' });
        if (!lobby) return;

        if (lobby.player1Id === data.telegramId) lobby.scores.player1 = data.score;
        else lobby.scores.player2 = data.score;
        await lobby.save();

        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            lobby.status = 'finished';
            await lobby.save();

            let winnerId = null;
            // Логика победы (в Сонике меньше - лучше, в МК больше - лучше)
            if (lobby.gameType.includes('sonic')) {
                winnerId = lobby.scores.player1 < lobby.scores.player2 ? lobby.player1Id : lobby.player2Id;
            } else {
                winnerId = lobby.scores.player1 > lobby.scores.player2 ? lobby.player1Id : lobby.player2Id;
            }

            if (lobby.betAmount > 0) {
                const totalPool = lobby.betAmount * 2;
                const fee = Math.floor(totalPool * 0.05); // Твои 5%
                const prize = totalPool - fee;

                await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
                await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee } });
                
                io.to(data.roomId).emit('match-results', { winnerId, prize });
            }
        }
    });
});

// ================= ТВОИ API ЭНДПОИНТЫ (ПЛАТЕЖИ, ЛОББИ) =================
app.post('/api/user-data', async (req, res) => {
    const userData = JSON.parse(new URLSearchParams(req.body.initData).get('user'));
    let user = await User.findOne({ telegramId: userData.id });
    if (!user) { user = new User({ telegramId: userData.id }); await user.save(); }
    res.json(user);
});

app.post('/api/lobby/create', async (req, res) => {
    const { telegramId, gameType, betAmount, isPrivate } = req.body;
    const user = await User.findOne({ telegramId });
    if (betAmount > 0 && user.balance < betAmount) return res.json({ success: false, error: 'Нет звезд' });
    
    if (betAmount > 0) { user.balance -= betAmount; await user.save(); }
    const lobby = new Lobby({ 
        lobbyId: 'L_' + Date.now(), creatorId: telegramId, player1Id: telegramId, 
        gameType, betAmount, isPrivate 
    });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.post('/api/lobby/join', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    const user = await User.findOne({ telegramId });
    const lobby = await Lobby.findOne({ lobbyId, status: 'waiting' });
    if (!lobby) return res.json({ success: false, error: 'Нет лобби' });
    if (lobby.betAmount > 0 && user.balance < lobby.betAmount) return res.json({ success: false, error: 'Нет звезд' });

    if (lobby.betAmount > 0) { user.balance -= lobby.betAmount; await user.save(); }
    lobby.player2Id = telegramId;
    lobby.status = 'playing';
    await lobby.save();
    res.json({ success: true, lobby });
});

// Добавь сюда свои остальные API (buy-stars, deposit и т.д.) из старого кода

httpServer.listen(CONFIG.PORT, () => console.log('✅ Server + Sockets running on port ' + CONFIG.PORT));
