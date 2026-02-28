const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// ЗАГОЛОВКИ ДЛЯ РАЗБЛОКИРОВКИ МОЩНОСТИ И ГРАФИКИ
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    // Разрешаем выполнение любых скриптов и блобов
    res.set('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'self' https://t.me https://web.telegram.org;");
    res.set('Cache-Control', 'no-cache');
    next();
});

app.use(express.static(__dirname));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/engine', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server: READY'));
