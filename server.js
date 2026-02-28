const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// --- НАСТРОЙКА ДЛЯ СОНИКА (CORS + STATIC) ---
// Принудительно отдаем папку roms с разрешением для эмулятора
app.use('/roms', express.static(path.join(__dirname, 'roms'), {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', 'application/octet-stream');
    }
}));

// Раздача остальных файлов (index.html и т.д.)
app.use(express.static(__dirname));

// --- СИСТЕМА ОТЛАДКИ ---
app.get('/debug', (req, res) => {
    const romPath = path.join(__dirname, 'roms', 'sonic.bin');
    const exists = fs.existsSync(romPath);
    res.json({
        status: "OK",
        folder_roms_exists: fs.existsSync(path.join(__dirname, 'roms')),
        file_sonic_exists: exists,
        path_checked: romPath,
        tip: exists ? "Все ок!" : "Загрузите файл sonic.bin в папку roms на GitHub"
    });
});

// --- БАЗА ДАННЫХ ---
const CONFIG = {
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ MongoDB Connected'));

const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number,
    balance: { type: Number, default: 100 },
    highScores: { sonic: { type: Number, default: 999999 }, snake: { type: Number, default: 0 } }
}));

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
    const update = game === 'sonic' ? { $min: { "highScores.sonic": score } } : { $max: { "highScores.snake": score } };
    await User.findOneAndUpdate({ telegramId }, update);
    res.json({ success: true });
});

app.listen(CONFIG.PORT, () => console.log(`🚀 Server running on port ${CONFIG.PORT}`));
