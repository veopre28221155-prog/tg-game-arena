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
    CRYPTO_BOT_TOKEN: "535127:AAviaEd5s4fdrTrHuHpXARM04OXIa7XsEjV", 
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416,
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ MongoDB Connected'));

// МОДЕЛИ
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number, balance: { type: Number, default: 0 }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player1Id: Number, player2Id: Number,
    gameType: String, betAmount: Number, status: { type: String, default: 'waiting' },
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } }
}));

// SOCKETS: МУЛЬТИПЛЕЕР
io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => socket.join(roomId));
    
    socket.on('emu-input', (data) => {
        socket.to(data.roomId).emit('partner-input', data);
    });

    socket.on('emu-game-over', async (data) => {
        const lobby = await Lobby.findOne({ lobbyId: data.roomId, status: 'playing' });
        if (!lobby) return;

        if (lobby.player1Id === data.telegramId) lobby.scores.player1 = data.score;
        else lobby.scores.player2 = data.score;
        await lobby.save();

        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            lobby.status = 'finished';
            await lobby.save();

            let winnerId = lobby.scores.player1 > lobby.scores.player2 ? lobby.player1Id : lobby.player2Id;
            const prize = (lobby.betAmount * 2) * 0.95;
            const fee = (lobby.betAmount * 2) * 0.05;

            await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
            await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee } });
            io.to(data.roomId).emit('match-results', { winnerId, prize });
        }
    });
});

// API: КОШЕЛЕК И ЛОББИ
app.post('/api/user-data', async (req, res) => {
    const userData = JSON.parse(new URLSearchParams(req.body.initData).get('user'));
    let user = await User.findOne({ telegramId: userData.id });
    if (!user) { user = new User({ telegramId: userData.id, balance: 10 }); await user.save(); }
    res.json(user);
});

app.post('/api/lobby/create', async (req, res) => {
    const { telegramId, gameType, betAmount } = req.body;
    const user = await User.findOne({ telegramId });
    if (user.balance < betAmount) return res.json({ success: false });
    
    await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -betAmount } });
    const lobby = new Lobby({ lobbyId: 'L_'+Date.now(), creatorId: telegramId, player1Id: telegramId, gameType, betAmount });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.get('/api/lobbies', async (req, res) => {
    res.json(await Lobby.find({ status: 'waiting' }));
});

app.post('/api/lobby/join', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    const lobby = await Lobby.findOne({ lobbyId, status: 'waiting' });
    const user = await User.findOne({ telegramId });
    if (!lobby || user.balance < lobby.betAmount) return res.json({ success: false });

    await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -lobby.betAmount } });
    lobby.player2Id = telegramId;
    lobby.status = 'playing';
    await lobby.save();
    res.json({ success: true, lobby });
});

// ПЛАТЕЖИ (STARS И CRYPTO)
app.post('/api/buy-stars', async (req, res) => {
    const { telegramId, amount } = req.body;
    const response = await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
        title: `Пополнение ${amount} ⭐️`, description: `Звезды для арены`, payload: `${telegramId}_${amount}`, currency: "XTR", prices: [{ label: "Stars", amount }]
    });
    res.json({ invoiceUrl: response.data.result });
});

httpServer.listen(CONFIG.PORT, () => console.log('✅ Server Live'));
