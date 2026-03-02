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

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, game: String, bet: Number, status: String,
    slots: [{ uid: Number, name: String, ready: { type: Boolean, default: false } }],
    createdAt: { type: Date, default: Date.now, expires: 600 }
}));

io.on('connection', (socket) => {
    socket.on('reconnect-to-slot', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if (l && l.slots.some(s => s.uid == d.uid)) {
            socket.join(d.rid);
            socket.emit('slot-confirmed', l);
        }
    });

    socket.on('occupy-slot', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if (!l) return;
        const slotIdx = l.slots.findIndex(s => s.uid === null);
        if (slotIdx !== -1) {
            l.slots[slotIdx] = { uid: d.uid, name: d.name, ready: false };
            await l.save();
            socket.join(d.rid);
            io.to(d.rid).emit('lobby-update', l);
        }
    });

    socket.on('toggle-ready', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if (!l) return;
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

app.post('/api/lobby/create', async (req, res) => {
    const { uid, name, game, bet, size } = req.body;
    const lobbyId = 'L' + Math.floor(Math.random()*90000);
    const slots = new Array(size).fill(null).map((_, i) => i === 0 ? { uid, name, ready: false } : { uid: null, name: null, ready: false });
    const lobby = new Lobby({ lobbyId, game, bet, slots, status: 'waiting' });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.get('/api/lobby/list', async (req, res) => res.json(await Lobby.find({ status: 'waiting' })));

httpServer.listen(CONFIG.PORT);
