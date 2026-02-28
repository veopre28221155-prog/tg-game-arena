const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// 1. Разрешаем запросы со всех адресов (для Telegram)
app.use(cors());

// 2. КРИТИЧЕСКИ ВАЖНО: Заголовки для работы игровых движков
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// 3. Раздаем все файлы в текущей папке
app.use(express.static(__dirname));

// 4. Раздаем папку с игрой (проверь, чтобы папка называлась roms)
app.use('/roms', express.static(path.join(__dirname, 'roms')));

// 5. Маршрут для игрового плеера
app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Игровой сервер запущен на порту ${PORT}`);
});
