const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = '7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8';
const MONGO_URI = 'mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI).then(() => console.log('✅ DB Connected'));

const UserSchema = new mongoose.Schema({
    tg_id: { type: Number, unique: true },
    name: String,
    balance: { type: Number, default: 1000 }
});
const User = mongoose.model('User', UserSchema);

const Withdraw = mongoose.model('Withdraw', new mongoose.Schema({
    tg_id: Number, amount: Number, date: { type: Date, default: Date.now }
}));

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

app.post('/api/create-invoice', async (req, res) => {
    const { initData, amount } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
    try {
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: "Пополнение Stars",
            description: `Покупка ${amount} звезд`,
            payload: `stars_${tgUser.id}`,
            currency: "XTR",
            prices: [{ label: "Stars", amount: amount }]
        });
        res.json({ invoiceLink: response.data.result });
    } catch (e) { res.status(500).json({ error: "Error" }); }
});

app.post('/api/withdraw', async (req, res) => {
    const { initData, amount } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
    const user = await User.findOne({ tg_id: tgUser.id });
    if (user.balance < amount) return res.status(400).send("No funds");
    user.balance -= amount;
    await user.save();
    await Withdraw.create({ tg_id: tgUser.id, amount });
    res.json({ success: true, balance: user.balance });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
