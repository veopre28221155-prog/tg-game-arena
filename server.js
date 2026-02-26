const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

// КОНФИГУРАЦИЯ
const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8",
    CRYPTO_BOT_TOKEN: "535127:AAviaEd5s4fdrTrHuHpXARM04OXIa7XsEjV",
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416,
    PORT: process.env.PORT || 3000
};

// БАЗА ДАННЫХ
mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ MongoDB Connected')).catch(e => console.error(e));

const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    balance: { type: Number, default: 0 },
    highScores: { snake: { type: Number, default: 0 }, tetris: { type: Number, default: 0 }, battleCity: { type: Number, default: 0 }, roadFighter: { type: Number, default: 0 }, spaceInvaders: { type: Number, default: 0 }, airHockey: { type: Number, default: 0 }, bomber: { type: Number, default: 0 }, gold: { type: Number, default: 0 } },
    createdAt: { type: Date, default: Date.now }
});

const LobbySchema = new mongoose.Schema({
    lobbyId: { type: String, required: true, unique: true },
    creatorId: { type: Number, required: true },
    player1Id: Number, player2Id: Number, 
    gameType: String, betAmount: { type: Number, default: 0 }, 
    isPrivate: { type: Boolean, default: false }, 
    status: { type: String, default: 'waiting' }, // waiting, playing, finished
    scores: { player1: { type: Number, default: -1 }, player2: { type: Number, default: -1 } },
    createdAt: { type: Date, default: Date.now }
});

const MatchHistorySchema = new mongoose.Schema({ winnerId: Number, loserId: Number, gameType: String, betAmount: Number, prize: Number, date: { type: Date, default: Date.now } });

const User = mongoose.model('User', UserSchema);
const Lobby = mongoose.model('Lobby', LobbySchema);
const MatchHistory = mongoose.model('MatchHistory', MatchHistorySchema);


// ================= ПЛАТЕЖИ: TELEGRAM STARS =================
app.post('/api/buy-stars', async (req, res) => {
    try {
        const { telegramId, amount } = req.body;
        const response = await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
            title: `Пополнение ${amount} ⭐️`, description: `Звезды для арены`, payload: `${telegramId}_${amount}`,
            provider_token: "", currency: "XTR", prices: [{ label: "Stars", amount }]
        });
        if (response.data.ok) res.json({ invoiceUrl: response.data.result });
        else res.status(400).json({ error: 'TG Error' });
    } catch (e) { res.status(500).json({ error: 'Server Error' }); }
});

