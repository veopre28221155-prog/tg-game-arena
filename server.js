const express = require('express');
const path = require('path');
const app = express();

// Middleware для логирования запросов (полезно для отладки)
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// ЕДИНСТВЕННАЯ И ГЛАВНАЯ СТРОКА для раздачи ВСЕХ файлов из папки 'public'.
// Express сам найдет index.html, sonic2.md, tanks.nes и т.д.
app.use(express.static(path.join(__dirname, 'public')));


// Если у тебя будет API для турниров, оно будет здесь.
// app.use(express.json());
// app.post('/api/some-route', ...);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Retro Empire is Active on port ${PORT}`));
