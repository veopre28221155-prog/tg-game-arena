const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

// --- КОНФИГУРАЦИЯ ---
const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8",
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416,
    PORT: process.env.PORT || 3000
};

// --- DATABASE ---
mongoose.connect(CONFIG.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    balance: { type: Number, default: 0 },
    highScores: {
        snake: { type: Number, default: 0 },
        tetris: { type: Number, default: 0 }
    },
    friends: [{ type: Number }], // Список ID друзей
    joinedAt: { type: Date, default: Date.now }
});

const LobbySchema = new mongoose.Schema({
    lobbyId: { type: String, required: true, unique: true },
    player1Id: Number,
    player2Id: Number,
    gameType: String, // snake или tetris
    betAmount: Number,
    status: { type: String, default: 'waiting' },
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } },
    createdAt: { type: Date, default: Date.now }
});

const WithdrawalSchema = new mongoose.Schema({
    telegramId: Number,
    amount: Number,
    walletInfo: String, // Информация об аккаунте
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Lobby = mongoose.model('Lobby', LobbySchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

// --- WEBHOOK (ПЛАТЕЖИ) ---
app.post('/api/webhook', async (req, res) => {
    const update = req.body;
    try {
        if (update.pre_checkout_query) {
            await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/answerPreCheckoutQuery`, {
                pre_checkout_query_id: update.pre_checkout_query.id,
                ok: true
            });
            return res.sendStatus(200);
        }
        if (update.message && update.message.successful_payment) {
            const userId = update.message.from.id;
            const amount = update.message.successful_payment.total_amount;
            
            // Начисляем баланс
            await User.findOneAndUpdate(
                { telegramId: userId },
                { $inc: { balance: amount } },
                { upsert: true }
            );
            return res.sendStatus(200);
        }
    } catch (e) { console.error("Webhook Error:", e.message); }
    res.sendStatus(200);
});

// --- API ROUTES ---

// 1. Init / Auth
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

// 2. Получить список друзей (с именами)
app.post('/api/friends', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.json([]);
        
        // Находим документы друзей
        const friends = await User.find({ telegramId: { $in: user.friends } }, 'telegramId firstName username highScores');
        res.json(friends);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Добавить друга (по ссылке)
app.post('/api/add-friend', async (req, res) => {
    const { userId, friendId } = req.body;
    if (userId == friendId) return res.json({ success: false }); // Нельзя добавить себя

    try {
        const user = await User.findOne({ telegramId: userId });
        const friend = await User.findOne({ telegramId: friendId });
        
        if (user && friend) {
            if (!user.friends.includes(friendId)) {
                user.friends.push(friendId);
                await user.save();
            }
            if (!friend.friends.includes(userId)) {
                friend.friends.push(userId);
                await friend.save();
            }
            return res.json({ success: true, friendName: friend.firstName });
        }
        res.json({ success: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Create Invoice
app.post('/api/create-invoice', async (req, res) => {
    const { amount } = req.body;
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
                provider_token: ""
            }
        );
        res.json({ invoiceLink: response.data.result });
    } catch (e) { res.status(500).json({ error: 'Invoice Failed' }); }
});

// 5. Create Lobby (Game + Bet)
app.post('/api/create-lobby', async (req, res) => {
    const { telegramId, gameType, betAmount } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < betAmount) return res.status(400).json({ error: 'Недостаточно средств' });

        user.balance -= betAmount;
        await user.save();

        const lobbyId = `L_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        const lobby = new Lobby({ 
            lobbyId, 
            player1Id: telegramId, 
            gameType, 
            betAmount 
        });
        await lobby.save();

        res.json({ success: true, lobbyId, gameType, betAmount, newBalance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. Join Lobby
app.post('/api/join-lobby', async (req, res) => {
    const { telegramId, startParam } = req.body;
    if (!startParam) return res.json({ mode: 'training' });

    try {
        // Проверяем, это инвайт в друзья или в лобби
        if (startParam.startsWith("friend_")) {
            const friendId = parseInt(startParam.split("_")[1]);
            return res.json({ mode: 'friend_add', friendId });
        }

        const lobby = await Lobby.findOne({ lobbyId: startParam });
        
        // Вернулся создатель
        if (lobby && lobby.player1Id === telegramId) {
            return res.json({ mode: 'duel', role: 'creator', lobby });
        }

        // Второй игрок
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
        res.status(400).json({ error: 'Лобби недоступно' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 7. Submit Score & Results
app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;
    try {
        // Update HighScore
        await User.findOneAndUpdate({ telegramId }, { $max: { [`highScores.${game}`]: score } });

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
            const fee = Math.floor(pool * 0.1);
            const prize = pool - fee;

            let winnerId = null;
            if (lobby.scores.player1 > lobby.scores.player2) winnerId = lobby.player1Id;
            else if (lobby.scores.player2 > lobby.scores.player1) winnerId = lobby.player2Id;

            // Admin Fee
            if (CONFIG.ADMIN_ID) await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee } }, { upsert: true });

            // Winner Prize
            if (winnerId) {
                await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
            } else {
                // Refund on Draw
                const refund = Math.floor(lobby.betAmount * 0.9);
                await User.findOneAndUpdate({ telegramId: lobby.player1Id }, { $inc: { balance: refund } });
                await User.findOneAndUpdate({ telegramId: lobby.player2Id }, { $inc: { balance: refund } });
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 8. Withdrawal Request
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount, method } = req.body; // method = "source_account"
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < amount) return res.status(400).json({ error: 'Недостаточно средств' });

        // Списываем средства
        user.balance -= amount;
        await user.save();

        // Создаем заявку (Админ увидит в базе)
        const withdrawal = new Withdrawal({ 
            telegramId, 
            amount, 
            walletInfo: "Возврат на счет Telegram Stars (Refund/Manual)",
            status: 'pending' 
        });
        await withdrawal.save();

        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 Server running on port ${CONFIG.PORT}`));
