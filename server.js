const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

// --- КОНФИГУРАЦИЯ ---
const CONFIG = {
    // ВАЖНО: Используйте .env в реальном проекте. Здесь хардкод по заданию.
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8",
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, // Ваш ID для комиссии
    PORT: process.env.PORT || 3000
};

// --- ПОДКЛЮЧЕНИЕ К БД ---
mongoose.connect(CONFIG.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Error:', err));

// --- СХЕМЫ ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    balance: { type: Number, default: 0 },
    highScores: {
        snake: { type: Number, default: 0 },
        tetris: { type: Number, default: 0 }
    }
});

const LobbySchema = new mongoose.Schema({
    lobbyId: { type: String, required: true, unique: true },
    player1Id: Number,
    player2Id: Number,
    betAmount: { type: Number, required: true },
    status: { type: String, default: 'waiting' }, // waiting, active, finished
    scores: {
        player1: { type: Number, default: -1 },
        player2: { type: Number, default: -1 }
    },
    createdAt: { type: Date, default: Date.now }
});

const WithdrawalSchema = new mongoose.Schema({
    telegramId: Number,
    amount: Number,
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Lobby = mongoose.model('Lobby', LobbySchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
const verifyTelegramWebAppData = (telegramInitData) => {
    if (!telegramInitData) return false;
    const urlParams = new URLSearchParams(telegramInitData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    const paramsList = [];
    for (const [key, value] of urlParams.entries()) paramsList.push(`${key}=${value}`);
    paramsList.sort();
    const dataCheckString = paramsList.join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CONFIG.TELEGRAM_BOT_TOKEN).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    return hmac === hash;
};

// --- ЭНДПОИНТЫ API ---

// 1. Инициализация и получение данных юзера
app.post('/api/user-data', async (req, res) => {
    const { initData } = req.body;
    if (!verifyTelegramWebAppData(initData)) return res.status(403).json({ error: 'Auth failed' });

    const userData = JSON.parse(new URLSearchParams(initData).get('user'));
    
    try {
        let user = await User.findOne({ telegramId: userData.id });
        if (!user) {
            user = new User({
                telegramId: userData.id,
                username: userData.username,
                firstName: userData.first_name,
                balance: 100 // Бонус новичкам
            });
            await user.save();
        }
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Создание лобби (Снятие ставки P1)
app.post('/api/create-lobby', async (req, res) => {
    const { telegramId, betAmount } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < betAmount) return res.status(400).json({ error: 'Недостаточно средств' });

        user.balance -= betAmount;
        await user.save();

        const lobbyId = `L_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const lobby = new Lobby({ lobbyId, player1Id: telegramId, betAmount });
        await lobby.save();

        res.json({ success: true, lobbyId, newBalance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Вход в лобби (Снятие ставки P2)
app.post('/api/join-lobby', async (req, res) => {
    const { telegramId, startParam } = req.body;
    if (!startParam) return res.json({ mode: 'training' });

    try {
        const lobby = await Lobby.findOne({ lobbyId: startParam });
        
        // Вход создателя (восстановление сессии)
        if (lobby && lobby.player1Id === telegramId) {
            return res.json({ mode: 'duel', role: 'creator', lobby });
        }

        // Вход второго игрока
        if (lobby && !lobby.player2Id) {
            const user = await User.findOne({ telegramId });
            if (!user || user.balance < lobby.betAmount) {
                return res.status(400).json({ error: 'Недостаточно средств для ставки' });
            }

            user.balance -= lobby.betAmount;
            await user.save();

            lobby.player2Id = telegramId;
            lobby.status = 'active';
            await lobby.save();

            return res.json({ mode: 'duel', role: 'joiner', lobby });
        }

        return res.status(400).json({ error: 'Лобби не найдено или заполнено' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Фиксация счета и РАСПРЕДЕЛЕНИЕ ВЫИГРЫША
app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;

    try {
        // Обновляем High Score
        const user = await User.findOne({ telegramId });
        if (user && score > user.highScores[game]) {
            user.highScores[game] = score;
            await user.save();
        }

        if (!lobbyId) return res.json({ success: true }); // Тренировка

        const lobby = await Lobby.findOne({ lobbyId });
        if (!lobby || lobby.status === 'finished') return res.json({ success: true });

        // Записываем счет
        if (lobby.player1Id === telegramId) lobby.scores.player1 = score;
        else if (lobby.player2Id === telegramId) lobby.scores.player2 = score;
        
        await lobby.save();

        // Если оба сыграли, распределяем банк
        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            lobby.status = 'finished';
            await lobby.save();

            const totalPool = lobby.betAmount * 2;
            const adminFee = Math.floor(totalPool * 0.10); // 10%
            const prize = totalPool - adminFee; // 90%

            let winnerId = null;
            if (lobby.scores.player1 > lobby.scores.player2) winnerId = lobby.player1Id;
            else if (lobby.scores.player2 > lobby.scores.player1) winnerId = lobby.player2Id;

            // 1. Начисляем комиссию АДМИНУ
            await User.updateOne(
                { telegramId: CONFIG.ADMIN_ID },
                { $inc: { balance: adminFee } },
                { upsert: true } // Создать админа, если нет
            );

            // 2. Начисляем выигрыш ПОБЕДИТЕЛЮ
            if (winnerId) {
                await User.updateOne(
                    { telegramId: winnerId },
                    { $inc: { balance: prize } }
                );
            } else {
                // Ничья: возвращаем ставки (минус комиссия за организацию или полный возврат - сделаем возврат за вычетом комиссии для простоты экономики)
                // Или просто вернем каждому по ставке. В ТЗ сказано "победитель получает".
                // При ничьей вернем каждому по ставке за вычетом 5% (половина комиссии).
                const refund = Math.floor(lobby.betAmount * 0.9); // Возврат 90% ставки
                 await User.updateOne({ telegramId: lobby.player1Id }, { $inc: { balance: refund } });
                 await User.updateOne({ telegramId: lobby.player2Id }, { $inc: { balance: refund } });
                 // Админ все равно получает свои 10% от банка (или 10% от каждой ставки)
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Создание платежа (Stars)
app.post('/api/create-invoice', async (req, res) => {
    const { amount } = req.body;
    const payload = {
        title: "Пополнение баланса",
        description: `${amount} Stars`,
        payload: JSON.stringify({ unique_id: Date.now() }),
        currency: "XTR", // Валюта для Telegram Stars
        prices: [{ label: "Stars", amount: amount }], // amount в звездах
        provider_token: "" // Оставляем пустым для Stars
    };

    try {
        const response = await axios.post(
            `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`,
            payload
        );
        res.json({ invoiceLink: response.data.result });
    } catch (e) { 
        console.error(e.response ? e.response.data : e);
        res.status(500).json({ error: 'Ошибка создания счета' }); 
    }
});

// 6. Вывод средств
app.post('/api/withdraw', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance <= 0) return res.status(400).json({ error: 'Нет средств для вывода' });

        const amount = user.balance;
        
        // Создаем заявку
        const withdrawal = new Withdrawal({ telegramId, amount });
        await withdrawal.save();

        // Списываем баланс
        user.balance = 0;
        await user.save();

        res.json({ success: true, amount });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(CONFIG.PORT, () => console.log(`Server running on port ${CONFIG.PORT}`));
