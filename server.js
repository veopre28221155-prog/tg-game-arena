const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Разрешаем серверу отдавать файлы из папки public и из корня
const publicPath = __dirname;
app.use(express.static(publicPath, {
    setHeaders: (res, filePath) => {
        res.set('Access-Control-Allow-Origin', '*');
        // Помогаем телефону понять типы файлов эмулятора
        if (filePath.endsWith('.wasm')) res.set('Content-Type', 'application/wasm');
        if (filePath.endsWith('.data')) res.set('Content-Type', 'application/octet-stream');
        if (filePath.endsWith('.js')) res.set('Content-Type', 'application/javascript');
    }
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
