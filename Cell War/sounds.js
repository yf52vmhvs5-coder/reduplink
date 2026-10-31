/* ═══════════════════════════════════════════════════════════════════════════
 *
 *   CELL WARS · RETRO EDITION
 *   ─────────────────────
 *   Audio Subsystem  ·  Procedural 8-Bit SFX
 *
 *   Sinteză chiptune prin Web Audio API — zero asset-uri externe.
 *   Voce principală: undă triunghi + filtru low-pass (estetic NES/Game Boy).
 *   Volum redus, rate-limiting pe evenimente frecvente — plăcut, nu enervant.
 *
 *   @module  Sfx
 *   @version 1.1.0
 *
 * ═══════════════════════════════════════════════════════════════════════════ */


/* ───────────────────────────────────────────────────────────────────────────
 *  CONSTANTS — Scale & Timing
 * ─────────────────────────────────────────────────────────────────────────── */

/** Pentatonică majoră (Hz) — sunete armonioase, retro-friendly */
const CHIPTUNE = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00,
    C6: 1046.50, E6: 1318.51, G6: 1567.98
};

const SFX_LIMITS = {
    eatFoodMs: 72,
    ejectMs: 110
};


/* ───────────────────────────────────────────────────────────────────────────
 *  PUBLIC API — Sfx Manager
 * ─────────────────────────────────────────────────────────────────────────── */

