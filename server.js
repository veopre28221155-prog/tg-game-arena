const path = require('path');

// Добавьте это СРАЗУ ПОСЛЕ создания переменной app = express():
app.use('/roms', express.static(path.join(__dirname, 'roms')));
app.use(express.static(__dirname));

// Чтобы проверить, видит ли сервер файл, добавьте этот маршрут:
app.get('/debug-rom', (req, res) => {
    const fs = require('fs');
    const filePath = path.join(__dirname, 'roms', 'sonic.bin');
    if (fs.existsSync(filePath)) {
        res.send("✅ Файл sonic.bin найден на сервере!");
    } else {
        res.send("❌ Файл НЕ НАЙДЕН. Проверьте, что на GitHub есть папка roms и в ней sonic.bin");
    }
});
