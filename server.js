const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// --- РАЗДАЧА ФАЙЛОВ ---
// Раздаем папку roms
app.use('/roms', express.static(path.join(__dirname, 'roms'), {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', 'application/octet-stream');
    }
}));

// Раздаем остальные файлы (index.html)
app.use(express.static(__dirname));

// --- БД (ИСПРАВЛЕНО) ---
const MONGO_URI = "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.log('❌ DB Error:', err));

const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number,
    balance: { type: Number, default: 100 },
    highScores: { sonic: { type: Number, default: 999999 } }
}));

// --- API ---
app.post('/api/user-data', async (req, res) => {
    try {
        const urlParams = new URLSearchParams(req.body.initData);
        const tgData = JSON.parse(urlParams.get('user'));
        let user = await User.findOne({ telegramId: tgData.id });
        if (!user) { user = new User({ telegramId: tgData.id }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/submit-score', async (req, res) => {
    try {
        const { telegramId, score } = req.body;
        await User.findOneAndUpdate({ telegramId }, { $min: { "highScores.sonic": score } });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// Роут для отладки
app.get('/check-file', (req, res) => {
    const filePath = path.join(__dirname, 'roms', 'sonic.bin');
    res.json({
        exists: fs.existsSync(filePath),
        path: filePath,
        dirContents: fs.readdirSync(__dirname)
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
