const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// Разрешаем CORS для всех запросов
app.use(cors());

const PORT = process.env.PORT || 3000;

// Настройка папки для статики (и корень, и папка public)
const publicPath = __dirname; 

app.use(express.static(publicPath, {
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        if (filePath.endsWith('.wasm')) res.set('Content-Type', 'application/wasm');
        if (filePath.endsWith('.data')) res.set('Content-Type', 'application/octet-stream');
    }
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
