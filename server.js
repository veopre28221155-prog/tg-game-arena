// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios'); // Для запросов к Telegram API

const app = express();
app.use(express.json());
app.use(cors());

// --- КОНФИГУРАЦИЯ (В продакшене используйте .env!) ---
const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8",
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    PORT: process.env.PORT || 3000
};

// --- MONGODB ПОДКЛЮЧЕНИЕ ---
mongoose.connect(CONFIG.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Error:', err));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    balance: { type: Number, default: 0 }, // Telegram Stars
    highScores: {
        snake: { type: Number, default: 0 },
        tetris: { type: Number, default: 0 }
    }
});

const LobbySchema = new mongoose.Schema({
    lobbyId: { type: String, required: true, unique: true },
    player1Id: Number, // Создатель
    player2Id: Number, // Присоединившийся
    gameType: String, // 'snake' или 'tetris'
    status: { type: String, default: 'waiting' }, // waiting, active, finished
    scores: {
        player1: { type: Number, default: 0 },
        player2: { type: Number, default: 0 }
    }
});

const User = mongoose.model('User', UserSchema);
const Lobby = mongoose.model('Lobby', LobbySchema);

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Проверка валидности данных от Telegram (HMAC)
const verifyTelegramWebAppData = (telegramInitData) => {
    if (!telegramInitData) return false;
    
    const urlParams = new URLSearchParams(telegramInitData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    // Сортируем параметры
    const paramsList = [];
    for (const [key, value] of urlParams.entries()) {
        paramsList.push(`${key}=${value}`);
    }
    paramsList.sort();
    const dataCheckString = paramsList.join('\n');
    
    // Генерация ключа и хеша
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CONFIG.TELEGRAM_BOT_TOKEN).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return hmac === hash;
};

// --- API ENDPOINTS ---

// 1. Инициализация пользователя и проверка данных
app.post('/api/user-data', async (req, res) => {
    const { initData } = req.body;

    if (!verifyTelegramWebAppData(initData)) {
        return res.status(403).json({ error: 'Invalid auth data' });
    }

    const urlParams = new URLSearchParams(initData);
    const userData = JSON.parse(urlParams.get('user'));

    try {
        let user = await User.findOne({ telegramId: userData.id });
        if (!user) {
            user = new User({
                telegramId: userData.id,
                username: userData.username,
                firstName: userData.first_name
            });
            await user.save();
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Вход в лобби (или создание ссылки для друга, если логика расширится)
app.post('/api/join-lobby', async (req, res) => {
    const { telegramId, startParam } = req.body; // startParam = lobby_ID

    if (!startParam) {
        // Режим тренировки
        return res.json({ mode: 'training', message: 'Training Mode' });
    }

    try {
        let lobby = await Lobby.findOne({ lobbyId: startParam });
        
        if (!lobby) {
            // Если лобби нет, создаем его (игрок 1)
            lobby = new Lobby({
                lobbyId: startParam,
                player1Id: telegramId,
                status: 'waiting'
            });
            await lobby.save();
            return res.json({ mode: 'duel', role: 'creator', lobby });
        } else {
            // Если лобби есть и игрок не создатель
            if (lobby.player1Id !== telegramId && !lobby.player2Id) {
                lobby.player2Id = telegramId;
                lobby.status = 'active';
                await lobby.save();
                return res.json({ mode: 'duel', role: 'joiner', lobby });
            } else if (lobby.player1Id === telegramId) {
                return res.json({ mode: 'duel', role: 'creator', lobby });
            } else {
                return res.status(400).json({ error: 'Lobby full or invalid' });
            }
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Отправка очков
app.post('/api/submit-score', async (req, res) => {
    const { telegramId, game, score, lobbyId } = req.body;

    try {
        // Обновляем личный рекорд
        const user = await User.findOne({ telegramId });
        if (user) {
            if (score > user.highScores[game]) {
                user.highScores[game] = score;
                await user.save();
            }
        }

        // Если это дуэль, обновляем лобби
        if (lobbyId) {
            const lobby = await Lobby.findOne({ lobbyId });
            if (lobby) {
                if (lobby.player1Id === telegramId) lobby.scores.player1 = score;
                else if (lobby.player2Id === telegramId) lobby.scores.player2 = score;
                
                // Простая логика завершения: если оба сыграли (нужен более сложный сокет для реалтайма, но для REST так)
                if (lobby.scores.player1 > 0 && lobby.scores.player2 > 0) {
                    lobby.status = 'finished';
                }
                await lobby.save();
            }
        }
        res.json({ success: true, newHighScore: user.highScores[game] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Создание платежа (Telegram Stars)
app.post('/api/create-invoice', async (req, res) => {
    const { title, description, amount } = req.body;

    // ВАЖНО: Telegram Stars (XTR). Provider token должен быть пустым для Stars.
    const payload = {
        title: title || "Пополнение баланса",
        description: description || "Покупка монет Retro Arena",
        payload: JSON.stringify({ unique_id: Date.now() }), // Внутренний ID
        currency: "XTR", 
        prices: [{ label: "Монеты", amount: amount }], // amount в звездах (целое число)
        provider_token: "" // Пусто для Stars
    };

    try {
        const response = await axios.post(
            `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/createInvoiceLink`,
            payload
        );
        res.json({ invoiceLink: response.data.result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

app.listen(CONFIG.PORT, () => {
    console.log(`Server running on port ${CONFIG.PORT}`);
});
