const express = require('express');
const crypto = require('crypto');
const axios = require('axios'); // Добавили библиотеку для запросов к API Telegram
const app = express();
app.use(express.json());

const BOT_TOKEN = 'ТВОЙ_ТОКЕН_ОТ_BOTFATHER'; // <--- ТВОЙ ТОКЕН ТУТ

// Функция проверки данных от Telegram
function verifyTelegramData(initData) {
    if (!initData) return false;
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    urlParams.sort();

    let dataCheckString = '';
    for (const [key, value] of urlParams.entries()) {
        dataCheckString += `${key}=${value}\n`;
    }
    dataCheckString = dataCheckString.slice(0, -1);

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return hmac === hash;
}

// 1. Получение данных профиля
app.post('/api/user-data', (req, res) => {
    const { initData } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).json({ error: 'Invalid data' });

    const user = JSON.parse(new URLSearchParams(initData).get('user'));
    
    // В будущем тут будет запрос к Базе Данных (MongoDB)
    res.json({
        id: user.id,
        name: user.first_name,
        balance: 1000, 
        wins: 0
    });
});

// 2. Создание счета на оплату (Telegram Stars)
app.post('/api/create-invoice', async (req, res) => {
    const { initData, amount } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).json({ error: 'Invalid data' });

    const user = JSON.parse(new URLSearchParams(initData).get('user'));

    try {
        // Запрос к Telegram Bot API для генерации ссылки на оплату
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: "Пополнение баланса Stars",
            description: `Покупка ${amount} звезд для игры в Retro Arena`,
            payload: `user_id_${user.id}`, // Скрытая метка, чтобы понять кто купил
            currency: "XTR", // Код для Telegram Stars
            prices: [{ label: "Stars", amount: amount }]
        });

        res.json({ invoiceLink: response.data.result });
    } catch (error) {
        console.error("Ошибка при создании счета:", error);
        res.status(500).json({ error: "Не удалось создать счет" });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
