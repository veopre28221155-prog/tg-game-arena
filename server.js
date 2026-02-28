const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Указываем, что файлы могут быть и в корне, и в папке public
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    // Проверяем оба варианта расположения index.html
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
});

// Специальный маршрут для проверки файла игры
app.get('/test-file', (req, res) => {
    res.send('Сервер работает. Попробуй открыть /sonic.bin в браузере.');
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
