const express = require('express');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static('public'));

const CONFIG = {
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, 
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ DB Connected'));

// МОДЕЛИ
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: { type: Number, unique: true }, username: String, balance: { type: Number, default: 1000 }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, game: String, creatorId: Number, player2Id: Number,
    name1: String, name2: String, bet: { type: Number, default: 0 },
    status: { type: String, default: 'waiting' },
    r1: { type: Boolean, default: false }, r2: { type: Boolean, default: false },
    s1: { type: Number, default: -1 }, s2: { type: Number, default: -1 },
    createdAt: { type: Date, default: Date.now, expires: 600 }
}));

// SOCKETS
io.on('connection', (socket) => {
    socket.on('sync-me', (rid) => socket.join(rid));

    socket.on('player-ready', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if(!l || l.status !== 'waiting') return;
        if (l.creatorId == d.uid) l.r1 = true; else l.player2Id == d.uid ? l.r2 = true : null;
        await l.save();
        io.to(d.rid).emit('lobby-update', l);
        if (l.r1 && l.r2) {
            l.status = 'playing'; await l.save();
            io.to(d.rid).emit('launch-match', { game: l.game, lid: l.lobbyId });
        }
    });

    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));

    socket.on('match-end', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid, status: 'playing' });
        if(!l) return;
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

// API
app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        let u = await User.findOneAndUpdate({ telegramId: userData.id }, { username: userData.first_name }, { upsert: true, new: true });
        res.json({ success: true, user: u });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/lobby/create', async (req, res) => {
    try {
        const { uid, name, game, bet } = req.body;
        await Lobby.deleteMany({ creatorId: uid, status: 'waiting' });
        const lobbyId = 'R' + Math.floor(1000 + Math.random()*9000);
        const lobby = new Lobby({ lobbyId, creatorId: uid, name1: name, game, bet, status: 'waiting' });
        await lobby.save();
        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/lobby/join', async (req, res) => {
    const l = await Lobby.findOneAndUpdate({ lobbyId: req.body.lid, status: 'waiting', player2Id: null }, { player2Id: req.body.uid, name2: req.body.name }, { new: true });
    if (l) { io.to(l.lobbyId).emit('lobby-update', l); res.json({ success: true, lobby: l }); }
    else res.json({ success: false });
});

app.get('/api/lobby/list', async (req, res) => res.json({ list: await Lobby.find({ status: 'waiting', player2Id: null }) }));

httpServer.listen(CONFIG.PORT);
