const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors());

const MONGO_URI = "ВАША_ССЫЛКА_MONGODB";
const ADMIN_ID = 1463465416;

mongoose.connect(MONGO_URI);

const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number,
    balance: { type: Number, default: 100 },
    highScores: {
        sonic: { type: Number, default: 999999 }, // Для Соника чем меньше, тем лучше
        tetris: { type: Number, default: 0 },
        snake: { type: Number, default: 0 },
        bomber: { type: Number, default: 0 }
    }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String,
    gameType: String,
    betAmount: Number,
    player1: Number,
    player2: Number,
    score1: { type: Number, default: -1 },
    score2: { type: Number, default: -1 },
    status: { type: String, default: 'waiting' } // waiting, playing, finished
}));

app.post('/api/user-data', async (req, res) => {
    const { initData } = req.body;
    // В реальном приложении здесь нужна валидация initData
    const urlParams = new URLSearchParams(initData);
    const tgUser = JSON.parse(urlParams.get('user'));
    let user = await User.findOne({ telegramId: tgUser.id });
    if (!user) { user = new User({ telegramId: tgUser.id }); await user.save(); }
    res.json(user);
});

app.post('/api/lobby/create', async (req, res) => {
    const { telegramId, gameType, betAmount } = req.body;
    const lobbyId = "L" + Date.now();
    const lobby = new Lobby({ lobbyId, gameType, betAmount, player1: telegramId });
    await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -betAmount } });
    await lobby.save();
    res.json({ success: true, lobby });
});

app.post('/api/lobby/join', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    const lobby = await Lobby.findOne({ lobbyId, status: 'waiting' });
    if (lobby) {
        lobby.player2 = telegramId;
        lobby.status = 'playing';
        await lobby.save();
        await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -lobby.betAmount } });
        res.json({ success: true, lobby });
    } else res.json({ success: false });
});

app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;
    
    // Обновляем личный рекорд
    const user = await User.findOne({ telegramId });
    if (game === 'sonic') {
        if (score < user.highScores.sonic) user.highScores.sonic = score;
    } else {
        if (score > user.highScores[game]) user.highScores[game] = score;
    }
    await user.save();

    // Обработка турнира
    if (lobbyId) {
        const lobby = await Lobby.findOne({ lobbyId });
        if (lobby.player1 === telegramId) lobby.score1 = score;
        if (lobby.player2 === telegramId) lobby.score2 = score;
        
        if (lobby.score1 !== -1 && lobby.score2 !== -1) {
            lobby.status = 'finished';
            let winner = null;
            if (game === 'sonic') {
                winner = lobby.score1 < lobby.score2 ? lobby.player1 : lobby.player2;
            } else {
                winner = lobby.score1 > lobby.score2 ? lobby.player1 : lobby.player2;
            }
            
            const prize = Math.floor(lobby.betAmount * 1.8);
            const fee = (lobby.betAmount * 2) - prize;
            
            await User.findOneAndUpdate({ telegramId: winner }, { $inc: { balance: prize } });
            await User.findOneAndUpdate({ telegramId: ADMIN_ID }, { $inc: { balance: fee } });
        }
        await lobby.save();
    }
    res.json({ success: true });
});

app.get('/api/lobbies', async (req, res) => {
    res.json(await Lobby.find({ status: 'waiting' }));
});

app.post('/api/lobby/status', async (req, res) => {
    const lobby = await Lobby.findOne({ lobbyId: req.body.lobbyId });
    res.json({ lobby });
});

app.listen(process.env.PORT || 3000);
