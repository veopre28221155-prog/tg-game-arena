const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// 1. КРИТИЧЕСКИ ВАЖНО: Разрешаем доступ со всех доменов
app.use(cors()); 
app.use(express.json());

// 2. Раздача папки roms с расширенными заголовками
app.use('/roms', express.static(path.join(__dirname, 'roms'), {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.set('Content-Type', 'application/octet-stream');
        res.set('Cache-Control', 'public, max-age=3600');
    }
}));

// 3. Раздача фронтенда
app.use(express.static(__dirname));

// 4. Проверка файла (для диагностики)
app.get('/check-file', (req, res) => {
    const filePath = path.join(__dirname, 'roms', 'sonic.bin');
    res.json({
        exists: fs.existsSync(filePath),
        path: filePath,
        dir: fs.readdirSync(__dirname)
    });
});

// 5. БД и API
const MONGO_URI = "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB Connected'));

const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number,
    balance: { type: Number, default: 100 },
    highScores: { sonic: { type: Number, default: 999999 } }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
