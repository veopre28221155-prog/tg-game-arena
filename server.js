const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const CONFIG = {
    ADMIN_ID: 1463465416,
    PORT: process.env.PORT || 3000,
    CRYPTO_TOKEN: "535127:AAviaEd5s4fdrTrHuHpXARM04OXIa7XsEjV"
};

mongoose.connect("mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority");

const User = mongoose.model('User', { 
    telegramId: Number, 
    username: String, 
    balance: { type: Number, default: 0 },
    adminCommission: { type: Number, default: 0 }
});

const Lobby = mongoose.model('Lobby', {
    lobbyId: String,
    player1Id: Number,
    player2Id: Number,
    betAmount: Number,
    status: { type: String, default: 'active' }, // active, finished
    winnerId: Number
});

// Роут для завершения игры (турнирный режим)
app.post('/api/submit-score', async (req, res) => {
    const { telegramId, lobbyId, finished } = req.body;
    
    if (!lobbyId || !finished) return res.json({ success: true });

    const lobby = await Lobby.findOne({ lobbyId, status: 'active' });
    if (lobby) {
        // Атомарно закрываем лобби и назначаем победителя
        const closedLobby = await Lobby.findOneAndUpdate(
            { lobbyId, status: 'active' },
            { $set: { status: 'finished', winnerId: telegramId } },
            { new: true }
        );

        if (closedLobby) {
            const pool = closedLobby.betAmount * 2;
            const fee = Math.floor(pool * 0.1); // Твои 10%
            const prize = pool - fee;

            // Начисляем тебе комиссию
            await User.findOneAndUpdate({ telegramId: CONFIG.ADMIN_ID }, { $inc: { balance: fee, adminCommission: fee } });
            // Начисляем приз победителю
            await User.findOneAndUpdate({ telegramId: telegramId }, { $inc: { balance: prize } });
            
            return res.json({ success: true, isWinner: true });
        }
    }
    res.json({ success: true, isWinner: false });
});

app.listen(CONFIG.PORT, () => console.log(`Server running on port ${CONFIG.PORT}`));
