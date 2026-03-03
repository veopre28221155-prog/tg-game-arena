const express = require('express');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static('public')); // Раздает всё из папки public

const CONFIG = {
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    PORT: process.env.PORT || 3000
};

// СХЕМЫ
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String, balance: { type: Number, default: 1000 }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, game: String, status: { type: String, default: 'waiting' },
    slots: [{ uid: Number, name: String, ready: { type: Boolean, default: false } }],
    createdAt: { type: Date, default: Date.now, expires: 300 }
}));

// ОЧИСТКА ПРИ СТАРТЕ
mongoose.connect(CONFIG.MONGO_URI).then(async () => {
    await User.deleteMany({ telegramId: null });
    console.log('✅ Arena System Connected');
});

io.on('connection', (socket) => {
    socket.on('reconnect-to-slot', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if (l && l.slots.some(s => s.uid == d.uid)) {
            socket.join(d.rid);
            socket.emit(l.status === 'playing' ? 'rejoin-match' : 'slot-confirmed', l);
        }
    });

    socket.on('player-ready', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if (!l || l.status !== 'waiting') return;
        const slot = l.slots.find(s => s.uid == d.uid);
        if (slot) slot.ready = !slot.ready;
        await l.save();
        io.to(d.rid).emit('lobby-update', l);
        if (l.slots.every(s => s.uid && s.ready)) {
            l.status = 'playing'; await l.save();
            io.to(d.rid).emit('launch-match', { game: l.game, lid: l.lobbyId });
        }
    });

    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));
});

app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        const u = await User.findOneAndUpdate({ telegramId: userData.id }, { username: userData.first_name }, { upsert: true, new: true });
        res.json({ success: true, user: u });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/lobby/create', async (req, res) => {
    try {
        const { uid, name, game } = req.body;
        await Lobby.deleteMany({ 'slots.0.uid': uid });
        const lobbyId = 'R' + Math.floor(Math.random()*9000);
        const lobby = new Lobby({ lobbyId, game, slots: [{ uid, name, ready: false }, { uid: null, name: null, ready: false }] });
        await lobby.save();
        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/lobby/join', async (req, res) => {
    try {
        const l = await Lobby.findOneAndUpdate({ lobbyId: req.body.lid, 'slots.1.uid': null }, { $set: { 'slots.1.uid': req.body.uid, 'slots.1.name': req.body.name } }, { new: true });
        if (l) { io.to(l.lobbyId).emit('lobby-update', l); res.json({ success: true, lobby: l }); }
        else throw new Error();
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/lobby/list', async (req, res) => res.json({ list: await Lobby.find({ status: 'waiting', 'slots.1.uid': null }) }));

httpServer.listen(CONFIG.PORT);
