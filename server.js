const express = require('express');
const path = require('path');
const app = express();
app.use(express.json()); // ВАЖНО: Разрешаем серверу принимать JSON-данные

// ================== БАЗА ДАННЫХ ДУЭЛЕЙ (ВРЕМЕННАЯ) ==================
// Пока что все дуэли будут храниться прямо здесь, в памяти сервера.
// При перезапуске сервера они будут стираться.
const duels = {}; 
// Пример того, как будет выглядеть дуэль:
// "d123xyz": { game: "Battletoads", player1: "ID_7732", score1: 125, player2: null, score2: null, status: "waiting" }
// =================================================================

// Статичные файлы (игры и index.html)
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// === API ДЛЯ УПРАВЛЕНИЯ ДУЭЛЯМИ ===

// 1. Создать новую дуэль
app.post('/api/create-duel', (req, res) => {
    const { game, playerName } = req.body;
    const duelId = `duel_${Math.random().toString(36).substr(2, 9)}`;
    
    duels[duelId] = {
        game: game,
        player1: playerName,
        score1: null,
        player2: null,
        score2: null,
        status: 'waiting_p1' // Ждем, пока игрок 1 закончит свой раунд
    };

    console.log(`[ДУЭЛЬ СОЗДАНА] ID: ${duelId}, Игра: ${game}`);
    res.json({ success: true, duelId: duelId });
});

// 2. Отправить результат раунда на сервер
app.post('/api/submit-score', (req, res) => {
    const { duelId, playerName, score } = req.body;
    const duel = duels[duelId];

    if (!duel) {
        return res.status(404).json({ success: false, message: "Дуэль не найдена" });
    }

    if (duel.status === 'waiting_p1' && duel.player1 === playerName) {
        duel.score1 = score;
        duel.status = 'waiting_p2'; // Теперь ждем второго игрока
        console.log(`[РЕЗУЛЬТАТ P1] ID: ${duelId}, Счет: ${score}`);
    } else if (duel.status === 'waiting_p2' && !duel.player2) {
        duel.player2 = playerName;
        duel.score2 = score;
        duel.status = 'finished'; // Дуэль завершена
        console.log(`[РЕЗУЛЬТАТ P2] ID: ${duelId}, Счет: ${score}. ДУЭЛЬ ЗАВЕРШЕНА.`);
    }

    res.json({ success: true, duel: duel });
});

// 3. Получить информацию о всех доступных дуэлях
app.get('/api/get-duels', (req, res) => {
    // Отправляем только те дуэли, где еще есть место для 2-го игрока
    const openDuels = Object.entries(duels)
        .filter(([id, duel]) => duel.status === 'waiting_p2')
        .reduce((obj, [id, duel]) => {
            obj[id] = duel;
            return obj;
        }, {});
    res.json(openDuels);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dueling Arena System Active on port ${PORT}`));
