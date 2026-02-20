<script>
    // --- ПРИНУДИТЕЛЬНЫЕ РЕТРО-СТИЛИ ДЛЯ CANVAS ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    canvas.style.imageRendering = 'pixelated';
    canvas.style.setProperty('width', '100%', 'important');
    canvas.style.setProperty('height', 'auto', 'important');
    ctx.imageSmoothingEnabled = false;

    // Внутреннее разрешение Sega Genesis
    canvas.width = 320; 
    canvas.height = 224; 

    const API = "https://tg-game-arena.onrender.com";
    const ADMIN_ID = 1463465416;
    const tg = window.Telegram.WebApp; tg.ready(); tg.expand();
    
    let user = null, lobby = null, poll = null, loop = null, gameMode = '';

    // --- ЗАГРУЗКА ВНЕШНЕГО СПРАЙТ-ЛИСТА ---
    const sonicSprite = new Image();
    sonicSprite.crossOrigin = "Anonymous";
    sonicSprite.src = "https://info.sonicretro.org/images/1/1a/Sonic1_sheet.png";

    // Нарезка кадров (x, y, ширина, высота)
    const anims = {
        idle: Array.of({x: 18, y: 22, w: 29, h: 39}),
        run: Array.of(
            {x: 17, y: 104, w: 32, h: 39}, 
            {x: 56, y: 104, w: 32, h: 39}, 
            {x: 96, y: 104, w: 32, h: 39}, 
            {x: 133, y: 104, w: 32, h: 39}
        ),
        roll: Array.of(
            {x: 17, y: 201, w: 30, h: 29}, 
            {x: 52, y: 201, w: 30, h: 29}, 
            {x: 87, y: 201, w: 30, h: 29}, 
            {x: 122, y: 201, w: 30, h: 29}
        )
    };

    // --- ПЛАТФОРМЕРНЫЙ ДВИЖОК ---
    const TILE_SIZE = 32;
    const MAP_W = 60;
    const MAP_H = 15;
    let mapData = Array.from({length: MAP_W * MAP_H}, () => 0); // 0 = пусто, 1 = земля, 2 = финиш

    const GRAVITY = 0.21875;
    const ACCEL = 0.046875;
    const FRICTION = 0.046875;
    const MAX_SPEED = 6;
    const JUMP_FORCE = 6.5;

    let player = {
        x: 50, y: 50, vx: 0, vy: 0,
        width: 20, height: 30,
        state: 'idle', 
        frame: 0, frameTimer: 0,
        dir: 1, 
        grounded: false
    };

    const keys = { left: false, right: false, up: false, down: false, jump: false };

    window.press = function(k, state) { Reflect.set(keys, k, state); };

    document.onkeydown = e => {
        if(e.key === 'ArrowLeft') press('left', true);
        if(e.key === 'ArrowRight') press('right', true);
        if(e.key === 'ArrowDown') press('down', true);
        if(e.key === ' ' || e.key === 'ArrowUp') press('jump', true);
    };
    document.onkeyup = e => {
        if(e.key === 'ArrowLeft') press('left', false);
        if(e.key === 'ArrowRight') press('right', false);
        if(e.key === 'ArrowDown') press('down', false);
        if(e.key === ' ' || e.key === 'ArrowUp') press('jump', false);
    };

    function buildLevel() {
        mapData = Array.from({length: MAP_W * MAP_H}, () => 0);
        
        // Рисуем пол (тайлы 1)
        for(let x = 0; x < MAP_W; x++) {
            Reflect.set(mapData, 13 * MAP_W + x, 1);
            Reflect.set(mapData, 14 * MAP_W + x, 1);
        }
        
        // Яма
        for(let x = 20; x < 25; x++) {
            Reflect.set(mapData, 13 * MAP_W + x, 0);
            Reflect.set(mapData, 14 * MAP_W + x, 0);
        }

        // Платформы
        Reflect.set(mapData, 10 * MAP_W + 10, 1);
        Reflect.set(mapData, 10 * MAP_W + 11, 1);
        Reflect.set(mapData, 10 * MAP_W + 12, 1);

        Reflect.set(mapData, 9 * MAP_W + 30, 1);
        Reflect.set(mapData, 9 * MAP_W + 31, 1);

        // Финишная черта (тайл 2)
        Reflect.set(mapData, 12 * MAP_W + (MAP_W - 5), 2);
        Reflect.set(mapData, 11 * MAP_W + (MAP_W - 5), 2);
    }

    function getTile(x, y) {
        if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return 1; // Границы мира твердые
        return mapData.at(y * MAP_W + x);
    }

    function updatePhysics() {
        // Управление и инерция
        if (keys.left) {
            player.dir = -1;
            if (player.vx > -MAX_SPEED) player.vx -= ACCEL;
            player.state = 'run';
        } else if (keys.right) {
            player.dir = 1;
            if (player.vx < MAX_SPEED) player.vx += ACCEL;
            player.state = 'run';
        } else {
            if (player.vx > 0) {
                player.vx -= FRICTION;
                if (player.vx < 0) player.vx = 0;
            } else if (player.vx < 0) {
                player.vx += FRICTION;
                if (player.vx > 0) player.vx = 0;
            }
            player.state = 'idle';
        }

        // Сворачивание в шар
        if (keys.down && Math.abs(player.vx) > 1) {
            player.state = 'roll';
        }

        // Прыжок
        if (keys.jump && player.grounded) {
            player.vy = -JUMP_FORCE;
            player.grounded = false;
            player.state = 'roll';
            keys.jump = false; // защита от зажатия
        } else if (!player.grounded) {
            player.state = 'roll';
        }

        player.vy += GRAVITY;

        // --- КОЛЛИЗИИ ПО X ---
        player.x += player.vx;
        let tx1 = Math.floor(player.x / TILE_SIZE);
        let tx2 = Math.floor((player.x + player.width) / TILE_SIZE);
        let ty1 = Math.floor(player.y / TILE_SIZE);
        let ty2 = Math.floor((player.y + player.height - 1) / TILE_SIZE);

        if (player.vx > 0) {
            if (getTile(tx2, ty1) === 1 || getTile(tx2, ty2) === 1) {
                player.x = tx2 * TILE_SIZE - player.width - 0.1;
                player.vx = 0;
            }
        } else if (player.vx < 0) {
            if (getTile(tx1, ty1) === 1 || getTile(tx1, ty2) === 1) {
                player.x = (tx1 + 1) * TILE_SIZE + 0.1;
                player.vx = 0;
            }
        }

        // --- КОЛЛИЗИИ ПО Y ---
        player.y += player.vy;
        tx1 = Math.floor((player.x + 2) / TILE_SIZE); 
        tx2 = Math.floor((player.x + player.width - 2) / TILE_SIZE);
        ty1 = Math.floor(player.y / TILE_SIZE);
        ty2 = Math.floor((player.y + player.height) / TILE_SIZE);

        player.grounded = false;
        if (player.vy > 0) { 
            if (getTile(tx1, ty2) === 1 || getTile(tx2, ty2) === 1) {
                player.y = ty2 * TILE_SIZE - player.height;
                player.vy = 0;
                player.grounded = true;
            }
        } else if (player.vy < 0) { 
            if (getTile(tx1, ty1) === 1 || getTile(tx2, ty1) === 1) {
                player.y = (ty1 + 1) * TILE_SIZE;
                player.vy = 0;
            }
        }

        // Проверка финиша
        let centerTx = Math.floor((player.x + player.width / 2) / TILE_SIZE);
        let centerTy = Math.floor((player.y + player.height / 2) / TILE_SIZE);
        if (getTile(centerTx, centerTy) === 2) {
            triggerFinish();
        }

        // Смерть от падения в яму
        if (player.y > MAP_H * TILE_SIZE) {
            player.x = 50; player.y = 50; player.vx = 0; player.vy = 0; 
        }
    }

    function updateAnimation() {
        player.frameTimer++;
        let speed = 10;
        if (player.state === 'run') speed = Math.max(2, 10 - Math.abs(player.vx));
        if (player.state === 'roll') speed = 4;

        if (player.frameTimer > speed) {
            player.frameTimer = 0;
            player.frame++;
        }

        let currentAnimArray = Reflect.get(anims, player.state) || anims.idle;
        if (player.frame >= currentAnimArray.length) player.frame = 0;
    }

    let cameraX = 0;
    function drawGame() {
        ctx.fillStyle = '#2452FF'; // Классическое небо Green Hill
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        cameraX = player.x - canvas.width / 2;
        if (cameraX < 0) cameraX = 0;
        if (cameraX > MAP_W * TILE_SIZE - canvas.width) cameraX = MAP_W * TILE_SIZE - canvas.width;

        // Отрисовка тайлов
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                let tile = getTile(x, y);
                let drawX = Math.floor(x * TILE_SIZE - cameraX);
                let drawY = Math.floor(y * TILE_SIZE);

                if (drawX < -TILE_SIZE || drawX > canvas.width) continue;

                if (tile === 1) {
                    ctx.fillStyle = '#8B4513'; // Земля
                    ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
                    ctx.fillStyle = '#228B22'; // Трава
                    ctx.fillRect(drawX, drawY, TILE_SIZE, 8);
                } else if (tile === 2) {
                    ctx.fillStyle = '#FFD700'; // Финишная табличка
                    ctx.fillRect(drawX + 10, drawY, 12, TILE_SIZE);
                }
            }
        }

        // Отрисовка Соника из спрайт-листа
        let currentAnimArray = Reflect.get(anims, player.state) || anims.idle;
        let frm = currentAnimArray.at(player.frame % currentAnimArray.length);

        ctx.save();
        ctx.translate(Math.floor(player.x - cameraX + player.width / 2), Math.floor(player.y + player.height / 2));
        if (player.dir === -1) ctx.scale(-1, 1);

        if (sonicSprite.complete && sonicSprite.naturalWidth !== 0) {
            // Рисуем вырезанный кадр
            ctx.drawImage(sonicSprite, frm.x, frm.y, frm.w, frm.h, -frm.w/2, -frm.h/2 + 4, frm.w, frm.h);
        } else {
            // Если спрайт еще грузится, рисуем заглушку
            ctx.fillStyle = '#0020B0';
            ctx.fillRect(-player.width/2, -player.height/2, player.width, player.height);
        }
        ctx.restore();
    }

    function gameTick() {
        if (!loop) return;
        updatePhysics();
        updateAnimation();
        drawGame();
        loop = requestAnimationFrame(gameTick);
    }

    // --- СЕТЕВАЯ ИГРА И UI ---
    async function init() {
        const r = await fetch(API + '/api/user-data', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) });
        user = await r.json(); 
        document.getElementById('p-bal').innerText = user.balance;
        if (user.telegramId === ADMIN_ID) document.getElementById('admin-panel').style.display = 'block';

        if (tg.initDataUnsafe.start_param) {
            const j = await fetch(API + '/api/join-lobby', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ telegramId: user.telegramId, startParam: tg.initDataUnsafe.start_param }) });
            const d = await j.json();
            if (d.mode === 'duel') { lobby = d.lobby; launchGame('ranked'); }
            else if (d.error) tg.showAlert(d.error);
        }
    }
    init();

    function nav(id, el) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('s-' + id).classList.add('active');
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        if(el) el.classList.add('active');
    }

    async function startMatchmaking() {
        const b = parseInt(document.getElementById('search-bet').value);
        if (user.balance < b) return tg.showAlert("Insufficient balance");
        nav('search');
        const r = await fetch(API + '/api/search-match', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ telegramId: user.telegramId, gameType: 'sonicSprint', betAmount: b }) });
        const d = await r.json();
        if (d.status === 'match_found') { lobby = { lobbyId: d.lobbyId, betAmount: b }; launchGame('ranked'); }
        else { 
            poll = setInterval(async () => {
                const cr = await fetch(API + '/api/check-match-status', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ telegramId: user.telegramId }) });
                const cd = await cr.json(); 
                if (cd.status === 'match_found') { clearInterval(poll); lobby = cd.lobby; launchGame('ranked'); }
            }, 3000); 
        }
    }

    async function cancelMatchmaking() {
        clearInterval(poll);
        await fetch(API + '/api/cancel-match', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ telegramId: user.telegramId }) });
        location.reload();
    }

    function launchGame(mode) {
        gameMode = mode;
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('s-game').classList.add('active');
        document.querySelector('.tabs').style.display = 'none';
        
        player.x = 50; player.y = 50; player.vx = 0; player.vy = 0;
        buildLevel();
        
        if(loop) cancelAnimationFrame(loop);
        loop = requestAnimationFrame(gameTick);
    }

    async function triggerFinish() {
        if (loop) cancelAnimationFrame(loop);
        loop = null;
        
        document.getElementById('modal-over').style.display = 'flex';
        
        if (lobby && gameMode === 'ranked') {
            document.getElementById('end-title').innerText = "FINISH!";
            document.getElementById('end-msg').innerText = "Validating result with server...";
            
            const r = await fetch(API + '/api/submit-score', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ telegramId: user.telegramId, finished: true, lobbyId: lobby.lobbyId }) 
            });
            const d = await r.json();
            
            if (d.isWinner) {
                document.getElementById('end-title').innerText = "YOU WIN!";
                document.getElementById('end-title').style.color = "#00f0ff";
                document.getElementById('end-msg').innerText = "Prize credited to your balance!";
            } else {
                document.getElementById('end-title').innerText = "DEFEAT";
                document.getElementById('end-msg').innerText = "Opponent reached the finish line first.";
            }
        } else {
            document.getElementById('end-title').innerText = "LEVEL CLEARED";
            document.getElementById('end-title').style.color = "#00f0ff";
            document.getElementById('end-msg').innerText = "You completed the track!";
        }
    }

    function quitGame() {
        tg.showConfirm("Forfeit the match?", async function(confirmed) {
            if(!confirmed) return;
            if (lobby) {
                await fetch(API + '/api/forfeit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ telegramId: user.telegramId, lobbyId: lobby.lobbyId }) });
            }
            location.reload();
        });
    }

    // Admin Tools
    async function loadAdminData() {
        const r = await fetch(API + '/api/admin/data', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ adminId: user.telegramId }) });
        const d = await r.json();
        document.getElementById('adm-commission').innerText = (d.adminCommission || 0) + '★';
    }

    async function adminSetBalance() {
        const tid = document.getElementById('adm-target-id').value;
        const bal = document.getElementById('adm-new-bal').value;
        if(!tid || !bal) return;
        const r = await fetch(API + '/api/admin/set-balance', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ adminId: user.telegramId, targetId: tid, newBalance: bal }) });
        const d = await r.json();
        if(d.success) tg.showAlert("Updated!");
    }

    async function depositCrypto(asset, cryptoAmount, starsAmount) {
        const r = await fetch(API + '/api/deposit', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ telegramId: user.telegramId, asset, amount: cryptoAmount, stars: starsAmount }) });
        const d = await r.json();
        if (d.payUrl) {
            tg.openTelegramLink(d.payUrl);
            let checkingTimer = setInterval(async () => {
                const cur = await fetch(API + '/api/user-data', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) });
                const curUser = await cur.json();
                if(curUser.balance > user.balance) {
                    user.balance = curUser.balance;
                    document.getElementById('p-bal').innerText = user.balance;
                    clearInterval(checkingTimer);
                    tg.showAlert("Balance updated!");
                }
            }, 3000);
            setTimeout(() => clearInterval(checkingTimer), 300000);
        } else { tg.showAlert("Invoice error"); }
    }

    function withdraw() {
        if(user.balance <= 0) return tg.showAlert("Empty balance");
        tg.showConfirm("Withdraw " + user.balance + " Stars?", async function(confirmed) {
            if(!confirmed) return;
            const r = await fetch(API + '/api/withdraw', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ telegramId: user.telegramId, amount: user.balance }) });
            const d = await r.json();
            if (d.success) { 
                user.balance = d.newBalance; 
                document.getElementById('p-bal').innerText = user.balance; 
                tg.showAlert("Request sent!"); 
            } else tg.showAlert(d.error);
        });
    }
</script>