const Sfx = {

    /* ── State ── */
    enabled: true,
    volume: 0.65,

    _ctx: null,
    _master: null,
    _warmth: null,
    _primed: false,
    _lastFood: 0,
    _lastEject: 0,


    /* ── Lifecycle ── */

    /** Pornește audio în gestul utilizatorului. Pe iPad click-ul singur nu ajunge. */
    unlock() {
        const ctx = this._ensureCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            const pending = ctx.resume();
            if (pending && typeof pending.catch === 'function') pending.catch(() => {});
        }
        if (this._primed) return;
        try {
            const buf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0);
            if (ctx.state === 'running') this._primed = true;
        } catch (_) { /* context not ready yet */ }
    },

    init() {
        const unlock = () => this.unlock();
        document.addEventListener('pointerdown', unlock, true);
        document.addEventListener('touchstart', unlock, { capture: true, passive: true });
        document.addEventListener('click', unlock, true);
        document.addEventListener('keydown', unlock, true);
    },

    setEnabled(on) {
        this.enabled = !!on;
    },

    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        if (this._master) this._master.gain.value = this.volume;
    },

    /** Redă un preset SFX după nume */
    play(name, opts = {}) {
        if (!this.enabled) return;
        const ctx = this._ensureCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') this.unlock();
        const fn = this._presets[name];
        if (!fn) return;
        try {
            fn.call(this, ctx, opts);
        } catch (err) {
            console.error('SFX error:', name, err);
        }
    },


    /* ── Audio Graph ── */

    _ensureCtx() {
        if (this._ctx) return this._ctx;

        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;

        this._ctx = new AC();

        this._warmth = this._ctx.createBiquadFilter();
        this._warmth.type = 'lowpass';
        this._warmth.frequency.value = 3400;
        this._warmth.Q.value = 0.6;

        this._master = this._ctx.createGain();
        this._master.gain.value = this.volume;

        this._warmth.connect(this._master);
        this._master.connect(this._ctx.destination);

        return this._ctx;
    },

    _out(node) {
        node.connect(this._warmth);
    },


    /* ── Synth Primitives ── */

    _gain(ctx, t, peak, attack = 0.006, release = 0.1) {
        const g = ctx.createGain();
        const p = Math.max(peak, 0.0001);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(p, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
        return g;
    },

    _osc(ctx, type, freq, t, dur) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        o.start(t);
        o.stop(t + dur);
        return o;
    },

    /** Blip scurt stil monedă 8-bit */
    _blip(ctx, t, freq, vol = 0.14, dur = 0.06) {
        const g = this._gain(ctx, t, vol, 0.002, dur * 0.85);
        const o = this._osc(ctx, 'triangle', freq, t, dur);
        o.frequency.exponentialRampToValueAtTime(freq * 1.08, t + dur * 0.35);
        o.connect(g);
        this._out(g);
    },

    /** Arpegiu discret — meniuri & confirmări */
    _arp(ctx, t, freqs, vol = 0.16, step = 0.048, wave = 'triangle') {
        freqs.forEach((f, i) => {
            const g = this._gain(ctx, t + i * step, vol, 0.004, 0.11);
            const o = this._osc(ctx, wave, f, t + i * step, step + 0.06);
            o.connect(g);
            this._out(g);
        });
    },

    /** Sweep melodic — tranziții & acțiuni */
    _sweep(ctx, t, f0, f1, vol = 0.18, dur = 0.18, wave = 'triangle') {
        const g = this._gain(ctx, t, vol, 0.008, dur);
        const o = this._osc(ctx, wave, f0, t, dur + 0.02);
        o.frequency.exponentialRampToValueAtTime(Math.max(f1, 40), t + dur * 0.9);
        o.connect(g);
        this._out(g);
    },


    /* ───────────────────────────────────────────────────────────────────────
     *  SFX PRESETS — UI · Gameplay · Feedback
     * ─────────────────────────────────────────────────────────────────────── */

    _presets: {

        /* · UI · */

        click(ctx) {
            Sfx._blip(ctx, ctx.currentTime, CHIPTUNE.E5, 0.12, 0.045);
        },

        menuOpen(ctx) {
            Sfx._arp(ctx, ctx.currentTime, [CHIPTUNE.C5, CHIPTUNE.E5, CHIPTUNE.G5], 0.13);
        },

        menuBack(ctx) {
            Sfx._arp(ctx, ctx.currentTime, [CHIPTUNE.G5, CHIPTUNE.E5, CHIPTUNE.C5], 0.12, 0.04);
        },

        save(ctx) {
            Sfx._arp(ctx, ctx.currentTime, [CHIPTUNE.C5, CHIPTUNE.E5, CHIPTUNE.G5, CHIPTUNE.C6], 0.14, 0.05);
        },

        introDone(ctx) {
            Sfx._sweep(ctx, ctx.currentTime, CHIPTUNE.C4, CHIPTUNE.C5, 0.16, 0.32);
        },

        start(ctx) {
            Sfx._arp(ctx, ctx.currentTime, [CHIPTUNE.C4, CHIPTUNE.E4, CHIPTUNE.G4, CHIPTUNE.C5, CHIPTUNE.E5], 0.15, 0.065);
        },

        /* · Gameplay · */

        eatFood(ctx, { mass = 2 } = {}) {
            const now = performance.now();
            if (now - Sfx._lastFood < SFX_LIMITS.eatFoodMs) return;
            Sfx._lastFood = now;

            const t = ctx.currentTime;
            const pool = [CHIPTUNE.C6, CHIPTUNE.E6, CHIPTUNE.G6];
            const freq = pool[Math.floor(Math.random() * pool.length)] + mass * 4;
            Sfx._blip(ctx, t, freq, 0.09, 0.05);
        },

        eatCell(ctx, { mass = 100 } = {}) {
            const t = ctx.currentTime;
            const base = mass > 200 ? CHIPTUNE.G4 : CHIPTUNE.E4;
            Sfx._arp(ctx, t, [base, CHIPTUNE.C5, CHIPTUNE.G5, CHIPTUNE.C6], 0.17, 0.055);
        },

        eatenBy(ctx) {
            Sfx._arp(ctx, ctx.currentTime, [CHIPTUNE.A4, CHIPTUNE.F4, CHIPTUNE.D4, CHIPTUNE.C4], 0.16, 0.09, 'triangle');
        },

        split(ctx) {
            Sfx._sweep(ctx, ctx.currentTime, CHIPTUNE.G4, CHIPTUNE.C6, 0.15, 0.14);
        },

        merge(ctx) {
            const t = ctx.currentTime;
            Sfx._blip(ctx, t, CHIPTUNE.C4, 0.11, 0.07);
            Sfx._blip(ctx, t + 0.05, CHIPTUNE.G4, 0.13, 0.09);
        },

        eject(ctx) {
            const now = performance.now();
            if (now - Sfx._lastEject < SFX_LIMITS.ejectMs) return;
            Sfx._lastEject = now;
            Sfx._sweep(ctx, ctx.currentTime, CHIPTUNE.E5, CHIPTUNE.C5, 0.1, 0.09);
        },

        mergeHold(ctx) {
            Sfx._blip(ctx, ctx.currentTime, CHIPTUNE.C4, 0.07, 0.08);
        },

        death(ctx) {
            Sfx._arp(ctx, ctx.currentTime, [CHIPTUNE.E4, CHIPTUNE.C4, CHIPTUNE.A4 - 110, CHIPTUNE.G4 - 98], 0.15, 0.12);
        },

        respawn(ctx) {
            Sfx._arp(ctx, ctx.currentTime, [CHIPTUNE.C4, CHIPTUNE.E4, CHIPTUNE.G4, CHIPTUNE.C5], 0.14, 0.07);
        },

        rankUp(ctx) {
            Sfx._blip(ctx, ctx.currentTime, CHIPTUNE.G5, 0.12, 0.06);
            Sfx._blip(ctx, ctx.currentTime + 0.06, CHIPTUNE.C6, 0.14, 0.08);
        },

        virus(ctx) {
            Sfx._sweep(ctx, ctx.currentTime, CHIPTUNE.E5, CHIPTUNE.G4, 0.14, 0.12);
        },

        powerup(ctx) {
            Sfx._arp(ctx, ctx.currentTime, [CHIPTUNE.C5, CHIPTUNE.E5, CHIPTUNE.G5, CHIPTUNE.C6], 0.15, 0.045);
        },

        combo(ctx, { level = 2 } = {}) {
            const base = CHIPTUNE.C5 + Math.min(level, 8) * 30;
            Sfx._blip(ctx, ctx.currentTime, base, 0.13, 0.07);
            Sfx._blip(ctx, ctx.currentTime + 0.05, base * 1.25, 0.15, 0.08);
        },

        shieldBreak(ctx) {
            Sfx._sweep(ctx, ctx.currentTime, CHIPTUNE.G5, CHIPTUNE.C4, 0.12, 0.14);
        },

        victory(ctx) {
            [CHIPTUNE.C4, CHIPTUNE.E4, CHIPTUNE.G4, CHIPTUNE.C5, CHIPTUNE.E5, CHIPTUNE.G5, CHIPTUNE.C6].forEach((f, i) => {
                Sfx._blip(ctx, ctx.currentTime + i * 0.08, f, 0.14, 0.12);
            });
        }
    }
};


/* ── Boot Audio Subsystem ── */
Sfx.init();
