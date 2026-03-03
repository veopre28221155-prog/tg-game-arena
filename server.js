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

mongoose.connect(CONFIG.MONGO_URI);

const User = mongoose.model('User', new mongoose.Schema({ telegramId: { type: Number, unique: true }, username: String, balance: { type: Number, default: 1000 } }));
const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player2Id: Number, name1: String, name2: String,
    game: String, bet: Number, status: String,
    r1: { type: Boolean, default: false }, r2: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}));

// ПРОТОКОЛ «ЧИСТИЛЬЩИКА» (Каждые 60 сек)
setInterval(async () => {
    const expiry = new Date(Date.now() - 300000); // 5 минут
    const res = await Lobby.deleteMany({ status: 'waiting', createdAt: { $lt: expiry } });
    if(res.deletedCount > 0) console.log(`[REAPER] Purged ${res.deletedCount} ghost lobbies.`);
}, 60000);

io.on('connection', (socket) => {
    socket.on('sync-me', (rid) => socket.join(rid));
    socket.on('player-ready', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if(!l) return;
        if (l.creatorId == d.uid) l.r1 = true; else l.r2 = true;
        await l.save();
        io.to(d.rid).emit('lobby-update', l);
        if (l.r1 && l.r2) {
            l.status = 'playing'; await l.save();
            io.to(d.rid).emit('launch-match', { game: l.game, lid: l.lobbyId });
        }
    });
    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));
});

app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const uObj = JSON.parse(params.get('user'));
        const u = await User.findOneAndUpdate({ telegramId: uObj.id }, { username: uObj.first_name }, { upsert: true, new: true });
        res.json({ success: true, user: u });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/lobby/create', async (req, res) => {
    try {
        const { uid, name, game } = req.body;
        await Lobby.deleteMany({ creatorId: uid }); // ПРИНУДИТЕЛЬНАЯ ОЧИСТКА ХОСТА
        const lid = 'R' + Math.floor(1000+Math.random()*9000);
        const l = new Lobby({ lobbyId: lid, creatorId: uid, name1: name, game, status: 'waiting' });
        await l.save();
        res.json({ success: true, lobby: l });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/lobby/join', async (req, res) => {
    try {
        const l = await Lobby.findOneAndUpdate({ lobbyId: req.body.lid, status: 'waiting', player2Id: null }, { player2Id: req.body.uid, name2: req.body.name }, { new: true });
        if (l) { io.to(l.lobbyId).emit('lobby-update', l); res.json({ success: true, lobby: l }); }
        else res.json({ success: false });
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/lobby/list', async (req, res) => res.json({ list: await Lobby.find({ status: 'waiting', player2Id: null }) }));

httpServer.listen(CONFIG.PORT);
