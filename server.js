const express = require('express');
const path = require('path');
const app = express();

// Middleware для логирования запросов, чтобы видеть, что происходит
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// ЕДИНСТВЕННАЯ И ГЛАВНАЯ СТРОКА для раздачи ВСЕХ файлов из папки 'public'.
// Express сам найдет index.html, sonic2.md, tanks.nes и т.д.
app.use(express.static(path.join(__dirname, 'public')));


// Тут может быть твой API для турниров, если ты его вернешь.
// app.use(express.json());
// app.post('/api/create-duel', ...);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Retro Empire is Active on port ${PORT}`));
