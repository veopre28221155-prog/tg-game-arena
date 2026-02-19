// server.js
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
    PORT: process.env.PORT || 3000,
    // ВАЖНО: Вставьте сюда свой Telegram ID (число), чтобы получать комиссию 10%
    ADMIN_ID: 0 
};

// --- MONGODB ---
mongoose.connect(CONFIG.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Error:', err));

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
    betAmount: { type: Number, default: 0 }, // Размер ставки одного игрока
    gameType: String,
    status: { type: String, default: 'waiting' }, // waiting, active, finished
    scores: {
        player1: { type: Number, default: -1 }, // -1 значит еще не сыграл
        player2: { type: Number, default: -1 }
    },
    createdAt: { type: Date, default: Date.now }
});

const WithdrawSchema = new mongoose.Schema({
    telegramId: Number,
    amount: Number,
    status: { type: String, default: 'pending' }, // pending, completed
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Lobby = mongoose.model('Lobby', LobbySchema);
const WithdrawRequest = mongoose.model('WithdrawRequest', WithdrawSchema);

// --- UTIL ---
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

// --- ENDPOINTS ---

// 1. Init User
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
                balance: 100 // Стартовый бонус для теста
            });
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Создание лобби (Игрок 1 делает ставку)
app.post('/api/create-lobby', async (req, res) => {
    const { telegramId, betAmount } = req.body;
    
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < betAmount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }

        // Списываем ставку у создателя сразу
        user.balance -= betAmount;
        await user.save();

        const lobbyId = "L_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        const lobby = new Lobby({
            lobbyId,
            player1Id: telegramId,
            betAmount,
            status: 'waiting'
        });
        await lobby.save();

        res.json({ success: true, lobbyId, newBalance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Вход в лобби (Игрок 2 делает ставку)
app.post('/api/join-lobby', async (req, res) => {
    const { telegramId, startParam } = req.body; // startParam = lobbyId

    if (!startParam) return res.json({ mode: 'training' });

    try {
        const lobby = await Lobby.findOne({ lobbyId: startParam });
        
        // Если лобби нет или игрок заходит в свое же
        if (!lobby || lobby.player1Id === telegramId) {
            return res.json({ mode: 'duel', role: 'creator', lobby });
        }

        if (lobby.player2Id && lobby.player2Id !== telegramId) {
            return res.status(400).json({ error: 'Лобби переполнено' });
        }

        // Если это новый второй игрок
        if (!lobby.player2Id) {
            const user = await User.findOne({ telegramId });
            if (!user || user.balance < lobby.betAmount) {
                return res.status(400).json({ error: `Нужен баланс ${lobby.betAmount} Stars` });
            }

            // Списываем ставку у второго игрока
            user.balance -= lobby.betAmount;
            await user.save();

            lobby.player2Id = telegramId;
            lobby.status = 'active';
            await lobby.save();
        }

        return res.json({ mode: 'duel', role: 'joiner', lobby });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Отправка результата и Расчет выигрыша
app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;

    try {
        // Обновляем личный рекорд
        const user = await User.findOne({ telegramId });
        if (score > user.highScores[game]) {
            user.highScores[game] = score;
            await user.save();
        }

        if (!lobbyId) return res.json({ success: true }); // Тренировка

        // Обработка дуэли
        const lobby = await Lobby.findOne({ lobbyId });
        if (!lobby || lobby.status === 'finished') return res.json({ success: true });

        // Записываем счет
        if (lobby.player1Id === telegramId) lobby.scores.player1 = score;
        else if (lobby.player2Id === telegramId) lobby.scores.player2 = score;
        
        await lobby.save();

        // Проверяем, сыграли ли оба
        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            lobby.status = 'finished';
            await lobby.save();

            const p1Score = lobby.scores.player1;
            const p2Score = lobby.scores.player2;
            const totalPool = lobby.betAmount * 2;
            
            // Распределение
            if (totalPool > 0) {
                const adminFee = Math.floor(totalPool * 0.10); // 10%
                const winnerPrize = totalPool - adminFee; // 90%

                let winnerId = null;
                if (p1Score > p2Score) winnerId = lobby.player1Id;
                else if (p2Score > p1Score) winnerId = lobby.player2Id;
                else {
                    // Ничья - возврат средств (за вычетом комиссии или без, тут возврат 100% сделаем для простоты)
                    // Или каждому по 50% от пула - fee. Сделаем возврат ставок.
                    const p1 = await User.findOne({ telegramId: lobby.player1Id });
                    const p2 = await User.findOne({ telegramId: lobby.player2Id });
                    p1.balance += lobby.betAmount;
                    p2.balance += lobby.betAmount;
                    await p1.save();
                    await p2.save();
                    return res.json({ result: 'draw', refund: true });
                }

                // Начисление победителю
                if (winnerId) {
                    const winner = await User.findOne({ telegramId: winnerId });
                    winner.balance += winnerPrize;
                    await winner.save();
                }

                // Начисление админу
                if (CONFIG.ADMIN_ID) {
                    const admin = await User.findOne({ telegramId: CONFIG.ADMIN_ID });
                    if (admin) {
                        admin.balance += adminFee;
                        await admin.save();
                    }
                }
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Создание платежа (Пополнение)
app.post('/api/create-invoice', async (req, res) => {
    const { amount } = req.body;
    const payload = {
        title: "Пополнение баланса",
        description: `${amount} Retro Stars`,
        payload: JSON.stringify({ unique_id: Date.now() }),
        currency: "XTR",
        prices: [{ label: "Stars", amount: amount }],
        provider_token: "" 
    };

    try {
        const response = await axios.post(
            `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`,
            payload
        );
        res.json({ invoiceLink: response.data.result });
    } catch (e) { res.status(500).json({ error: 'Invoice failed' }); }
});

// 6. Заявка на вывод
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (user.balance < amount) return res.status(400).json({ error: 'Недостаточно средств' });

        user.balance -= amount;
        await user.save();

        const reqWithdraw = new WithdrawRequest({ telegramId, amount });
        await reqWithdraw.save();

        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(CONFIG.PORT, () => console.log(`Server running on port ${CONFIG.PORT}`));
