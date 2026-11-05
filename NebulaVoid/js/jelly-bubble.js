/**
 * NEBULA VOID — JellyBubble soft-body incubators + spatial spawn.
 * Load after config-loader.js and js/pool.js. Call configureJellyBubble() from entities.js.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/jelly-bubble.js");
    }

    const GAME_SETTINGS = boot.gameSettings;

    /** Contur jeleu — cyan / albastru / violet (ton NEBULA VOID, la fel de neon ca înainte). */
    const JELLY_SHELL_COLORS = [
        "rgba(0, 210, 255, 1)",
        "rgba(96, 165, 255, 1)",
        "rgba(148, 118, 255, 1)",
        "rgba(224, 242, 255, 1)",
    ];

    /** Ouă — paletă rece dar distinctă (fără roșu/portocaliu/maro). */
    const JELLY_EGG_COLORS = [
        "#5CB8FF",
        "#6B9FFF",
        "#8B7CF6",
        "#4FD1C5",
        "#7DD3FC",
        "#A5B4FC",
        "#67E8F9",
        "#C4B5FD",
    ];

    /** @type {null | (() => { poolJellyBubbles: unknown[]; player: object })} */
    let getSpawnContextFn = null;

    function configureJellyBubble(deps) {
        if (!deps || typeof deps.getSpawnContext !== "function") {
            throw new Error("configureJellyBubble requires { getSpawnContext: () => ({ poolJellyBubbles, player }) }");
        }
        getSpawnContextFn = deps.getSpawnContext;
    }

class JellyBubble {
    constructor() {
        this.active = false;
        this.points = [];
        this.numPoints = 32;
        this.x = 0; this.y = 0; this.radius = 0;
        this.color = "";
        this.innerColor = "";
        this.jellyId = ++JellyBubble._nextId;
        
        // --- Sistem Ouă ---
        this.eggs = [];
        this.eggTimer = 0;
    }

    spawn(x, y, radius, color) {
        this.active = true;
        this.x = x; this.y = y;
        this.radius = radius;
        this.color = color;
        this.innerColor = color.replace("1)", "0.1)");
        
        this.eggs = [];
        this.eggTimer = 0;

        const aStep = (Math.PI * 2) / this.numPoints;

        if (this.points.length === 0) {
            for (let i = 0; i < this.numPoints; i++) {
                const px = Math.cos(i * aStep) * radius;
                const py = Math.sin(i * aStep) * radius;
                this.points.push({ x: px, y: py, origX: px, origY: py, vx: 0, vy: 0 });
            }
        } else {
            this.points.forEach((p, i) => {
                const px = Math.cos(i * aStep) * radius;
                const py = Math.sin(i * aStep) * radius;
                p.x = p.origX = px; p.y = p.origY = py;
                p.vx = p.vy = 0;
            });
        }
    }

