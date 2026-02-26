const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

// --- КОНФИГУРАЦИЯ ---
const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8", // ВАШ ТОКЕН БОТА
    CRYPTO_BOT_TOKEN: "535127:AAviaEd5s4fdrTrHuHpXARM04OXIa7XsEjV", // Токен Crypto Pay
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416,
    PORT: process.env.PORT || 3000
};

// --- DATABASE ---
mongoose.connect(CONFIG.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// Модель Игрока
const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String, firstName: String, balance: { type: Number, default: 0 },
    adminCommission: { type: Number, default: 0 },
    highScores: { snake: { type: Number, default: 0 }, tetris: { type: Number, default: 0 }, battleCity: { type: Number, default: 0 }, roadFighter: { type: Number, default: 0 }, spaceInvaders: { type: Number, default: 0 }, airHockey: { type: Number, default: 0 } },
    createdAt: { type: Date, default: Date.now }
});

// ОБНОВЛЕННАЯ Модель Лобби
const LobbySchema = new mongoose.Schema({
    lobbyId: { type: String, required: true, unique: true },
    creatorId: { type: Number, required: true },
    player1Id: Number, 
    player2Id: Number, 
    gameType: String, 
    betAmount: { type: Number, default: 0 }, // 0 для бесплатных игр с другом
    isPrivate: { type: Boolean, default: false }, 
    status: { type: String, default: 'waiting' }, // waiting, playing, finished, cancelled
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } },
    createdAt: { type: Date, default: Date.now }
});

const MatchHistorySchema = new mongoose.Schema({ winnerId: Number, loserId: Number, gameType: String, betAmount: Number, prize: Number, date: { type: Date, default: Date.now } });

const User = mongoose.model('User', UserSchema);
const Lobby = mongoose.model('Lobby', LobbySchema);
const MatchHistory = mongoose.model('MatchHistory', MatchHistorySchema);


// ================= ОПЛАТА: TELEGRAM STARS API =================
app.post('/api/buy-stars', async (req, res) => {
    const { telegramId, amount } = req.body;
    try {
        const response = await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
            title: `Пополнение ${amount} ⭐️`,
            description: `Виртуальные звезды для турниров`,
            payload: `${telegramId}_${amount}`,
            provider_token: "", // Пустой для XTR (Telegram Stars)
            currency: "XTR",
            prices: [{ label: "Stars", amount: amount }]
        });
        
        if (response.data && response.data.ok) res.json({ invoiceUrl: response.data.result });
        else res.status(400).json({ error: 'Failed to create Telegram invoice' });
    } catch (e) { res.status(500).json({ error: 'Telegram API Error' }); }
});

