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
    console.log('✅ Arena System Connected');
    await Lobby.deleteMany({ status: 'waiting' }); // Очистка при перезагрузке
});

// МОДЕЛИ
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number, username: String, balance: { type: Number, default: 1000 }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player2Id: Number,
    creatorName: String, player2Name: String,
    gameType: String, betAmount: { type: Number, default: 0 },
    status: { type: String, default: 'waiting' },
    isPrivate: { type: Boolean, default: false },
    ready1: { type: Boolean, default: false },
    ready2: { type: Boolean, default: false },
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } }
}));

// SOCKETS
io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => socket.join(roomId));

    socket.on('player-ready', async (data) => {
        const lobby = await Lobby.findOne({ lobbyId: data.roomId });
        if (!lobby) return;

        if (lobby.creatorId === data.telegramId) lobby.ready1 = true;
        if (lobby.player2Id === data.telegramId) lobby.ready2 = true;
        await lobby.save();

        io.to(data.roomId).emit('update-lobby', lobby);

        if (lobby.ready1 && lobby.ready2) {
            lobby.status = 'playing';
            await lobby.save();
            io.to(data.roomId).emit('start-game', { game: lobby.gameType, lobbyId: lobby.lobbyId });
        }
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
            if (lobby.betAmount > 0) {
                const prize = (lobby.betAmount * 2) * 0.95;
                await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
                await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: (lobby.betAmount * 2) * 0.05 } });
            }
            lobby.status = 'finished'; await lobby.save();
            io.to(lobby.lobbyId).emit('results', { winnerId });
        }
    });
});

// API
app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        let user = await User.findOne({ telegramId: userData.id });
        if (!user) { user = new User({ telegramId: userData.id, username: userData.first_name }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/lobby/create', async (req, res) => {
    const { telegramId, username, gameType, betAmount, isPrivate } = req.body;
    const user = await User.findOne({ telegramId });
    if (betAmount > user.balance) return res.json({ success: false });
    if (betAmount > 0) await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -betAmount } });

    const lobbyId = 'R' + Math.floor(Math.random()*9000);
    const lobby = new Lobby({ lobbyId, creatorId: telegramId, creatorName: username, gameType, betAmount, isPrivate });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.post('/api/lobby/join', async (req, res) => {
    const { telegramId, username, lobbyId } = req.body;
    const lobby = await Lobby.findOne({ lobbyId, status: 'waiting' });
    const user = await User.findOne({ telegramId });
    if (!lobby || (lobby.betAmount > user.balance)) return res.json({ success: false });

    if (lobby.betAmount > 0) await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -lobby.betAmount } });
    lobby.player2Id = telegramId;
    lobby.player2Name = username;
    await lobby.save();
    io.to(lobbyId).emit('update-lobby', lobby);
    res.json({ success: true, lobby });
});

app.get('/api/lobby/list', async (req, res) => res.json(await Lobby.find({ status: 'waiting', isPrivate: false })));

httpServer.listen(CONFIG.PORT, () => console.log('🚀 Server started'));
