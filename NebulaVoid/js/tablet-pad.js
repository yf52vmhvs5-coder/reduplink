/**
 * NEBULA VOID — tablet pad. PC mouse and WASD stay as saved.
 * The stick writes the same aim vector WASD already uses.
 */
(function (global) {
    "use strict";

    const STICK_SIZE = 112;
    const STICK_DEAD = 0.12;

    let pointerId = null;
    let origin = null;
    let leaveStamp = 0;
    let abilityStamp = 0;

    function isTabletDevice() {
        const shortSide = Math.min(global.innerWidth, global.innerHeight);
        if (shortSide < 600) return false;
        const ua = global.navigator.userAgent || "";
        const iPad = /iPad/.test(ua) || (global.navigator.platform === "MacIntel" && global.navigator.maxTouchPoints > 1);
        const androidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
        if (iPad || androidTablet) return true;
        if (global.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
        const coarse = global.matchMedia("(pointer: coarse)").matches;
        const noHover = global.matchMedia("(hover: none)").matches;
        return (coarse || noHover) && global.navigator.maxTouchPoints > 0;
    }

    function tabletOn() {
        return document.documentElement.classList.contains("tablet-mode");
    }

    function abilityState() {
        if (typeof global.getTabletAbilityState !== "function") return null;
        return global.getTabletAbilityState();
    }

    function combatAlive() {
        if (!tabletOn()) return false;
        const state = abilityState();
        return !!(state && state.alive);
    }

    function mirrorLive() {
        return !!(
            global.NebulaGameMode &&
            typeof global.NebulaGameMode.getRunMode === "function" &&
            global.NebulaGameMode.getRunMode() === "mirror"
        );
    }

    function stickEl() {
        return document.getElementById("tabletStick");
    }

    function knobEl() {
        return document.getElementById("tabletStickKnob");
    }

    function hideStick() {
        pointerId = null;
        origin = null;
        if (typeof global.setTabletAim === "function") global.setTabletAim(0, 0, false);
        const el = stickEl();
        const knob = knobEl();
        if (knob) knob.style.transform = "";
        if (el) {
            el.classList.remove("is-shown");
            el.setAttribute("aria-hidden", "true");
        }
    }

    function syncViewportLock(on) {
        const viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) return;
        viewport.setAttribute(
            "content",
            on
                ? "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
                : "width=device-width, initial-scale=1, viewport-fit=cover"
        );
    }

    function syncFullscreenOffer() {
        const fs = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
        document.documentElement.classList.toggle("tablet-no-fullscreen", tabletOn() && !fs);
    }

    function syncOptionsCopy() {
        const padHint = document.querySelector(".options-control-hint--pad");
        if (padHint) padHint.hidden = !tabletOn();
    }

    function syncMode() {
        const on = isTabletDevice();
        const was = tabletOn();
        document.documentElement.classList.toggle("tablet-mode", on);
        if (document.body) document.body.classList.toggle("tablet-mode", on);
        if (was && !on) {
            hideStick();
            if (typeof global.resetWasdInputSmoothing === "function") global.resetWasdInputSmoothing();
        }
        syncViewportLock(on);
        syncFullscreenOffer();
        syncOptionsCopy();
        syncChrome();
    }

    function syncAbility() {
        const btn = document.getElementById("tabletAbilityBtn");
        const state = abilityState();
        if (!btn || !state) return;
        const accent = state.accent || "#d8d8d8";
        btn.style.setProperty("--tablet-ability", accent);
        document.documentElement.style.setProperty("--tablet-ability", accent);
    }

    function syncChrome() {
        const live = combatAlive();
        const pad = document.getElementById("tabletPad");
        const leave = document.getElementById("tabletLeaveBtn");
        if (pad) {
            pad.hidden = !live;
            pad.setAttribute("aria-hidden", live ? "false" : "true");
        }
        if (leave) leave.hidden = !(live && mirrorLive());
        if (!live) hideStick();
        syncAbility();
    }

    function showStickAt(clientX, clientY) {
        const el = stickEl();
        if (!el) return;
        el.classList.add("is-shown");
        el.setAttribute("aria-hidden", "false");
        const size = el.offsetWidth || STICK_SIZE;
        const half = size / 2;
        const x = Math.max(half, Math.min(global.innerWidth - half, clientX));
        const y = Math.max(half, Math.min(global.innerHeight - half, clientY));
        el.style.left = x - half + "px";
        el.style.top = y - half + "px";
        origin = { x: x, y: y };
        const knob = knobEl();
        if (knob) knob.style.transform = "";
    }

    function placeStick(e) {
        if (!origin) return;
        const el = stickEl();
        const knob = knobEl();
        if (!el || !knob) return;
        const max = el.offsetWidth / 2 - 18;
        let dx = e.clientX - origin.x;
        let dy = e.clientY - origin.y;
        const dist = Math.hypot(dx, dy);
        if (dist > max && max > 0) {
            dx = (dx / dist) * max;
            dy = (dy / dist) * max;
        }
        const nx = max > 0 ? dx / max : 0;
        const ny = max > 0 ? dy / max : 0;
        const mag = Math.hypot(nx, ny);
        if (typeof global.setTabletAim === "function") {
            if (mag < STICK_DEAD) global.setTabletAim(0, 0, true);
            else global.setTabletAim(nx, ny, true);
        }
        knob.style.transform = "translate(" + dx + "px," + dy + "px)";
    }

    function bindStick() {
        const canvas = document.getElementById("gameCanvas");
        if (!canvas) return;

        canvas.addEventListener("pointerdown", (e) => {
            if (!combatAlive() || pointerId != null) return;
            if (e.pointerType === "mouse") return;
            if (e.target !== canvas) return;
            e.preventDefault();
            pointerId = e.pointerId;
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
            if (typeof global.initAudio === "function") global.initAudio();
            showStickAt(e.clientX, e.clientY);
            placeStick(e);
        });

        canvas.addEventListener("pointermove", (e) => {
            if (e.pointerId !== pointerId) return;
            placeStick(e);
        });

        const endStick = (e) => {
            if (pointerId == null) return;
            if (e && e.pointerId !== pointerId) return;
            hideStick();
        };
        canvas.addEventListener("pointerup", endStick);
        canvas.addEventListener("pointercancel", endStick);
        canvas.addEventListener("contextmenu", (e) => {
            if (tabletOn()) e.preventDefault();
        });
    }

    function bindActions() {
        const ability = document.getElementById("tabletAbilityBtn");
        const leave = document.getElementById("tabletLeaveBtn");
        const pad = document.getElementById("tabletPad");

        const cast = (e) => {
            if (!combatAlive()) return;
            if (e.button != null && e.button !== 0) return;
            const now = performance.now();
            if (now - abilityStamp < 90) return;
            abilityStamp = now;
            e.preventDefault();
            e.stopPropagation();
            if (typeof global.initAudio === "function") global.initAudio();
            if (typeof global.triggerPlayerAbility === "function") global.triggerPlayerAbility();
            if (ability) {
                ability.classList.add("is-pressed");
                global.setTimeout(() => ability.classList.remove("is-pressed"), 140);
            }
            syncAbility();
        };

        const forfeit = (e) => {
            if (!combatAlive() || !mirrorLive()) return;
            const now = performance.now();
            if (now - leaveStamp < 200) return;
            leaveStamp = now;
            e.preventDefault();
            e.stopPropagation();
            hideStick();
            if (typeof global.tryMirrorEscapeToLobby === "function") global.tryMirrorEscapeToLobby();
            syncChrome();
        };

        if (ability) {
            ability.addEventListener("pointerdown", cast);
            ability.addEventListener("click", cast);
            ability.addEventListener("contextmenu", (e) => e.preventDefault());
        }
        if (leave) {
            leave.addEventListener("pointerdown", forfeit);
            leave.addEventListener("click", forfeit);
            leave.addEventListener("contextmenu", (e) => e.preventDefault());
        }
        if (pad) pad.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    function bindGuards() {
        const blockGesture = (e) => {
            if (tabletOn()) e.preventDefault();
        };
        document.addEventListener("gesturestart", blockGesture, { passive: false });
        document.addEventListener("gesturechange", blockGesture, { passive: false });
        document.addEventListener("touchmove", (e) => {
            if (!tabletOn() || !document.body.classList.contains("game-running")) return;
            const tag = e.target && e.target.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            e.preventDefault();
        }, { passive: false });

        global.addEventListener("blur", () => hideStick());
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) hideStick();
        });
        global.addEventListener("resize", syncMode);

        const vv = global.visualViewport;
        if (vv) {
            const applyKeyboard = () => {
                if (!tabletOn()) {
                    document.documentElement.style.removeProperty("--tablet-kb");
                    document.documentElement.classList.remove("tablet-keyboard");
                    return;
                }
                const inset = Math.max(0, global.innerHeight - vv.height - vv.offsetTop);
                document.documentElement.style.setProperty("--tablet-kb", inset.toFixed(0) + "px");
                document.documentElement.classList.toggle("tablet-keyboard", inset > 80);
            };
            vv.addEventListener("resize", applyKeyboard);
            vv.addEventListener("scroll", applyKeyboard);
        }

        document.addEventListener("focusin", (e) => {
            if (!tabletOn()) return;
            const target = e.target;
            if (!target || (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA")) return;
            global.setTimeout(() => {
                try { target.scrollIntoView({ block: "center" }); } catch (err) { /* ignore */ }
            }, 280);
        });
    }

    function tickTabletPad() {
        syncChrome();
    }

    function boot() {
        if (!document.body) return;
        syncMode();
        bindStick();
        bindActions();
        bindGuards();
        global.tickTabletPad = tickTabletPad;
    }

    boot();
})(typeof window !== "undefined" ? window : globalThis);
