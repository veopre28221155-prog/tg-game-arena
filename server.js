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
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8",
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, // Ваш ID для получения 10%
    PORT: process.env.PORT || 3000
};

// --- ПОДКЛЮЧЕНИЕ К MONGODB ---
mongoose.connect(CONFIG.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- СХЕМЫ БД ---
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
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Lobby = mongoose.model('Lobby', LobbySchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

// --- UTIL: Проверка подлинности Telegram ---
const verifyTelegramWebAppData = (telegramInitData) => {
    if (!telegramInitData) return false;
    const urlParams = new URLSearchParams(telegramInitData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    const paramsList = [];
    for (const [key, value] of urlParams.entries()) {
        paramsList.push(`${key}=${value}`);
    }
    paramsList.sort();
    const dataCheckString = paramsList.join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CONFIG.TELEGRAM_BOT_TOKEN).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    return hmac === hash;
};

// --- ЭНДПОИНТЫ ---

// 1. Инициализация пользователя
app.post('/api/user-data', async (req, res) => {
    const { initData } = req.body;
    
    // В продакшене раскомментировать проверку!
    // if (!verifyTelegramWebAppData(initData)) return res.status(403).json({ error: 'Auth failed' });

    try {
        const urlParams = new URLSearchParams(initData);
        const userData = JSON.parse(urlParams.get('user'));

        let user = await User.findOne({ telegramId: userData.id });
        if (!user) {
            user = new User({
                telegramId: userData.id,
                username: userData.username,
                firstName: userData.first_name,
                balance: 0 // Стартовый баланс 0
            });
            await user.save();
            console.log(`New user created: ${userData.id}`);
        }
        res.json(user);
    } catch (e) {
        console.error('User Init Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 2. Создание счета на оплату (Stars)
app.post('/api/create-invoice', async (req, res) => {
    const { amount, telegramId } = req.body;
    console.log(`Creating invoice for ${telegramId}, amount: ${amount}`);

    const payload = {
        title: "Пополнение баланса",
        description: `${amount} Stars`,
        payload: JSON.stringify({ userId: telegramId, date: Date.now() }),
        currency: "XTR", // Telegram Stars currency code
        prices: [{ label: "Stars", amount: amount }], // amount целое число
        provider_token: "" // ВАЖНО: Пустая строка для Stars!
    };

    try {
        // Устанавливаем таймаут 10 секунд, чтобы не висело
        const response = await axios.post(
            `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`,
            payload,
            { timeout: 10000 }
        );

        if (response.data && response.data.ok) {
            console.log('Invoice link generated successfully');
            res.json({ invoiceLink: response.data.result });
        } else {
            console.error('Telegram API Error:', response.data);
            res.status(500).json({ error: 'Failed to generate link' });
        }
    } catch (e) {
        console.error('Invoice Network Error:', e.message);
        res.status(500).json({ error: 'Network error connecting to Telegram' });
    }
});

// 3. Создание лобби (Игрок 1)
app.post('/api/create-lobby', async (req, res) => {
    const { telegramId, betAmount } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < betAmount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        // Списываем ставку у создателя
        user.balance -= betAmount;
        await user.save();

        const lobbyId = `L_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const lobby = new Lobby({
            lobbyId,
            player1Id: telegramId,
            betAmount
        });
        await lobby.save();

        res.json({ success: true, lobbyId, newBalance: user.balance });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Вход в лобби (Игрок 2)
app.post('/api/join-lobby', async (req, res) => {
    const { telegramId, startParam } = req.body;
    if (!startParam) return res.json({ mode: 'training' });

    try {
        const lobby = await Lobby.findOne({ lobbyId: startParam });
        
        // Вход создателя (вернулся в свое лобби)
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
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. Завершение игры и РАСПРЕДЕЛЕНИЕ (Комиссия 10%)
app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;

    try {
        // Обновляем рекорд
        const user = await User.findOne({ telegramId });
        if (user && score > user.highScores[game]) {
            user.highScores[game] = score;
            await user.save();
        }

        if (!lobbyId) return res.json({ success: true }); // Тренировка

        const lobby = await Lobby.findOne({ lobbyId });
        if (!lobby || lobby.status === 'finished') return res.json({ success: true });

        // Записываем очки
        if (lobby.player1Id === telegramId) lobby.scores.player1 = score;
        else if (lobby.player2Id === telegramId) lobby.scores.player2 = score;
        
        await lobby.save();

        // Проверяем, сыграли ли оба
        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            lobby.status = 'finished';
            await lobby.save();

            const totalPool = lobby.betAmount * 2;
            const adminFee = Math.floor(totalPool * 0.10); // 10%
            const winnerPrize = totalPool - adminFee; // 90%

            let winnerId = null;
            if (lobby.scores.player1 > lobby.scores.player2) winnerId = lobby.player1Id;
            else if (lobby.scores.player2 > lobby.scores.player1) winnerId = lobby.player2Id;
            
            // 1. Зачисляем комиссию АДМИНУ
            await User.updateOne(
                { telegramId: CONFIG.ADMIN_ID },
                { $inc: { balance: adminFee } },
                { upsert: true }
            );
            console.log(`Commission ${adminFee} credited to Admin ${CONFIG.ADMIN_ID}`);

            // 2. Зачисляем приз ПОБЕДИТЕЛЮ
            if (winnerId) {
                await User.updateOne(
                    { telegramId: winnerId },
                    { $inc: { balance: winnerPrize } }
                );
            } else {
                // Ничья: возвращаем ставки минус 50% комиссии каждому (или полный возврат по желанию)
                // Здесь сделаем возврат ставок каждому игроку за вычетом половины комиссии (по 5%)
                const refund = Math.floor(lobby.betAmount * 0.9);
                await User.updateOne({ telegramId: lobby.player1Id }, { $inc: { balance: refund } });
                await User.updateOne({ telegramId: lobby.player2Id }, { $inc: { balance: refund } });
            }
        }
        res.json({ success: true });
    } catch (e) {
        console.error("Submit Score Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 6. Вывод средств
app.post('/api/withdraw', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance <= 0) return res.status(400).json({ error: 'Нет средств' });

        const amount = user.balance;
        const withdrawal = new Withdrawal({ telegramId, amount });
        await withdrawal.save();

        user.balance = 0;
        await user.save();

        res.json({ success: true, amount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(CONFIG.PORT, () => {
    console.log(`🚀 Server running on port ${CONFIG.PORT}`);
});
