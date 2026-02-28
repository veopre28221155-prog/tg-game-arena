const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

const CONFIG = {
    PORT: process.env.PORT || 3000,
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
};

// === ДИАГНОСТИКА ФАЙЛОВ ПРИ ЗАПУСКЕ ===
const publicPath = path.join(__dirname, 'public');
console.log(`📂 [SERVER] Путь к папке public: ${publicPath}`);

if (fs.existsSync(publicPath)) {
    console.log('✅ [SERVER] Папка public существует. Содержимое:');
    fs.readdirSync(publicPath).forEach(file => {
        console.log(`   📄 - ${file}`);
    });
} else {
    console.error('❌ [SERVER] ПАПКА PUBLIC НЕ НАЙДЕНА! Создай её и положи туда sonic.bin');
}

// === РАЗДАЧА ФАЙЛОВ ===
app.use(express.static(publicPath));

// Специальный маршрут для проверки наличия файла клиентом
app.get('/check-file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(publicPath, filename);
    
    if (fs.existsSync(filePath)) {
        res.json({ found: true, size: fs.statSync(filePath).size });
    } else {
        res.status(404).json({ found: false, error: 'File not found on disk' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// === ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ ===
mongoose.connect(CONFIG.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(e => console.error('❌ MongoDB Error:', e));

const UserSchema = new mongoose.Schema({ telegramId: Number, balance: Number });
const User = mongoose.model('User', UserSchema);

app.post('/api/user-data', async (req, res) => {
    try {
        const user = new User({ telegramId: 12345, balance: 100 }); // Заглушка для теста
        res.json(user);
    } catch (e) { res.json({ error: e.message }); }
});

const server = http.createServer(app);
server.listen(CONFIG.PORT, () => {
    console.log('🚀 Server running on port ' + CONFIG.PORT);
});