    // --- UPDATAT: Am adăugat poolNutrients pentru a arunca ouăle afară ---
    update(player, poolBots, poolNutrients, dt) {
        if (!this.active) return;

        const dxB = this.x - player.x, dyB = this.y - player.y;
        const distSq = dxB*dxB + dyB*dyB;
        const checkRange = this.radius + 150; 

        const t = Date.now() * 0.0015;
        const skipPlayer = distSq > checkRange*checkRange;

        this.eggTimer += dt;
        if (this.eggTimer >= GAME_SETTINGS.JELLY_EGG_SPAWN_RATE) {
            this.eggTimer = 0;
            
            if (this.eggs.length < GAME_SETTINGS.JELLY_MAX_EGGS) {
                // Creăm un ou nou în interior
                let angle = Math.random() * Math.PI * 2;
                // sqrt(random) distribuie ouăle uniform pe suprafața discului (nu aglomerat în centru)
                let dist = Math.sqrt(Math.random()) * (this.radius * 0.6);
                const startX = Math.cos(angle) * dist;
                const startY = Math.sin(angle) * dist;
                this.eggs.push({
                    offsetX: startX,
                    offsetY: startY,
                    homeX: startX,
                    homeY: startY,
                    color: JELLY_EGG_COLORS[Math.floor(Math.random() * JELLY_EGG_COLORS.length)],
                    vx: 0,
                    vy: 0
                });
            } else {
                // JELEUL E PLIN -> EXPLOZIE DE OUĂ PE HARTĂ!
                if (typeof playJellyEggBurstSound === "function") {
                    playJellyEggBurstSound(this.radius, this.eggs.length);
                }
                
                this.eggs.forEach(egg => {
                    let n = global.getFromPool(poolNutrients);
                    if (n) {
                        n.spawn(this.x + egg.offsetX, this.y + egg.offsetY, egg.color);
                        n.jellyId = this.jellyId;
                        // Aruncăm oul în direcția în care se afla în jeleu (efect radial)
                        let expelAngle = Math.atan2(egg.offsetY, egg.offsetX);
                        n.vx = Math.cos(expelAngle) * 1600; // Viteză mare de ejecție
                        n.vy = Math.sin(expelAngle) * 1600;
                        n.radius = 2.5; // Ouăle sunt un pic mai mari decât nutrienții normali
                        n.life = 7.0;   // Trăiesc mult ca să poată fi culese
                    }
                });
                
                // Efect vizual de contracție a jeleului când elimină ouăle
                this.points.forEach(p => { p.vx -= p.origX * 0.5; p.vy -= p.origY * 0.5; });
                
                this.eggs = []; // Golim incubatorul
            }
        }

        // --- Căutăm boții care se lovesc de marginea jeleului ---
        let nearbyBots = [];
        if (poolBots) {
            for (let i = 0; i < poolBots.length; i++) {
                let b = poolBots[i];
                if (!b.active) continue;
                let bdx = this.x - b.x, bdy = this.y - b.y;
                if (bdx*bdx + bdy*bdy < (this.radius + b.radius + 60)**2) {
                    nearbyBots.push(b);
                }
            }
        }

        // --- NOU: Coliziune fizică player <-> ouă (ouăle sunt împinse, nu traversate) ---
        const maxEggRadius = 16.5; // din draw: 10 + sin()*6.5 (raza vizuală maximă a oului)
        const playerEggCollisionRange = player.radius + maxEggRadius;
        const playerEggCollisionRangeSq = playerEggCollisionRange * playerEggCollisionRange;
        for (let i = 0; i < this.eggs.length; i++) {
            const egg = this.eggs[i];
            let ex = this.x + egg.offsetX;
            let ey = this.y + egg.offsetY;
            let edx = ex - player.x;
            let edy = ey - player.y;
            let edSq = edx * edx + edy * edy;

            if (edSq < playerEggCollisionRangeSq && edSq > 0.000001) {
                const ed = Math.sqrt(edSq);
                const overlap = playerEggCollisionRange - ed;
                const nx = edx / ed;
                const ny = edy / ed;

                // Separare de poziție, o dată. Impulsul se aplică doar dacă oul încă intră în celulă,
                // ca arcul de revenire să nu-l bage la loc în aceeași lovitură.
                egg.offsetX += nx * overlap;
                egg.offsetY += ny * overlap;
                const closing = egg.vx * nx + egg.vy * ny;
                if (closing < 0) {
                    egg.vx -= nx * closing;
                    egg.vy -= ny * closing;
                    const push = Math.min(2.4, overlap * 0.45);
                    egg.vx += nx * push;
                    egg.vy += ny * push;
                }
            }

            // Soft-body: oul revine lent la poziția lui proprie (home), nu la centrul jeleului
            egg.vx += (egg.homeX - egg.offsetX) * 0.035; // FORȚĂ DE REVENIRE spre poziția "home" a oului
            egg.vy += (egg.homeY - egg.offsetY) * 0.035; // Mai mare = revine mai repede, mai rigid
            egg.offsetX += egg.vx * dt * 60;
            egg.offsetY += egg.vy * dt * 60;
            egg.vx *= 0.84; // DAMPING: mai mic = se oprește mai repede (mai puțin bounce)
            egg.vy *= 0.84; // Mai mare = persistă mișcarea mai mult

            // Nu lăsăm ouăle să iasă din jeleu
            const maxDist = this.radius * 0.72;
            const ox = egg.offsetX, oy = egg.offsetY;
            const odSq = ox * ox + oy * oy;
            if (odSq > maxDist * maxDist) {
                const od = Math.sqrt(odSq) || 0.001;
                const scale = maxDist / od;
                egg.offsetX *= scale;
                egg.offsetY *= scale;
                const rx = egg.offsetX / maxDist;
                const ry = egg.offsetY / maxDist;
                const outward = egg.vx * rx + egg.vy * ry;
                if (outward > 0) {
                    egg.vx -= rx * outward;
                    egg.vy -= ry * outward;
                }
            }
        }

        // Separare între ouă (anti suprapunere ou-peste-ou)
        const eggSeparationDist = 20; // Distanța minimă între centrele ouălor (anti suprapunere)
        const eggSeparationDistSq = eggSeparationDist * eggSeparationDist;
        for (let i = 0; i < this.eggs.length; i++) {
            const a = this.eggs[i];
            for (let j = i + 1; j < this.eggs.length; j++) {
                const b = this.eggs[j];
                const dx = b.offsetX - a.offsetX;
                const dy = b.offsetY - a.offsetY;
                const dSq = dx * dx + dy * dy;
                if (dSq <= 0.0001 || dSq >= eggSeparationDistSq) continue;
                const d = Math.sqrt(dSq);
                const overlap = (eggSeparationDist - d) * 0.5;
                const nx = dx / d;
                const ny = dy / d;
                a.offsetX -= nx * overlap;
                a.offsetY -= ny * overlap;
                b.offsetX += nx * overlap;
                b.offsetY += ny * overlap;
            }
        }

        const nPts = this.numPoints;
        if (!this._skinFx || this._skinFx.length !== nPts) {
            this._skinFx = new Float64Array(nPts);
            this._skinFy = new Float64Array(nPts);
            this._botPx = new Float64Array(nPts);
            this._botPy = new Float64Array(nPts);
        }
        const skinFx = this._skinFx;
        const skinFy = this._skinFy;
        const botPx = this._botPx;
        const botPy = this._botPy;
        const body = typeof player.radius === "number" ? player.radius : 0;
        const skinMargin = 22;

        for (let i = 0; i < nPts; i++) {
            const p = this.points[i];
            let pX = 0, pY = 0;
            skinFx[i] = 0;
            skinFy[i] = 0;

            // Contact de la suprafața celulei. Centrul unei celule mici nu mai intră singur în zonă.
            if (!skipPlayer && body > 0) {
                const dx = (this.x + p.x) - player.x;
                const dy = (this.y + p.y) - player.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                const reach = body + skinMargin;
                if (d > 0.001 && d < reach) {
                    const skin = Math.min(1, (reach - d) / skinMargin);
                    const falloff = skin * skin * (3 - 2 * skin);
                    const pressed = Math.min(1, Math.max(0, body - d) / body);
                    const f = falloff * (0.85 + pressed * 0.7);
                    const inv = f / d;
                    skinFx[i] = dx * inv;
                    skinFy[i] = dy * inv;
                }
            }

            // Deformare de la Boți — neschimbată
            for (let j = 0; j < nearbyBots.length; j++) {
                let b = nearbyBots[j];
                let bdx = (this.x + p.x) - b.x;
                let bdy = (this.y + p.y) - b.y;
                let bd = Math.sqrt(bdx * bdx + bdy * bdy);
                let botRepulseRange = b.radius + 20;

                if (bd > 0.001 && bd < botRepulseRange) {
                    const f = (botRepulseRange - bd) * 0.8;
                    pX += (bdx / bd) * f;
                    pY += (bdy / bd) * f;
                }
            }

            botPx[i] = pX;
            botPy[i] = pY;
        }

        for (let i = 0; i < nPts; i++) {
            const p = this.points[i];
            const prev = (i + nPts - 1) % nPts;
            const next = (i + 1) % nPts;
            // Arcul ia dâra, nu un singur vârf care se schimbă de-a lungul conturului.
            const fx = skinFx[i] * 0.5 + (skinFx[prev] + skinFx[next]) * 0.25;
            const fy = skinFy[i] * 0.5 + (skinFy[prev] + skinFy[next]) * 0.25;

            const tx = p.origX + Math.cos(t + i) * 4;
            const ty = p.origY + Math.sin(t + i) * 4;

            p.vx += (tx - p.x) * 0.1 + fx;
            p.vy += (ty - p.y) * 0.1 + fy;

            p.x += (p.vx + botPx[i]) * dt * 60;
            p.y += (p.vy + botPy[i]) * dt * 60;

            p.vx *= 0.8;
            p.vy *= 0.8;
        }
    }

