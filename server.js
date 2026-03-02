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

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ DB Connected'));

// МОДЕЛИ
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number, username: String, balance: { type: Number, default: 0 }
}));

const Withdrawal = mongoose.model('Withdrawal', new mongoose.Schema({
    userId: Number, username: String, coinAmount: Number, usdtAmount: Number,
    status: { type: String, default: 'pending' }, date: { type: Date, default: Date.now }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player1Id: Number, player2Id: Number,
    gameType: String, betAmount: { type: Number, default: 0 },
    status: { type: String, default: 'waiting' },
    isFree: { type: Boolean, default: false },
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } }
}));

// SOCKETS (Мультиплеер)
io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => socket.join(roomId));
    socket.on('emu-input', (data) => socket.to(data.roomId).emit('partner-input', data));
    socket.on('emu-game-over', async (data) => {
        const lobby = await Lobby.findOne({ lobbyId: data.roomId, status: 'playing' });
        if (!lobby) return;
        if (lobby.player1Id === data.telegramId) lobby.scores.player1 = data.score;
        else lobby.scores.player2 = data.score;
        await lobby.save();
        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            const winnerId = lobby.scores.player1 > lobby.scores.player2 ? lobby.player1Id : lobby.player2Id;
            if (!lobby.isFree && lobby.betAmount > 0) {
                const total = lobby.betAmount * 2;
                const prize = total * 0.95;
                const fee = total * 0.05;
                await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
                await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee } });
                io.to(lobby.lobbyId).emit('match-results', { winnerId, prize });
            } else {
                io.to(lobby.lobbyId).emit('match-results', { winnerId, prize: 0 });
            }
            lobby.status = 'finished'; await lobby.save();
        }
    });
});

// API
app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        let user = await User.findOne({ telegramId: userData.id });
        if (!user) { user = new User({ telegramId: userData.id, username: userData.username }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/lobby/create', async (req, res) => {
    const { telegramId, gameType, betAmount, isFree } = req.body;
    if (!isFree) {
        const user = await User.findOne({ telegramId });
        if (user.balance < betAmount) return res.json({ success: false });
        await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -betAmount } });
    }
    const lobbyId = 'L_'+Date.now();
    const lobby = new Lobby({ lobbyId, creatorId: telegramId, player1Id: telegramId, gameType, betAmount, isFree });
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
    lobby.player2Id = telegramId; lobby.status = 'playing'; await lobby.save();
    io.to(lobbyId).emit('start-match', { game: lobby.gameType });
    res.json({ success: true, lobby });
});

app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount } = req.body;
    const user = await User.findOne({ telegramId });
    if (user.balance >= amount && amount >= 5000) {
        await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -amount } });
        const request = new Withdrawal({ userId: telegramId, username: user.username, coinAmount: amount, usdtAmount: (amount/5000).toFixed(2) });
        await request.save();
        res.json({ success: true });
    } else res.json({ success: false });
});

app.post('/api/admin/get-withdrawals', async (req, res) => {
    if (req.body.adminId != CONFIG.ADMIN_ID) return res.status(403).send("No");
    res.json(await Withdrawal.find({ status: 'pending' }));
});

app.post('/api/admin/action', async (req, res) => {
    if (req.body.adminId != CONFIG.ADMIN_ID) return res.status(403).send("No");
    const w = await Withdrawal.findById(req.body.id);
    if (req.body.action === 'complete') w.status = 'completed';
    else { w.status = 'rejected'; await User.findOneAndUpdate({ telegramId: w.userId }, { $inc: { balance: w.coinAmount } }); }
    await w.save(); res.json({ success: true });
});

app.post('/api/deposit-stars', async (req, res) => {
    const r = await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
        title: "TopUp Coins", payload: `${req.body.telegramId}`, currency: "XTR", prices: [{ label: "Stars", amount: req.body.amount }]
    });
    res.json({ url: r.data.result });
});

httpServer.listen(CONFIG.PORT, () => console.log('🚀 Server running'));
