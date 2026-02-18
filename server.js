const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');
const app = express();
app.use(express.json());

const BOT_TOKEN = 'ТВОЙ_ТОКЕН_ОТ_BOTFATHER'; // Вставь свой токен!
const MONGO_URI = 'mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority';

// Подключение к MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ База данных подключена'))
    .catch(err => console.error('❌ Ошибка базы:', err));

// Схема пользователя
const UserSchema = new mongoose.Schema({
    tg_id: { type: Number, unique: true },
    name: String,
    balance: { type: Number, default: 1000 },
    wins: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

// Проверка подлинности Telegram
function verifyTelegramData(initData) {
    if (!initData) return false;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    urlParams.sort();
    const dataCheckString = Array.from(urlParams.entries()).map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    return hmac === hash;
}

// Получение данных профиля из базы
app.post('/api/user-data', async (req, res) => {
    const { initData } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');

    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
    
    let user = await User.findOne({ tg_id: tgUser.id });
    if (!user) {
        user = await User.create({ tg_id: tgUser.id, name: tgUser.first_name });
        console.log(`🆕 Создан новый игрок: ${user.name}`);
    }

    res.json({ id: user.tg_id, name: user.name, balance: user.balance, wins: user.wins });
});

// Создание счета на Stars
app.post('/api/create-invoice', async (req, res) => {
    const { initData, amount } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));

    try {
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: "Пополнение Stars",
            description: `Покупка ${amount} звезд для Retro Arena`,
            payload: `user_${tgUser.id}_${Date.now()}`,
            currency: "XTR",
            prices: [{ label: "Stars", amount: amount }]
        });
        res.json({ invoiceLink: response.data.result });
    } catch (e) {
        res.status(500).json({ error: "Ошибка платежа" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
