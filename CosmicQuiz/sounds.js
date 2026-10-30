/**
 * Cosmic Quiz — Procedural audio engine
 *
 * Single IIFE module using Web Audio API: master bus, reverb, SFX recipes,
 * Blitz ticks, and window.CosmicAudio for script.js.
 */
(function () {
    'use strict';

    // =========================================================================
    // CONSTANTS & CONFIGURATION
    // localStorage key, master and SFX gain levels.
    // =========================================================================
    const STORAGE_KEY = 'cosmic-quiz-sound';
    const MASTER = 0.82;
    const SFX = 0.9;

    // =========================================================================
    // MODULE STATE
    // AudioContext graph nodes, mute flag, and unlock gate.
    // =========================================================================
    let ctx = null;
    let master = null;
    let sfxBus = null;
    let reverb = null;
    let enabled = true;
    let unlocked = false;

    // =========================================================================
    // PERSISTENCE
    // Read/write user sound preference from localStorage.
    // =========================================================================
    function readEnabled() {
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            if (v === '0') return false;
            if (v === '1') return true;
        } catch (_) { /* ignore */ }
        return true;
    }

    function saveEnabled() {
        try {
            localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
        } catch (_) { /* ignore */ }
    }

    // =========================================================================
    // AUDIO CONTEXT & SIGNAL GRAPH
    // Lazy AudioContext init: compressor, reverb send, and the SFX bus.
    // =========================================================================
    function now() {
        return ctx.currentTime;
    }

    function makeImpulse(seconds, decay) {
        const rate = ctx.sampleRate;
        const len = Math.floor(rate * seconds);
        const buf = ctx.createBuffer(2, len, rate);
        for (let c = 0; c < 2; c++) {
            const ch = buf.getChannelData(c);
            for (let i = 0; i < len; i++) {
                ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
            }
        }
        return buf;
    }

    function ensureCtx() {
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;

        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = MASTER;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 12;
        comp.ratio.value = 3.2;
        comp.attack.value = 0.004;
        comp.release.value = 0.18;

        reverb = ctx.createConvolver();
        reverb.buffer = makeImpulse(2.4, 2.8);
        const revSend = ctx.createGain();
        revSend.gain.value = 0.34;

        sfxBus = ctx.createGain();
        sfxBus.gain.value = SFX;

        sfxBus.connect(revSend);
        revSend.connect(reverb);
        reverb.connect(master);
        sfxBus.connect(master);
        master.connect(comp);
        comp.connect(ctx.destination);

        enabled = readEnabled();
        return ctx;
    }

    async function unlock() {
        const c = ensureCtx();
        if (!c || unlocked) return;
        if (c.state === 'suspended') await c.resume();
        unlocked = true;
    }

    // =========================================================================
    // SYNTH PRIMITIVES
    // Low-level tone() oscillator envelope and noiseBurst() filtered noise.
    // =========================================================================
    function tone(freq, type, t0, dur, peak, opts = {}) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const f = opts.filterHz ? ctx.createBiquadFilter() : null;

        o.type = type;
        o.frequency.setValueAtTime(freq, t0);
        if (opts.glideTo) {
            o.frequency.exponentialRampToValueAtTime(Math.max(opts.glideTo, 1), t0 + dur);
        }
        if (opts.detune) o.detune.value = opts.detune;

        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + (opts.attack || 0.012));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        o.connect(g);
        if (f) {
            f.type = opts.filterType || 'lowpass';
            f.frequency.setValueAtTime(opts.filterHz, t0);
            if (opts.filterTo) {
                f.frequency.exponentialRampToValueAtTime(opts.filterTo, t0 + dur);
            }
            g.connect(f);
            f.connect(sfxBus);
        } else {
            g.connect(sfxBus);
        }
        o.start(t0);
        o.stop(t0 + dur + 0.05);
        return { o, g };
    }

    function noiseBurst(t0, dur, peak, opts = {}) {
        const len = Math.ceil(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = opts.type || 'bandpass';
        f.frequency.value = opts.freq || 1200;
        f.Q.value = opts.q || 0.9;

        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        src.connect(f);
        f.connect(g);
        g.connect(sfxBus);
        src.start(t0);
        src.stop(t0 + dur);
    }

    // =========================================================================
    // SFX RECIPES
    // Procedural one-shots: UI, gameplay, power-ups, victory, game over.
    // =========================================================================
    function playUiClick() {
        const t = now();
        tone(2400, 'sine', t, 0.06, 0.07, { attack: 0.002 });
        tone(520, 'triangle', t, 0.05, 0.04, { attack: 0.001 });
    }

    function playCorrect() {
        const t = now();
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => {
            tone(f, 'sine', t + i * 0.055, 0.35 - i * 0.04, 0.11 - i * 0.015, {
                attack: 0.006,
                detune: i * 3,
            });
            tone(f * 2, 'triangle', t + i * 0.055, 0.2, 0.025, { attack: 0.01 });
        });
        noiseBurst(t + 0.12, 0.18, 0.035, { freq: 4000, q: 2, type: 'highpass' });
    }

    function playWrong() {
        const t = now();
        // Cosmic misfire — bright warp collapse, no low saw/square rumble
        tone(1318.5, 'sine', t, 0.14, 0.085, { attack: 0.002, glideTo: 523.25, detune: 5 });
        tone(987.77, 'sine', t + 0.025, 0.12, 0.075, { attack: 0.002, glideTo: 392, detune: -7 });
        tone(739.99, 'triangle', t + 0.05, 0.1, 0.04, { attack: 0.004, glideTo: 329.63 });
        tone(1174.66, 'sine', t, 0.16, 0.032, { attack: 0.006, glideTo: 1046.5, detune: 16 });
        tone(1108.73, 'sine', t, 0.16, 0.032, { attack: 0.006, glideTo: 987.77, detune: -16 });
        noiseBurst(t, 0.09, 0.042, { freq: 7200, q: 2.2, type: 'highpass' });
        noiseBurst(t + 0.04, 0.07, 0.028, { freq: 10500, q: 2.5, type: 'highpass' });
    }

    function playLifeLost() {
        const t = now();
        tone(392, 'sine', t, 0.15, 0.1, { glideTo: 196, attack: 0.008 });
        tone(196, 'triangle', t + 0.08, 0.45, 0.12, {
            glideTo: 55,
            filterHz: 900,
            filterTo: 120,
            attack: 0.02,
        });
        noiseBurst(t + 0.05, 0.35, 0.05, { freq: 400, q: 0.6, type: 'lowpass' });
    }

    function playQuestion() {
        const t = now();
        tone(880, 'sine', t, 0.12, 0.035, { attack: 0.004 });
        tone(1320, 'sine', t + 0.03, 0.08, 0.018, { attack: 0.006 });
    }

    function playStart() {
        const t = now();
        noiseBurst(t, 0.55, 0.09, { freq: 200, q: 0.4, type: 'lowpass' });
        tone(110, 'sine', t, 0.5, 0.14, { glideTo: 440, attack: 0.02 });
        [220, 277.18, 329.63, 440].forEach((f, i) => {
            tone(f, 'triangle', t + 0.18 + i * 0.07, 0.5, 0.08, { attack: 0.015, detune: i * 5 });
        });
        tone(1760, 'sine', t + 0.45, 0.25, 0.04, { attack: 0.01 });
    }

    function playGameOver() {
        const t = now();
        [220, 261.63, 329.63].forEach((f, i) => {
            tone(f, 'sine', t, 2.4, 0.065 - i * 0.012, {
                attack: 0.2,
                detune: i * -5,
                filterHz: 2400,
                filterTo: 320,
            });
        });
        tone(987.77, 'sine', t + 0.1, 1.6, 0.035, { glideTo: 130, attack: 0.08 });
        tone(493.88, 'triangle', t + 0.35, 2, 0.028, { glideTo: 65, attack: 0.25 });
        noiseBurst(t + 1.1, 1.4, 0.02, { freq: 3200, q: 0.45, type: 'highpass' });
    }

    /** Cosmic ability activate — stardust charge + variant tint per power-up. */
    function playPowerup(kind) {
        const t = now();

        function stardustCharge() {
            tone(987.77, 'sine', t, 0.1, 0.045, { attack: 0.003, detune: 8 });
            tone(1318.5, 'sine', t + 0.04, 0.12, 0.05, { attack: 0.004, detune: -6 });
            tone(1760, 'triangle', t + 0.09, 0.16, 0.038, { attack: 0.006 });
            noiseBurst(t + 0.02, 0.14, 0.032, { freq: 8200, q: 2.4, type: 'highpass' });
        }

        switch (kind) {
            case 'quantum50': {
                stardustCharge();
                tone(1567.98, 'sine', t + 0.12, 0.11, 0.06, { attack: 0.002, glideTo: 783.99, detune: 12 });
                tone(2093, 'sine', t + 0.14, 0.09, 0.04, { attack: 0.002, glideTo: 1046.5, detune: -10 });
                noiseBurst(t + 0.1, 0.12, 0.028, { freq: 5600, q: 1.8, type: 'bandpass' });
                break;
            }
            case 'lifePod': {
                stardustCharge();
                tone(196, 'sine', t + 0.14, 0.22, 0.09, { attack: 0.02, glideTo: 261.63 });
                tone(261.63, 'triangle', t + 0.32, 0.28, 0.07, { attack: 0.025, glideTo: 329.63 });
                tone(523.25, 'sine', t + 0.2, 0.35, 0.035, { attack: 0.04, filterHz: 1200, filterTo: 600 });
                break;
            }
            case 'timeWarp': {
                noiseBurst(t, 0.2, 0.05, { freq: 400, q: 0.5, type: 'lowpass' });
                tone(880, 'sine', t, 0.18, 0.055, { attack: 0.004, glideTo: 220, detune: 5 });
                tone(440, 'triangle', t + 0.1, 0.25, 0.05, { attack: 0.008, glideTo: 1320, detune: -8 });
                stardustCharge();
                tone(1174.66, 'sine', t + 0.22, 0.2, 0.06, { attack: 0.01, glideTo: 1760 });
                noiseBurst(t + 0.15, 0.18, 0.04, { freq: 9500, q: 2, type: 'highpass' });
                break;
            }
            case 'shield': {
                stardustCharge();
                tone(440, 'sine', t + 0.1, 0.45, 0.08, { attack: 0.03, detune: 4 });
                tone(554.37, 'triangle', t + 0.12, 0.5, 0.055, { attack: 0.035, detune: -3 });
                tone(880, 'sine', t + 0.14, 0.4, 0.03, { attack: 0.04, filterHz: 2000, filterTo: 800 });
                break;
            }
            default: {
                const notes = [659.25, 830.61, 987.77, 1318.5];
                notes.forEach((f, i) => {
                    tone(f, 'sine', t + i * 0.055, 0.22, 0.065 - i * 0.01, {
                        attack: 0.005,
                        detune: i * 4,
                    });
                    tone(f * 1.5, 'triangle', t + i * 0.055, 0.14, 0.022, { attack: 0.008 });
                });
                noiseBurst(t + 0.08, 0.2, 0.038, { freq: 7200, q: 1.6, type: 'highpass' });
                tone(1760, 'sine', t + 0.28, 0.35, 0.045, { attack: 0.02, glideTo: 2093 });
                break;
            }
        }
    }

    function playVictory() {
        const t = now();
        const scale = [261.63, 329.63, 392, 523.25, 659.25, 783.99];
        scale.forEach((f, i) => {
            tone(f, 'sine', t + i * 0.1, 0.55, 0.1, { attack: 0.008, detune: i * 2 });
            tone(f * 0.5, 'triangle', t + i * 0.1, 0.7, 0.06, { attack: 0.02 });
        });
        tone(1046.5, 'sine', t + 0.75, 1.2, 0.12, { attack: 0.02 });
        tone(1318.5, 'triangle', t + 0.85, 0.9, 0.07, { attack: 0.03 });
        noiseBurst(t + 0.5, 0.4, 0.04, { freq: 6000, q: 1.5, type: 'highpass' });
    }

    /** Blitz countdown tick — audible from the start, ramps up hard in the last seconds. */
    function emitBlitzTick(remainingSeconds, totalSeconds) {
        const total = Math.max(totalSeconds, 1);
        const remaining = Math.max(0, remainingSeconds);
        const urgency = 1 - remaining / total;
        const late = remaining <= 5;
        const peak = 0.07 + urgency * 0.12;
        const clickFreq = 1700 + urgency * 1100;
        const t = now();

        noiseBurst(t, 0.05, peak, { freq: clickFreq, q: 2, type: 'bandpass' });
        tone(clickFreq, 'sine', t, 0.05, peak * 0.65, { attack: 0.001 });
        tone(clickFreq * 0.5, 'triangle', t, 0.055, peak * 0.4, { attack: 0.002 });
        if (late) {
            tone(clickFreq * 1.2, 'sine', t + 0.05, 0.06, peak * 0.5, { attack: 0.002 });
            noiseBurst(t + 0.02, 0.07, peak * 0.55, { freq: clickFreq * 1.5, q: 1.5, type: 'highpass' });
        }
    }

    // =========================================================================
    // PUBLIC API
    // SFX dispatch map, play/unlock/toggle, Blitz tick, window.CosmicAudio.
    // =========================================================================
    const SFX_MAP = {
        click: playUiClick,
        correct: playCorrect,
        wrong: playWrong,
        lifeLost: playLifeLost,
        question: playQuestion,
        start: playStart,
        gameOver: playGameOver,
        victory: playVictory,
        powerup: playPowerup,
    };

    /** Route SFX id (and optional detail, e.g. power-up kind) to a recipe. */
    async function play(id, detail) {
        if (!enabled) return;
        try {
            await unlock();
            if (!ctx) return;
            const fn = SFX_MAP[id];
            if (fn) fn(detail);
        } catch (_) { /* autoplay blocked or device unavailable */ }
    }

    function setEnabled(on) {
        enabled = !!on;
        saveEnabled();
    }

    function toggle() {
        setEnabled(!enabled);
        return enabled;
    }

    function isEnabled() {
        return enabled;
    }

    enabled = readEnabled();

    /** Blitz countdown tick — exposed separately for script.js timer loop. */
    async function playBlitzTick(remainingSeconds, totalSeconds) {
        if (!enabled) return;
        try {
            await unlock();
            if (!ctx) return;
            emitBlitzTick(remainingSeconds, totalSeconds);
        } catch (_) { /* autoplay blocked or device unavailable */ }
    }

    window.CosmicAudio = {
        play,
        playBlitzTick,
        unlock,
        toggle,
        setEnabled,
        isEnabled,
    };
})();
