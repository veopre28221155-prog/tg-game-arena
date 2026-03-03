const express = require('express');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
// УВЕЛИЧЕННЫЙ БУФЕР ДЛЯ ПЕРЕДАЧИ SNAPSHOT
const io = new Server(httpServer, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7 // 10MB
});

app.use(express.static('public'));
app.use(express.json());

const CONFIG = {
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI);

const User = mongoose.model('User', new mongoose.Schema({ telegramId: Number, username: String, balance: { type: Number, default: 1000 } }));
const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String, creatorId: Number, player2Id: Number, game: String, status: String,
    name1: String, name2: String, r1: Boolean, r2: Boolean
}));

io.on('connection', (socket) => {
    socket.on('join-room', (rid) => socket.join(rid));
    
    // Релей кнопок
    socket.on('emu-input', (d) => socket.to(d.rid).emit('partner-input', d));

    // РЕЛЕЙ СОСТОЯНИЯ ПАМЯТИ (STATE SYNC)
    socket.on('sync-state', (d) => {
        socket.to(d.rid).emit('apply-state', d.state);
    });

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

// ... твои API (user-data, lobby/create, join) остаются такими же
httpServer.listen(CONFIG.PORT);
