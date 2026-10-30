/**
 * NEBULA VOID — presentation FX: screen shake, static cosmic dust, pickup float text.
 * Load after config-loader.js (cosmic dust reads __GAME_BOOT).
 */
(function (global) {
    "use strict";

    // -------------------------------------------------------------------------
    // Camera screen shake
    // -------------------------------------------------------------------------

    const shakeState = {
        x: 0,
        y: 0,
        time: 0,
        duration: 0,
        strength: 0,
        cooldown: 0,
    };

    function addScreenShake(strength, duration) {
        const s = Math.max(0, strength || 0);
        const d = Math.max(0, duration || 0);
        if (s <= 0 || d <= 0) return;
        shakeState.time = Math.max(shakeState.time, d);
        shakeState.duration = Math.max(shakeState.duration, d);
        shakeState.strength = Math.max(shakeState.strength, s);
    }

    function pulseDamageShake(multiplier = 1) {
        if (shakeState.cooldown > 0) return;
        const m = Math.max(0.5, Number.isFinite(multiplier) ? multiplier : 1);
        addScreenShake(0.9 * m, 0.06);
        shakeState.cooldown = 0.09;
    }

    function pulseSporeAbsorbShake() {
        addScreenShake(0.32, 0.058);
    }

    function pulsePhaseCageResonanceShake(stress) {
        const s = Number.isFinite(stress) ? Math.max(0, Math.min(1, stress)) : 0.45;
        const strength = 0.22 + s * 0.38;
        const duration = 0.045 + s * 0.035;
        addScreenShake(strength, duration);
    }

    function updateScreenShake(dt) {
        shakeState.cooldown = Math.max(0, shakeState.cooldown - dt);
        if (shakeState.time <= 0) {
            shakeState.time = 0;
            shakeState.duration = 0;
            shakeState.strength = 0;
            shakeState.x = 0;
            shakeState.y = 0;
            return;
        }

        shakeState.time -= dt;
        const fade = shakeState.duration > 0 ? Math.max(0, shakeState.time / shakeState.duration) : 0;
        const amp = shakeState.strength * fade;
        shakeState.x = (Math.random() * 2 - 1) * amp;
        shakeState.y = (Math.random() * 2 - 1) * amp;
    }

    function getScreenShakeOffset() {
        return { x: shakeState.x, y: shakeState.y };
    }

    function resetScreenShake() {
        shakeState.x = 0;
        shakeState.y = 0;
        shakeState.time = 0;
        shakeState.duration = 0;
        shakeState.strength = 0;
        shakeState.cooldown = 0;
    }

    global.addScreenShake = addScreenShake;
    global.pulseDamageShake = pulseDamageShake;
    global.pulseSporeAbsorbShake = pulseSporeAbsorbShake;
    global.pulsePhaseCageResonanceShake = pulsePhaseCageResonanceShake;
    global.updateScreenShake = updateScreenShake;
    global.getScreenShakeOffset = getScreenShakeOffset;
    global.resetScreenShake = resetScreenShake;

    // -------------------------------------------------------------------------
    // Static world cosmic dust (batched draw)
    // -------------------------------------------------------------------------

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/fx-presentation.js");
    }

    const worldSize = boot.gameSettings.WORLD_SIZE;
    const count = boot.world.cosmicDustCount;

    const cosmicDust = Array.from({ length: count }, () => ({
        x: Math.random() * worldSize,
        y: Math.random() * worldSize,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.2 + 0.8,
        color: Math.random() > 0.5 ? "#444" : "#222",
    }));

    const byColor444 = cosmicDust.filter((d) => d.color === "#444");
    const byColor222 = cosmicDust.filter((d) => d.color === "#222");

    function drawCosmicDust(ctx, cameraX, cameraY, screenW, screenH, zoom) {
        ctx.save();
        const viewDistDust = (screenW > screenH ? screenW : screenH) / zoom;

        ctx.fillStyle = "#444";
        for (let i = 0; i < byColor444.length; i++) {
            const dust = byColor444[i];
            if (
                Math.abs(dust.x - cameraX) < viewDistDust &&
                Math.abs(dust.y - cameraY) < viewDistDust
            ) {
                ctx.globalAlpha = dust.opacity;
                ctx.fillRect(dust.x, dust.y, dust.size, dust.size);
            }
        }
        ctx.fillStyle = "#222";
        for (let i = 0; i < byColor222.length; i++) {
            const dust = byColor222[i];
            if (
                Math.abs(dust.x - cameraX) < viewDistDust &&
                Math.abs(dust.y - cameraY) < viewDistDust
            ) {
                ctx.globalAlpha = dust.opacity;
                ctx.fillRect(dust.x, dust.y, dust.size, dust.size);
            }
        }
        ctx.restore();
    }

    global.drawCosmicDust = drawCosmicDust;

    // -------------------------------------------------------------------------
    // Floating pickup score text
    // -------------------------------------------------------------------------

    const PICKUP_POOL_SIZE = 22;
    const PICKUP_LIFE_SEC = 0.85;
    const PICKUP_DRIFT_PX_PER_SEC = 32;
    const PICKUP_FONT_SIZE_PX = 10;
    const PICKUP_FONT_FAMILY = '"Courier New", Courier, monospace';
    const PICKUP_LETTER_SPACING = "1px";

    const PICKUP_DEFAULT_COLORS = {
        particle: { color: "#8ecfff", glow: "rgba(142, 207, 255, 0.82)" },
        nutrient: { color: "#5de87a", glow: "rgba(93, 232, 122, 0.78)" },
        bot: { color: "#ffc94a", glow: "rgba(255, 201, 74, 0.85)" },
    };

    let pickupColors = { ...PICKUP_DEFAULT_COLORS };
    const pickupPool = [];

    for (let i = 0; i < PICKUP_POOL_SIZE; i++) {
        pickupPool.push({
            active: false,
            wx: 0,
            wy: 0,
            life: 0,
            maxLife: PICKUP_LIFE_SEC,
            text: "",
            fill: "#fff",
            glow: "rgba(255,255,255,0.8)",
        });
    }

    function formatPickupText(amount) {
        const n = Math.round(Number(amount) || 0);
        if (n >= 0) return `+${n}`;
        return String(n);
    }

    function pickKindColors(kind) {
        const row = pickupColors[kind] || pickupColors.particle;
        return {
            fill: row.color || "#ffffff",
            glow: row.glow || "rgba(255,255,255,0.7)",
        };
    }

    function configurePickupFloat(opts) {
        if (!opts || typeof opts !== "object") return;
        if (opts.colors && typeof opts.colors === "object") {
            Object.keys(PICKUP_DEFAULT_COLORS).forEach((key) => {
                const src = opts.colors[key];
                if (!src || typeof src !== "object") return;
                pickupColors[key] = {
                    color: typeof src.color === "string" ? src.color : PICKUP_DEFAULT_COLORS[key].color,
                    glow: typeof src.glow === "string" ? src.glow : PICKUP_DEFAULT_COLORS[key].glow,
                };
            });
        }
    }

    function spawnPickupFloat(worldX, worldY, amount, kind) {
        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt === 0) return;
        const text = formatPickupText(amt);
        if (kind === "bot") {
            for (let i = 0; i < pickupPool.length; i++) {
                const f = pickupPool[i];
                if (!f.active || f.text !== text) continue;
                const dx = f.wx - worldX;
                const dy = f.wy - worldY;
                if (dx * dx + dy * dy < 96 * 96) return;
            }
        }
        let slot = null;
        for (let i = 0; i < pickupPool.length; i++) {
            if (!pickupPool[i].active) {
                slot = pickupPool[i];
                break;
            }
        }
        if (!slot) {
            let oldest = null;
            let oldestLife = Infinity;
            for (let i = 0; i < pickupPool.length; i++) {
                const f = pickupPool[i];
                if (f.active && f.life < oldestLife) {
                    oldestLife = f.life;
                    oldest = f;
                }
            }
            slot = oldest;
            if (!slot) return;
        }
        const palette = pickKindColors(kind);
        slot.active = true;
        slot.wx = worldX;
        slot.wy = worldY;
        slot.maxLife = PICKUP_LIFE_SEC;
        slot.life = PICKUP_LIFE_SEC;
        slot.text = text;
        slot.fill = palette.fill;
        slot.glow = palette.glow;
    }

    function updatePickupFloats(dt) {
        const step = Math.max(0, Number(dt) || 0);
        for (let i = 0; i < pickupPool.length; i++) {
            const f = pickupPool[i];
            if (!f.active) continue;
            f.life -= step;
            f.wy -= PICKUP_DRIFT_PX_PER_SEC * step;
            if (f.life <= 0) f.active = false;
        }
    }

    function clearPickupFloats() {
        for (let i = 0; i < pickupPool.length; i++) pickupPool[i].active = false;
    }

    function drawPickupFloats(ctx, view) {
        if (!ctx || !view) return;
        const {
            cameraX,
            cameraY,
            zoom,
            centerX,
            centerY,
            shakeX,
            shakeY,
            screenW,
            screenH,
        } = view;
        const z = Math.max(0.05, zoom || 1);
        const margin = 24;

        ctx.save();
        ctx.font = `${PICKUP_FONT_SIZE_PX}px ${PICKUP_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if ("letterSpacing" in ctx) ctx.letterSpacing = PICKUP_LETTER_SPACING;

        for (let i = 0; i < pickupPool.length; i++) {
            const f = pickupPool[i];
            if (!f.active) continue;
            const t = Math.max(0, Math.min(1, f.life / f.maxLife));
            const sx = (f.wx - cameraX) * z + centerX + (shakeX || 0);
            const sy = (f.wy - cameraY) * z + centerY + (shakeY || 0);
            if (sx < -margin || sx > screenW + margin || sy < -margin || sy > screenH + margin) {
                continue;
            }
            ctx.globalAlpha = 0.92 * t;
            ctx.shadowBlur = 6;
            ctx.shadowColor = f.glow;
            ctx.fillStyle = f.fill;
            ctx.fillText(f.text, sx, sy);
        }
        ctx.restore();
    }

    global.configurePickupFloat = configurePickupFloat;
    global.spawnPickupFloat = spawnPickupFloat;
    global.updatePickupFloats = updatePickupFloats;
    global.drawPickupFloats = drawPickupFloats;
    global.clearPickupFloats = clearPickupFloats;
})(typeof window !== "undefined" ? window : globalThis);
