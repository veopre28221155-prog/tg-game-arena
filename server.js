const express = require('express');
const crypto = require('crypto');
const app = express();
app.use(express.json());

// ВСТАВЬ СЮДА СВОЙ ТОКЕН ОТ BOTFATHER
const BOT_TOKEN = 'ТВОЙ_ТОКЕН_ЗДЕСЬ'; 

// Проверка подлинности данных от Telegram
function verifyTelegramData(initData) {
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

// Запрос данных пользователя
app.post('/api/user-data', (req, res) => {
    const { initData } = req.body;

    if (!verifyTelegramData(initData)) {
        return res.status(403).json({ error: 'Data invalid' });
    }

    const urlParams = new URLSearchParams(initData);
    const user = JSON.parse(urlParams.get('user'));

    // Пока храним баланс в памяти сервера (после перезагрузки сбросится)
    // В будущем тут будет подключение к Базе Данных
    res.json({
        id: user.id,
        name: user.first_name,
        balance: 1000, 
        wins: 0
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
