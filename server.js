const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');
const app = express();
app.use(express.json());

const BOT_TOKEN = '7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8';
const MONGO_URI = 'mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI).then(() => console.log('✅ DB Connected'));

const UserSchema = new mongoose.Schema({
    tg_id: { type: Number, unique: true },
    name: String,
    balance: { type: Number, default: 1000 },
    wins: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

const TournamentSchema = new mongoose.Schema({
    creatorId: Number,
    bet: Number,
    status: { type: String, default: 'waiting' },
    players: [{ tg_id: Number, name: String, score: Number }]
});
const Tournament = mongoose.model('Tournament', TournamentSchema);

function verifyTelegramData(initData) {
    if (!initData) return false;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    urlParams.sort();
    const dataCheckString = Array.from(urlParams.entries()).map(([k,v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    return crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex') === hash;
}

app.post('/api/user-data', async (req, res) => {
    const { initData } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
    let user = await User.findOne({ tg_id: tgUser.id });
    if (!user) user = await User.create({ tg_id: tgUser.id, name: tgUser.first_name });
    res.json(user);
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const topUsers = await User.find().sort({ balance: -1 }).limit(10);
        res.json(topUsers);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/create-invoice', async (req, res) => {
    const { initData, amount } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
    try {
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: "Пополнение Stars",
            description: `Зачисление ${amount} звезд на игровой баланс`,
            payload: `stars_topup_${tgUser.id}`,
            currency: "XTR",
            prices: [{ label: "Stars", amount: amount }]
        });
        res.json({ invoiceLink: response.data.result });
    } catch (e) { res.status(500).json({ error: "Invoice error" }); }
});

app.post('/api/create-tournament', async (req, res) => {
    const { initData, bet } = req.body;
    if (!verifyTelegramData(initData)) return res.sendStatus(403);
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
    try {
        const user = await User.findOne({ tg_id: tgUser.id });
        if (user.balance < bet) return res.status(400).json({ error: "Недостаточно Stars" });
        user.balance -= bet;
        await user.save();
        const tourney = await Tournament.create({
            creatorId: tgUser.id,
            bet: bet,
            status: 'waiting',
            players: [{ tg_id: tgUser.id, name: tgUser.first_name, score: 0 }]
        });
        res.json({ tourneyId: tourney._id, balance: user.balance });
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/webhook', async (req, res) => {
    const update = req.body;
    if (update.message && update.message.successful_payment) {
        const pay = update.message.successful_payment;
        const tgId = parseInt(pay.invoice_payload.replace('stars_topup_', ''));
        await User.findOneAndUpdate({ tg_id: tgId }, { $inc: { balance: pay.total_amount } });
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
