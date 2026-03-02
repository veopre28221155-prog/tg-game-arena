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

const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8", 
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, 
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI).then(async () => {
    console.log('✅ DB Connected');
    // Очистка старых зависших лобби при старте
    await Lobby.deleteMany({ status: { $ne: 'finished' } });
});

// МОДЕЛИ
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number, username: String, balance: { type: Number, default: 0 }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player2Id: Number,
    gameType: String, betAmount: { type: Number, default: 0 },
    status: { type: String, default: 'waiting' },
    isPrivate: { type: Boolean, default: false },
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } },
    createdAt: { type: Date, default: Date.now, expires: 3600 } // Удалять через час
}));

// SOCKETS (Связь игроков)
io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`Socket joined room: ${roomId}`);
    });

    socket.on('emu-input', (data) => {
        socket.to(data.roomId).emit('partner-input', data);
    });

    socket.on('match-finished', async (data) => {
        const lobby = await Lobby.findOne({ lobbyId: data.roomId, status: 'playing' });
        if (!lobby) return;
        if (lobby.creatorId === data.telegramId) lobby.scores.player1 = data.score;
        else lobby.scores.player2 = data.score;
        await lobby.save();
        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            const winnerId = lobby.scores.player1 > lobby.scores.player2 ? lobby.creatorId : lobby.player2Id;
            const prize = (lobby.betAmount * 2) * 0.95;
            if (lobby.betAmount > 0) {
                await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
                await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: (lobby.betAmount * 2) * 0.05 } });
            }
            lobby.status = 'finished'; await lobby.save();
            io.to(lobby.lobbyId).emit('results', { winnerId, prize });
        }
    });
});

// API
app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        let user = await User.findOne({ telegramId: userData.id });
        if (!user) { user = new User({ telegramId: userData.id, username: userData.username, balance: 5000 }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).send("Auth error"); }
});

app.post('/api/lobby/create', async (req, res) => {
    const { telegramId, gameType, betAmount, isPrivate } = req.body;
    const user = await User.findOne({ telegramId });
    if (betAmount > 0 && user.balance < betAmount) return res.json({ success: false, error: "Low balance" });
    if (betAmount > 0) await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -betAmount } });

    const lobbyId = 'R' + Math.floor(1000 + Math.random() * 9000);
    const lobby = new Lobby({ lobbyId, creatorId: telegramId, gameType, betAmount, isPrivate });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.get('/api/lobby/list', async (req, res) => {
    res.json(await Lobby.find({ status: 'waiting', isPrivate: false }));
});

app.post('/api/lobby/join', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    const lobby = await Lobby.findOne({ lobbyId, status: 'waiting' });
    const user = await User.findOne({ telegramId });
    if (!lobby || (lobby.betAmount > 0 && user.balance < lobby.betAmount)) return res.json({ success: false });

    if (lobby.betAmount > 0) await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -lobby.betAmount } });
    lobby.player2Id = telegramId;
    lobby.status = 'playing';
    await lobby.save();
    
    io.to(lobbyId).emit('start-match', { game: lobby.gameType, lobbyId: lobby.lobbyId });
    res.json({ success: true, lobby });
});

httpServer.listen(CONFIG.PORT, () => console.log('🚀 Server running on ' + CONFIG.PORT));
