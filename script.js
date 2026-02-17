// 1. Проверяем, что скрипт вообще запустился
console.log("Script.js is active!");

// 2. Настройка эмулятора
const config = {
    gameUrl: "https://cdn.emulatorjs.org/stable/data/roms/nes/kirby_dream_land.nes",
    system: "nes",
    container: "#game"
};

// 3. Функция старта (запустится сама)
function initEmulator() {
    if (typeof EmulatorJS === 'undefined') {
        console.error("ОШИБКА: Загрузчик EmulatorJS не найден. Проверь интернет или ссылку в HTML.");
        document.getElementById('game').innerHTML = "<div style='color:red; padding:20px;'>Ошибка: Движок не загружен. Проверь файл index.html</div>";
        return;
    }

    new EmulatorJS(config.container, {
        dataUrl: "https://cdn.emulatorjs.org/stable/data/",
        gameUrl: config.gameUrl,
        system: config.system,
        allowPreloader: true,
        onReady: () => {
            console.log("КИРБИ ГОТОВ К БОЮ!");
            document.querySelector('.text-blue-500').innerText = "ENGINE: RUNNING";
        }
    });
}

// Запускаем через секунду, чтобы всё успело прогрузиться
setTimeout(initEmulator, 1000);

// 4. УПРАВЛЕНИЕ (Тот самый прыжок!)
function press(btn) {
    console.log("Нажата кнопка:", btn);
    if (window.EmuJS && window.EmuJS.Input) {
        window.EmuJS.Input.press(btn);
    }
}

function release(btn) {
    if (window.EmuJS && window.EmuJS.Input) {
        window.EmuJS.Input.release(btn);
    }
}

// 5. ИИ АНАЛИЗ (Для красоты)
function checkResult() {
    alert("ИИ Gemini начинает анализ экрана... Функция будет доступна после подключения API Telegram.");
}