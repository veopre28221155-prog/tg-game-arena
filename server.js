const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// КРИТИЧЕСКИЕ НАСТРОЙКИ МОЩНОСТИ (SharedArrayBuffer)
// Эти заголовки позволяют эмулятору использовать многопоточность процессора телефона
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

app.use(express.static(__dirname));

// Маршрут к Игровому Узлу
app.get('/engine', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Игровая станция активна` phot));
