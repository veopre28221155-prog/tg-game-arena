// ... (начало кода такое же: подключение mongoose, axios и проверка initData)

// Схема Турнира
const TournamentSchema = new mongoose.Schema({
    creatorId: Number,
    bet: Number,
    status: { type: String, default: 'waiting' }, // waiting, playing, finished
    winnerId: Number,
    players: [{ tg_id: Number, name: String, score: Number }]
});
const Tournament = mongoose.model('Tournament', TournamentSchema);

// 1. Создание турнира
app.post('/api/create-tournament', async (req, res) => {
    const { initData, bet } = req.body;
    if (!verifyTelegramData(initData)) return res.sendStatus(403);
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));

    const user = await User.findOne({ tg_id: tgUser.id });
    if (user.balance < bet) return res.status(400).json({ error: "Недостаточно Stars" });

    // Списываем ставку
    user.balance -= bet;
    await user.save();

    const tourney = await Tournament.create({
        creatorId: tgUser.id,
        bet: bet,
        players: [{ tg_id: tgUser.id, name: tgUser.first_name, score: 0 }]
    });

    res.json({ tourneyId: tourney._id, balance: user.balance });
});

// 2. Завершение и выплата приза
app.post('/api/finish-tournament', async (req, res) => {
    const { initData, tourneyId, score } = req.body;
    if (!verifyTelegramData(initData)) return res.sendStatus(403);
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));

    const tourney = await Tournament.findById(tourneyId);
    if (tourney.status === 'finished') return res.status(400).json({ error: "Уже завершен" });

    // В демо-режиме (против бота) сразу начисляем выигрыш, если победил
    const winAmount = Math.floor(tourney.bet * 1.8); // 1.8x от ставки (10% комиссия сервиса)
    
    const user = await User.findOne({ tg_id: tgUser.id });
    user.balance += winAmount;
    await user.save();

    tourney.status = 'finished';
    await tourney.save();

    res.json({ win: true, amount: winAmount, newBalance: user.balance });
});

// ... (остальной код порта и запуска)
