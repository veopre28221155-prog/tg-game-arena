const express = require('express');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    allowEIO3: true,
    transports: ['polling', 'websocket'] 
});

app.use(express.json());
app.use(express.static('public'));

// Логгер всех запросов
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

const CONFIG = {
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ DB Connected'));

const User = mongoose.model('User', new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String, balance: { type: Number, default: 1000 }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, game: String, status: { type: String, default: 'waiting' },
    slots: [{ uid: Number, name: String, ready: { type: Boolean, default: false } }],
    createdAt: { type: Date, default: Date.now, expires: 300 }
}));

io.on('connection', (socket) => {
    console.log(`[Socket] New connection: ${socket.id}`);
    
    socket.on('reconnect-to-slot', async (d) => {
        console.log(`[Socket] Reconnect attempt: UID ${d.uid} to Room ${d.rid}`);
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if (l && l.slots.some(s => s.uid == d.uid)) {
            socket.join(d.rid);
            socket.emit(l.status === 'playing' ? 'rejoin-match' : 'slot-confirmed', l);
        }
    });

    socket.on('player-ready', async (d) => {
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
    });

    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));
});

app.post('/api/user-data', async (req, res) => {
    console.log("[API] /user-data - Body:", JSON.stringify(req.body));
    try {
        if (!req.body.initData) throw new Error("NO_INITDATA");
        const params = new URLSearchParams(req.body.initData);
        const userObj = JSON.parse(params.get('user'));
        console.log(`[API] Auth for UID: ${userObj.id}`);
        
        const u = await User.findOneAndUpdate(
            { telegramId: userObj.id }, 
            { username: userObj.first_name || userObj.username }, 
            { upsert: true, new: true }
        );
        res.json({ success: true, user: u });
    } catch (e) { 
        console.error("[API ERROR] /user-data:", e.message);
        res.status(500).json({ success: false, error: e.message }); 
    }
});

app.post('/api/lobby/create', async (req, res) => {
    console.log("[API] /lobby/create - Body:", JSON.stringify(req.body));
    try {
        const { uid, name, game } = req.body;
        await Lobby.deleteMany({ 'slots.0.uid': uid });
        const lobbyId = 'R' + Math.floor(1000 + Math.random()*9000);
        const lobby = new Lobby({ lobbyId, game, slots: [{ uid, name, ready: false }, { uid: null, name: null, ready: false }] });
        await lobby.save();
        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/lobby/join', async (req, res) => {
    console.log("[API] /lobby/join - Body:", JSON.stringify(req.body));
    try {
        const l = await Lobby.findOneAndUpdate(
            { lobbyId: req.body.lid, 'slots.1.uid': null, status: 'waiting' }, 
            { $set: { 'slots.1.uid': req.body.uid, 'slots.1.name': req.body.name } }, 
            { new: true }
        );
        if (!l) throw new Error("SLOT_LOCKED_OR_LOBBY_GONE");
        io.to(l.lobbyId).emit('lobby-update', l);
        res.json({ success: true, lobby: l });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get('/api/lobby/list', async (req, res) => {
    try {
        const list = await Lobby.find({ status: 'waiting', 'slots.1.uid': null });
        res.json({ success: true, list });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

httpServer.listen(CONFIG.PORT, () => console.log(`🚀 DEBUG_MODE_ON: Port ${CONFIG.PORT}`));
