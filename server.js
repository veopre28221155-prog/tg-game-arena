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

// СХЕМА С ЖЕСТКОЙ ВАЛИДАЦИЕЙ
const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    balance: { type: Number, default: 1000 }
});
const User = mongoose.model('User', UserSchema);

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player2Id: Number, game: String, status: String,
    slots: [{ uid: Number, name: String, ready: { type: Boolean, default: false } }],
    createdAt: { type: Date, default: Date.now, expires: 300 }
}));

// ФУНКЦИЯ ОЧИСТКИ ЗОМБИ-ЗАПИСЕЙ (Запускается при старте)
async function emergencyCleanup() {
    try {
        const res = await User.deleteMany({ telegramId: { $eq: null } });
        console.log(`[CLEANUP] Removed ${res.deletedCount} zombie users with null ID.`);
        // Также удаляем записи, где поле может называться иначе из-за старых индексов
        await User.collection.deleteMany({ tg_id: null }); 
    } catch (e) { console.error("[CLEANUP ERR]", e.message); }
}

mongoose.connect(CONFIG.MONGO_URI).then(() => {
    console.log('✅ DB Connected');
    emergencyCleanup();
});

io.on('connection', (socket) => {
    socket.on('reconnect-to-slot', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if (l && l.slots.some(s => s.uid == d.uid)) {
            socket.join(d.rid);
            socket.emit('slot-confirmed', l);
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
    try {
        if (!req.body.initData) throw new Error("INIT_DATA_MISSING");
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        
        if (!userData || !userData.id) throw new Error("TELEGRAM_ID_MISSING");
        
        console.log("Attempting auth for ID:", userData.id);

        const u = await User.findOneAndUpdate(
            { telegramId: userData.id }, 
            { username: userData.first_name || userData.username }, 
            { upsert: true, new: true, runValidators: true }
        );
        res.json({ success: true, user: u });
    } catch (e) { 
        console.error("[AUTH ERR]", e.message);
        res.status(500).json({ success: false, error: e.message, stack: "USER_DATA_ERR" }); 
    }
});

// Остальные роуты (create, join, list) — без изменений, но обернуты в try/catch по умолчанию
app.post('/api/lobby/create', async (req, res) => {
    try {
        const { uid, name, game, bet } = req.body;
        await Lobby.deleteMany({ creatorId: uid });
        const lobbyId = 'L' + Math.floor(Math.random()*90000);
        const lobby = new Lobby({
            lobbyId, creatorId: uid, game, bet, status: 'waiting',
            slots: [{ uid, name, ready: false }, { uid: null, name: null, ready: false }]
        });
        await lobby.save();
        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/lobby/join', async (req, res) => {
    try {
        const { uid, name, lid } = req.body;
        const l = await Lobby.findOneAndUpdate(
            { lobbyId: lid, status: 'waiting', 'slots.1.uid': null },
            { $set: { 'slots.1.uid': uid, 'slots.1.name': name } },
            { new: true }
        );
        if (!l) throw new Error("SLOT_OCCUPIED_OR_LOBBY_CLOSED");
        res.json({ success: true, lobby: l });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/lobby/list', async (req, res) => {
    try { res.json({ success: true, list: await Lobby.find({ status: 'waiting', 'slots.1.uid': null }) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

httpServer.listen(CONFIG.PORT);
