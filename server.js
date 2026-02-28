const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// Эти заголовки Обязательны для работы игр в 2024 году
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    res.set('Cache-Control', 'no-store');
    next();
});

app.use(express.static(__dirname));

// Маршрут для игрового движка
app.get('/engine', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is LIVE on port ${PORT}`));
