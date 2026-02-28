const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// Настройки для высокой производительности (SharedArrayBuffer)
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// Раздаем статические файлы
app.use(express.static(__dirname));
app.use('/roms', express.static(path.join(__dirname, 'roms')));

// Маршрут для игрового движка
app.get('/engine', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен!`);
});
