const express = require('express');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { 
    cors: { origin: "*" },
    transports: ['websocket', 'polling'] 
});

app.use(express.json());
app.use(express.static('public'));

const CONFIG = {
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, 
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI);

const User = mongoose.model('User', new mongoose.Schema({ telegramId: Number, username: String, balance: { type: Number, default: 1000 } }));
const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, lobbyName: String, creatorId: Number, player2Id: Number, creatorName: String, player2Name: String,
    game: String, bet: Number, status: { type: String, default: 'waiting' }, isPrivate: Boolean,
    r1: { type: Boolean, default: false }, r2: { type: Boolean, default: false }
}));

// Очистка пустых лобби через 5 минут
setInterval(async () => {
    await Lobby.deleteMany({ status: 'waiting', creatorId: null }); 
}, 60000);

io.on('connection', (socket) => {
    socket.on('register', (uid) => { socket.uid = uid; });

    socket.on('join-room', (rid) => {
        socket.join(rid);
        console.log(`User ${socket.uid} joined ${rid}`);
    });

    socket.on('player-ready', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if (!l) return;
        if (l.creatorId == d.uid) l.r1 = true; 
        else if (l.player2Id == d.uid) l.r2 = true;
        await l.save();
        io.to(d.rid).emit('lobby-update', l);
        
        if (l.r1 && l.r2) {
            l.status = 'playing'; await l.save();
            io.to(d.rid).emit('start-match', { game: l.game, lid: l.lobbyId });
        }
    });

    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));
});

app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        let u = await User.findOneAndUpdate({ telegramId: userData.id }, { username: userData.first_name }, { upsert: true, new: true });
        res.json(u);
    } catch (e) { res.status(500).send("Err"); }
});

app.post('/api/lobby/create', async (req, res) => {
    const { uid, name, lname, game, bet, priv } = req.body;
    const lobbyId = 'R' + Math.floor(1000 + Math.random()*9000);
    const lobby = new Lobby({ lobbyId, lobbyName: lname, creatorId: uid, creatorName: name, game, bet, isPrivate: priv });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.post('/api/lobby/join', async (req, res) => {
    const { uid, name, lid } = req.body;
    const l = await Lobby.findOneAndUpdate({ lobbyId: lid, status: 'waiting', player2Id: null }, { player2Id: uid, player2Name: name }, { new: true });
    if (l) { io.to(lid).emit('lobby-update', l); res.json({ success: true, lobby: l }); }
    else res.json({ success: false });
});

app.get('/api/lobby/list', async (req, res) => {
    res.json(await Lobby.find({ status: 'waiting', isPrivate: false, player2Id: null }));
});

httpServer.listen(CONFIG.PORT);
