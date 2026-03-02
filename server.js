const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static('public'));

const CONFIG = {
    BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8", 
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, 
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI);

const User = mongoose.model('User', new mongoose.Schema({ telegramId: Number, username: String, balance: { type: Number, default: 1000 } }));
const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player2Id: Number, creatorName: String, player2Name: String,
    game: String, bet: { type: Number, default: 0 }, status: { type: String, default: 'waiting' }, isPrivate: Boolean,
    r1: { type: Boolean, default: false }, r2: { type: Boolean, default: false },
    s1: { type: Number, default: -1 }, s2: { type: Number, default: -1 }
}));

io.on('connection', (socket) => {
    socket.on('force-join', (rid) => { socket.join(rid); });

    socket.on('player-ready', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid });
        if (!l) return;
        if (l.creatorId == d.uid) l.r1 = true; else l.player2Id == d.uid ? l.r2 = true : null;
        await l.save();
        io.to(d.rid).emit('lobby-update', l);
        
        if (l.r1 && l.r2) {
            l.status = 'playing'; await l.save();
            io.to(d.rid).emit('start-match', { game: l.game, lid: l.lobbyId });
        }
    });

    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));

    socket.on('match-end', async (d) => {
        const l = await Lobby.findOne({ lobbyId: d.rid, status: 'playing' });
        if (!l) return;
        if (l.creatorId == d.uid) l.s1 = d.score; else l.s2 = d.score;
        await l.save();
        if (l.s1 !== -1 && l.s2 !== -1) {
            const winId = l.s1 > l.s2 ? l.creatorId : l.player2Id;
            if (l.bet > 0) {
                const prize = (l.bet * 2) * 0.95;
                await User.findOneAndUpdate({ telegramId: winId }, { $inc: { balance: prize } });
                await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: (l.bet * 2) * 0.05 } });
            }
            l.status = 'finished'; await l.save();
            io.to(l.lobbyId).emit('results', { winId });
        }
    });
});

app.post('/api/user-data', async (req, res) => {
    const params = new URLSearchParams(req.body.initData);
    const userData = JSON.parse(params.get('user'));
    let u = await User.findOne({ telegramId: userData.id });
    if (!u) { u = new User({ telegramId: userData.id, username: userData.first_name }); await u.save(); }
    res.json(u);
});

app.post('/api/lobby/create', async (req, res) => {
    const { uid, name, game, bet, priv } = req.body;
    const lobbyId = 'L' + Math.floor(1000 + Math.random()*9000);
    const lobby = new Lobby({ lobbyId, creatorId: uid, creatorName: name, game, bet, isPrivate: priv });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.post('/api/lobby/join', async (req, res) => {
    const { uid, name, lid } = req.body;
    const l = await Lobby.findOneAndUpdate({ lobbyId: lid, status: 'waiting' }, { player2Id: uid, player2Name: name }, { new: true });
    if (l) { io.to(lid).emit('lobby-update', l); res.json({ success: true, lobby: l }); }
    else res.json({ success: false });
});

app.get('/api/lobby/list', async (req, res) => res.json(await Lobby.find({ status: 'waiting', isPrivate: false })));

httpServer.listen(CONFIG.PORT);
