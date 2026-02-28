const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());

// КРИТИЧЕСКИ ВАЖНО для работы эмуляторов в 2024 году:
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// Раздача папки roms
app.use('/roms', express.static(path.join(__dirname, 'roms'), {
    setHeaders: (res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', 'application/octet-stream');
    }
}));

app.use(express.static(__dirname));

// Маршрут для самой игры (тот самый "выделенный сайт")
app.get('/play-sonic', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

// Диагностика
app.get('/check-file', (req, res) => {
    const p = path.join(__dirname, 'roms', 'sonic.bin');
    res.json({ exists: fs.existsSync(p), size: fs.existsSync(p) ? fs.statSync(p).size : 0 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Игровой сервер запущен на порту ${PORT}`));
