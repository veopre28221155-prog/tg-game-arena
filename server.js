const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Тщательная настройка заголовков для мобильных устройств
app.use(express.static(__dirname, {
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
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
