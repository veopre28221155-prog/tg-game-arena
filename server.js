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

// Таблица лидеров
app.get('/api/leaderboard', async (req, res) => {
    const topUsers = await User.find().sort({ balance: -1 }).limit(10);
    res.json(topUsers);
});

// ... (оставь функции verifyTelegramData, /api/user-data, /api/create-invoice и /api/webhook из прошлого сообщения)
// Добавь эндпоинты /api/create-tournament и /api/finish-tournament, которые я давал выше.

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
