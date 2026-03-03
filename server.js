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

const User = mongoose.model('User', new mongoose.Schema({ telegramId: { type: Number, unique: true }, username: String, balance: { type: Number, default: 1000 } }));
const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player2Id: Number, game: String, status: String,
    slots: [{ uid: Number, name: String, ready: { type: Boolean, default: false } }],
    createdAt: { type: Date, default: Date.now, expires: 300 }
}));

io.on('connection', (socket) => {
    // Игрок сообщает серверу: "Я в комнате RID"
    socket.on('sync-me', async (rid) => {
        socket.join(rid);
        const l = await Lobby.findOne({ lobbyId: rid });
        if(l) socket.emit('lobby-update', l); // Сразу шлем ему актуальное состояние
    });

    socket.on('player-ready', async (d) => {
        try {
            const l = await Lobby.findOne({ lobbyId: d.rid });
            if(!l) return;
            const s = l.slots.find(x => x.uid == d.uid);
            if(s) s.ready = !s.ready;
            await l.save();
            
            // Оповещаем ВСЕХ в комнате об изменении
            io.to(d.rid).emit('lobby-update', l);

            if(l.slots.every(x => x.uid && x.ready)) {
                l.status = 'playing'; await l.save();
                io.to(d.rid).emit('launch-match', { game: l.game, lid: l.lobbyId });
            }
        } catch(e) { console.error(e); }
    });

    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));
});

app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const uObj = JSON.parse(params.get('user'));
        const u = await User.findOneAndUpdate({ telegramId: uObj.id }, { username: uObj.first_name }, { upsert: true, new: true });
        res.json({ success: true, user: u });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/lobby/create', async (req, res) => {
    try {
        const { uid, name, game } = req.body;
        const lid = 'R' + Math.floor(1000+Math.random()*9000);
        const l = new Lobby({ lobbyId: lid, creatorId: uid, game, status: 'waiting', slots: [{uid, name, ready:false}, {uid:null, name:null, ready:false}] });
        await l.save();
        res.json({ success: true, lobby: l });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/lobby/join', async (req, res) => {
    try {
        const l = await Lobby.findOneAndUpdate({ lobbyId: req.body.lid, 'slots.1.uid': null }, { $set: {'slots.1.uid': req.body.uid, 'slots.1.name': req.body.name} }, { new: true });
        if(!l) throw new Error("Lobby full or gone");
        res.json({ success: true, lobby: l });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/lobby/list', async (req, res) => {
    const list = await Lobby.find({ status: 'waiting', 'slots.1.uid': null });
    res.json({ success: true, list });
});

httpServer.listen(CONFIG.PORT);
