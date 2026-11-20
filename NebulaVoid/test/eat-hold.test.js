"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadScript(sandbox, rel) {
    const file = path.join(__dirname, "..", rel);
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: rel });
}

function makeSandbox(extras) {
    const sandbox = {
        console,
        Date,
        Math,
        Number,
        String,
        Boolean,
        Array,
        Object,
        Map,
        Set,
        JSON,
        Error,
        TypeError,
        parseInt,
        parseFloat,
        Infinity,
        NaN,
        performance: {
            now() {
                return sandbox._now;
            },
        },
        _now: 0,
    };
    Object.assign(sandbox, extras || {});
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    return sandbox;
}

describe("remote eat stays visible until the drawn cell arrives", () => {
    it("holds a dust mote, blocks a second collect, then removes it on the drawn cell", () => {
        const remotes = [
            { active: true, arenaOut: false, x: 0, y: 0, radius: 20, displayX: 0, displayY: 0, displayRadius: 20 },
        ];
        const sandbox = makeSandbox({
            __GAME_BOOT: {
                gameSettings: {
                    WORLD_SIZE: 4000,
                    MAX_PARTICLES: 4,
                    PARTICLE_SHADOW: false,
                    BH_PARTICLE_PULL_RANGE: 0,
                    BH_CORE_RADIUS: 1,
                    BH_PARTICLE_PULL_SPEED: 0,
                },
            },
            NebulaMpRemotes: {
                getRemotePlayers: () => remotes,
            },
        });
        loadScript(sandbox, "js/pool.js");
        loadScript(sandbox, "js/particle.js");
        const pool = [];
        for (let i = 0; i < 4; i++) pool.push(new sandbox.Particle());
        sandbox.NebulaDust.bind(() => pool);
        sandbox._now = 1000;
        sandbox.NebulaDust.begin(7);
        const mote = pool.find((p) => p.active && p.dustId);
        assert.ok(mote);
        const id = mote.dustId;
        remotes[0].displayX = mote.x + 400;
        remotes[0].displayY = mote.y;
        sandbox.NebulaDust.consumeRemote(id, 0);
        assert.equal(pool.some((p) => p.active && p.dustId === id), true);
        assert.equal(sandbox.NebulaDust.consumeLocal(id), false);
        remotes[0].displayX = mote.x;
        remotes[0].displayRadius = 30;
        sandbox._now = 1020;
        sandbox.NebulaDust.advance(sandbox._now);
        assert.equal(pool.some((p) => p.active && p.dustId === id), false);
    });

    it("drops a held mote when the drawn cell never arrives", () => {
        const sandbox = makeSandbox({
            __GAME_BOOT: {
                gameSettings: {
                    WORLD_SIZE: 4000,
                    MAX_PARTICLES: 2,
                    PARTICLE_SHADOW: false,
                    BH_PARTICLE_PULL_RANGE: 0,
                    BH_CORE_RADIUS: 1,
                    BH_PARTICLE_PULL_SPEED: 0,
                },
            },
            NebulaMpRemotes: { getRemotePlayers: () => [] },
        });
        loadScript(sandbox, "js/pool.js");
        loadScript(sandbox, "js/particle.js");
        const pool = [new sandbox.Particle(), new sandbox.Particle()];
        sandbox.NebulaDust.bind(() => pool);
        sandbox._now = 1000;
        sandbox.NebulaDust.begin(3);
        const mote = pool.find((p) => p.active && p.dustId);
        const id = mote.dustId;
        sandbox.NebulaDust.consumeRemote(id, 0);
        assert.equal(pool.some((p) => p.active && p.dustId === id), true);
        sandbox._now = 1000 + 200;
        sandbox.NebulaDust.advance(sandbox._now);
        assert.equal(pool.some((p) => p.active && p.dustId === id), false);
    });

    it("keeps a remote egg drawn until the cell covers it", () => {
        const remotes = [
            { active: true, arenaOut: false, x: 0, y: 0, radius: 20, displayX: -1000, displayY: -1000, displayRadius: 20 },
        ];
        const sandbox = makeSandbox({
            __GAME_BOOT: {
                gameSettings: {
                    WORLD_SIZE: 4000,
                    GLASS_VAULT_COUNT: 8,
                    GLASS_EGGS_PER: 2,
                    JELLY_EGG_SPAWN_RATE: 0.2,
                },
            },
            NebulaMpRemotes: { getRemotePlayers: () => remotes },
        });
        loadScript(sandbox, "js/glass-vault.js");
        sandbox._now = 10000;
        sandbox.NebulaGlass.begin(11);
        sandbox._now = 15000;
        let egg = null;
        sandbox.NebulaGlass.visitAlive((item) => {
            if (!egg) egg = item;
        });
        assert.ok(egg);
        sandbox.NebulaGlass.consumeRemote(egg.id, 1, "pOther");
        let stillAlive = false;
        sandbox.NebulaGlass.visitAlive((item) => {
            if (item.id === egg.id) stillAlive = true;
        });
        assert.equal(stillAlive, false);
        const arcs = [];
        const ctx = fakeCtx(arcs);
        sandbox.NebulaGlass.draw(ctx, egg.x, egg.y, 2000, sandbox._now);
        assert.ok(arcs.some((a) => Math.abs(a.x - egg.x) < 1 && Math.abs(a.y - egg.y) < 1));
        remotes[0].displayX = egg.x;
        remotes[0].displayY = egg.y;
        remotes[0].displayRadius = 40;
        arcs.length = 0;
        sandbox.NebulaGlass.draw(ctx, egg.x, egg.y, 2000, sandbox._now);
        assert.equal(
            arcs.some((a) => Math.abs(a.x - egg.x) < 1 && Math.abs(a.y - egg.y) < 1),
            false
        );
    });
});

function fakeCtx(arcs) {
    const gradient = { addColorStop() {} };
    return {
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        beginPath() {},
        arc(x, y, r) {
            arcs.push({ x: x, y: y, r: r });
        },
        fill() {},
        stroke() {},
        fillRect() {},
        strokeRect() {},
        createRadialGradient() {
            return gradient;
        },
        set fillStyle(_v) {},
        set strokeStyle(_v) {},
        set lineWidth(_v) {},
        set shadowBlur(_v) {},
        set shadowColor(_v) {},
        set globalAlpha(_v) {},
    };
}
