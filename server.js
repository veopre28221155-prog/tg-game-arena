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

mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB Connected'));

const UserSchema = new mongoose.Schema({
    tg_id: { type: Number, unique: true },
    name: String,
    balance: { type: Number, default: 1000 }
});
const User = mongoose.model('User', UserSchema);

const RoomSchema = new mongoose.Schema({
    bet: Number,
    creatorId: Number,
    status: { type: String, default: 'waiting' }
});
const Room = mongoose.model('Room', RoomSchema);

function verifyTelegramData(initData) {
    if (!initData) return false;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    urlParams.sort();
    const dataCheckString = Array.from(urlParams.entries()).map(([k,v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const checkHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    return checkHash === hash;
}

app.post('/api/user-data', async (req, res) => {
    try {
        const { initData } = req.body;
        if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
        const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
        let user = await User.findOne({ tg_id: tgUser.id });
        if (!user) user = await User.create({ tg_id: tgUser.id, name: tgUser.first_name });
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ПОПОЛНЕНИЕ ОТ 10 STARS
app.post('/api/create-invoice', async (req, res) => {
    try {
        const { initData, amount } = req.body;
        if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
        if (amount < 10) return res.status(400).json({ error: "Минимум 10 Stars" });

        const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: "Пополнение баланса",
            description: `Покупка ${amount} звезд для Retro Arena`,
            payload: `stars_${tgUser.id}`,
            currency: "XTR",
            prices: [{ label: "Stars", amount: amount }]
        });
        res.json({ invoiceLink: response.data.result });
    } catch (e) { res.status(500).json({ error: "Ошибка платежа" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
