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

const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    balance: { type: Number, default: 0 },
    highScores: { snake: { type: Number, default: 0 }, tetris: { type: Number, default: 0 } },
    friends:
});

const LobbySchema = new mongoose.Schema({
    lobbyId: { type: String, required: true, unique: true },
    player1Id: Number,
    player2Id: Number,
    gameType: String,
    betAmount: Number,
    status: { type: String, default: 'active' },
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } },
    createdAt: { type: Date, default: Date.now }
});

const MatchRequestSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true },
    gameType: String,
    betAmount: Number,
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
const MatchRequest = mongoose.model('MatchRequest', MatchRequestSchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

// --- WEBHOOK (PAYMENTS) ---
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
            await User.findOneAndUpdate({ telegramId: userId }, { $inc: { balance: amount } }, { upsert: true });
            return res.sendStatus(200);
        }
    } catch (e) { console.error("Webhook Error:", e.message); }
    res.sendStatus(200);
});

// --- API ROUTES ---

app.post('/api/user-data', async (req, res) => {
    const { initData } = req.body;
    try {
        const urlParams = new URLSearchParams(initData);
        const userData = JSON.parse(urlParams.get('user'));
        let user = await User.findOne({ telegramId: userData.id });
        if (!user) {
            user = new User({ telegramId: userData.id, username: userData.username, firstName: userData.first_name, balance: 0 });
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/create-invoice', async (req, res) => {
    const { amount } = req.body;
    try {
        const response = await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
            title: "Top Up Balance",
            description: `${amount} Stars`,
            payload: JSON.stringify({ unique_id: Date.now() }),
            currency: "XTR",
            prices:,
            provider_token: ""
        });
        res.json({ invoiceLink: response.data.result });
    } catch (e) { res.status(500).json({ error: 'Invoice failed' }); }
});

// --- ДОБАВЛЕНО: СОЗДАНИЕ ПРИВАТНОГО ЛОББИ ДЛЯ ДРУГА ---
app.post('/api/create-lobby', async (req, res) => {
    const { telegramId, gameType, betAmount } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < betAmount) return res.status(400).json({ error: 'Недостаточно средств' });

        // Списываем ставку
        user.balance -= betAmount;
        await user.save();

        const lobbyId = `L_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        const lobby = new Lobby({ lobbyId, player1Id: telegramId, gameType, betAmount, status: 'waiting' });
        await lobby.save();

        res.json({ success: true, lobbyId, newBalance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- MATCHMAKING ---
app.post('/api/search-match', async (req, res) => {
    const { telegramId, gameType, betAmount } = req.body;
    if (betAmount < 10) return res.status(400).json({ error: 'Min bet is 10 Stars' });

    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < betAmount) return res.status(400).json({ error: 'Недостаточно средств' });

        user.balance -= betAmount;
        await user.save();

        const opponentRequest = await MatchRequest.findOneAndDelete({ gameType, betAmount, telegramId: { $ne: telegramId } });

        if (opponentRequest) {
            const lobbyId = `L_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            const lobby = new Lobby({ lobbyId, player1Id: opponentRequest.telegramId, player2Id: telegramId, gameType, betAmount, status: 'active' });
            await lobby.save();
            return res.json({ status: 'match_found', lobbyId, newBalance: user.balance });
        } else {
            await MatchRequest.deleteMany({ telegramId });
            const newRequest = new MatchRequest({ telegramId, gameType, betAmount });
            await newRequest.save();
            return res.json({ status: 'waiting', newBalance: user.balance });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/check-match-status', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const recentLobby = await Lobby.findOne({
            $or:,
            status: 'active',
            createdAt: { $gt: new Date(Date.now() - 30000) } 
        }).sort({ createdAt: -1 });

        if (recentLobby) return res.json({ status: 'match_found', lobby: recentLobby });

        const request = await MatchRequest.findOne({ telegramId });
        if (request) return res.json({ status: 'waiting' });

        return res.json({ status: 'none' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cancel-match', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const request = await MatchRequest.findOneAndDelete({ telegramId });
        if (request) {
            const user = await User.findOne({ telegramId });
            user.balance += request.betAmount;
            await user.save();
            return res.json({ success: true, newBalance: user.balance });
        }
        return res.json({ success: false, message: 'No active request found' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ВХОД В ЛОББИ ---
app.post('/api/join-lobby', async (req, res) => {
    const { telegramId, startParam } = req.body;
    if (!startParam) return res.json({ mode: 'training' });

    try {
        const lobby = await Lobby.findOne({ lobbyId: startParam });
        
        // Переподключение создателя или второго игрока
        if (lobby && (lobby.player1Id === telegramId || lobby.player2Id === telegramId)) {
            return res.json({ mode: 'duel', lobby });
        }
        
        // Вход второго игрока по ссылке
        if (lobby && !lobby.player2Id) {
            const user = await User.findOne({ telegramId });
            if (!user || user.balance < lobby.betAmount) return res.status(400).json({ error: 'Low balance' });
            
            user.balance -= lobby.betAmount;
            await user.save();
            
            lobby.player2Id = telegramId;
            lobby.status = 'active';
            await lobby.save();
            return res.json({ mode: 'duel', lobby });
        }
        res.status(400).json({ error: 'Lobby full or invalid' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;
    try {
        await User.findOneAndUpdate({ telegramId }, { $max: {: score } });

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

            if (CONFIG.ADMIN_ID) await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee } }, { upsert: true });

            if (winnerId) {
                await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
            } else {
                 const refund = Math.floor(lobby.betAmount * 0.95);
                 await User.findOneAndUpdate({ telegramId: lobby.player1Id }, { $inc: { balance: refund } });
                 await User.findOneAndUpdate({ telegramId: lobby.player2Id }, { $inc: { balance: refund } });
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < amount) return res.status(400).json({ error: 'Error' });
        user.balance -= amount;
        await user.save();
        const w = new Withdrawal({ telegramId, amount });
        await w.save();
        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 Server on ${CONFIG.PORT}`));
