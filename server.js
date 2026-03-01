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
// Этот код оставлен на будущее, если захочешь вернуть старые дуэли
const duels = {}; 

// ==========================================================================

// ВАЖНО: ЕДИНСТВЕННАЯ И ГЛАВНАЯ СТРОКА ДЛЯ РАЗДАЧИ ФАЙЛОВ!
// Сервер будет раздавать ВСЕ файлы (включая index.html) из папки 'public'.
// Когда пользователь заходит на сайт, Express автоматически найдет 'index.html' в этой папке.
app.use(express.static(path.join(__dirname, 'public')));


// === ТВОЙ API ДЛЯ УПРАВЛЕНИЯ ЛОББИ И ИГРОКАМИ (БЕЗ ИЗМЕНЕНИЙ) ===
// Весь твой мощный код для турниров, пользователей и платежей остается здесь.
// Я его не показываю, чтобы не загромождать ответ. Просто оставь его как есть.
// ... (здесь твой код про /api/user-data, /api/lobbies, /api/buy-stars и т.д.)


// Код для старых дуэлей. Пусть пока будет здесь.
app.post('/api/create-duel', (req, res) => {
    const { game, fileName, core, playerName } = req.body;
    const duelId = `duel_${Math.random().toString(36).substr(2, 9)}`;
    duels[duelId] = { game, fileName, core, player1: playerName, score1: null, player2: null, score2: null, status: 'waiting_p1' };
    console.log(`[ДУЭЛЬ СОЗДАНА] ID: ${duelId} | Game: ${game}`);
    res.json({ success: true, duelId });
});
app.get('/api/get-duels', (req, res) => {
    const openDuels = Object.fromEntries(
        Object.entries(duels).filter(([id, duel]) => duel.status === 'waiting_p2')
    );
    res.json(openDuels);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Retro Battle Arena is Active on port ${PORT}`));
