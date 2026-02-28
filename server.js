const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// === ВАЖНОЕ ИСПРАВЛЕНИЕ ===
// Явно указываем папку public и настройки для .bin файлов
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: function (res, path, stat) {
        if (path.endsWith('.bin')) {
            res.set('Content-Type', 'application/octet-stream');
        }
    }
}));

// Логируем запрос файла игры, чтобы видеть в консоли Render, качает он его или нет
app.get('/sonic.bin', (req, res) => {
    console.log('📂 [SERVER] Попытка скачать sonic.bin...');
    res.sendFile(path.join(__dirname, 'public', 'sonic.bin'), (err) => {
        if (err) {
            console.error('❌ [SERVER] Ошибка отправки файла (проверь название!):', err);
            res.status(404).send("File not found");
        } else {
            console.log('✅ [SERVER] Файл sonic.bin успешно отправлен!');
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8", 
    CRYPTO_BOT_TOKEN: "535127:AAviaEd5s4fdrTrHuHpXARM04OXIa7XsEjV", 
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416,
    PORT: process.env.PORT || 3000
};

// Подключение к БД
mongoose.connect(CONFIG.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(e => console.error('❌ MongoDB Connection Error:', e));

const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    balance: { type: Number, default: 0 },
    highScores: { sonic: { type: Number, default: 0 } }
});
const User = mongoose.model('User', UserSchema);

// APIEndpoints
app.post('/api/user-data', async (req, res) => {
    try {
        let userData = { id: 12345 };
        if (req.body.initData && req.body.initData !== "dummy") {
            try { userData = JSON.parse(new URLSearchParams(req.body.initData).get('user')); } catch(e){}
        }
        let user = await User.findOne({ telegramId: userData.id });
        if (!user) { user = new User({ telegramId: userData.id }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const server = http.createServer(app);
server.listen(CONFIG.PORT, () => {
    console.log('🚀 Server running on port ' + CONFIG.PORT);
});
