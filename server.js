// ... (начало кода с подключением и схемами остается прежним)

// 1. Создание турнира и получение ссылки-приглашения
app.post('/api/create-tournament', async (req, res) => {
    const { initData, bet } = req.body;
    if (!verifyTelegramData(initData)) return res.sendStatus(403);
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));

    const user = await User.findOne({ tg_id: tgUser.id });
    if (user.balance < bet) return res.status(400).json({ error: "Недостаточно Stars" });

    user.balance -= bet;
    await user.save();

    const tourney = await Tournament.create({
        creatorId: tgUser.id,
        bet: bet,
        status: 'waiting',
        players: [{ tg_id: tgUser.id, name: tgUser.first_name, score: 0 }]
    });

    // Создаем ссылку для друга
    const inviteLink = `https://t.me/RetroBattleArena_bot/play?startapp=${tourney._id}`;
    res.json({ tourneyId: tourney._id, inviteLink, balance: user.balance });
});

// 2. Вход в турнир по ссылке
app.post('/api/join-tournament', async (req, res) => {
    const { initData, tourneyId } = req.body;
    if (!verifyTelegramData(initData)) return res.sendStatus(403);
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));

    const tourney = await Tournament.findById(tourneyId);
    if (!tourney || tourney.status !== 'waiting') return res.status(400).json({ error: "Турнир недоступен" });

    const user = await User.findOne({ tg_id: tgUser.id });
    if (user.balance < tourney.bet) return res.status(400).json({ error: "Нужно пополнить баланс" });

    user.balance -= tourney.bet;
    await user.save();

    tourney.players.push({ tg_id: tgUser.id, name: tgUser.first_name, score: 0 });
    tourney.status = 'playing';
    await tourney.save();

    res.json({ success: true, bet: tourney.bet });
});
