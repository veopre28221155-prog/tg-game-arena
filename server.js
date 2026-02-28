const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// 1. Максимально открытый CORS
app.use(cors());
app.use(express.json());

// 2. Специальные заголовки для работы эмуляторов (SharedArrayBuffer)
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// 3. Раздача папки roms
app.use('/roms', express.static(path.join(__dirname, 'roms'), {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', 'application/octet-stream');
    }
}));

app.use(express.static(__dirname));

// Диагностика
app.get('/check-file', (req, res) => {
    res.json({ exists: fs.existsSync(path.join(__dirname, 'roms', 'sonic.bin')) });
});

// БД
const MONGO_URI = "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log('✅ DB Connected'));

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
    } catch (e) { res.status(500).send("Error"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running`));
