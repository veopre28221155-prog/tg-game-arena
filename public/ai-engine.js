// NEURAL ARENA ENGINE v5.0 - AUTONOMOUS AI INTEGRATION
class NeuralSonicEngine {
    constructor(scene) {
        this.scene = scene;
        this.version = "5.0_HUNTER_BOT";
    }

    // ИИ воссоздает графику (Соник + Пол + Враг)
    generateTextures() {
        // --- СОНИК ---
        const s = document.createElement('canvas');
        s.width = 64; s.height = 64;
        const ctxS = s.getContext('2d');
        ctxS.fillStyle = '#0055FF'; ctxS.beginPath(); ctxS.arc(32, 30, 20, 0, Math.PI * 2); ctxS.fill();
        ctxS.moveTo(15, 20); ctxS.lineTo(2, 10); ctxS.lineTo(15, 30); ctxS.fill();
        ctxS.moveTo(15, 35); ctxS.lineTo(2, 45); ctxS.lineTo(20, 45); ctxS.fill();
        ctxS.fillStyle = '#0033AA'; ctxS.fillRect(20, 10, 8, 8); ctxS.fillRect(36, 10, 8, 8);
        ctxS.fillStyle = '#FFDAB9'; ctxS.arc(42, 35, 12, 0, Math.PI*2); ctxS.fill();
        ctxS.fillStyle = '#000'; ctxS.fillRect(48, 30, 4, 6);
        ctxS.fillStyle = '#FF0000'; ctxS.fillRect(15, 52, 35, 10); 
        ctxS.fillStyle = '#FFFFFF'; ctxS.fillRect(15, 52, 35, 2);
        this.scene.textures.addCanvas('sonic_v4', s);

        // --- НЕЙРО-ОХОТНИК (ВРАГ) ---
        const e = document.createElement('canvas');
        e.width = 64; e.height = 64;
        const ctxE = e.getContext('2d');
        ctxE.fillStyle = '#333333'; // Металлический корпус
        ctxE.beginPath(); ctxE.arc(32, 32, 22, 0, Math.PI * 2); ctxE.fill();
        ctxE.fillStyle = '#FF0000'; // Светящийся красный глаз
        ctxE.fillRect(35, 25, 15, 8);
        ctxE.fillStyle = '#FFFF00'; // Турбина сзади
        ctxE.fillRect(10, 30, 10, 15);
        this.scene.textures.addCanvas('hunter_bot', e);

        // --- УРОВЕНЬ ---
        const g = this.scene.make.graphics({x: 0, y: 0, add: false});
        g.fillStyle(0x8B4513, 1); g.fillRect(0, 0, 64, 64);
        g.fillStyle(0x654321, 1);
        for(let x=0; x<64; x+=8) { for(let y=0; y<64; y+=8) { if((x+y)%16==0) g.fillRect(x,y,4,4); } }
        g.fillStyle(0x00CC00, 1); g.fillRect(0, 0, 64, 20);
        g.generateTexture('tile_v4', 64, 64);
    }

    // Нейронный анализ скорости
    getVelocityData(velocity) {
        if (Math.abs(velocity) > 300) return "SONIC_SPEED";
        if (Math.abs(velocity) > 10) return "RUNNING";
        return "IDLE";
    }

    // АВТОНОМНЫЙ ИИ ОХОТНИКА
    processHunterAI(hunter, target) {
        // ИИ вычисляет дистанцию до игрока
        const distance = Phaser.Math.Distance.Between(hunter.x, hunter.y, target.x, target.y);

        if (distance < 500 && distance > 50) {
            // Если игрок близко - Атака! (разгон к игроку)
            this.scene.physics.moveToObject(hunter, target, 250); 
            
            // Вращение турбины (анимация агрессии)
            hunter.setAngle(hunter.body.velocity.x > 0 ? 15 : -15);
        } else if (distance <= 50) {
            // Игрок пойман
            hunter.setVelocityX(0);
            hunter.setAngle(0);
        } else {
            // Игрок далеко - Патрулирование (остановка)
            hunter.setVelocityX(0);
            hunter.setAngle(0);
        }
    }
}
