const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// РАЗДАЧА ФАЙЛОВ
app.use(express.static(__dirname));
app.use('/roms', express.static(path.join(__dirname, 'roms'), {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*'); // Разрешаем доступ к рому
    }
}));

const CONFIG = {
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416,
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('MongoDB Connected'));

const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number,
    balance: { type: Number, default: 100 },
    highScores: { sonic: { type: Number, default: 999999 }, snake: { type: Number, default: 0 } }
}));

app.post('/api/user-data', async (req, res) => {
    try {
        const urlParams = new URLSearchParams(req.body.initData);
        const tgUser = JSON.parse(urlParams.get('user'));
        let user = await User.findOne({ telegramId: tgUser.id });
        if (!user) { user = new User({ telegramId: tgUser.id }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score } = req.body;
    const user = await User.findOne({ telegramId });
    if (game === 'sonic') {
        if (score < user.highScores.sonic) user.highScores.sonic = score;
    } else {
        if (score > user.highScores[game]) user.highScores[game] = score;
    }
    await user.save();
    res.json({ success: true });
});

app.listen(CONFIG.PORT, () => console.log(`Server running on port ${CONFIG.PORT}`));
