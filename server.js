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

const User = mongoose.model('User', new mongoose.Schema({
    tg_id: { type: Number, unique: true },
    name: String,
    balance: { type: Number, default: 1000 }
}));

const Lobby = mongoose.model('Lobby', new mongoose.Schema({
    lobbyId: String,
    players: [Number],
    status: { type: String, default: 'waiting' },
    scores: { type: Map, of: Number, default: {} }
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

app.post('/api/join-lobby', async (req, res) => {
    const { initData, lobbyId } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
    let lobby = await Lobby.findOne({ lobbyId });
    if (!lobby) {
        lobby = await Lobby.create({ lobbyId, players: [tgUser.id] });
    } else if (!lobby.players.includes(tgUser.id)) {
        lobby.players.push(tgUser.id);
        if (lobby.players.length >= 2) lobby.status = 'ready';
        await lobby.save();
    }
    res.json(lobby);
});

app.post('/api/submit-score', async (req, res) => {
    const { initData, lobbyId, score } = req.body;
    if (!verifyTelegramData(initData)) return res.status(403).send('Unauthorized');
    const tgUser = JSON.parse(new URLSearchParams(initData).get('user'));
    let lobby = await Lobby.findOne({ lobbyId });
    if (lobby) {
        lobby.scores.set(tgUser.id.toString(), score);
        await lobby.save();
        res.json(lobby);
    } else res.status(404).send("Lobby not found");
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
