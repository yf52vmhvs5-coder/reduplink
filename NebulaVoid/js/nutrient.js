/**
 * NEBULA VOID — Nutrient entities (food particles, jelly eggs).
 * Load after config-loader.js and js/pool.js.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/nutrient.js");
    }

    const GAME_SETTINGS = boot.gameSettings;

    const NUTRIENT_HSL_CACHE = (function () {
        const arr = new Array(1000);
        for (let i = 0; i < 1000; i++) {
            const h = Math.round((i * 137.5) % 360);
            arr[i] = { stroke: `hsl(${h},80%,60%)`, shadow: `hsl(${h},100%,50%)` };
        }
        return arr;
    })();

    function getNutrientHslCache() {
        return NUTRIENT_HSL_CACHE;
    }

    class Nutrient {
        constructor() {
            this.active = false;
            this.x = 0;
            this.y = 0;
            this.color = "#fff";
            this.radius = 0;
            this.vx = 0;
            this.vy = 0;
            this.friction = 0.96;
            this.life = 0;
            this.jellyId = 0;
            this.suppressPickupFloat = false;
        }

        spawn(x, y, color) {
            this.active = true;
            this.x = x;
            this.y = y;
            this.color = color;
            this.radius = Math.random() * 2 + 1.5;
            this.vx = (Math.random() - 0.5) * 1920;
            this.vy = (Math.random() - 0.5) * 1920;
            this.life = 3.75 + Math.random() * 2.5;
            this.jellyId = 0;
            this.suppressPickupFloat = false;
            this.botEatDelay = 0;
        }

        update(dt = 0.016) {
            if (!this.active) return;

            if (this.botEatDelay > 0) {
                this.botEatDelay -= dt;
                if (this.botEatDelay < 0) this.botEatDelay = 0;
            }

            this.life -= dt;
            if (this.life <= 0) {
                this.active = false;
                return;
            }

            const world = GAME_SETTINGS.WORLD_SIZE;
            if (Math.abs(this.vx) < 0.1 && Math.abs(this.vy) < 0.1) {
                this.vx = 0;
                this.vy = 0;
                if (this.x < 0) this.x = 0;
                else if (this.x > world) this.x = world;
                if (this.y < 0) this.y = 0;
                else if (this.y > world) this.y = world;
                return;
            }
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            const f = Math.pow(this.friction, dt * 160);
            this.vx *= f;
            this.vy *= f;
            if (this.x < 0) {
                this.x = 0;
                if (this.vx < 0) this.vx = -this.vx;
            } else if (this.x > world) {
                this.x = world;
                if (this.vx > 0) this.vx = -this.vx;
            }
            if (this.y < 0) {
                this.y = 0;
                if (this.vy < 0) this.vy = -this.vy;
            } else if (this.y > world) {
                this.y = world;
                if (this.vy > 0) this.vy = -this.vy;
            }
        }

        draw(ctx, pX, pY, scrW, scrH) {
            if (!this.active) return;
            const relX = this.x - (pX - scrW / 2);
            const relY = this.y - (pY - scrH / 2);
            if (relX < -20 || relX > scrW + 20 || relY < -20 || relY > scrH + 20) return;

            ctx.globalAlpha = Math.min(1, this.life / 0.625);

            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, 6.28);
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.globalAlpha = 1.0;
        }
    }

    global.Nutrient = Nutrient;
    global.getNutrientHslCache = getNutrientHslCache;
})(typeof window !== "undefined" ? window : globalThis);
