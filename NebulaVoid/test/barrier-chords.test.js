"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadScript(sandbox, rel) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", rel), "utf8"), sandbox, { filename: rel });
}

function makeSandbox(seed) {
    const sandbox = {
        console,
        Date,
        Math,
        Number,
        String,
        Boolean,
        Array,
        Object,
        Set,
        JSON,
        Error,
        parseInt,
        Infinity,
        NaN,
        performance: {
            now() {
                return sandbox._now;
            },
        },
        _now: 0,
        NebulaGameMode: { getRunMode: () => "mirror" },
        __GAME_BOOT: {
            entityTypes: {
                TITAN: { color: "#F5F5F5" },
                GLITCH: { color: "#00FF7F" },
                PULSAR: { color: "#FFFF00" },
                NECROMANCER: { color: "#32CD32" },
                GRAVITY_WELL: { color: "#8A2BE2" },
                ARCHITECT: { color: "#FFD700" },
                WORMHOLE: { color: "#FF4500" },
                CHRONOS: { color: "#00BFFF" },
                NEBULA: { color: "#4B0082" },
                MIMIC: { color: "#A9A9A9" },
            },
        },
        died: false,
        playerDeath() {
            sandbox.died = true;
        },
    };
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    loadScript(sandbox, "js/barrier-chords.js");
    sandbox._now = 0;
    sandbox.beginMirrorChords(seed);
    return sandbox;
}

function view() {
    return { left: 0, right: 4000, top: 0, bottom: 4000, cx: 2000, cy: 2000, reach: 2800 };
}

function capture(sandbox) {
    const lines = [];
    let current = null;
    let style = "#000";
    const ctx = {
        save() {},
        restore() {},
        beginPath() {
            current = null;
        },
        rect() {},
        clip() {},
        moveTo(x, y) {
            current = { x1: x, y1: y, x2: x, y2: y, color: "" };
        },
        lineTo(x, y) {
            if (!current) return;
            current.x2 = x;
            current.y2 = y;
        },
        stroke() {
            if (!current) return;
            current.color = style;
            lines.push(current);
            current = null;
        },
        fill() {},
        arc() {},
        set strokeStyle(v) {
            style = v;
        },
        set fillStyle(_v) {},
        set shadowColor(_v) {},
        set shadowBlur(_v) {},
        set lineWidth(_v) {},
        set lineCap(_v) {},
        set globalAlpha(_v) {},
    };
    sandbox.drawBarrierChords(ctx, sandbox._now, 0.016, false);
    return lines;
}

describe("shared mirror chords", () => {
    it("draws the same seeded line and intruder color on both clients", () => {
        const a = makeSandbox(99);
        const b = makeSandbox(99);
        a._now = 2100;
        b._now = 2100;
        const player = { x: 10, y: 10, radius: 20, glow: "#ff0000" };
        a.tickBarrierChords(0.016, player, [], null, 4000, view());
        b.tickBarrierChords(0.016, { x: 10, y: 10, radius: 20, glow: "#00ff00" }, [], null, 4000, view());
        const la = capture(a);
        const lb = capture(b);
        assert.ok(la.length > 0);
        assert.deepEqual(la, lb);
        assert.notEqual(la[0].color, "#ff0000");
        assert.notEqual(la[0].color, "#00ff00");
    });

    it("cuts only the local body", () => {
        const sandbox = makeSandbox(99);
        sandbox._now = 2100;
        const probe = { x: 10, y: 10, radius: 20, glow: "#fff" };
        sandbox.tickBarrierChords(0.016, probe, [], null, 4000, view());
        const line = capture(sandbox)[0];
        const player = {
            x: (line.x1 + line.x2) / 2,
            y: (line.y1 + line.y2) / 2,
            radius: 30,
            glow: "#fff",
        };
        const remote = {
            peerId: "pOther",
            active: true,
            x: player.x,
            y: player.y,
            radius: 40,
            displayX: player.x,
            displayY: player.y,
            displayRadius: 40,
            glow: "#00FF7F",
        };
        sandbox.NebulaMpRemotes = { getRemotePlayers: () => [remote] };
        sandbox.tickBarrierChords(0.016, player, [], null, 4000, view());
        assert.equal(player.radius, 29);
        assert.equal(remote.radius, 40);
        sandbox.tickBarrierChords(0.016, player, [], null, 4000, view());
        assert.equal(player.radius, 29);
    });
});
