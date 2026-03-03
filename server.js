const express = require('express');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7,
    transports: ['polling', 'websocket']
});

app.use(express.json());
app.use(express.static('public'));

const CONFIG = {
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI);

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player2Id: Number, game: String, status: String,
    r1: Boolean, r2: Boolean
}));

const loadedClients = {}; // Карта загруженных клиентов по комнатам

io.on('connection', (socket) => {
    socket.on('sync-me', (rid) => socket.join(rid));

    // БАРЬЕР ЗАГРУЗКИ
    socket.on('client-loaded', (d) => {
        if (!loadedClients[d.rid]) loadedClients[d.rid] = new Set();
        loadedClients[d.rid].add(socket.id);

        console.log(`[Sync] Client ready in ${d.rid}. Total: ${loadedClients[d.rid].size}`);

        if (loadedClients[d.rid].size >= 2) {
            io.to(d.rid).emit('ignite-engine');
            delete loadedClients[d.rid]; // Сброс для следующего матча
        }
    });

    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));
    socket.on('sync-state', (d) => socket.to(d.rid).emit('apply-state', d.state));

    socket.on('player-ready', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if(!l) return;
        d.uid == l.creatorId ? l.r1 = true : l.r2 = true;
        await l.save();
        io.to(d.rid).emit('lobby-update', l);
        if(l.r1 && l.r2) {
            l.status = 'playing'; await l.save();
            io.to(d.rid).emit('launch-match', { game: l.game, lid: l.lobbyId });
        }
    });
});

app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        const User = mongoose.model('User', new mongoose.Schema({ telegramId: Number, username: String, balance: { type: Number, default: 1000 } }));
        let u = await User.findOneAndUpdate({ telegramId: userData.id }, { username: userData.first_name }, { upsert: true, new: true });
        res.json({ success: true, user: u });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/lobby/create', async (req, res) => {
    const { uid, game } = req.body;
    await Lobby.deleteMany({ creatorId: uid });
    const lobbyId = 'R' + Math.floor(1000 + Math.random() * 9000);
    const lobby = new Lobby({ lobbyId, creatorId: uid, game, status: 'waiting', r1: false, r2: false });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.post('/api/lobby/join', async (req, res) => {
    const l = await Lobby.findOneAndUpdate({ lobbyId: req.body.lid, player2Id: null }, { player2Id: req.body.uid }, { new: true });
    res.json({ success: !!l, lobby: l });
});

httpServer.listen(CONFIG.PORT);
