const express = require('express');
const path = require('path');
const app = express();

// Middleware для обработки JSON и логирования запросов
app.use(express.json());
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// ВАЖНО: Эта единственная строка отвечает за раздачу ВСЕХ файлов из папки 'public'.
// Express сам найдет index.html, sonic2.md, tanks.nes и т.д.
// Твой предыдущий server.js раздавал файлы из корня И из 'public', что создавало путаницу.
// Этот вариант - самый чистый и правильный.
app.use(express.static(path.join(__dirname, 'public')));


// === API для турниров и т.д. (если ты их вернешь) ===
// Этот код можно будет раскомментировать, когда ты вернешь свои турниры
/*
app.post('/api/user-data', (req, res) => {
    // ... твоя логика API ...
});
*/

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Retro Empire is Active on port ${PORT}`));
