const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

// Прямая раздача файлов из корня и папки roms
app.use(express.static(path.join(__dirname)));
app.use('/roms', express.static(path.join(__dirname, 'roms')));

// ТЕСТОВЫЙ ПУТЬ: Проверить, видит ли сервер файл
app.get('/test-rom', (req, res) => {
    res.sendFile(path.join(__dirname, 'roms', 'sonic.bin'), (err) => {
        if (err) res.status(404).send("Файл sonic.bin НЕ НАЙДЕН в папке roms");
    });
});

// ... (остальной код лобби и БД оставляем как был)

app.listen(process.env.PORT || 3000, () => console.log("Server OK"));
