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
    CRYPTO_BOT_TOKEN: "535127:AAviaEd5s4fdrTrHuHpXARM04OXIa7XsEjV",
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
    adminCommission: { type: Number, default: 0 }, // Счетчик общего дохода админа
    highScores: { snake: { type: Number, default: 0 }, tetris: { type: Number, default: 0 } },
    createdAt: { type: Date, default: Date.now }
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

const MatchHistorySchema = new mongoose.Schema({
    winnerId: Number,
    loserId: Number,
    gameType: String,
    betAmount: Number,
    prize: Number,
    date: { type: Date, default: Date.now }
});

const WithdrawalSchema = new mongoose.Schema({
    telegramId: Number,
    amount: Number,
    status: { type: String, default: 'pending' }, 
    date: { type: Date, default: Date.now }
});

const MatchRequestSchema = new mongoose.Schema({
    telegramId: Number, gameType: String, betAmount: Number 
});

const User = mongoose.model('User', UserSchema);
const Lobby = mongoose.model('Lobby', LobbySchema);
const MatchHistory = mongoose.model('MatchHistory', MatchHistorySchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);
const MatchRequest = mongoose.model('MatchRequest', MatchRequestSchema);


// --- CRYPTO PAY WEBHOOK ---
app.post('/api/crypto-webhook', async (req, res) => {
    const update = req.body;
    try {
        if (update && update.update_type === 'invoice_paid') {
            const invoice = update.payload;
            const customPayload = invoice.payload; // Строка вида: "userId_starsAmount"
            
            if (customPayload) {
                const = customPayload.split('_');
                if (userId && starsAmount) {
                    await User.findOneAndUpdate(
                        { telegramId: Number(userId) }, 
                        { $inc: { balance: Number(starsAmount) } }, 
                        { upsert: true }
                    );
                    console.log(`✅ Пополнен баланс: ID ${userId} на ${starsAmount} Stars`);
                }
            }
        }
    } catch (e) { 
        console.error('Webhook error:', e); 
    }
    res.sendStatus(200); // Обязательно возвращаем 200, чтобы CryptoBot понял, что мы приняли вебхук
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

// Новый эндпоинт пополнения через CryptoBot
app.post('/api/deposit', async (req, res) => {
    const { telegramId, asset, amount, stars } = req.body;
    try {
        const response = await axios.post(`https://pay.crypt.bot/api/createInvoice`, {
            asset: asset,
            amount: amount.toString(),
            description: `Пополнение внутреннего баланса на ${stars} ⭐️`,
            payload: `${telegramId}_${stars}` // передаем данные в вебхук
        }, {
            headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_BOT_TOKEN }
        });

        if (response.data && response.data.ok) {
            // Используем mini_app_invoice_url для нативного открытия инвойса в телеграм
            res.json({ payUrl: response.data.result.mini_app_invoice_url });
        } else {
            res.status(400).json({ error: 'Failed to create invoice' });
        }
    } catch (e) { 
        console.error(e.response ? e.response.data : e.message);
        res.status(500).json({ error: 'Invoice failed' }); 
    }
});


// --- ADMIN ROUTES ---
app.post('/api/admin/data', async (req, res) => {
    const { adminId } = req.body;
    if (adminId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'Access denied' });

    try {
        const adminUser = await User.findOne({ telegramId: CONFIG.ADMIN_ID });
        const adminCommission = adminUser ? adminUser.adminCommission : 0;

        const withdrawals = await Withdrawal.find().sort({ date: -1 }).limit(20);
        const matches = await MatchHistory.find().sort({ date: -1 }).limit(20);
        res.json({ withdrawals, matches, adminCommission });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/set-balance', async (req, res) => {
    const { adminId, targetId, newBalance } = req.body;
    if (adminId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'Access denied' });

    try {
        const user = await User.findOneAndUpdate({ telegramId: targetId }, { balance: newBalance }, { new: true });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// --- GAME LOGIC ---
app.post('/api/create-lobby-friend', async (req, res) => {
    const { telegramId, gameType, betAmount } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < betAmount) return res.status(400).json({ error: 'Недостаточно средств' });
        user.balance -= betAmount;
        await user.save();
        const lobbyId = `FRIEND_${Date.now()}_${telegramId}`;
        const lobby = new Lobby({ lobbyId, player1Id: telegramId, gameType, betAmount, status: 'waiting' });
        await lobby.save();
        res.json({ success: true, lobbyId, newBalance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/search-match', async (req, res) => {
    const { telegramId, gameType, betAmount } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < betAmount) return res.status(400).json({ error: 'Low balance' });
        user.balance -= betAmount; await user.save();
        const opponent = await MatchRequest.findOneAndDelete({ gameType, betAmount, telegramId: { $ne: telegramId } });
        
        if (opponent) {
            const lobbyId = `L_${Date.now()}`;
            const lobby = new Lobby({ lobbyId, player1Id: opponent.telegramId, player2Id: telegramId, gameType, betAmount, status: 'active' });
            await lobby.save();
            return res.json({ status: 'match_found', lobbyId, newBalance: user.balance });
        } else {
            await MatchRequest.deleteMany({ telegramId });
            await new MatchRequest({ telegramId, gameType, betAmount }).save();
            return res.json({ status: 'waiting', newBalance: user.balance });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/check-match-status', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const lobby = await Lobby.findOne({ $or:, status: 'active', createdAt: { $gt: new Date(Date.now() - 60000) } });
        if (lobby) return res.json({ status: 'match_found', lobby });
        const r = await MatchRequest.findOne({ telegramId });
        res.json({ status: r ? 'waiting' : 'none' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/join-lobby', async (req, res) => {
    const { telegramId, startParam } = req.body;
    try {
        const lobby = await Lobby.findOne({ lobbyId: startParam });
        if (!lobby) return res.status(404).json({ error: 'Lobby not found' });
        if (lobby.player1Id === telegramId || lobby.player2Id === telegramId) return res.json({ mode: 'duel', lobby });
        if (lobby.status === 'waiting' && !lobby.player2Id) {
            const user = await User.findOne({ telegramId });
            if (!user || user.balance < lobby.betAmount) return res.status(400).json({ error: 'Low balance' });
            user.balance -= lobby.betAmount; await user.save();
            lobby.player2Id = telegramId; lobby.status = 'active'; await lobby.save();
            return res.json({ mode: 'duel', lobby });
        }
        res.status(400).json({ error: 'Lobby full' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cancel-match', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const r = await MatchRequest.findOneAndDelete({ telegramId });
        if (r) {
            const u = await User.findOne({ telegramId });
            u.balance += r.betAmount; await u.save();
            return res.json({ success: true, newBalance: u.balance });
        }
        res.json({ success: false });
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
            lobby.status = 'finished'; await lobby.save();

            const pool = lobby.betAmount * 2;
            const fee = Math.floor(pool * 0.1); // 10% комиссия
            const prize = pool - fee; // 90% победителю

            let winnerId = null;
            let loserId = null;

            if (lobby.scores.player1 > lobby.scores.player2) { winnerId = lobby.player1Id; loserId = lobby.player2Id; }
            else if (lobby.scores.player2 > lobby.scores.player1) { winnerId = lobby.player2Id; loserId = lobby.player1Id; }

            // 1. Начисляем 10% АДМИНУ в balance (чтобы мог вывести) и в adminCommission (для статистики)
            await User.findOneAndUpdate(
                { telegramId: CONFIG.ADMIN_ID }, 
                { $inc: { balance: fee, adminCommission: fee } }, 
                { upsert: true }
            );

            // 2. Начисляем выигрыш ПОБЕДИТЕЛЮ
            if (winnerId) {
                await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
                
                const history = new MatchHistory({ winnerId, loserId, gameType: lobby.gameType, betAmount: lobby.betAmount, prize });
                await history.save();
            } else {
                // Ничья (возвращаем ставку без комиссии)
                const refund = lobby.betAmount;
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
        const u = await User.findOne({ telegramId });
        if (u.balance < amount) return res.status(400).json({ error: 'Low balance' });
        
        u.balance -= amount; await u.save();

        const w = new Withdrawal({ telegramId, amount, status: 'pending' });
        await w.save();

        res.json({ success: true, newBalance: u.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 Server running on port ${CONFIG.PORT}`));
