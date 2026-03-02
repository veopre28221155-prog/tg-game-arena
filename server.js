// ... (начало кода такое же: экспресс, монгус, конфиг)
const CONFIG = {
    TELEGRAM_BOT_TOKEN: "7593728405:AAEcp0It8ovT3P_dyugpaIujGXr6s5AQqH8", 
    MONGO_URI: "mongodb+srv://admin:Cdjkjxns2011123@cluster0.3ena1xi.mongodb.net/retro_arena?retryWrites=true&w=majority",
    ADMIN_ID: 1463465416, 
    PORT: process.env.PORT || 3000
};

// НОВАЯ МОДЕЛЬ ВЫВОДОВ
const Withdrawal = mongoose.model('Withdrawal', new mongoose.Schema({
    userId: Number,
    username: String,
    coinAmount: Number,
    usdtAmount: Number,
    status: { type: String, default: 'pending' }, // pending, completed, rejected
    date: { type: Date, default: Date.now }
}));

// API ДЛЯ ЮЗЕРОВ: СОЗДАНИЕ ЗАЯВКИ
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amount } = req.body;
    const user = await User.findOne({ telegramId });
    if (user.balance >= amount && amount >= 5000) {
        await User.findOneAndUpdate({ telegramId }, { $inc: { balance: -amount } });
        const usdtAmount = (amount / 5000).toFixed(2);
        
        const request = new Withdrawal({
            userId: telegramId,
            username: user.username,
            coinAmount: amount,
            usdtAmount: usdtAmount
        });
        await request.save();
        res.json({ success: true });
    } else res.json({ success: false });
});

// --- АДМИН-ПАНЕЛЬ (ТОЛЬКО ДЛЯ ТЕБЯ) ---

// Получить список всех заявок
app.post('/api/admin/get-withdrawals', async (req, res) => {
    if (req.body.adminId !== CONFIG.ADMIN_ID) return res.status(403).send("No access");
    const list = await Withdrawal.find({ status: 'pending' }).sort({ date: -1 });
    res.json(list);
});

// Действие над заявкой (Подтвердить / Отклонить)
app.post('/api/admin/action', async (req, res) => {
    if (req.body.adminId !== CONFIG.ADMIN_ID) return res.status(403).send("No access");
    const { id, action } = req.body;
    const withdraw = await Withdrawal.findById(id);

    if (action === 'complete') {
        withdraw.status = 'completed';
    } else if (action === 'reject') {
        withdraw.status = 'rejected';
        // Возвращаем деньги игроку на баланс
        await User.findOneAndUpdate({ telegramId: withdraw.userId }, { $inc: { balance: withdraw.coinAmount } });
    }
    await withdraw.save();
    res.json({ success: true });
});

// httpServer.listen(CONFIG.PORT, ...)
