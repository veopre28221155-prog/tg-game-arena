const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority";

// === РАЗДАЧА ФАЙЛОВ ЭМУЛЯТОРА И ИГР ===
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath, {
    setHeaders: function (res, path, stat) {
        // Гарантируем, что файлы игр скачиваются правильно
        if (path.endsWith('.bin') || path.endsWith('.gen') || path.endsWith('.smd')) {
            res.set('Content-Type', 'application/octet-stream');
        }
    }
}));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// === БАЗА ДАННЫХ ===
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB успешно подключена'))
    .catch(e => console.error('❌ Ошибка подключения к MongoDB:', e));

const UserSchema = new mongoose.Schema({ telegramId: Number, balance: { type: Number, default: 0 } });
const User = mongoose.model('User', UserSchema);

// API для юзеров
app.post('/api/user-data', async (req, res) => {
    try {
        let userId = 12345; // Заглушка, если запущен не в ТГ
        if (req.body.initData && req.body.initData !== "dummy") {
            try { userId = JSON.parse(new URLSearchParams(req.body.initData).get('user')).id; } catch(e){}
        }
        let user = await User.findOne({ telegramId: userId });
        if (!user) { user = new User({ telegramId: userId }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Запуск сервера
const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
