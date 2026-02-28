const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// КРИТИЧЕСКИ ВАЖНО для игровых движков (SharedArrayBuffer)
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// Раздача файлов игры и движка
app.use(express.static(__dirname));

// Маршрут для запуска игрового ядра
app.get('/engine', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Игровая станция запущена на порту ${PORT}`));