    draw(ctx) {
        if (!this.active) return;

        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.beginPath();
        const pts = this.points;
        const nPts = this.numPoints;
        const seamA = pts[nPts - 1];
        const seamB = pts[0];
        ctx.moveTo((seamA.x + seamB.x) * 0.5, (seamA.y + seamB.y) * 0.5);

        for (let i = 0; i < nPts; i++) {
            const p1 = pts[i];
            const p2 = pts[(i + 1) % nPts];
            ctx.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5);
        }

        ctx.closePath();

        const g = ctx.createRadialGradient(0,0,0,0,0,this.radius);
        g.addColorStop(0,"rgba(210, 235, 255, 0.11)");
        g.addColorStop(0.8,this.innerColor);
        g.addColorStop(1,this.color);

        ctx.fillStyle = g;
        ctx.fill();

        ctx.strokeStyle = this.color;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 6;
        ctx.shadowColor = this.color;
        ctx.stroke();
        
        // --- NOU: Randare Ouă în interiorul jeleului ---
        let timePulse = Date.now() * 0.002;
        this.eggs.forEach((egg, index) => {
            ctx.beginPath();
            // Ouăle pulsează ușor în dimensiune (efect biologic)
            let eggRadius = 10 + Math.sin(timePulse + index) * 6.5; 
            ctx.arc(egg.offsetX, egg.offsetY, eggRadius, 0, Math.PI * 2);
            ctx.fillStyle = egg.color;
            ctx.shadowBlur = 12;
            ctx.shadowColor = egg.color;
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        ctx.restore();
    }
}

// =============================================================================
// ⚙️ LOGICA DE SPAWN AVANSATĂ: FĂRĂ SUPRAPUNERI ȘI ZONE INTERZISE (GRID OPTIMIZED)
// =============================================================================
function initJellyBubbles() {
    const { poolJellyBubbles, player } = getSpawnContextFn();
    const colors = JELLY_SHELL_COLORS;
    const minR = 150, maxR = 230;
    const bhForbiddenZoneSq = 1100*1100;
    const minDistSq = 500*500;
    const playerSafeSq = 600*600;

    const worldSize = GAME_SETTINGS.WORLD_SIZE;
    const center = worldSize/2;

    // ===============================
    // 🔲 Spatial Grid
    // ===============================
    const gridSize = 600;
    const grid = {};
    const getKey = (x,y)=>((x/gridSize|0)+","+(y/gridSize|0));

    const getNearby = (x,y)=>{
        let res = [];
        let gx = x/gridSize|0, gy = y/gridSize|0;
        for (let ox=-1;ox<=1;ox++)
            for (let oy=-1;oy<=1;oy++) {
                let cell = grid[(gx+ox)+","+(gy+oy)];
                if (cell) res.push(...cell);
            }
        return res;
    };

    poolJellyBubbles.forEach(jb => { jb.active=false; jb.x=-9999; });

    for (let jb of poolJellyBubbles) {

        let safe=false, attempts=0, rx, ry, rr;

        while (!safe && attempts<100) {
            attempts++;

            rr = minR + Math.random()*(maxR-minR);
            rx = 300 + Math.random()*(worldSize-600);
            ry = 300 + Math.random()*(worldSize-600);

            let dxC=rx-center, dyC=ry-center;
            if (dxC*dxC + dyC*dyC < bhForbiddenZoneSq) continue;

            let dxP=rx-player.x, dyP=ry-player.y;
            if (dxP*dxP + dyP*dyP < playerSafeSq) continue;

            let tooClose = false;
            for (let other of getNearby(rx,ry)) {
                let dx=rx-other.x, dy=ry-other.y;
                if (dx*dx + dy*dy < minDistSq) { tooClose=true; break; }
            }

            if (!tooClose) safe=true;
        }

        if (safe) {
            jb.spawn(rx, ry, rr, colors[Math.random()*colors.length|0]);

            // ➕ adaug în grid
            const key = getKey(rx,ry);
            (grid[key] ||= []).push(jb);
        }
    }
}
JellyBubble._nextId = 0;
    global.JellyBubble = JellyBubble;
    global.initJellyBubbles = initJellyBubbles;
    global.configureJellyBubble = configureJellyBubble;
})(typeof window !== "undefined" ? window : globalThis);
