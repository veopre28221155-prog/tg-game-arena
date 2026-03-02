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

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ Arena System Live'));

// МОДЕЛИ
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number, username: String, balance: { type: Number, default: 0 }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player1Id: Number, player2Id: Number,
    gameType: String, betAmount: { type: Number, default: 0 },
    status: { type: String, default: 'waiting' }, // waiting, playing, finished
    isPrivate: { type: Boolean, default: false },
    isFree: { type: Boolean, default: false },
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } }
}));

// SOCKETS
io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => socket.join(roomId));

    socket.on('emu-input', (data) => {
        socket.to(data.roomId).emit('partner-input', data);
    });

    socket.on('match-finished', async (data) => {
        const lobby = await Lobby.findOne({ lobbyId: data.roomId, status: 'playing' });
        if (!lobby) return;

        if (lobby.player1Id === data.telegramId) lobby.scores.player1 = data.score;
        else lobby.scores.player2 = data.score;
        await lobby.save();

        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            processWinner(lobby);
        }
    });
});

async function processWinner(lobby) {
    const winnerId = lobby.scores.player1 > lobby.scores.player2 ? lobby.player1Id : lobby.player2Id;
    const totalBank = lobby.betAmount * 2;
    const fee = totalBank * 0.05;
    const prize = totalBank - fee;

    if (!lobby.isFree && lobby.betAmount > 0) {
        await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
        await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee } });
    }
    
    lobby.status = 'finished';
    await lobby.save();
    io.to(lobby.lobbyId).emit('results', { winnerId, prize: lobby.isFree ? 0 : prize });
}

// API
app.post('/api/user-data', async (req, res) => {
    const params = new URLSearchParams(req.body.initData);
    const userData = JSON.parse(params.get('user'));
    let user = await User.findOne({ telegramId: userData.id });
    if (!user) { user = new User({ telegramId: userData.id, username: userData.username }); await user.save(); }
    res.json(user);
});

app.post('/api/lobby/create', async (req, res) => {
    const { telegramId, gameType, betAmount, isPrivate, isFree } = req.body;
    if (!isFree) {
        const user = await User.findOne({ telegramId });
        if (user.balance < betAmount) return res.json({ success: false });
        await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -betAmount } });
    }
    const lobbyId = 'L_'+Date.now();
    const lobby = new Lobby({ lobbyId, creatorId: telegramId, player1Id: telegramId, gameType, betAmount, isPrivate, isFree });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.get('/api/lobbies', async (req, res) => {
    res.json(await Lobby.find({ status: 'waiting', isPrivate: false }));
});

app.post('/api/lobby/join', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    const lobby = await Lobby.findOne({ lobbyId, status: 'waiting' });
    const user = await User.findOne({ telegramId });
    if (!lobby || (!lobby.isFree && user.balance < lobby.betAmount)) return res.json({ success: false });

    if (!lobby.isFree) await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -lobby.betAmount } });
    lobby.player2Id = telegramId;
    lobby.status = 'playing';
    await lobby.save();
    
    io.to(lobbyId).emit('start-match', { game: lobby.gameType, lobbyId: lobby.lobbyId });
    res.json({ success: true });
});

httpServer.listen(CONFIG.PORT, () => console.log('🚀 Server running'));
