const express = require('express');
const path = require('path');
const app = express();

// Middleware для обработки JSON и логирования запросов
app.use(express.json());
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// ================== БАЗА ДАННЫХ ДУЭЛЕЙ (В ПАМЯТИ СЕРВЕРА) ==================
const duels = {}; 
// ==========================================================================

// ВАЖНО: Правильно раздаем статичные файлы. 
// Папка 'public' для ROM-файлов, корневая папка для index.html.
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// === API ДЛЯ УПРАВЛЕНИЯ ДУЭЛЯМИ ===

app.post('/api/create-duel', (req, res) => {
    const { game, fileName, core, playerName } = req.body;
    const duelId = `duel_${Math.random().toString(36).substr(2, 9)}`;
    
    duels[duelId] = { game, fileName, core, player1: playerName, score1: null, player2: null, score2: null, status: 'waiting_p1' };
    console.log(`[ДУЭЛЬ СОЗДАНА] ID: ${duelId} | Game: ${game}`);
    res.json({ success: true, duelId });
});

app.post('/api/submit-score', (req, res) => {
    const { duelId, playerName, score } = req.body;
    const duel = duels[duelId];

    if (!duel) return res.status(404).json({ success: false, message: "Дуэль не найдена" });

    if (duel.status === 'waiting_p1' && duel.player1 === playerName) {
        duel.score1 = score;
        duel.status = 'waiting_p2';
        console.log(`[РЕЗУЛЬТАТ P1] ID: ${duelId} | Score: ${score}`);
    } else if (duel.status === 'waiting_p2') {
        duel.player2 = playerName;
        duel.score2 = score;
        duel.status = 'finished';
        console.log(`[РЕЗУЛЬТАТ P2] ID: ${duelId} | Score: ${score}. ЗАВЕРШЕНО.`);
    }
    res.json({ success: true, duel });
});

app.get('/api/get-duels', (req, res) => {
    const openDuels = Object.fromEntries(
        Object.entries(duels).filter(([id, duel]) => duel.status === 'waiting_p2')
    );
    res.json(openDuels);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dueling Arena System Active on port ${PORT}`));
