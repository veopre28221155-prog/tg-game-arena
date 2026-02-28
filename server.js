const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Настройка отдачи папки с игрой (CORS FIX)
app.use('/roms', express.static(path.join(__dirname, 'roms'), {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.set('Content-Type', 'application/octet-stream');
    }
}));

// Раздача фронтенда
app.use(express.static(__dirname));

const CONFIG = {
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ MongoDB Connected'));

// Схема пользователя
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number,
    balance: { type: Number, default: 100 },
    highScores: { 
        sonic: { type: Number, default: 999999 },
        snake: { type: Number, default: 0 }
    }
}));

// API
app.post('/api/user-data', async (req, res) => {
    try {
        const urlParams = new URLSearchParams(req.body.initData);
        const tgData = JSON.parse(urlParams.get('user'));
        let user = await User.findOne({ telegramId: tgData.id });
        if (!user) { user = new User({ telegramId: tgData.id }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).send("Auth error"); }
});

app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score } = req.body;
    if (game === 'sonic') {
        await User.findOneAndUpdate({ telegramId }, { $min: { "highScores.sonic": score } });
    } else {
        await User.findOneAndUpdate({ telegramId }, { $max: { [`highScores.${game}`]: score } });
    }
    res.json({ success: true });
});

app.listen(CONFIG.PORT, () => console.log(`🚀 Server running on port ${CONFIG.PORT}`));
