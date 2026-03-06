// ==========================================
// server.js - Backend Pixel Kombat Arena
// ==========================================
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Раздаем папку public

// ❌ ВСТАВЬ СВОИ ДАННЫЕ СЮДА ❌
const MONGO_URI = "mongodb+srv://ТВОЙ_ЛОГИН:ТВОЙ_ПАРОЛЬ@cluster0...mongodb.net/pixelarena";
const GEMINI_API_KEY = "ТВОЙ_КЛЮЧ_GOOGLE_AI_STUDIO";

// Подключение к MongoDB
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB подключена')).catch(err => console.error(err));

// Модель пользователя
const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: String,
    balance: { type: Number, default: 1000 } // Стартовый баланс
});
const User = mongoose.model('User', UserSchema);

// --- API: АВТОРИЗАЦИЯ И ПОЛУЧЕНИЕ БАЛАНСА ---
app.post('/api/user-data', async (req, res) => {
    try {
        // В реальном проекте тут нужна валидация initData через токен бота
        // Пока доверяем данным для простоты (заглушка)
        const tgData = req.body.telegramUser; // Ожидаем объект { id, first_name }
        
        if (!tgData || !tgData.id) return res.status(400).json({ success: false });

        let user = await User.findOne({ telegramId: tgData.id });
        if (!user) {
            user = await User.create({ telegramId: tgData.id, username: tgData.first_name || "Warrior" });
        }
        
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- API: ИИ-СУДЬЯ (GEMINI ANTI-CHEAT) ---
const SYSTEM_INSTRUCTION = `You are an immutable Anti-Cheat Verification Engine for "Pixel Kombat Arena", a retro-gaming platform. 
Your sole purpose is to analyze match telemetry and determine if a human player used cheats, memory editors, or macros.

You analyze three games based on their hard-coded physics and engine limitations (60 FPS NTSC standard).

[GAME: SONIC THE HEDGEHOG]
- Goal: Minimum Time (ms).
- Physics limits: Sonic has a maximum X-axis velocity and a fixed acceleration curve. He cannot teleport. 
- Impossible metrics: Completing any standard Act in under 20,000ms (20 seconds) without glitches. Telemetry showing massive distance covered in 0 frames.
- Rules: If time_ms is lower than the known human TAS (Tool-Assisted Speedrun) limits, it is a cheat.

[GAME: TETRIS]
- Goal: Maximum Score.
- Physics limits: Maximum points per action is a "Tetris" (4 lines cleared simultaneously). The piece drop speed is physically limited by the 60Hz engine. 
- Impossible metrics: Gaining 10,000+ points in a single 1-second interval. Clearing more than 4 lines in a single timestamp. Score ending in an impossible digit (Tetris scoring usually ends in 0).
- Rules: If the score velocity (points per second) exceeds mathematical limits of the game grid, it is a cheat.

[GAME: BOMBER ARENA]
- Goal: Survival Time & Points.
- Physics limits: Bomb placement has a strict cooldown (e.g., max 2 bombs on screen initially). Explosion delay is fixed.
- Impossible metrics: Placing 10 bombs in 1 second. Surviving longer than the server's absolute match timer.
- Rules: Any action rate exceeding the game's cooldown memory limits is a cheat.

[OUTPUT PROTOCOL]
You must respond ONLY with a valid JSON object. Absolutely no markdown formatting (do not use \`\`\`json), no conversational text, no explanations outside the JSON.

Expected Output Format:
{
  "status": "approve" | "flag_for_review" | "reject",
  "reason": "Short, technical explanation (max 10 words)"
}`;

app.post('/api/verify-match', async (req, res) => {
    const { telegramId, game, score, telemetry } = req.body;

    const promptData = JSON.stringify({ game, final_score_ms: score, telemetry_events: telemetry });

    try {
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
                contents: [{ parts: [{ text: promptData }] }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const result = await geminiResponse.json();
        
        // Извлекаем ответ ИИ
        const aiText = result.candidates[0].content.parts[0].text;
        const aiVerdict = JSON.parse(aiText);

        // Если ИИ одобряет — начисляем награду (например, +50 монет)
        if (aiVerdict.status === 'approve') {
            const updatedUser = await User.findOneAndUpdate(
                { telegramId }, 
                { $inc: { balance: 50 } }, 
                { new: true }
            );
            return res.json({ status: 'approve', reason: aiVerdict.reason, newBalance: updatedUser.balance });
        }

        // Если чит или подозрение — монеты не даем
        res.json(aiVerdict);

    } catch (error) {
        console.error("AI Referee Error:", error);
        res.status(500).json({ error: "Referee system offline" });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