app.post('/api/telegram-webhook', async (req, res) => {
    const update = req.body;
    try {
        if (update.pre_checkout_query) await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/answerPreCheckoutQuery`, { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
        if (update.message?.successful_payment) {
            const [userId, stars] = update.message.successful_payment.invoice_payload.split('_');
            if (userId && stars) await User.findOneAndUpdate({ telegramId: Number(userId) }, { $inc: { balance: Number(stars) } }, { upsert: true });
        }
    } catch (e) {} res.sendStatus(200);
});

// ================= ПЛАТЕЖИ: CRYPTO BOT =================
app.post('/api/deposit', async (req, res) => {
    try {
        const { telegramId, asset, amount, stars } = req.body;
        const response = await axios.post('https://pay.crypt.bot/api/createInvoice', {
            asset, amount: amount.toString(), payload: `${telegramId}_${stars}`
        }, { headers: { 'Crypto-Pay-API-Token': CONFIG.CRYPTO_BOT_TOKEN } });
        if (response.data.ok) res.json({ payUrl: response.data.result.mini_app_invoice_url });
    } catch (e) { res.status(500).json({ error: 'Crypto Error' }); }
});

app.post('/api/crypto-webhook', async (req, res) => {
    try {
        if (req.body?.update_type === 'invoice_paid') {
            const [userId, stars] = req.body.payload.payload.split('_');
            if (userId && stars) await User.findOneAndUpdate( { telegramId: Number(userId) }, { $inc: { balance: Number(stars) } }, { upsert: true });
        }
    } catch (e) {} res.sendStatus(200);
});


// ================= ПРОФИЛЬ И БАЛАНС =================
app.post('/api/user-data', async (req, res) => {
    try {
        const userData = JSON.parse(new URLSearchParams(req.body.initData).get('user'));
        let user = await User.findOne({ telegramId: userData.id });
        if (!user) { user = new User({ telegramId: userData.id }); await user.save(); }

        // Возврат за зависшие лобби
        const stuck = await Lobby.find({ $or: [{ player1Id: user.telegramId }, { player2Id: user.telegramId }], status: { $in: ['waiting', 'playing'] }, createdAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) } });
        for (let l of stuck) {
            l.status = 'cancelled'; await l.save();
            if (l.betAmount > 0) {
                user.balance += l.betAmount;
                if (l.player1Id !== user.telegramId && l.player1Id) await User.findOneAndUpdate({ telegramId: l.player1Id }, { $inc: { balance: l.betAmount } });
                if (l.player2Id !== user.telegramId && l.player2Id) await User.findOneAndUpdate({ telegramId: l.player2Id }, { $inc: { balance: l.betAmount } });
            }
        }
        if (stuck.length > 0) await user.save();
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// ================= ТУРНИРЫ И ЛОББИ =================
app.get('/api/lobbies', async (req, res) => {
    try {
        await Lobby.deleteMany({ status: 'waiting', createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } });
        res.json(await Lobby.find({ status: 'waiting', isPrivate: false }).sort({ createdAt: -1 }).limit(20));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lobby/create', async (req, res) => {
    try {
        const { telegramId, gameType, betAmount, isPrivate } = req.body;
        const user = await User.findOne({ telegramId });
        if (betAmount > 0) {
            if (!user || user.balance < betAmount) return res.status(400).json({ success: false, error: 'Недостаточно звезд' });
            user.balance -= betAmount; await user.save();
        }
        const lobby = new Lobby({ lobbyId: 'L_' + Date.now() + Math.floor(Math.random()*1000), creatorId: telegramId, player1Id: telegramId, gameType, betAmount: betAmount || 0, isPrivate });
        await lobby.save();
        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/lobby/join', async (req, res) => {
    try {
        const { telegramId, lobbyId } = req.body;
        const user = await User.findOne({ telegramId });
        const lobby = await Lobby.findOne({ lobbyId, status: 'waiting' });
        
        if (!lobby) return res.status(404).json({ success: false, error: 'Лобби не найдено' });
        if (lobby.creatorId === telegramId) return res.status(400).json({ success: false, error: 'Сам с собой?' });
        
        if (lobby.betAmount > 0) {
            if (!user || user.balance < lobby.betAmount) return res.status(400).json({ success: false, error: 'Недостаточно звезд' });
            user.balance -= lobby.betAmount; await user.save();
        }
        lobby.player2Id = telegramId; lobby.status = 'playing'; await lobby.save();
        res.json({ success: true, lobby });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/lobby/status', async (req, res) => { res.json({ lobby: await Lobby.findOne({ lobbyId: req.body.lobbyId }) }); });

app.post('/api/lobby/cancel', async (req, res) => {
    try {
        const lobby = await Lobby.findOneAndDelete({ lobbyId: req.body.lobbyId, creatorId: req.body.telegramId, status: 'waiting' });
        if (lobby && lobby.betAmount > 0) await User.findOneAndUpdate({ telegramId: req.body.telegramId }, { $inc: { balance: lobby.betAmount } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// ================= ФИНАЛ ИГРЫ =================
app.post('/api/submit-score', async (req, res) => {
    try {
        const { telegramId, game, score, lobbyId } = req.body;
        
        // Update highscore
        const scoreUpdate = { $max: {} }; Reflect.set(scoreUpdate.$max, 'highScores.' + game, score);
        await User.findOneAndUpdate({ telegramId }, scoreUpdate);
        
        if (!lobbyId) return res.json({ success: true });
        
        const lobby = await Lobby.findOne({ lobbyId, status: 'playing' });
        if (!lobby) return res.json({ success: true });
        
        if (lobby.player1Id === telegramId) lobby.scores.player1 = score;
        else if (lobby.player2Id === telegramId) lobby.scores.player2 = score;
        await lobby.save();
        
        // Оба игрока завершили
        if (lobby.scores.player1 !== -1 && lobby.scores.player2 !== -1) {
            lobby.status = 'finished'; await lobby.save();
            if (lobby.betAmount > 0) {
                const pool = lobby.betAmount * 2;
                const fee = Math.floor(pool * 0.1);
                const prize = pool - fee;
                let winnerId = null, loserId = null;
                
                if (lobby.scores.player1 > lobby.scores.player2) { winnerId = lobby.player1Id; loserId = lobby.player2Id; }
                else if (lobby.scores.player2 > lobby.scores.player1) { winnerId = lobby.player2Id; loserId = lobby.player1Id; }
                
                if (winnerId) {
                    await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
                    await new MatchHistory({ winnerId, loserId, gameType: lobby.gameType, betAmount: lobby.betAmount, prize }).save();
                } else { // Ничья
                    await User.findOneAndUpdate({ telegramId: lobby.player1Id }, { $inc: { balance: lobby.betAmount } });
                    await User.findOneAndUpdate({ telegramId: lobby.player2Id }, { $inc: { balance: lobby.betAmount } });
                }
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/forfeit', async (req, res) => {
    try {
        const lobby = await Lobby.findOneAndUpdate({ lobbyId: req.body.lobbyId, status: 'playing' }, { status: 'finished' }, { new: true });
        if (lobby && lobby.betAmount > 0) {
            const winnerId = (lobby.player1Id === req.body.telegramId) ? lobby.player2Id : lobby.player1Id;
            const prize = (lobby.betAmount * 2) - Math.floor((lobby.betAmount * 2) * 0.1);
            await User.findOneAndUpdate({ telegramId: winnerId }, { $inc: { balance: prize } });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(CONFIG.PORT, () => console.log('Server running on port ' + CONFIG.PORT));
