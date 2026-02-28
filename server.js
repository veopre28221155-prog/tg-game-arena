const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());

// Заголовки для работы игровых движков (SharedArrayBuffer)
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    res.set('Cache-Control', 'no-cache');
    next();
});

app.use(express.static(__dirname));

// Специальный путь для проверки существования файлов
app.get('/api/check-rom', (req, res) => {
    const romPath = path.join(__dirname, 'roms', 'sonic.bin');
    const exists = fs.existsSync(romPath);
    res.json({ 
        status: exists ? "OK" : "ERROR", 
        message: exists ? "Файл найден" : "Файл sonic.bin не найден в папке roms",
        size: exists ? fs.statSync(romPath).size : 0
    });
});

app.get('/engine', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HOSTING RUNNING ON PORT ${PORT}`));
