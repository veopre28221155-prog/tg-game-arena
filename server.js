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

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, lobbyName: String, creatorId: Number, player2Id: { type: Number, default: null },
    name1: String, name2: String, game: String, bet: Number, status: { type: String, default: 'waiting' },
    isPrivate: { type: Boolean, default: false }, r1: Boolean, r2: Boolean
}, { timestamps: true }));

io.on('connection', (socket) => {
    socket.on('join-room', (rid) => socket.join(rid));

    socket.on('player-ready', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if(!l) return;
        if (l.creatorId == d.uid) l.r1 = true; else l.player2Id == d.uid ? l.r2 = true : null;
        await l.save();
        io.to(d.rid).emit('lobby-update', l);
        if (l.r1 && l.r2) {
            l.status = 'playing'; await l.save();
            io.to(d.rid).emit('start-match', { game: l.game, lid: l.lobbyId });
        }
    });

    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));
});

// API: Создание лобби
app.post('/api/lobby/create', async (req, res) => {
    try {
        const { uid, name, lname, game, bet, priv } = req.body;
        await Lobby.deleteMany({ creatorId: uid }); // Удаляем старые лобби этого юзера
        const lobbyId = 'L' + Date.now();
        const lobby = new Lobby({
            lobbyId, lobbyName: lname || "ARENA", creatorId: uid, name1: name,
            game, bet: bet || 0, isPrivate: priv || false, status: 'waiting'
        });
        await lobby.save();
        io.emit('new-lobby-created'); // Оповещаем всех онлайн игроков
        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ success: false }); }
});

// API: Список лобби (Улучшенный фильтр)
app.get('/api/lobby/list', async (req, res) => {
    try {
        // Находим все лобби, которые ждут игрока и не скрыты
        const list = await Lobby.find({ 
            status: 'waiting', 
            isPrivate: false, 
            player2Id: null 
        }).limit(10);
        res.json(list);
    } catch (e) { res.status(500).json([]); }
});

// API: Вход в лобби
app.post('/api/lobby/join', async (req, res) => {
    try {
        const { uid, name, lid } = req.body;
        const l = await Lobby.findOneAndUpdate(
            { lobbyId: lid, status: 'waiting', player2Id: null },
            { player2Id: uid, name2: name },
            { new: true }
        );
        if(l) {
            io.to(lid).emit('lobby-update', l);
            res.json({ success: true, lobby: l });
        } else res.json({ success: false });
    } catch (e) { res.json({ success: false }); }
});

// Твой эндпоинт user-data остается без изменений...
app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        const User = mongoose.model('User', new mongoose.Schema({ telegramId: Number, username: String, balance: { type: Number, default: 1000 } }));
        let u = await User.findOneAndUpdate({ telegramId: userData.id }, { username: userData.first_name }, { upsert: true, new: true });
        res.json({ success: true, user: u });
    } catch (e) { res.status(500).json({ success: false }); }
});

httpServer.listen(CONFIG.PORT);
