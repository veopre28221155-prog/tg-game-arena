// Файл: public/custom-sega-loader.js

(function() {
    const RETRO_DEVICE_ID_JOYPAD_B = 0, RETRO_DEVICE_ID_JOYPAD_Y = 1, RETRO_DEVICE_ID_JOYPAD_SELECT = 2;
    const RETRO_DEVICE_ID_JOYPAD_START = 3, RETRO_DEVICE_ID_JOYPAD_UP = 4, RETRO_DEVICE_ID_JOYPAD_DOWN = 5;
    const RETRO_DEVICE_ID_JOYPAD_LEFT = 6, RETRO_DEVICE_ID_JOYPAD_RIGHT = 7, RETRO_DEVICE_ID_JOYPAD_A = 8, RETRO_DEVICE_ID_JOYPAD_X = 9;

    window.ArenaEngine = {
        Module: null,
        memory: null,
        getSystemRamPointer: function() {
            if (this.Module && this.Module._retro_get_memory_data) {
                return this.Module._retro_get_memory_data(0);
            }
            return 0;
        },
        readRamByte: function(offset) {
            const ptr = this.getSystemRamPointer();
            if (ptr && this.memory) return this.memory[ptr + offset];
            return null;
        }
    };

    const inputState = new Int16Array(16);
    const keyMap = {
        'ArrowUp': RETRO_DEVICE_ID_JOYPAD_UP, 'ArrowDown': RETRO_DEVICE_ID_JOYPAD_DOWN,
        'ArrowLeft': RETRO_DEVICE_ID_JOYPAD_LEFT, 'ArrowRight': RETRO_DEVICE_ID_JOYPAD_RIGHT,
        'KeyX': RETRO_DEVICE_ID_JOYPAD_A, 'KeyZ': RETRO_DEVICE_ID_JOYPAD_B,
        'KeyC': RETRO_DEVICE_ID_JOYPAD_Y, 'Enter': RETRO_DEVICE_ID_JOYPAD_START
    };

    window.addEventListener('keydown', (e) => {
        if (keyMap[e.code] !== undefined) { inputState[keyMap[e.code]] = 1; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
        if (keyMap[e.code] !== undefined) { inputState[keyMap[e.code]] = 0; e.preventDefault(); }
    });

    window.StartCustomEmulator = async function(romName) {
        console.log(`[ArenaEngine] Запуск ядра для: ${romName}`);
        const canvas = document.getElementById('game-container');
        
        let romBuffer;
        try {
            const response = await fetch('/' + romName);
            if (!response.ok) throw new Error("ROM не найден");
            romBuffer = await response.arrayBuffer();
        } catch (err) {
            console.error('[ArenaEngine] Ошибка загрузки ROM:', err); return;
        }

        const Module = {
            canvas: canvas,
            print: (text) => console.log(`[Core] ${text}`),
            printErr: (text) => console.error(`[Core Error] ${text}`),
            onRuntimeInitialized: function() {
                window.ArenaEngine.Module = Module;
                window.ArenaEngine.memory = Module.HEAPU8;
                
                Module.FS.writeFile('/game.md', new Uint8Array(romBuffer));
                Module._retro_init();
                
                const gameInfo = Module._malloc(1024);
                if (Module._retro_load_game(gameInfo)) {
                    const step = () => { Module._retro_run(); requestAnimationFrame(step); };
                    requestAnimationFrame(step);
                }
            },
            retro_input_poll: function() {},
            retro_input_state: function(port, device, index, id) { return inputState[id] || 0; },
            audioContext: null,
            retro_audio_sample: function() {},
            retro_audio_sample_batch: function() {
                if (!this.audioContext) this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        };

        window.Module = Module; // Важно для Emscripten
        const script = document.createElement('script');
        script.src = '/genesis_plus_gx.js';
        document.head.appendChild(script);
    };
})();
