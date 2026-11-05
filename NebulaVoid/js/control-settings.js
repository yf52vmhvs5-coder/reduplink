/**
 * NEBULA VOID — movement control scheme (mouse vs WASD) + options UI sync.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    const STORAGE_KEY =
        (boot && boot.meta && boot.meta.controlSchemeStorageKey) || "nebulaVoidControlScheme";
    const SCHEMES = new Set(["mouse", "wasd"]);

    const keys = { w: false, a: false, s: false, d: false };

    /** Exponential smoothing toward raw WASD direction (press vs release). */
    const WASD_SMOOTH_PRESS = 18;
    const WASD_SMOOTH_RELEASE = 12;
    const WASD_SMOOTH_EPS = 0.0015;

    let smoothX = 0;
    let smoothY = 0;

    function usesVectorAim() {
        return scheme === "wasd";
    }

    function readScheme() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return SCHEMES.has(raw) ? raw : "mouse";
        } catch (e) {
            return "mouse";
        }
    }

    let scheme = readScheme();

    function applyBodyClass() {
        if (!document.body) return;
        document.body.classList.remove("control-scheme-mouse", "control-scheme-wasd");
        document.body.classList.add(
            scheme === "wasd" ? "control-scheme-wasd" : "control-scheme-mouse"
        );
    }

    function syncControlSchemePickerUi() {
        document.querySelectorAll(".control-choice[data-scheme]").forEach((btn) => {
            const on = btn.dataset.scheme === scheme;
            btn.classList.toggle("control-choice--active", on);
            btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
        document.querySelectorAll(".options-control-hint[data-for]").forEach((el) => {
            const show = el.getAttribute("data-for") === scheme;
            el.hidden = !show;
        });
    }

    function setControlScheme(next) {
        if (!SCHEMES.has(next) || next === scheme) return;
        scheme = next;
        try {
            localStorage.setItem(STORAGE_KEY, scheme);
        } catch (e) {
            /* storage unavailable */
        }
        applyBodyClass();
        syncControlSchemePickerUi();
        if (next === "mouse") resetWasdInputSmoothing();
    }

    function getControlScheme() {
        return scheme;
    }

    function resetWasdInputSmoothing() {
        smoothX = 0;
        smoothY = 0;
    }

    function isMenuOverlayOpen() {
        const opt = document.getElementById("optionsScreen");
        const about = document.getElementById("aboutScreen");
        return (opt && !opt.hidden) || (about && !about.hidden);
    }

    function isWasdGameplayCaptureAllowed() {
        if (!document.body || !document.body.classList.contains("game-running")) return false;
        if (isMenuOverlayOpen()) return false;
        return true;
    }

    /** Clear held keys + smoothing (menus, overlays, run start). */
    function clearWasdKeysState() {
        keys.w = false;
        keys.a = false;
        keys.s = false;
        keys.d = false;
        resetWasdInputSmoothing();
    }

    function getWasdInputRaw() {
        let x = 0;
        let y = 0;
        if (keys.w) y -= 1;
        if (keys.s) y += 1;
        if (keys.a) x -= 1;
        if (keys.d) x += 1;
        const len = Math.hypot(x, y);
        if (len > 1e-6) {
            x /= len;
            y /= len;
        }
        return { x, y };
    }

    function getWasdInput() {
        return getWasdInputRaw();
    }

    function tickWasdInputSmoothing(dt) {
        if (!usesVectorAim()) return;
        const step = Math.max(0, Number(dt) || 0);
        if (step <= 0) return;

        const raw = getWasdInputRaw();
        const rawLen = Math.hypot(raw.x, raw.y);
        const k = rawLen > 1e-6 ? WASD_SMOOTH_PRESS : WASD_SMOOTH_RELEASE;
        const alpha = 1 - Math.exp(-k * step);

        smoothX += (raw.x - smoothX) * alpha;
        smoothY += (raw.y - smoothY) * alpha;

        const smoothLen = Math.hypot(smoothX, smoothY);
        if (smoothLen < WASD_SMOOTH_EPS && rawLen < 1e-6) {
            smoothX = 0;
            smoothY = 0;
        }
    }

    function getWasdInputSmoothed() {
        return { x: smoothX, y: smoothY };
    }

    function mapKeyCode(code) {
        if (code === "KeyW") return "w";
        if (code === "KeyA") return "a";
        if (code === "KeyS") return "s";
        if (code === "KeyD") return "d";
        return null;
    }

    function initControlSettings(optionsScreen) {
        applyBodyClass();
        syncControlSchemePickerUi();
        const picker = optionsScreen && optionsScreen.querySelector(".control-picker");
        if (!picker) return;
        picker.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-scheme]");
            if (!btn || !picker.contains(btn)) return;
            setControlScheme(btn.dataset.scheme);
            try {
                if (typeof global.playHoverSound === "function") global.playHoverSound();
            } catch (err) {
                /* ignore */
            }
        });
    }

    window.addEventListener("keydown", (e) => {
        if (e.repeat) return;
        const k = mapKeyCode(e.code);
        if (!k) return;
        if (!isWasdGameplayCaptureAllowed()) {
            keys[k] = false;
            return;
        }
        keys[k] = true;
    });

    window.addEventListener("keyup", (e) => {
        const k = mapKeyCode(e.code);
        if (k) keys[k] = false;
    });

    window.addEventListener("blur", () => {
        clearWasdKeysState();
    });

    global.getControlScheme = getControlScheme;
    global.setControlScheme = setControlScheme;
    global.getWasdInput = getWasdInput;
    global.getWasdInputSmoothed = getWasdInputSmoothed;
    global.tickWasdInputSmoothing = tickWasdInputSmoothing;
    global.resetWasdInputSmoothing = resetWasdInputSmoothing;
    global.clearWasdKeysState = clearWasdKeysState;
    global.usesVectorAim = usesVectorAim;
    global.syncControlSchemePickerUi = syncControlSchemePickerUi;
    global.initControlSettings = initControlSettings;
})(typeof window !== "undefined" ? window : globalThis);
