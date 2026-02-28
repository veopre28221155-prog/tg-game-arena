const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// Установка критических заголовков для работы игровых движков
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
});

app.use(express.static(__dirname));

// Маскировка игровых файлов под системные данные
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
    setHeaders: (res) => {
        res.set('Content-Type', 'application/octet-stream');
    }
}));

// Путь к игровому движку
app.get('/engine', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Stealth Server: ACTIVE`));
