const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

// --- КОНФИГУРАЦИЯ ---
const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8",
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, // Ваш ID для комиссии
    PORT: process.env.PORT || 3000
};

// --- DATABASE ---
mongoose.connect(CONFIG.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

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
    betAmount: Number,
    status: { type: String, default: 'waiting' },
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } }
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

// --- ГЛАВНЫЙ ФИКС ПЛАТЕЖЕЙ (WEBHOOK) ---
app.post('/api/webhook', async (req, res) => {
    const update = req.body;

    try {
        // 1. Подтверждение платежа перед Telegram (Pre-Checkout)
        // Это УБИРАЕТ ошибку "Bot didn't respond in time"
        if (update.pre_checkout_query) {
            await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/answerPreCheckoutQuery`, {
                pre_checkout_query_id: update.pre_checkout_query.id,
                ok: true
            });
            return res.sendStatus(200);
        }

        // 2. Обработка успешной оплаты (Successful Payment)
        if (update.message && update.message.successful_payment) {
            const userId = update.message.from.id;
            const amount = update.message.successful_payment.total_amount; // Сумма Stars

            // Начисляем баланс
            await User.findOneAndUpdate(
                { telegramId: userId },
                { $inc: { balance: amount } },
                { upsert: true }
            );
            console.log(`💰 Начислено ${amount} Stars пользователю ${userId}`);
            return res.sendStatus(200);
        }

    } catch (e) {
        console.error("Webhook Error:", e.message);
    }
    res.sendStatus(200);
});

// --- API ЭНДПОИНТЫ ---

// 1. Init User
app.post('/api/user-data', async (req, res) => {
    const { initData } = req.body;
    try {
        const urlParams = new URLSearchParams(initData);
        const userData = JSON.parse(urlParams.get('user'));
        
        let user = await User.findOne({ telegramId: userData.id });
        if (!user) {
            user = new User({
                telegramId: userData.id,
                username: userData.username,
                firstName: userData.first_name,
                balance: 0
            });
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Create Invoice Link
app.post('/api/create-invoice', async (req, res) => {
    const { amount } = req.body;
    
    // Payload должен быть, иначе Telegram ругается
    const payloadData = JSON.stringify({ unique_id: Date.now() });

    try {
        const response = await axios.post(
            `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`,
            {
                title: "Пополнение баланса",
                description: `${amount} Stars`,
                payload: payloadData,
                currency: "XTR",
                prices: [{ label: "Stars", amount: parseInt(amount) }],
                provider_token: "" // Пусто для Stars!
            }
        );
        res.json({ invoiceLink: response.data.result });
    } catch (e) {
        console.error("Invoice create error:", e.response?.data || e.message);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// 3. Create Lobby
app.post('/api/create-lobby', async (req, res) => {
    const { telegramId, betAmount } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < betAmount) return res.status(400).json({ error: 'Недостаточно средств' });

        user.balance -= betAmount;
        await user.save();

        const lobbyId = `L_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        const lobby = new Lobby({ lobbyId, player1Id: telegramId, betAmount });
        await lobby.save();

        res.json({ success: true, lobbyId, newBalance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Join Lobby
app.post('/api/join-lobby', async (req, res) => {
    const { telegramId, startParam } = req.body;
    if (!startParam) return res.json({ mode: 'training' });

    try {
        const lobby = await Lobby.findOne({ lobbyId: startParam });
        if (lobby && lobby.player1Id === telegramId) return res.json({ mode: 'duel', role: 'creator', lobby });

        if (lobby && !lobby.player2Id) {
            const user = await User.findOne({ telegramId });
            if (!user || user.balance < lobby.betAmount) return res.status(400).json({ error: 'Недостаточно средств' });

            user.balance -= lobby.betAmount;
            await user.save();
            lobby.player2Id = telegramId;
            lobby.status = 'active';
            await lobby.save();

            return res.json({ mode: 'duel', role: 'joiner', lobby });
        }
        res.status(400).json({ error: 'Лобби занято или не найдено' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Submit Score & Distribute Funds (10% Commission)
app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;
    try {
        await User.findOneAndUpdate(
            { telegramId },
            { $max: { [`highScores.${game}`]: score } }
        );

        if (!lobbyId) return res.json({ success: true });

        const lobby = await Lobby.findOne({ lobbyId });
        if (!lobby || lobby.status === 'finished') return res.json({ success: true });

        if (lobby.player1Id === telegramId) lobby.scores.player1 = score;
        if (lobby.player2Id === telegramId) lobby.scores.player2 = score;
        await lobby.save();

        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            lobby.status = 'finished';
            await lobby.save();

            const pool = lobby.betAmount * 2;
            const adminFee = Math.floor(pool * 0.1); // 10% Админу
            const winnerPrize = pool - adminFee;     // 90% Победителю

            let winnerId = null;
            if (lobby.scores.player1 > lobby.scores.player2) winnerId = lobby.player1Id;
            else if (lobby.scores.player2 > lobby.scores.player1) winnerId = lobby.player2Id;

            // Начисляем Админу (ID 1463465416)
            if (CONFIG.ADMIN_ID) {
                await User.findOneAndUpdate(
                    { telegramId: CONFIG.ADMIN_ID },
                    { $inc: { balance: adminFee } },
                    { upsert: true }
                );
            }

            // Начисляем Победителю
            if (winnerId) {
                await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: winnerPrize } });
            } else {
                // Ничья: Возврат ставок за вычетом половины комиссии (по 5% с каждого за участие)
                // Или просто возврат 90% ставки
                const refund = Math.floor(lobby.betAmount * 0.9);
                await User.findOneAndUpdate({ telegramId: lobby.player1Id }, { $inc: { balance: refund } });
                await User.findOneAndUpdate({ telegramId: lobby.player2Id }, { $inc: { balance: refund } });
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. Withdraw
app.post('/api/withdraw', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance <= 0) return res.status(400).json({ error: 'Баланс пуст' });

        const amount = user.balance;
        const w = new Withdrawal({ telegramId, amount });
        await w.save();

        user.balance = 0;
        await user.save();
        res.json({ success: true, amount });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 Server running on port ${CONFIG.PORT}`));
