const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');
const app = express();
app.use(express.json());

const BOT_TOKEN = 'ТВОЙ_ТОКЕН_ОТ_BOTFATHER'; // <--- ПРОВЕРЬ ТОКЕН!
const MONGO_URI = 'mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI).then(() => console.log('✅ DB Connected'));

const UserSchema = new mongoose.Schema({
    tg_id: { type: Number, unique: true },
    name: String,
    balance: { type: Number, default: 1000 }
});
const User = mongoose.model('User', UserSchema);

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

// 1. Получение данных профиля
app.post('/api/user-data', async (req, res) => {
    const { initData } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
    
    let user = await User.findOne({ tg_id: tgUser.id });
    if (!user) user = await User.create({ tg_id: tgUser.id, name: tgUser.first_name });
    res.json(user);
});

// 2. Создание счета (Invoice)
app.post('/api/create-invoice', async (req, res) => {
    const { initData, amount } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));

    try {
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: "Пополнение Stars",
            description: `Зачисление ${amount} звезд на игровой баланс`,
            payload: `stars_topup_${tgUser.id}`, // Важно для Webhook
            currency: "XTR",
            prices: [{ label: "Stars", amount: amount }]
        });
        res.json({ invoiceLink: response.data.result });
    } catch (e) { res.status(500).json({ error: "Invoice error" }); }
});

// 3. ОБРАБОТЧИК ПЛАТЕЖЕЙ (Webhook)
// Этот эндпоинт Telegram вызовет сам после оплаты
app.post('/api/webhook', async (req, res) => {
    const update = req.body;
    
    // Если пришел успешный платеж
    if (update.message && update.message.successful_payment) {
        const pay = update.message.successful_payment;
        const tgId = parseInt(pay.invoice_payload.replace('stars_topup_', ''));
        const amount = pay.total_amount;

        // Начисляем звезды в базу данных MongoDB!
        await User.findOneAndUpdate({ tg_id: tgId }, { $inc: { balance: amount } });
        console.log(`✅ Игроку ${tgId} зачислено ${amount} Stars`);
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
