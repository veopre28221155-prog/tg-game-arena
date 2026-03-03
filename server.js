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

// СХЕМА: Убраны все лишние индексы
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

// ФУНКЦИЯ ГЛУБОКОЙ ЗАЧИСТКИ БАЗЫ
async function fullDatabaseSanitization() {
    try {
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const usersExists = collections.some(c => c.name === 'users');

        if (usersExists) {
            // Удаляем старый индекс tg_id, который вызывает ошибку на скриншоте
            try {
                await db.collection('users').dropIndex('tg_id_1');
                console.log("✅ Ghost index 'tg_id_1' dropped.");
            } catch (e) { console.log("ℹ️ Index 'tg_id_1' already gone or not found."); }

            // Удаляем всех битых юзеров без ID
            const res = await User.deleteMany({ telegramId: null });
            console.log(`✅ Removed ${res.deletedCount} null-id users.`);
        }
    } catch (e) { console.error("❌ Sanitization Error:", e.message); }
}

mongoose.connect(CONFIG.MONGO_URI).then(() => {
    console.log('✅ DB Connected');
    fullDatabaseSanitization();
});

// SOCKETS
io.on('connection', (socket) => {
    socket.on('sync-me', (rid) => socket.join(rid));
    socket.on('player-ready', async (d) => {
        try {
            const l = await Lobby.findOne({ lobbyId: d.rid });
            if(!l) return;
            const s = l.slots.find(x => x.uid == d.uid);
            if(s) s.ready = !s.ready;
            await l.save();
            io.to(d.rid).emit('lobby-update', l);
            if(l.slots.every(x => x.uid && x.ready)) {
                l.status = 'playing'; await l.save();
                io.to(d.rid).emit('launch-match', { game: l.game, lid: l.lobbyId });
            }
        } catch(e) { console.error(e); }
    });
    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));
});

// API AUTH С ПРОВЕРКОЙ НА NULL
app.post('/api/user-data', async (req, res) => {
    try {
        if (!req.body.initData) throw new Error("INIT_DATA_MISSING");
        const params = new URLSearchParams(req.body.initData);
        const uRaw = params.get('user');
        if (!uRaw) throw new Error("USER_OBJECT_MISSING");
        
        const uObj = JSON.parse(uRaw);
        if (!uObj.id) throw new Error("ID_IS_NULL");

        console.info(`[AUTH] ID: ${uObj.id} Name: ${uObj.first_name}`);

        const u = await User.findOneAndUpdate(
            { telegramId: uObj.id }, 
            { username: uObj.first_name || "RetroPlayer" }, 
            { upsert: true, new: true, runValidators: true }
        );
        res.json({ success: true, user: u });
    } catch (e) { 
        console.error("[SERVER ERR]", e.message);
        res.status(500).json({ success: false, error: e.message, stack: "USER_DATA_CRASH" }); 
    }
});

// ОСТАЛЬНЫЕ РОУТЫ (Lobby Create/Join/List)
app.post('/api/lobby/create', async (req, res) => {
    try {
        const { uid, name, game } = req.body;
        if(!uid) throw new Error("UID_REQUIRED");
        await Lobby.deleteMany({ creatorId: uid });
        const lid = 'R' + Math.floor(1000+Math.random()*9000);
        const l = new Lobby({ lobbyId: lid, creatorId: uid, game, slots: [{uid, name, ready:false}, {uid:null, name:null, ready:false}], status: 'waiting' });
        await l.save();
        res.json({ success: true, lobby: l });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/lobby/join', async (req, res) => {
    try {
        const { uid, name, lid } = req.body;
        const l = await Lobby.findOneAndUpdate(
            { lobbyId: lid, status: 'waiting', 'slots.1.uid': null }, 
            { $set: {'slots.1.uid': uid, 'slots.1.name': name} }, 
            { new: true }
        );
        if(!l) throw new Error("LOBBY_UNAVAILABLE");
        io.to(l.lobbyId).emit('lobby-update', l);
        res.json({ success: true, lobby: l });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/lobby/list', async (req, res) => {
    const list = await Lobby.find({ status: 'waiting', 'slots.1.uid': null });
    res.json({ success: true, list });
});

httpServer.listen(CONFIG.PORT);
