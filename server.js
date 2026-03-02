const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG = {
    BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8", 
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, 
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI).then(async () => {
    await mongoose.model('Lobby').deleteMany({ status: 'waiting' });
    console.log('🚀 Database & Socket System Ready');
});

const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number, username: String, balance: { type: Number, default: 1000 }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player2Id: Number, creatorName: String, player2Name: String,
    game: String, bet: Number, status: String, isPrivate: Boolean,
    r1: { type: Boolean, default: false }, r2: { type: Boolean, default: false },
    s1: { type: Number, default: -1 }, s2: { type: Number, default: -1 }
}));

const Withdrawal = mongoose.model('Withdrawal', new mongoose.Schema({ userId: Number, amount: Number, status: String }));

io.on('connection', (socket) => {
    socket.on('join-room', (id) => socket.join(id));

    socket.on('set-ready', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.id });
        if (!l) return;
        if (l.creatorId == d.uid) l.r1 = true; else l.r2 = true;
        await l.save();
        io.to(d.id).emit('lobby-update', l);
        if (l.r1 && l.r2) {
            l.status = 'playing'; await l.save();
            io.to(d.id).emit('start-game', { game: l.game, lid: l.lobbyId });
        }
    });

    socket.on('emu-input', (d) => socket.to(d.rid).emit('p-input', d));

    socket.on('match-end', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid, status: 'playing' });
        if (!l) return;
        if (l.creatorId == d.uid) l.s1 = d.score; else l.s2 = d.score;
        await l.save();
        if (l.s1 !== -1 && l.s2 !== -1) {
            const winId = l.s1 > l.s2 ? l.creatorId : l.player2Id;
            if (l.bet > 0) {
                const prize = (l.bet * 2) * 0.95;
                await User.findOneAndUpdate({ telegramId: winId }, { $inc: { balance: prize } });
                await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: (l.bet * 2) * 0.05 } });
            }
            l.status = 'finished'; await l.save();
            io.to(l.lobbyId).emit('results', { winId });
        }
    });
});

app.post('/api/user-data', async (req, res) => {
    const data = JSON.parse(new URLSearchParams(req.body.initData).get('user'));
    let u = await User.findOne({ telegramId: data.id });
    if (!u) { u = new User({ telegramId: data.id, username: data.first_name }); await u.save(); }
    res.json(u);
});

app.post('/api/lobby/create', async (req, res) => {
    const { uid, name, game, bet, priv } = req.body;
    const u = await User.findOne({ telegramId: uid });
    if (bet > u.balance) return res.json({ success: false });
    if (bet > 0) await User.findOneAndUpdate({ telegramId: uid }, { $inc: { balance: -bet } });
    const lobby = new Lobby({ lobbyId: 'R'+Date.now(), creatorId: uid, creatorName: name, game, bet, isPrivate: priv, status: 'waiting' });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.post('/api/lobby/join', async (req, res) => {
    const { uid, name, lid } = req.body;
    const l = await Lobby.findOne({ lobbyId: lid, status: 'waiting' });
    const u = await User.findOne({ telegramId: uid });
    if (!l || (l.bet > u.balance)) return res.json({ success: false });
    if (l.bet > 0) await User.findOneAndUpdate({ telegramId: uid }, { $inc: { balance: -l.bet } });
    l.player2Id = uid; l.player2Name = name; await l.save();
    io.to(lid).emit('lobby-update', l);
    res.json({ success: true, lobby: l });
});

app.get('/api/lobby/list', async (req, res) => res.json(await Lobby.find({ status: 'waiting', isPrivate: false })));

httpServer.listen(CONFIG.PORT);
