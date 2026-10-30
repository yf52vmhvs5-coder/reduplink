/**
 * NEBULA VOID — Web Audio (ambient, black hole, SFX)
 * Loaded after config-loader; configure via configureAudio() from entities.js.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot || !boot.audio) {
        throw new Error("NEBULA VOID: load game config before js/audio.js");
    }

    const AMBIENT_BASE_GAIN = boot.audio.ambientBaseGain;
    const AMBIENT_ARENA_GAIN_MULT = (() => {
        const m = Number(boot.audio.ambientArenaGainMult);
        return Number.isFinite(m) && m > 0 && m <= 1 ? m : 0.5;
    })();
    const AMBIENT_UPDATE_INTERVAL = boot.audio.ambientUpdateInterval;

    let getGameState = function defaultGameState() {
        return {
            isDying: false,
            worldSize: 8000,
            startRadius: 20,
            maxPlayerRadius: 120,
        };
    };

    function configureAudio(deps) {
        if (!deps || typeof deps.getState !== "function") {
            throw new Error("configureAudio requires { getState: () => ({ ... }) }");
        }
        getGameState = deps.getState;
    }

    var soundEnabled = true;
    var audioCtx = null;
    var bhNodes = null;
    var bhAudible = false;
    var ambientNodes = null;
    var lastParticleSoundTime = 0;

    function initAudio() {
        if (!soundEnabled) return;
        if (!audioCtx) {
            audioCtx = new (global.AudioContext || global.webkitAudioContext)();
            // Un context nou pornește de la currentTime = 0; throttle-urile vechi l-ar muta.
            lastParticleSoundTime = 0;
            lastBloodRiftSiphonSoundTime = 0;
            lastWarpBarrierSoundTime = 0;
            lastPhaseCageBleedSoundTime = 0;
            releaseAllPhaseCageHuntDrones();
            setupBlackHoleAudio();
            setupAmbientAudio();
        }
        // Creat la mousemove (fără gest) pornește "suspended"; click-urile ulterioare îl deblochează.
        if (audioCtx.state === "suspended") audioCtx.resume().catch(function () {});
    }

    /** Em → Am → C → F — voicing pe 3 note, schimbare foarte lentă. */
    const AMBIENT_CHORDS = [
        [164.81, 196.0, 246.94],
        [220.0, 261.63, 329.63],
        [261.63, 329.63, 392.0],
        [174.61, 220.0, 261.63],
    ];
    const AMBIENT_CHORD_HOLD_SEC = 58;
    const AMBIENT_CHORD_RAMP_SEC = 14;

    function createAmbientNoiseBuffer(durationSec) {
        const len = Math.max(1, Math.ceil(audioCtx.sampleRate * durationSec));
        const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        let smooth = 0;
        for (let i = 0; i < len; i++) {
            const white = (Math.random() * 2 - 1) * 0.11;
            smooth = (smooth + white) * 0.986;
            data[i] = smooth;
        }
        return buf;
    }

    function applyAmbientChord(index, now) {
        if (!ambientNodes) return;
        const chord = AMBIENT_CHORDS[index % AMBIENT_CHORDS.length];
        const ramp = AMBIENT_CHORD_RAMP_SEC;
        ambientNodes.padA.frequency.setTargetAtTime(chord[0], now, ramp);
        ambientNodes.padB.frequency.setTargetAtTime(chord[1], now, ramp);
        ambientNodes.padC.frequency.setTargetAtTime(chord[2], now, ramp);
        ambientNodes.padSub.frequency.setTargetAtTime(chord[0] * 0.5, now, ramp);
        ambientNodes.padD.frequency.setTargetAtTime(chord[2] * 2, now, ramp);
        ambientNodes.padShimmerA.frequency.setTargetAtTime(chord[1], now, ramp);
        ambientNodes.padShimmerB.frequency.setTargetAtTime(chord[2], now, ramp);
        ambientNodes.currentChordNotes = chord;
        ambientNodes.chordIndex = index % AMBIENT_CHORDS.length;
    }

    function playAmbientDreamSparkle(now) {
        if (!audioCtx || !ambientNodes?.master) return;
        const chord = ambientNodes.currentChordNotes || AMBIENT_CHORDS[0];
        const pool = [chord[0], chord[1], chord[2], chord[0] * 2, chord[1] * 1.5];
        const noteCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < noteCount; i++) {
            const t0 = now + i * (0.32 + Math.random() * 0.22);
            const freq = pool[Math.floor(Math.random() * pool.length)];
            const bell = audioCtx.createOscillator();
            const bellGain = audioCtx.createGain();
            const bellFilter = audioCtx.createBiquadFilter();
            bell.type = "sine";
            bell.frequency.setValueAtTime(freq, t0);
            bell.frequency.exponentialRampToValueAtTime(freq * 0.94, t0 + 1.35);
            bellFilter.type = "lowpass";
            bellFilter.frequency.setValueAtTime(2200, t0);
            bellFilter.frequency.exponentialRampToValueAtTime(720, t0 + 1.5);
            bellGain.gain.setValueAtTime(0, t0);
            bellGain.gain.linearRampToValueAtTime(0.009, t0 + 0.06);
            bellGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.55);
            bell.connect(bellFilter).connect(bellGain).connect(ambientNodes.master);
            bell.start(t0);
            bell.stop(t0 + 1.6);
        }
    }

    function setupAmbientAudio() {
        if (!audioCtx || ambientNodes) return;

        const master = audioCtx.createGain();
        master.gain.value = AMBIENT_BASE_GAIN;

        const lowpass = audioCtx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = 760;
        lowpass.Q.value = 0.45;

        const highpass = audioCtx.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 110;
        highpass.Q.value = 0.5;

        const subHighpass = audioCtx.createBiquadFilter();
        subHighpass.type = "highpass";
        subHighpass.frequency.value = 42;
        subHighpass.Q.value = 0.6;

        const padA = audioCtx.createOscillator();
        const padB = audioCtx.createOscillator();
        const padC = audioCtx.createOscillator();
        const padSub = audioCtx.createOscillator();
        const padD = audioCtx.createOscillator();
        const padShimmerA = audioCtx.createOscillator();
        const padShimmerB = audioCtx.createOscillator();
        const padGain = audioCtx.createGain();
        const subGain = audioCtx.createGain();
        const airGain = audioCtx.createGain();
        const shimmerVoiceGain = audioCtx.createGain();
        const airPanner = audioCtx.createStereoPanner();
        const shimmerPanner = audioCtx.createStereoPanner();

        padA.type = "sine";
        padB.type = "triangle";
        padC.type = "sine";
        padSub.type = "sine";
        padD.type = "sine";
        padShimmerA.type = "triangle";
        padShimmerB.type = "sine";
        padGain.gain.value = 0.2;
        subGain.gain.value = 0.055;
        airGain.gain.value = 0.07;
        shimmerVoiceGain.gain.value = 0.045;
        airPanner.pan.value = 0.28;
        shimmerPanner.pan.value = -0.32;
        padShimmerA.detune.value = 11;
        padShimmerB.detune.value = -9;

        const noiseMix = audioCtx.createGain();
        noiseMix.gain.value = 1;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.value = 0.032;
        const bedSpecs = [
            { sec: 7, lp: 210, g: 0.38 },
            { sec: 11, lp: 340, g: 0.34 },
            { sec: 13, lp: 480, g: 0.28 },
        ];
        const bedSources = [];

        const shimmerLfo = audioCtx.createOscillator();
        const shimmerGain = audioCtx.createGain();
        const toneLfo = audioCtx.createOscillator();
        const toneLfoGain = audioCtx.createGain();
        shimmerLfo.type = "sine";
        shimmerLfo.frequency.value = 0.07;
        shimmerGain.gain.value = 0.006;
        shimmerLfo.connect(shimmerGain).connect(master.gain);
        toneLfo.type = "sine";
        toneLfo.frequency.value = 0.024;
        toneLfoGain.gain.value = 70;
        toneLfo.connect(toneLfoGain).connect(lowpass.frequency);

        padA.connect(padGain);
        padB.connect(padGain);
        padC.connect(padGain);
        padGain.connect(highpass).connect(lowpass).connect(master).connect(audioCtx.destination);

        padSub.connect(subGain).connect(subHighpass).connect(lowpass);
        padD.connect(airGain).connect(airPanner).connect(highpass);
        padShimmerA.connect(shimmerVoiceGain);
        padShimmerB.connect(shimmerVoiceGain);
        shimmerVoiceGain.connect(shimmerPanner).connect(highpass);

        for (let i = 0; i < bedSpecs.length; i++) {
            const spec = bedSpecs[i];
            const bed = audioCtx.createBufferSource();
            bed.buffer = createAmbientNoiseBuffer(spec.sec);
            bed.loop = true;
            const nf = audioCtx.createBiquadFilter();
            const ng = audioCtx.createGain();
            nf.type = "lowpass";
            nf.frequency.value = spec.lp;
            nf.Q.value = 0.35;
            ng.gain.value = spec.g;
            bed.connect(nf).connect(ng).connect(noiseMix);
            bedSources.push(bed);
        }
        noiseMix.connect(noiseGain).connect(highpass);

        const now = audioCtx.currentTime;
        master.gain.setValueAtTime(0.0001, now);

        padA.start(now);
        padB.start(now);
        padC.start(now);
        padSub.start(now);
        padD.start(now);
        padShimmerA.start(now);
        padShimmerB.start(now);
        for (let i = 0; i < bedSources.length; i++) bedSources[i].start(now);
        shimmerLfo.start(now);
        toneLfo.start(now);

        ambientNodes = {
            master,
            lowpass,
            highpass,
            padA,
            padB,
            padC,
            padSub,
            padD,
            padShimmerA,
            padShimmerB,
            padGain,
            subGain,
            airGain,
            shimmerVoiceGain,
            noiseGain,
            shimmerLfo,
            shimmerGain,
            toneLfo,
            toneLfoGain,
            lastUpdateTime: 0,
            chordIndex: 0,
            chordTimer: 0,
            currentChordNotes: AMBIENT_CHORDS[0],
            dreamTimer: 0,
            nextDreamInterval: 30 + Math.random() * 16,
        };
        applyAmbientChord(0, now);
    }

    function setAmbientLevel(target, time = 1.4) {
        if (!audioCtx || !ambientNodes?.master) return;
        const now = audioCtx.currentTime;
        const safeTarget = Math.max(0.0001, target);
        ambientNodes.master.gain.cancelScheduledValues(now);
        ambientNodes.master.gain.setValueAtTime(Math.max(0.0001, ambientNodes.master.gain.value), now);
        ambientNodes.master.gain.exponentialRampToValueAtTime(safeTarget, now + Math.max(0.05, time));
    }

    function playDeathAmbientBloom() {
        if (!audioCtx || !ambientNodes) return;
        const now = audioCtx.currentTime;
        const bell = audioCtx.createOscillator();
        const bellGain = audioCtx.createGain();
        const bellFilter = audioCtx.createBiquadFilter();
        bell.type = "sine";
        bell.frequency.setValueAtTime(659.25, now);
        bell.frequency.exponentialRampToValueAtTime(329.63, now + 1.5);
        bellFilter.type = "lowpass";
        bellFilter.frequency.setValueAtTime(1800, now);
        bellFilter.frequency.exponentialRampToValueAtTime(640, now + 1.8);
        bellGain.gain.setValueAtTime(0, now);
        bellGain.gain.linearRampToValueAtTime(0.018, now + 0.08);
        bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
        bell.connect(bellFilter).connect(ambientNodes.master);
        bell.start(now);
        bell.stop(now + 1.85);
    }

    function updateAmbientAudio(playerX, playerY, playerRadius, bountyMultiplier) {
        const state = getGameState();
        if (!audioCtx || !ambientNodes || state.isDying) return;
        const now = audioCtx.currentTime;
        if (now - (ambientNodes.lastUpdateTime || 0) < AMBIENT_UPDATE_INTERVAL) return;
        ambientNodes.lastUpdateTime = now;

        const center = state.worldSize * 0.5;
        const distToCenter = Math.hypot(playerX - center, playerY - center);
        const centerTension = Math.max(0, 1 - distToCenter / 1500);
        const growthTension = Math.min(
            1,
            Math.max(
                0,
                (playerRadius - state.startRadius) / (state.maxPlayerRadius - state.startRadius)
            )
        );
        const bountyLift = Math.min(1, Math.max(0, (bountyMultiplier - 1) / 3));
        const intensity = Math.min(1, centerTension * 0.65 + growthTension * 0.25 + bountyLift * 0.35);

        const targetLP = 680 + intensity * 260;
        const targetNoise = 0.026 + intensity * 0.014;
        const targetPad = 0.19 + intensity * 0.038;
        const targetAir = 0.062 + intensity * 0.022;
        const targetDetune = 1.5 + intensity * 8;
        const arenaBase = AMBIENT_BASE_GAIN * AMBIENT_ARENA_GAIN_MULT;
        const targetMaster = Math.min(0.03, arenaBase * (0.96 + intensity * 0.2));

        ambientNodes.lowpass.frequency.setTargetAtTime(targetLP, now, 0.35);
        ambientNodes.noiseGain.gain.setTargetAtTime(targetNoise, now, 0.45);
        ambientNodes.padGain.gain.setTargetAtTime(targetPad, now, 0.42);
        ambientNodes.airGain.gain.setTargetAtTime(targetAir, now, 0.48);
        ambientNodes.padB.detune.setTargetAtTime(targetDetune, now, 0.65);
        ambientNodes.padC.detune.setTargetAtTime(-targetDetune * 0.8, now, 0.65);
        ambientNodes.padShimmerA.detune.setTargetAtTime(10 + targetDetune * 0.35, now, 0.65);
        ambientNodes.padShimmerB.detune.setTargetAtTime(-8 - targetDetune * 0.3, now, 0.65);
        ambientNodes.master.gain.setTargetAtTime(targetMaster, now, 0.7);

        ambientNodes.chordTimer = (ambientNodes.chordTimer || 0) + AMBIENT_UPDATE_INTERVAL;
        if (ambientNodes.chordTimer >= AMBIENT_CHORD_HOLD_SEC) {
            ambientNodes.chordTimer = 0;
            const next = ((ambientNodes.chordIndex || 0) + 1) % AMBIENT_CHORDS.length;
            applyAmbientChord(next, now);
        }

        ambientNodes.dreamTimer = (ambientNodes.dreamTimer || 0) + AMBIENT_UPDATE_INTERVAL;
        if (ambientNodes.dreamTimer >= ambientNodes.nextDreamInterval) {
            ambientNodes.dreamTimer = 0;
            ambientNodes.nextDreamInterval = 28 + Math.random() * 20;
            if (!state.isDying) playAmbientDreamSparkle(now);
        }
    }

    function playEatBotSound(size) {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const dur = 0.4;
        const baseFreq = Math.max(40, 150 - size);
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(baseFreq, now);
        osc1.frequency.exponentialRampToValueAtTime(20, now + dur);
        gain1.gain.setValueAtTime(0.4, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + dur);
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(baseFreq * 4, now);
        osc2.frequency.exponentialRampToValueAtTime(baseFreq * 2, now + dur * 0.5);
        gain2.gain.setValueAtTime(0.2, now);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + dur * 0.8);
        osc1.connect(gain1).connect(audioCtx.destination);
        osc2.connect(gain2).connect(audioCtx.destination);
        [osc1, osc2].forEach((o) => {
            o.start(now);
            o.stop(now + dur);
        });
    }

    function setupBlackHoleAudio() {
        if (!audioCtx || bhNodes) return;
        const bufferSize = 2 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const out = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) out[i] = Math.random() * 2 - 1;
        const whiteNoise = audioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;
        const windFilter = audioCtx.createBiquadFilter();
        const windGain = audioCtx.createGain();
        const hum = audioCtx.createOscillator();
        const humGain = audioCtx.createGain();
        windFilter.type = "lowpass";
        windFilter.frequency.value = 400;
        windGain.gain.value = 0;
        hum.type = "sine";
        hum.frequency.value = 40;
        humGain.gain.value = 0;
        whiteNoise.connect(windFilter).connect(windGain).connect(audioCtx.destination);
        hum.connect(humGain).connect(audioCtx.destination);
        whiteNoise.start();
        hum.start();
        bhNodes = { windGain, humGain, windFilter, hum };
        bhAudible = false;
    }

    function silenceBlackHoleAudio() {
        if (!bhNodes || !audioCtx) return;
        const now = audioCtx.currentTime;
        const wind = bhNodes.windGain.gain;
        const hum = bhNodes.humGain.gain;
        wind.cancelScheduledValues(now);
        hum.cancelScheduledValues(now);
        wind.setValueAtTime(0, now);
        hum.setValueAtTime(0, now);
        bhAudible = false;
    }

    function updateBlackHoleAudio(playerX, playerY) {
        if (!bhNodes || !audioCtx) return;
        const state = getGameState();
        const worldSize = state && typeof state.worldSize === "number" ? state.worldSize : 4000;
        const bhX = worldSize / 2;
        const bhY = worldSize / 2;
        const dist = Math.hypot(bhX - playerX, bhY - playerY);
        const maxRange = 1200;
        const dying = !!(state && state.isDying);
        if (dying || !(dist < maxRange)) {
            if (bhAudible || dying) silenceBlackHoleAudio();
            return;
        }
        bhAudible = true;
        const intensity = Math.pow(1 - dist / maxRange, 2);
        const now = audioCtx.currentTime;
        bhNodes.windGain.gain.setTargetAtTime(intensity * 0.15, now, 0.1);
        bhNodes.humGain.gain.setTargetAtTime(intensity * 0.25, now, 0.1);
        bhNodes.windFilter.frequency.setTargetAtTime(400 + intensity * 1200, now, 0.1);
        bhNodes.hum.frequency.setTargetAtTime(40 - intensity * 15, now, 0.1);
    }

    function playEatParticleSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        if (now - lastParticleSoundTime < 0.06) return;
        lastParticleSoundTime = now;
        const dur = 0.1;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const freq = 400 + Math.random() * 200;
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + dur);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + dur);
    }

    /** Jeleu plin: micro-pop-uri eșalonate + whoosh discret (nu eat-bot). */
    function playJellyEggBurstSound(radius, eggCount) {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const r = typeof radius === "number" && radius > 0 ? radius : 180;
        const eggs = typeof eggCount === "number" && eggCount > 0 ? eggCount : 12;
        const pitchMul = Math.max(0.82, Math.min(1.18, 1.12 - (r - 140) / 520));
        const popCount = Math.min(5, Math.max(3, Math.round(eggs / 3.5)));

        const whooshDur = 0.24;
        const whooshSamples = Math.ceil(audioCtx.sampleRate * whooshDur);
        const whooshBuf = audioCtx.createBuffer(1, whooshSamples, audioCtx.sampleRate);
        const whooshData = whooshBuf.getChannelData(0);
        for (let i = 0; i < whooshSamples; i++) whooshData[i] = Math.random() * 2 - 1;
        const whoosh = audioCtx.createBufferSource();
        whoosh.buffer = whooshBuf;
        const whooshFilter = audioCtx.createBiquadFilter();
        const whooshGain = audioCtx.createGain();
        whooshFilter.type = "lowpass";
        whooshFilter.frequency.setValueAtTime(2400 * pitchMul, now);
        whooshFilter.frequency.exponentialRampToValueAtTime(380, now + whooshDur);
        whooshGain.gain.setValueAtTime(0, now);
        whooshGain.gain.linearRampToValueAtTime(0.026, now + 0.012);
        whooshGain.gain.exponentialRampToValueAtTime(0.001, now + whooshDur);
        whoosh.connect(whooshFilter).connect(whooshGain).connect(audioCtx.destination);
        whoosh.start(now);
        whoosh.stop(now + whooshDur + 0.02);

        const span = 0.11;
        for (let i = 0; i < popCount; i++) {
            const t0 = now + (i / Math.max(1, popCount - 1)) * span + Math.random() * 0.01;
            const popDur = 0.065 + Math.random() * 0.035;
            const basePop = (480 + Math.random() * 420) * pitchMul;
            const osc = audioCtx.createOscillator();
            const popGain = audioCtx.createGain();
            const popFilter = audioCtx.createBiquadFilter();
            osc.type = "sine";
            osc.frequency.setValueAtTime(basePop * 0.7, t0);
            osc.frequency.exponentialRampToValueAtTime(basePop * 1.25, t0 + popDur * 0.32);
            osc.frequency.exponentialRampToValueAtTime(basePop * 0.55, t0 + popDur);
            popFilter.type = "bandpass";
            popFilter.frequency.setValueAtTime(basePop, t0);
            popFilter.Q.value = 3.8;
            popGain.gain.setValueAtTime(0, t0);
            popGain.gain.linearRampToValueAtTime(0.042, t0 + 0.007);
            popGain.gain.exponentialRampToValueAtTime(0.001, t0 + popDur);
            osc.connect(popFilter).connect(popGain).connect(audioCtx.destination);
            osc.start(t0);
            osc.stop(t0 + popDur + 0.03);
        }
    }

    /** Blood Rift cast — Crimson bloom (sub + tear + chime minor). */
    function playBloodRiftCastSound(hunting) {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const hunt = !!hunting;
        const dur = 0.58;

        const sub = audioCtx.createOscillator();
        const subGain = audioCtx.createGain();
        sub.type = "sine";
        sub.frequency.setValueAtTime(54, now);
        sub.frequency.exponentialRampToValueAtTime(hunt ? 82 : 70, now + 0.16);
        sub.frequency.exponentialRampToValueAtTime(38, now + dur);
        subGain.gain.setValueAtTime(0, now);
        subGain.gain.linearRampToValueAtTime(0.09, now + 0.035);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        sub.connect(subGain).connect(audioCtx.destination);
        sub.start(now);
        sub.stop(now + dur + 0.02);

        const tearDur = 0.32;
        const tearSamples = Math.ceil(audioCtx.sampleRate * tearDur);
        const tearBuf = audioCtx.createBuffer(1, tearSamples, audioCtx.sampleRate);
        const tearData = tearBuf.getChannelData(0);
        for (let i = 0; i < tearSamples; i++) tearData[i] = Math.random() * 2 - 1;
        const tear = audioCtx.createBufferSource();
        tear.buffer = tearBuf;
        const tearFilter = audioCtx.createBiquadFilter();
        const tearGain = audioCtx.createGain();
        tearFilter.type = "bandpass";
        tearFilter.frequency.setValueAtTime(hunt ? 920 : 780, now);
        tearFilter.Q.value = 1.1;
        tearFilter.frequency.exponentialRampToValueAtTime(320, now + tearDur);
        tearGain.gain.setValueAtTime(0, now);
        tearGain.gain.linearRampToValueAtTime(0.034, now + 0.02);
        tearGain.gain.exponentialRampToValueAtTime(0.001, now + tearDur);
        tear.connect(tearFilter).connect(tearGain).connect(audioCtx.destination);
        tear.start(now + 0.02);
        tear.stop(now + tearDur + 0.05);

        const chimes = hunt ? [311.13, 392.0, 523.25] : [277.18, 369.99, 440.0];
        chimes.forEach((freq, i) => {
            const t0 = now + 0.05 + i * 0.045;
            const chDur = 0.42;
            const bell = audioCtx.createOscillator();
            const bellGain = audioCtx.createGain();
            const bellFilter = audioCtx.createBiquadFilter();
            bell.type = "sine";
            bell.frequency.setValueAtTime(freq, t0);
            bell.frequency.exponentialRampToValueAtTime(freq * 0.98, t0 + chDur);
            bellFilter.type = "lowpass";
            bellFilter.frequency.setValueAtTime(2400, t0);
            bellFilter.frequency.exponentialRampToValueAtTime(900, t0 + chDur);
            bellGain.gain.setValueAtTime(0, t0);
            bellGain.gain.linearRampToValueAtTime(0.038 - i * 0.006, t0 + 0.018);
            bellGain.gain.exponentialRampToValueAtTime(0.001, t0 + chDur);
            bell.connect(bellFilter).connect(bellGain).connect(audioCtx.destination);
            bell.start(t0);
            bell.stop(t0 + chDur + 0.02);
        });
    }

    var lastBloodRiftSiphonSoundTime = 0;

    /** Blood Rift siphons — arc electric subtil (crimson buzz + micro-sparks per link). */
    function playBloodRiftSiphonPulse(linkCount) {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        if (now - lastBloodRiftSiphonSoundTime < 0.07) return;
        lastBloodRiftSiphonSoundTime = now;

        const links = Math.min(3, Math.max(1, Math.round(Number(linkCount) || 1)));
        const humDur = 0.1 + links * 0.018;
        const humBase = 118 + links * 14 + (Math.random() - 0.5) * 6;

        const humA = audioCtx.createOscillator();
        const humB = audioCtx.createOscillator();
        const humFilt = audioCtx.createBiquadFilter();
        const humGain = audioCtx.createGain();
        humA.type = "triangle";
        humB.type = "sine";
        humA.frequency.setValueAtTime(humBase, now);
        humB.frequency.setValueAtTime(humBase * 2.007, now);
        humB.detune.setValueAtTime(11 + links * 3, now);
        humFilt.type = "bandpass";
        humFilt.Q.value = 3.2;
        humFilt.frequency.setValueAtTime(520 + links * 35, now);
        humFilt.frequency.exponentialRampToValueAtTime(920, now + humDur * 0.35);
        humFilt.frequency.exponentialRampToValueAtTime(340, now + humDur);
        humGain.gain.setValueAtTime(0, now);
        humGain.gain.linearRampToValueAtTime(0.0065 + links * 0.0012, now + 0.006);
        humGain.gain.exponentialRampToValueAtTime(0.00035, now + humDur);
        humA.connect(humFilt);
        humB.connect(humFilt);
        humFilt.connect(humGain).connect(audioCtx.destination);
        humA.start(now);
        humB.start(now);
        humA.stop(now + humDur + 0.02);
        humB.stop(now + humDur + 0.02);

        const sub = audioCtx.createOscillator();
        const subGain = audioCtx.createGain();
        sub.type = "sine";
        sub.frequency.setValueAtTime(52, now);
        sub.frequency.exponentialRampToValueAtTime(68, now + 0.05);
        subGain.gain.setValueAtTime(0, now);
        subGain.gain.linearRampToValueAtTime(0.014, now + 0.01);
        subGain.gain.exponentialRampToValueAtTime(0.00025, now + 0.08);
        sub.connect(subGain).connect(audioCtx.destination);
        sub.start(now);
        sub.stop(now + 0.09);

        for (let i = 0; i < links; i++) {
            const t0 = now + 0.012 + i * 0.024;
            const sparkDur = 0.04 + Math.random() * 0.022;
            const sparkSamples = Math.ceil(audioCtx.sampleRate * sparkDur);
            const sparkBuf = audioCtx.createBuffer(1, sparkSamples, audioCtx.sampleRate);
            const sparkData = sparkBuf.getChannelData(0);
            for (let s = 0; s < sparkSamples; s++) {
                const t = s / sparkSamples;
                sparkData[s] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
            }
            const spark = audioCtx.createBufferSource();
            spark.buffer = sparkBuf;
            const sparkHP = audioCtx.createBiquadFilter();
            const sparkBP = audioCtx.createBiquadFilter();
            const sparkGain = audioCtx.createGain();
            sparkHP.type = "highpass";
            sparkHP.frequency.value = 1800 + i * 320;
            sparkBP.type = "bandpass";
            sparkBP.Q.value = 1.45;
            const sparkF0 = 2600 + i * 480 + Math.random() * 220;
            sparkBP.frequency.setValueAtTime(sparkF0, t0);
            sparkBP.frequency.exponentialRampToValueAtTime(1100, t0 + sparkDur);
            sparkGain.gain.setValueAtTime(0, t0);
            sparkGain.gain.linearRampToValueAtTime(0.011 - i * 0.0015, t0 + 0.0015);
            sparkGain.gain.exponentialRampToValueAtTime(0.00025, t0 + sparkDur);
            spark.connect(sparkHP).connect(sparkBP).connect(sparkGain).connect(audioCtx.destination);
            spark.start(t0);
            spark.stop(t0 + sparkDur + 0.015);

            const arcDur = 0.034;
            const arc = audioCtx.createOscillator();
            const arcFilt = audioCtx.createBiquadFilter();
            const arcGain = audioCtx.createGain();
            arc.type = "sine";
            arc.frequency.setValueAtTime(2400 + i * 360, t0);
            arc.frequency.exponentialRampToValueAtTime(580, t0 + arcDur);
            arcFilt.type = "lowpass";
            arcFilt.frequency.setValueAtTime(4800, t0);
            arcFilt.frequency.exponentialRampToValueAtTime(750, t0 + arcDur);
            arcGain.gain.setValueAtTime(0, t0);
            arcGain.gain.linearRampToValueAtTime(0.009, t0 + 0.002);
            arcGain.gain.exponentialRampToValueAtTime(0.0002, t0 + arcDur);
            arc.connect(arcFilt).connect(arcGain).connect(audioCtx.destination);
            arc.start(t0);
            arc.stop(t0 + arcDur + 0.015);
        }
    }

    var lastWarpBarrierSoundTime = 0;
    var lastPhaseCageBleedSoundTime = 0;
    var lastPhaseCageCaptureBySerial = {};
    /** @type {Map<number, object>} */
    var phaseCageHuntDrones = new Map();

    function releasePhaseCageHuntDrone(serial) {
        const key = Number(serial);
        if (!Number.isFinite(key)) return;
        const d = phaseCageHuntDrones.get(key);
        if (!d) return;
        phaseCageHuntDrones.delete(key);
        try {
            const t = audioCtx ? audioCtx.currentTime : 0;
            d.gain.gain.cancelScheduledValues(t);
            d.gain.gain.setValueAtTime(d.gain.gain.value, t);
            d.gain.gain.linearRampToValueAtTime(0, t + 0.12);
            d.osc.stop(t + 0.14);
            if (d.breath) d.breath.stop(t + 0.14);
        } catch (e) {
            /* already stopped */
        }
    }

    function releaseAllPhaseCageHuntDrones() {
        phaseCageHuntDrones.forEach(function (_d, key) {
            releasePhaseCageHuntDrone(key);
        });
        phaseCageHuntDrones.clear();
        lastPhaseCageCaptureBySerial = {};
    }

    function createPhaseCageHuntDroneNodes() {
        const osc = audioCtx.createOscillator();
        const breathBufLen = Math.ceil(audioCtx.sampleRate * 0.35);
        const breathBuf = audioCtx.createBuffer(1, breathBufLen, audioCtx.sampleRate);
        const breathData = breathBuf.getChannelData(0);
        let smooth = 0;
        for (let i = 0; i < breathBufLen; i++) {
            const white = (Math.random() * 2 - 1) * 0.14;
            smooth = (smooth + white) * 0.992;
            breathData[i] = smooth;
        }
        const breath = audioCtx.createBufferSource();
        breath.buffer = breathBuf;
        breath.loop = true;
        const mixFilter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = 108;
        breath.playbackRate.value = 0.92;
        mixFilter.type = "bandpass";
        mixFilter.frequency.value = 640;
        mixFilter.Q.value = 0.55;
        gain.gain.value = 0;
        osc.connect(mixFilter);
        breath.connect(mixFilter);
        mixFilter.connect(gain).connect(audioCtx.destination);
        osc.start();
        breath.start();
        return { osc, breath, mixFilter, gain, ctx: audioCtx };
    }

    /** Phase Cage x3 — glide continuu cât cage-ul vânează (gain din huntPulse). */
    function updatePhaseCageHuntDrone(cageSerial, huntPulse, isMoving) {
        if (!audioCtx) return;
        const key = Number(cageSerial);
        if (!Number.isFinite(key)) return;
        const pulse = Number.isFinite(huntPulse) ? Math.max(0, Math.min(1, huntPulse)) : 0;
        const move = !!isMoving;
        const level = pulse * (move ? 1 : 0.38);
        const now = audioCtx.currentTime;

        if (level < 0.03) {
            if (phaseCageHuntDrones.has(key)) releasePhaseCageHuntDrone(key);
            return;
        }

        let d = phaseCageHuntDrones.get(key);
        if (!d || d.ctx !== audioCtx) {
            if (d) releasePhaseCageHuntDrone(key);
            d = createPhaseCageHuntDroneNodes();
            phaseCageHuntDrones.set(key, d);
        }

        const targetGain = 0.006 + level * 0.02;
        d.gain.gain.setTargetAtTime(targetGain, now, 0.14);
        d.mixFilter.frequency.setTargetAtTime(480 + level * 420, now, 0.18);
        const detune = move ? 6 + pulse * 10 : 2;
        d.osc.detune.setTargetAtTime(detune, now, 0.2);
    }

    /** Phase Cage x3 — țintă nouă în rază (lock discret, o dată per schimbare). */
    function playPhaseCageHuntLockSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const dur = 0.46;
        const freqs = [392.0, 523.25];
        freqs.forEach(function (freq, i) {
            const t0 = now + i * 0.055;
            const bell = audioCtx.createOscillator();
            const bellGain = audioCtx.createGain();
            const bellFilter = audioCtx.createBiquadFilter();
            bell.type = "sine";
            bell.frequency.setValueAtTime(freq, t0);
            bell.frequency.exponentialRampToValueAtTime(freq * 0.985, t0 + dur);
            bellFilter.type = "lowpass";
            bellFilter.frequency.setValueAtTime(2200, t0);
            bellFilter.frequency.exponentialRampToValueAtTime(880, t0 + dur);
            bellFilter.Q.value = 0.6;
            bellGain.gain.setValueAtTime(0, t0);
            bellGain.gain.linearRampToValueAtTime(0.028 - i * 0.007, t0 + 0.042);
            bellGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            bell.connect(bellFilter).connect(bellGain).connect(audioCtx.destination);
            bell.start(t0);
            bell.stop(t0 + dur + 0.02);
        });
    }

    /** Phase Cage x3 — prindere bot în cage. */
    function playPhaseCageCaptureSound(cageSerial) {
        if (!audioCtx) return;
        const key = Number(cageSerial);
        const now = audioCtx.currentTime;
        if (Number.isFinite(key)) {
            const last = lastPhaseCageCaptureBySerial[key] || 0;
            if (now - last < 0.22) return;
            lastPhaseCageCaptureBySerial[key] = now;
        }

        const dur = 0.52;
        const sub = audioCtx.createOscillator();
        const subGain = audioCtx.createGain();
        sub.type = "sine";
        sub.frequency.setValueAtTime(58, now);
        sub.frequency.exponentialRampToValueAtTime(42, now + dur);
        subGain.gain.setValueAtTime(0, now);
        subGain.gain.linearRampToValueAtTime(0.042, now + 0.05);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        sub.connect(subGain).connect(audioCtx.destination);
        sub.start(now);
        sub.stop(now + dur + 0.02);

        const bloom = audioCtx.createOscillator();
        const bloomGain = audioCtx.createGain();
        const bloomFilter = audioCtx.createBiquadFilter();
        bloom.type = "sine";
        bloom.frequency.setValueAtTime(329.63, now + 0.04);
        bloom.frequency.exponentialRampToValueAtTime(277.18, now + dur);
        bloomFilter.type = "lowpass";
        bloomFilter.frequency.setValueAtTime(1800, now + 0.04);
        bloomFilter.frequency.exponentialRampToValueAtTime(620, now + dur);
        bloomGain.gain.setValueAtTime(0, now + 0.04);
        bloomGain.gain.linearRampToValueAtTime(0.034, now + 0.09);
        bloomGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        bloom.connect(bloomFilter).connect(bloomGain).connect(audioCtx.destination);
        bloom.start(now + 0.04);
        bloom.stop(now + dur + 0.02);
    }

    /** Phase Cage x2 — rezonanță perete (un singur strat, fără tick-uri). */
    function playPhaseCageWallBleedSound(intensity, botRadius) {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const stress = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0.5;
        const minGap = 0.5 - stress * 0.08;
        if (now - lastPhaseCageBleedSoundTime < minGap) return;
        lastPhaseCageBleedSoundTime = now;

        const size = Number.isFinite(botRadius) ? Math.max(8, botRadius) : 40;
        const sizeT = Math.min(1, (size - 8) / 100);
        const dur = 0.52 + stress * 0.22 + sizeT * 0.06;
        const base = (146.83 + stress * 12) * (0.97 + sizeT * 0.05);

        const body = audioCtx.createOscillator();
        const bodyGain = audioCtx.createGain();
        const bodyFilt = audioCtx.createBiquadFilter();
        body.type = "sine";
        body.frequency.setValueAtTime(base, now);
        body.frequency.exponentialRampToValueAtTime(Math.max(72, base * 0.88), now + dur);
        bodyFilt.type = "lowpass";
        bodyFilt.frequency.setValueAtTime(720 + stress * 280, now);
        bodyFilt.frequency.exponentialRampToValueAtTime(260, now + dur);
        bodyFilt.Q.value = 0.45;
        const bodyPeak = 0.032 + stress * 0.022 + sizeT * 0.008;
        bodyGain.gain.setValueAtTime(0, now);
        bodyGain.gain.linearRampToValueAtTime(bodyPeak, now + 0.055);
        bodyGain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

        const breathDur = Math.min(dur, 0.38);
        const breathSamples = Math.ceil(audioCtx.sampleRate * breathDur);
        const breathBuf = audioCtx.createBuffer(1, breathSamples, audioCtx.sampleRate);
        const breathData = breathBuf.getChannelData(0);
        for (let i = 0; i < breathSamples; i++) breathData[i] = Math.random() * 2 - 1;
        const breath = audioCtx.createBufferSource();
        breath.buffer = breathBuf;
        const breathFilt = audioCtx.createBiquadFilter();
        const breathGain = audioCtx.createGain();
        breathFilt.type = "bandpass";
        breathFilt.frequency.setValueAtTime(420 + stress * 120, now);
        breathFilt.Q.value = 0.75;
        breathFilt.frequency.exponentialRampToValueAtTime(220, now + breathDur);
        breathGain.gain.setValueAtTime(0, now);
        breathGain.gain.linearRampToValueAtTime(0.012 + stress * 0.01, now + 0.07);
        breathGain.gain.exponentialRampToValueAtTime(0.0006, now + breathDur);

        body.connect(bodyFilt).connect(bodyGain).connect(audioCtx.destination);
        breath.connect(breathFilt).connect(breathGain).connect(audioCtx.destination);
        body.start(now);
        breath.start(now);
        body.stop(now + dur + 0.03);
        breath.stop(now + breathDur + 0.03);
    }

    let lastGlassEnterAt = 0;
    let lastGlassExitAt = 0;

    /** Dreptunghi de duel — intrare, ton moale care urcă. */
    function playGlassEnterSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        if (now - lastGlassEnterAt < 0.08) return;
        lastGlassEnterAt = now;
        const dur = 0.22;
        const osc = audioCtx.createOscillator();
        const over = audioCtx.createOscillator();
        const overGain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        over.type = "sine";
        osc.frequency.setValueAtTime(349.23, now);
        osc.frequency.exponentialRampToValueAtTime(523.25, now + dur);
        over.frequency.setValueAtTime(698.46, now);
        over.frequency.exponentialRampToValueAtTime(783.99, now + dur);
        overGain.gain.setValueAtTime(0.28, now);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1600, now);
        filter.Q.value = 0.6;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.04, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(filter);
        over.connect(overGain).connect(filter);
        filter.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        over.start(now);
        osc.stop(now + dur + 0.02);
        over.stop(now + dur + 0.02);
    }

    /** Dreptunghi de duel — ieșire, ton mai jos care coboară. */
    function playGlassExitSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        if (now - lastGlassExitAt < 0.08) return;
        lastGlassExitAt = now;
        const dur = 0.2;
        const osc = audioCtx.createOscillator();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(261.63, now + dur);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(700, now + dur);
        filter.Q.value = 0.5;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.032, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(filter).connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + dur + 0.02);
    }

    /** Phase Shifter — trecere barieră hartă (violet chime scurt). */
    function playWarpBarrierCrossSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        if (now - lastWarpBarrierSoundTime < 0.08) return;
        lastWarpBarrierSoundTime = now;

        const chDur = 0.28;
        const base =
            (Math.random() < 0.5 ? 587.33 : 659.25) * (1 + (Math.random() - 0.5) * 0.015);
        const fund = audioCtx.createOscillator();
        const overtone = audioCtx.createOscillator();
        const mixGain = audioCtx.createGain();
        const mixFilter = audioCtx.createBiquadFilter();

        fund.type = "sine";
        overtone.type = "triangle";
        fund.frequency.setValueAtTime(base, now);
        fund.frequency.exponentialRampToValueAtTime(base * 0.992, now + chDur);
        overtone.frequency.setValueAtTime(base * 2.01, now);
        overtone.frequency.exponentialRampToValueAtTime(base * 1.98, now + chDur);

        mixFilter.type = "lowpass";
        mixFilter.frequency.setValueAtTime(2800, now);
        mixFilter.frequency.exponentialRampToValueAtTime(1100, now + chDur);
        mixFilter.Q.value = 0.7;

        mixGain.gain.setValueAtTime(0, now);
        mixGain.gain.linearRampToValueAtTime(0.052, now + 0.008);
        mixGain.gain.exponentialRampToValueAtTime(0.001, now + chDur);

        fund.connect(mixFilter);
        overtone.connect(mixFilter);
        mixFilter.connect(mixGain).connect(audioCtx.destination);
        fund.start(now);
        overtone.start(now);
        fund.stop(now + chDur + 0.02);
        overtone.stop(now + chDur + 0.02);
    }

    function playBountySound(m) {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const notes = m === 2 ? [440, 660] : m === 3 ? [440, 554, 659] : [440, 554, 659, 880];
        const type = m === 2 ? "sine" : m === 3 ? "triangle" : "sawtooth";
        const vol = m === 4 ? 0.08 : m === 3 ? 0.15 : 0.1;
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();
            const startTime = now + i * 0.05;
            const dur = 0.6;
            osc.type = type;
            osc.frequency.setValueAtTime(freq, startTime);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.05, startTime + dur);
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(1000, startTime);
            filter.frequency.exponentialRampToValueAtTime(4000, startTime + 0.2);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
            osc.connect(filter).connect(gain).connect(audioCtx.destination);
            osc.start(startTime);
            osc.stop(startTime + dur);
        });
    }

    function playReadySound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(554, now + 0.2);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.03, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    function playDamageSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.25);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    function playBountyLostSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.8);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.8);
    }

    function playDeathSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const dur = 2.5;
        playDeathAmbientBloom();
        setAmbientLevel(0.0001, 2.2);
        for (let i = 0; i < 12; i++) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const freq = 1200 - i * 80;
            const startTime = now + i * 0.05;
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, startTime);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.1, startTime + 0.8);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.8);
        }
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        const osc3 = audioCtx.createOscillator();
        const gain3 = audioCtx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(80, now);
        osc2.frequency.exponentialRampToValueAtTime(20, now + dur);
        filter.type = "lowpass";
        filter.frequency.value = 400;
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.2, now + 0.5);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc3.type = "sine";
        osc3.frequency.setValueAtTime(1500, now + 0.1);
        gain3.gain.setValueAtTime(0, now + 0.1);
        gain3.gain.linearRampToValueAtTime(0.05, now + 0.2);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        osc2.connect(filter).connect(gain2).connect(audioCtx.destination);
        osc3.connect(gain3).connect(audioCtx.destination);
        osc2.start(now);
        osc2.stop(now + dur);
        osc3.start(now + 0.1);
        osc3.stop(now + 1.5);
    }

    function playAbilitySound(type) {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        if (type === "vampire") {
            /* playBloodRiftCastSound() la spawn reușit în entities.js */
        } else if (type === "warp") {
            [440, 880, 1320].forEach((f, i) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = "sine";
                o.frequency.setValueAtTime(f, now);
                o.frequency.exponentialRampToValueAtTime(f * 0.5, now + 0.6);
                g.gain.setValueAtTime(0, now);
                g.gain.linearRampToValueAtTime(0.05, now + 0.1);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
                o.connect(g).connect(audioCtx.destination);
                o.start(now + i * 0.03);
                o.stop(now + 0.6);
            });
        } else if (type === "speed") {
            const n = audioCtx.createBufferSource();
            const b = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.5, audioCtx.sampleRate);
            const d = b.getChannelData(0);
            const fi = audioCtx.createBiquadFilter();
            const ga = audioCtx.createGain();
            for (let i = 0; i < b.length; i++) d[i] = Math.random() * 2 - 1;
            n.buffer = b;
            fi.type = "lowpass";
            fi.frequency.setValueAtTime(1500, now);
            fi.frequency.exponentialRampToValueAtTime(400, now + 0.5);
            ga.gain.setValueAtTime(0, now);
            ga.gain.linearRampToValueAtTime(0.2, now + 0.1);
            ga.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            n.connect(fi).connect(ga).connect(audioCtx.destination);
            n.start(now);
        }
    }

    function playChatReceiveSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        osc.type = "sine";
        osc2.type = "triangle";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1174.7, now + 0.07);
        osc2.frequency.setValueAtTime(1320, now);
        osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.09);
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1200, now);
        filter.Q.setValueAtTime(4, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.045, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc2.start(now + 0.018);
        osc.stop(now + 0.24);
        osc2.stop(now + 0.24);
    }

    function playHoverSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.linearRampToValueAtTime(1320, now + 0.15);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.05, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    function playErrorSound() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const o1 = audioCtx.createOscillator();
        const o2 = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const f = audioCtx.createBiquadFilter();
        o1.type = "square";
        o2.type = "triangle";
        o1.frequency.setValueAtTime(190, now);
        o1.frequency.exponentialRampToValueAtTime(95, now + 0.24);
        o2.frequency.setValueAtTime(142, now);
        o2.frequency.exponentialRampToValueAtTime(78, now + 0.24);
        f.type = "lowpass";
        f.frequency.setValueAtTime(880, now);
        f.frequency.exponentialRampToValueAtTime(240, now + 0.24);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.06, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        o1.connect(f);
        o2.connect(f);
        f.connect(g).connect(audioCtx.destination);
        o1.start(now);
        o2.start(now + 0.01);
        o1.stop(now + 0.26);
        o2.stop(now + 0.26);
    }

    function getAmbientBaseGain() {
        return AMBIENT_BASE_GAIN;
    }

    /** Volum ambient la intrare în rundă (doar arenă — updateAmbientAudio folosește același multiplicator). */
    function getAmbientArenaGain() {
        return AMBIENT_BASE_GAIN * AMBIENT_ARENA_GAIN_MULT;
    }

    function isSoundEnabled() {
        return soundEnabled;
    }

    async function setSoundEnabled(on) {
        soundEnabled = !!on;
        try {
            if (!soundEnabled) {
                if (audioCtx) {
                    // Detașăm contextul înainte de await: un ON rapid trebuie să creeze unul nou.
                    const closingCtx = audioCtx;
                    releaseAllPhaseCageHuntDrones();
                    audioCtx = null;
                    bhNodes = null;
                    bhAudible = false;
                    ambientNodes = null;
                    await closingCtx.close();
                }
                return;
            }
            if (!audioCtx) initAudio();
        } catch (e) {
            /* ignore */
        }
    }

    global.NebulaAudio = {
        configure: configureAudio,
        getAmbientBaseGain,
        getAmbientArenaGain,
        isSoundEnabled,
        setSoundEnabled,
    };

    global.configureAudio = configureAudio;
    global.initAudio = initAudio;
    global.setAmbientLevel = setAmbientLevel;
    global.updateAmbientAudio = updateAmbientAudio;
    global.updateBlackHoleAudio = updateBlackHoleAudio;
    global.playEatBotSound = playEatBotSound;
    global.playEatParticleSound = playEatParticleSound;
    global.playJellyEggBurstSound = playJellyEggBurstSound;
    global.playBloodRiftCastSound = playBloodRiftCastSound;
    global.playBloodRiftSiphonPulse = playBloodRiftSiphonPulse;
    global.playWarpBarrierCrossSound = playWarpBarrierCrossSound;
    global.playGlassEnterSound = playGlassEnterSound;
    global.playGlassExitSound = playGlassExitSound;
    global.playPhaseCageWallBleedSound = playPhaseCageWallBleedSound;
    global.playPhaseCageHuntLockSound = playPhaseCageHuntLockSound;
    global.playPhaseCageCaptureSound = playPhaseCageCaptureSound;
    global.updatePhaseCageHuntDrone = updatePhaseCageHuntDrone;
    global.releasePhaseCageHuntDrone = releasePhaseCageHuntDrone;
    global.playBountySound = playBountySound;
    global.playReadySound = playReadySound;
    global.playDamageSound = playDamageSound;
    global.playBountyLostSound = playBountyLostSound;
    global.playDeathSound = playDeathSound;
    global.playAbilitySound = playAbilitySound;
    global.playHoverSound = playHoverSound;
    global.playChatReceiveSound = playChatReceiveSound;
    global.playErrorSound = playErrorSound;
})(typeof window !== "undefined" ? window : globalThis);