app.post('/api/telegram-webhook', async (req, res) => {
    const update = req.body;
    try {
        if (update.pre_checkout_query) {
            await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/answerPreCheckoutQuery`, { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
        }
        if (update.message && update.message.successful_payment) {
            const payload = update.message.successful_payment.invoice_payload;
            const [userId, starsAmount] = payload.split('_');
            if (userId && starsAmount) await User.findOneAndUpdate({ telegramId: Number(userId) }, { $inc: { balance: Number(starsAmount) } }, { upsert: true });
        }
    } catch (e) { console.error('Telegram webhook error:', e.message); }
    res.sendStatus(200);
});

// ================= ОПЛАТА: CRYPTO BOT API (СОХРАНЕНО) =================
app.post('/api/deposit', async (req, res) => {
    const { telegramId, asset, amount, stars } = req.body;
    try {
        const response = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset: asset, amount: amount.toString(), description: `Пополнение: ${stars} ⭐️`, payload: `${telegramId}_${stars}`
        }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_BOT_TOKEN } });
                 
        if (response.data && response.data.ok) res.json({ payUrl: response.data.result.mini_app_invoice_url });
        else res.status(400).json({ error: 'Failed to create crypto invoice' });
    } catch (e) { res.status(500).json({ error: 'Crypto Invoice failed' }); }
});

app.post('/api/crypto-webhook', async (req, res) => {
    const update = req.body;
    try {
        if (update && update.update_type === 'invoice_paid') {
            const customPayload = update.payload.payload;
            if (customPayload) {
                const parts = customPayload.split('_');
                const userId = parts.at(0); const starsAmount = parts.at(1);
                if (userId && starsAmount) await User.findOneAndUpdate( { telegramId: Number(userId) }, { $inc: { balance: Number(starsAmount) } }, { upsert: true });
            }
        }
    } catch (e) { console.error('Crypto Webhook error:', e); }
    res.sendStatus(200);
});


// ================= БАЗОВЫЕ МЕТОДЫ =================
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

        // Возврат средств за "зависшие" лобби (старше 30 минут)
        const stuckLobbies = await Lobby.find({
            $or: Array.of({ player1Id: user.telegramId }, { player2Id: user.telegramId }),
            status: { $in: ['waiting', 'playing'] },
            createdAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) }
        });

        for (let l of stuckLobbies) {
            l.status = 'cancelled'; await l.save();
            if (l.betAmount > 0) {
                user.balance += l.betAmount;
                const otherId = l.player1Id === user.telegramId ? l.player2Id : l.player1Id;
                if (otherId) await User.findOneAndUpdate({ telegramId: otherId }, { $inc: { balance: l.betAmount } });
            }
        }
        if (stuckLobbies.length > 0) await user.save();
        
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// ================= ЛОГИКА ТУРНИРОВ И ЛОББИ =================

// Получить список публичных лобби
app.get('/api/lobbies', async (req, res) => {
    try {
        await Lobby.deleteMany({ status: 'waiting', createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } });
        const lobbies = await Lobby.find({ status: 'waiting', isPrivate: false }).sort({ createdAt: -1 }).limit(20);
        res.json(lobbies);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Создать новое лобби (Free или со ставкой)
app.post('/api/lobby/create', async (req, res) => {
    const { telegramId, gameType, betAmount, isPrivate } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        
        if (betAmount > 0) {
            if (!user || user.balance < betAmount) return res.status(400).json({ success: false, error: 'Недостаточно баланса' });
            user.balance -= betAmount;
            await user.save();
        }

        const lobbyId = 'L_' + Date.now() + Math.floor(Math.random()*1000);
        const lobby = new Lobby({ lobbyId, creatorId: telegramId, player1Id: telegramId, gameType, betAmount: betAmount || 0, isPrivate, status: 'waiting' });
        await lobby.save();

        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Войти в лобби
app.post('/api/lobby/join', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const lobby = await Lobby.findOne({ lobbyId, status: 'waiting' });
        
        if (!lobby) return res.status(404).json({ success: false, error: 'Лобби не найдено' });
        if (lobby.creatorId === telegramId) return res.status(400).json({ success: false, error: 'Нельзя играть с собой' });
        
        if (lobby.betAmount > 0) {
            if (!user || user.balance < lobby.betAmount) return res.status(400).json({ success: false, error: 'Недостаточно баланса' });
            user.balance -= lobby.betAmount;
            await user.save();
        }

        lobby.player2Id = telegramId; lobby.status = 'playing';
        await lobby.save();

        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Проверка статуса (для создателя)
app.post('/api/lobby/status', async (req, res) => {
    try {
        const lobby = await Lobby.findOne({ lobbyId: req.body.lobbyId });
        res.json({ lobby });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Отмена лобби
app.post('/api/lobby/cancel', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    try {
        const lobby = await Lobby.findOneAndDelete({ lobbyId, creatorId: telegramId, status: 'waiting' });
        if (lobby && lobby.betAmount > 0) await User.findOneAndUpdate({ telegramId }, { $inc: { balance: lobby.betAmount } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================= ЗАВЕРШЕНИЕ ИГРЫ И НАЧИСЛЕНИЕ ПРИЗА =================
app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;
    try {
        const scoreUpdate = { $max: {} }; Reflect.set(scoreUpdate.$max, 'highScores.' + game, score);
        await User.findOneAndUpdate({ telegramId }, scoreUpdate);
        
        if (!lobbyId) return res.json({ success: true });
        
        const tempLobby = await Lobby.findOne({ lobbyId, status: 'playing' });
        if (!tempLobby) return res.json({ success: true });
        
        let updateField = {};
        if (tempLobby.player1Id === telegramId) updateField = { "scores.player1": score };
        else if (tempLobby.player2Id === telegramId) updateField = { "scores.player2": score };
        else return res.json({ success: true });
        
        const lobby = await Lobby.findOneAndUpdate({ lobbyId, status: 'playing' }, { $set: updateField }, { new: true });
        
        // Когда оба результата получены
        if (lobby && lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            const finishLobby = await Lobby.findOneAndUpdate({ lobbyId, status: 'playing' }, { $set: { status: 'finished' } }, { new: true });
            
            if (finishLobby && finishLobby.betAmount > 0) {
                const pool = finishLobby.betAmount * 2;
                const fee = Math.floor(pool * 0.1);
                const prize = pool - fee;
                let winnerId = null; let loserId = null;
                
                if (finishLobby.scores.player1 > finishLobby.scores.player2) { winnerId = finishLobby.player1Id; loserId = finishLobby.player2Id; }
                else if (finishLobby.scores.player2 > finishLobby.scores.player1) { winnerId = finishLobby.player2Id; loserId = finishLobby.player1Id; }
                
                if (winnerId) {
                    await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee, adminCommission: fee } }, { upsert: true });
                    await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
                    await new MatchHistory({ winnerId, loserId, gameType: finishLobby.gameType, betAmount: finishLobby.betAmount, prize }).save();
                } else { // Ничья
                    await User.findOneAndUpdate({ telegramId: finishLobby.player1Id }, { $inc: { balance: finishLobby.betAmount } });
                    await User.findOneAndUpdate({ telegramId: finishLobby.player2Id }, { $inc: { balance: finishLobby.betAmount } });
                }
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/forfeit', async (req, res) => {
    const { telegramId, lobbyId } = req.body;
    try {
        const lobby = await Lobby.findOne({ lobbyId, status: 'playing' });
        if (!lobby) return res.json({ success: true });
        
        const winnerId = (lobby.player1Id === telegramId) ? lobby.player2Id : lobby.player1Id;
        const finishLobby = await Lobby.findOneAndUpdate({ lobbyId, status: 'playing' }, { $set: { status: 'finished' } }, { new: true });
        
        if (finishLobby && finishLobby.betAmount > 0) {
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

app.listen(CONFIG.PORT, () => console.log('Server running on port ' + CONFIG.PORT));
