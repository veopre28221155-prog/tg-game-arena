const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 3000;

// ИИ получает доступ ко всему в папке проекта
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/check-assets', (req, res) => {
    // ИИ проверяет наличие файлов в папке public
    const hasSonic = fs.existsSync(path.join(__dirname, 'public', 'sonic.bin')) || fs.existsSync(path.join(__dirname, 'sonic.bin'));
    res.json({ sonic_bin: hasSonic, status: "AI_ACCESS_GRANTED" });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 AI Server visualizer active on port ${PORT}`));
