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

// ТАК КАК ВСЕ ФАЙЛЫ В ОДНОЙ ПАПКЕ:
const publicPath = __dirname; 

app.use(express.static(publicPath, {
    setHeaders: function (res, path, stat) {
        res.set('Access-Control-Allow-Origin', '*');
        if (path.endsWith('.wasm')) res.set('Content-Type', 'application/wasm');
        if (path.endsWith('.bin')) res.set('Content-Type', 'application/octet-stream');
        if (path.endsWith('.data')) res.set('Content-Type', 'application/octet-stream');
    }
}));

// Исправленный путь к index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB подключена'))
    .catch(e => console.error('❌ Ошибка MongoDB:', e));

const UserSchema = new mongoose.Schema({ telegramId: Number, balance: { type: Number, default: 0 } });
const User = mongoose.model('User', UserSchema);

app.post('/api/user-data', async (req, res) => {
    try {
        let userId = 12345;
        if (req.body.initData && req.body.initData !== "dummy") {
            try { userId = JSON.parse(new URLSearchParams(req.body.initData).get('user')).id; } catch(e){}
        }
        let user = await User.findOne({ telegramId: userId });
        if (!user) { user = new User({ telegramId: userId }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
