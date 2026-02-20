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

const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    balance: { type: Number, default: 0 },
    adminCommission: { type: Number, default: 0 },
    highScores: {
        snake: { type: Number, default: 0 },
        tetris: { type: Number, default: 0 }
    },
    createdAt: { type: Date, default: Date.now }
});

const LobbySchema = new mongoose.Schema({
    lobbyId: { type: String, required: true, unique: true },
    player1Id: Number,
    player2Id: Number,
    gameType: String,
    betAmount: Number,
    status: { type: String, default: 'active' }, // active, finished, cancelled
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
    telegramId: Number, 
    gameType: String, 
    betAmount: Number,
    createdAt: { type: Date, default: Date.now }
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
            const customPayload = invoice.payload;
            if (customPayload) {
                const parts = customPayload.split('_');
                const userId = parts.at(0);
                const starsAmount = parts.at(1);
                if (userId && starsAmount) {
                    await User.findOneAndUpdate(
                        { telegramId: Number(userId) },
                        { $inc: { balance: Number(starsAmount) } },
                        { upsert: true }
                    );
                    console.log('✅ Balance updated for ID ' + userId + ' with ' + starsAmount + ' Stars');
                }
            }
        }
    } catch (e) {
        console.error('Webhook error:', e);
    }
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

        // ВОЗВРАТ СРЕДСТВ ИЗ ЗАВИСШИХ ЛОББИ (более 30 минут)
        const stuckLobbies = await Lobby.find({
            $or: Array.of({ player1Id: user.telegramId }, { player2Id: user.telegramId }),
            status: 'active',
            createdAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) }
        });

        for (let l of stuckLobbies) {
            l.status = 'cancelled';
            await l.save();
            user.balance += l.betAmount; 
            const otherId = l.player1Id === user.telegramId ? l.player2Id : l.player1Id;
            if (otherId) await User.findOneAndUpdate({ telegramId: otherId }, { $inc: { balance: l.betAmount } });
        }
        if (stuckLobbies.length > 0) await user.save();

        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/deposit', async (req, res) => {
    const { telegramId, asset, amount, stars } = req.body;
    try {
        const response = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset: asset,
            amount: amount.toString(),
            description: 'Пополнение баланса: ' + stars + ' ⭐️',
            payload: telegramId + '_' + stars
        }, {
            headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_BOT_TOKEN }
        });
        if (response.data && response.data.ok) {
            res.json({ payUrl: response.data.result.mini_app_invoice_url });
        } else {
            res.status(400).json({ error: 'Failed to create invoice' });
        }
    } catch (e) {
        console.error(e.message);
        res.status(500).json({ error: 'Invoice failed' });
    }
});

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

app.post('/api/search-match', async (req, res) => {
    const { telegramId, gameType, betAmount } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user || user.balance < betAmount) return res.status(400).json({ error: 'Low balance' });
        
        user.balance -= betAmount; 
        await user.save();
        
        const opponent = await MatchRequest.findOneAndDelete({ 
            gameType, 
            betAmount, 
            telegramId: { $ne: telegramId },
            createdAt: { $gt: new Date(Date.now() - 30000) } 
        });
        
        if (opponent) {
            const lobbyId = 'L_' + Date.now();
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
        const searchConditions = Array.of({ player1Id: telegramId }, { player2Id: telegramId });
        const lobby = await Lobby.findOne({
            $or: searchConditions,
            status: 'active'
        });
        
        if (lobby) return res.json({ status: 'match_found', lobby });
        
        const r = await MatchRequest.findOneAndUpdate(
            { telegramId },
            { $set: { createdAt: new Date() } }
        );
        res.json({ status: r ? 'waiting' : 'none' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cancel-match', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const r = await MatchRequest.findOneAndDelete({ telegramId });
        if (r) {
            const u = await User.findOne({ telegramId });
            u.balance += r.betAmount; 
            await u.save();
            return res.json({ success: true, newBalance: u.balance });
        }
        res.json({ success: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Атомарная отправка счета и проверка победителя
app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;
    try {
        // Обновляем личный рекорд
        const scoreUpdate = { $max: {} };
        Reflect.set(scoreUpdate.$max, 'highScores.' + game, score);
        await User.findOneAndUpdate({ telegramId }, scoreUpdate);

        if (!lobbyId) return res.json({ success: true });

        const tempLobby = await Lobby.findOne({ lobbyId, status: 'active' });
        if (!tempLobby) return res.json({ success: true }); 

        let updateField = {};
        if (tempLobby.player1Id === telegramId) updateField = { "scores.player1": score };
        else if (tempLobby.player2Id === telegramId) updateField = { "scores.player2": score };
        else return res.json({ success: true });

        // Атомарно сохраняем счет
        const lobby = await Lobby.findOneAndUpdate(
            { lobbyId, status: 'active' },
            { $set: updateField },
            { new: true }
        );

        // Если оба прислали результат - закрываем лобби
        if (lobby && lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            const finishLobby = await Lobby.findOneAndUpdate(
                { lobbyId, status: 'active' },
                { $set: { status: 'finished' } },
                { new: true }
            );

            if (finishLobby) {
                const pool = finishLobby.betAmount * 2;
                const fee = Math.floor(pool * 0.1);
                const prize = pool - fee;

                let winnerId = null;
                let loserId = null;

                if (finishLobby.scores.player1 > finishLobby.scores.player2) { winnerId = finishLobby.player1Id; loserId = finishLobby.player2Id; }
                else if (finishLobby.scores.player2 > finishLobby.scores.player1) { winnerId = finishLobby.player2Id; loserId = finishLobby.player1Id; }

                await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee, adminCommission: fee } }, { upsert: true });

                if (winnerId) {
                    await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
                    await new MatchHistory({ winnerId, loserId, gameType: finishLobby.gameType, betAmount: finishLobby.betAmount, prize }).save();
                } else {
                    // Ничья - возврат средств без комиссии
                    const refund = finishLobby.betAmount;
                    await User.findOneAndUpdate({ telegramId: finishLobby.player1Id }, { $inc: { balance: refund } });
                    await User.findOneAndUpdate({ telegramId: finishLobby.player2Id }, { $inc: { balance: refund } });
                }
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/forfeit', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    try {
        const lobby = await Lobby.findOne({ lobbyId, status: 'active' });
        if (!lobby) return res.json({ success: true });

        const winnerId = (lobby.player1Id === telegramId) ? lobby.player2Id : lobby.player1Id;
        
        const finishLobby = await Lobby.findOneAndUpdate(
            { lobbyId, status: 'active' },
            { $set: { status: 'finished', winnerId: winnerId } },
            { new: true }
        );

        if (finishLobby) {
            const pool = finishLobby.betAmount * 2;
            const fee = Math.floor(pool * 0.1);
            const prize = pool - fee;

            await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee, adminCommission: fee } }, { upsert: true });
            await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
            await new MatchHistory({ winnerId: winnerId, loserId: telegramId, gameType: finishLobby.gameType, betAmount: finishLobby.betAmount, prize }).save();
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

app.listen(CONFIG.PORT, () => console.log('Server running on port ' + CONFIG.PORT));
