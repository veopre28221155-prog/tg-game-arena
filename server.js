const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const CONFIG = {
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    PORT: process.env.PORT || 3000
};

mongoose.connect(CONFIG.MONGO_URI).then(() => console.log('✅ Database Connected'));

const User = mongoose.model('User', new mongoose.Schema({
    telegramId: Number, username: String, balance: { type: Number, default: 1000 }
}));

app.post('/api/user-data', async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const userData = JSON.parse(params.get('user'));
        let u = await User.findOneAndUpdate(
            { telegramId: userData.id }, 
            { username: userData.first_name }, 
            { upsert: true, new: true }
        );
        res.json({ success: true, user: u });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 Solo Arena Serving on Port ${CONFIG.PORT}`));
