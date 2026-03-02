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
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI);

const LobbySchema = new mongoose.Schema({
    lobbyId: String, creatorId: Number, game: String, bet: Number, status: { type: String, default: 'waiting' },
    slots: [{ uid: { type: Number, default: null }, name: { type: String, default: null }, ready: { type: Boolean, default: false } }],
    createdAt: { type: Date, default: Date.now, expires: 300 } 
});
const Lobby = mongoose.model('Lobby', LobbySchema);

const User = mongoose.model('User', new mongoose.Schema({ telegramId: Number, username: String, balance: { type: Number, default: 1000 } }));

io.on('connection', (socket) => {
    socket.on('reconnect-to-slot', async (d) => {
        try {
            const l = await Lobby.findOne({ lobbyId: d.rid });
            if (l && l.slots.some(s => s.uid == d.uid)) {
                socket.join(d.rid);
                socket.emit('slot-confirmed', l);
            }
        } catch (e) { console.error(e); }
    });

    socket.on('player-ready', async (d) => {
        try {
            const l = await Lobby.findOne({ lobbyId: d.rid });
            if (!l) return;
            const slot = l.slots.find(s => s.uid == d.uid);
            if (slot) slot.ready = !slot.ready;
            await l.save();
            io.to(d.rid).emit('lobby-update', l);
            if (l.slots.every(s => s.uid !== null && s.ready)) {
                l.status = 'playing'; await l.save();
                io.to(d.rid).emit('launch-match', { game: l.game, lid: l.lobbyId });
            }
        } catch (e) { console.error(e); }
    });

    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));
});

app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        const u = await User.findOneAndUpdate({ telegramId: userData.id }, { username: userData.first_name }, { upsert: true, new: true });
        res.json({ success: true, user: u });
    } catch (e) { res.status(500).json({ success: false, error: e.message, stack: "USER_DATA_ERR" }); }
});

app.post('/api/lobby/create', async (req, res) => {
    try {
        const { uid, name, game, bet } = req.body;
        await Lobby.deleteMany({ creatorId: uid }); // THE REAPER
        const lobbyId = 'L' + Math.floor(Math.random()*90000);
        const lobby = new Lobby({
            lobbyId, creatorId: uid, game, bet,
            slots: [{ uid, name, ready: false }, { uid: null, name: null, ready: false }]
        });
        await lobby.save();
        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ success: false, error: e.message, stack: "CREATE_ERR" }); }
});

app.post('/api/lobby/join', async (req, res) => {
    try {
        const { uid, name, lid } = req.body;
        const l = await Lobby.findOneAndUpdate(
            { lobbyId: lid, status: 'waiting', 'slots.1.uid': null },
            { $set: { 'slots.1.uid': uid, 'slots.1.name': name } },
            { new: true }
        );
        if (!l) throw new Error("LOBBY_FULL_OR_CLOSED");
        io.to(lid).emit('lobby-update', l);
        res.json({ success: true, lobby: l });
    } catch (e) { res.status(500).json({ success: false, error: e.message, stack: "JOIN_ERR" }); }
});

app.get('/api/lobby/list', async (req, res) => {
    try { res.json({ success: true, list: await Lobby.find({ status: 'waiting', 'slots.1.uid': null }) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

httpServer.listen(CONFIG.PORT);
