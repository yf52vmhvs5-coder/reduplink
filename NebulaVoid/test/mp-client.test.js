"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadScript(sandbox, rel) {
    const file = path.join(__dirname, "..", rel);
    const code = fs.readFileSync(file, "utf8");
    vm.runInContext(code, sandbox, { filename: rel });
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
        JSON,
        Error,
        TypeError,
        parseInt,
        parseFloat,
        Infinity,
        NaN,
        setTimeout,
        clearTimeout,
        addEventListener() {},
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

function blankRemote(id) {
    return {
        peerId: id,
        active: false,
        x: 0,
        y: 0,
        radius: 20,
        displayX: 0,
        displayY: 0,
        displayRadius: 20,
        color: "#0a0a0a",
        glow: "#888888",
        entity: "",
        ability: "",
        cd: 0,
        cdMax: 0,
        arenaOut: false,
    };
}

describe("mp-session state send + remote apply", () => {
    function sessionEnv() {
        const remotes = new Map();
        const sent = [];
        const player = {
            x: 10.04,
            y: 20.06,
            radius: 22.129,
            color: "#0a0a0a",
            glow: "#ff66aa",
        };
        const sandbox = makeSandbox({
            NebulaMpRemotes: {
                getLocalPeerId: () => "pLocal",
                ensureRemotePeer(id) {
                    if (!remotes.has(id)) remotes.set(id, blankRemote(id));
                    return remotes.get(id);
                },
                getRemotePlayers: () => Array.from(remotes.values()),
            },
            NebulaMpMirror: {
                send(payload, opts) {
                    sent.push({ payload, opts });
                    return true;
                },
            },
        });
        loadScript(sandbox, "js/mp-session.js");
        sandbox.configureMpSession({
            getRunMode: () => "mirror",
            getGameActive: () => true,
            getLocalPeerId: () => "pLocal",
            getPlayer: () => player,
            getEntityName: () => "Ravenous",
            getAbilitySnapshot: () => ({ ability: "speed", cd: 1.234, cdMax: 8 }),
            getRemotePlayers: () => Array.from(remotes.values()),
            getMultiplayerConfig: () => ({
                stateSendIntervalMs: 16,
                remoteInterpSpeed: 32,
                remoteSnapDistancePx: 320,
                remoteExtrapMaxSec: 0.055,
            }),
        });
        sandbox.startMpNetworkTick();
        return { sandbox, player, sent, remotes };
    }

    it("sends a quantized full snapshot first, then a delta without appearance", () => {
        const { sandbox, player, sent } = sessionEnv();
        sandbox._now = 0;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 1);
        assert.equal(sent[0].opts.dropIfBuffered, true);
        assert.equal(sent[0].payload.x, 10);
        assert.equal(sent[0].payload.y, 20.1);
        assert.equal(sent[0].payload.radius, 22.13);
        assert.equal(sent[0].payload.glow, "#ff66aa");
        assert.equal(sent[0].payload.entity, "Ravenous");
        assert.equal(sent[0].payload.cd, 1.23);

        player.x = 40;
        player.y = 50;
        sandbox._now = 20;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 2);
        assert.equal(sent[1].payload.x, 40);
        assert.equal(sent[1].payload.y, 50);
        assert.equal(sent[1].payload.glow, undefined);
        assert.equal(sent[1].payload.color, undefined);
        assert.equal(sent[1].payload.entity, undefined);
        assert.equal(sent[1].payload.ability, "speed");
    });

    it("does not send while idle, then keepalive includes appearance", () => {
        const { sandbox, sent } = sessionEnv();
        sandbox._now = 0;
        sandbox.pushMirrorStateFromSim();
        sandbox._now = 20;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 1);
        sandbox._now = 300;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 2);
        assert.equal(sent[1].payload.glow, "#ff66aa");
        assert.equal(sent[1].payload.entity, "Ravenous");
    });

    it("forwards arena chat to the taunt handler and ignores it otherwise", () => {
        const { sandbox } = sessionEnv();
        const seen = [];
        sandbox.handleMpRelayMessage({ type: "chat", text: "CATCH ME", fromPeerId: "pOther" });
        assert.equal(seen.length, 0);
        sandbox.handleMpTauntMessage = function (msg) {
            seen.push(msg);
        };
        sandbox.handleMpRelayMessage({ type: "chat", text: "CATCH ME", fromPeerId: "pOther" });
        assert.equal(seen.length, 1);
        assert.equal(seen[0].text, "CATCH ME");
        assert.equal(seen[0].fromPeerId, "pOther");
    });

    it("does not advance last payload when send is dropped by backpressure", () => {
        const { sandbox, player, sent } = sessionEnv();
        let fail = false;
        sandbox.NebulaMpMirror.send = function (payload, opts) {
            if (fail) return false;
            sent.push({ payload, opts });
            return true;
        };
        sandbox._now = 0;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 1);
        player.x = 80;
        sandbox._now = 20;
        fail = true;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 1);
        fail = false;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 2);
        assert.equal(sent[1].payload.x, 80);
    });

    it("keeps glow across delta state and interpolates at the existing speed", () => {
        const { sandbox, remotes } = sessionEnv();
        sandbox.handleMpRelayMessage({
            type: "state",
            fromPeerId: "pOther",
            t: 1000,
            x: 0,
            y: 0,
            radius: 20,
            glow: "#ff66aa",
            entity: "Ravenous",
        });
        const rp = remotes.get("pOther");
        assert.equal(rp.glow, "#ff66aa");
        assert.equal(rp.displayX, 0);
        sandbox._now = 16;
        sandbox.handleMpRelayMessage({
            type: "state",
            fromPeerId: "pOther",
            t: 1016,
            x: 100,
            y: 0,
            radius: 20,
        });
        assert.equal(rp.glow, "#ff66aa");
        assert.equal(rp.entity, "Ravenous");
        assert.equal(rp.x, 100);
        assert.equal(rp.displayX, 0);
        sandbox.tickRemoteDisplayInterpolation(0.016);
        assert.ok(Math.abs(rp.displayX - 51.2) < 0.05, `displayX ${rp.displayX}`);
    });

    it("forces a full snapshot when glow changes without moving", () => {
        const { sandbox, player, sent } = sessionEnv();
        sandbox._now = 0;
        sandbox.pushMirrorStateFromSim();
        player.glow = "#00ffcc";
        sandbox._now = 20;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 2);
        assert.equal(sent[1].payload.glow, "#00ffcc");
        assert.equal(sent[1].payload.entity, "Ravenous");
        assert.equal(sent[1].payload.x, 10);
    });

    it("snaps display on a large jump using the existing snap distance", () => {
        const { sandbox, remotes } = sessionEnv();
        sandbox.handleMpRelayMessage({
            type: "state",
            fromPeerId: "pOther",
            t: 1,
            x: 0,
            y: 0,
            radius: 20,
        });
        sandbox.handleMpRelayMessage({
            type: "state",
            fromPeerId: "pOther",
            t: 20,
            x: 400,
            y: 0,
            radius: 20,
        });
        const rp = remotes.get("pOther");
        assert.equal(rp.displayX, 400);
        assert.equal(rp.netVelX, 0);
    });

    it("ignores non-finite pose and self snapshots", () => {
        const { sandbox, remotes } = sessionEnv();
        sandbox.handleMpRelayMessage({
            type: "state",
            fromPeerId: "pOther",
            t: 1,
            x: 15,
            y: 25,
            radius: 20,
        });
        const rp = remotes.get("pOther");
        sandbox.handleMpRelayMessage({
            type: "state",
            fromPeerId: "pOther",
            t: 2,
            x: Infinity,
            y: 99,
            radius: 0,
        });
        assert.equal(rp.x, 15);
        assert.equal(rp.y, 99);
        assert.equal(rp.radius, 20);
        sandbox.handleMpRelayMessage({
            type: "state",
            fromPeerId: "pLocal",
            t: 3,
            x: 500,
            y: 500,
            radius: 40,
        });
        assert.equal(remotes.has("pLocal"), false);
    });

    it("does not apply state snapshots outside a mirror run", () => {
        const remotes = new Map();
        const sandbox = makeSandbox({
            NebulaMpRemotes: {
                getLocalPeerId: () => "pLocal",
                ensureRemotePeer(id) {
                    if (!remotes.has(id)) remotes.set(id, blankRemote(id));
                    return remotes.get(id);
                },
                getRemotePlayers: () => Array.from(remotes.values()),
            },
            NebulaMpMirror: {
                send() {
                    return true;
                },
            },
        });
        loadScript(sandbox, "js/mp-session.js");
        sandbox.configureMpSession({
            getRunMode: () => "single",
            getGameActive: () => true,
            getLocalPeerId: () => "pLocal",
            getPlayer: () => ({ x: 0, y: 0, radius: 20, color: "#0a0a0a", glow: "#fff" }),
            getRemotePlayers: () => Array.from(remotes.values()),
        });
        sandbox.handleMpRelayMessage({
            type: "state",
            fromPeerId: "pOther",
            t: 1,
            x: 50,
            y: 60,
            radius: 22,
            glow: "#ff00ff",
        });
        assert.equal(remotes.size, 0);
    });

    it("sends a stop packet when halting and decays stale extrapolation smoothly", () => {
        const { sandbox, player, sent, remotes } = sessionEnv();
        sandbox._now = 0;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 1);
        assert.equal(sent[0].payload.vx, 0);

        player.x = 14;
        sandbox._now = 20;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 2);
        assert.ok(sent[1].payload.vx > 0);

        // Player stops at x = 14: one stop packet with vx = 0 is sent, then silence
        sandbox._now = 40;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 3);
        assert.equal(sent[2].payload.vx, 0);
        assert.equal(sent[2].payload.vy, 0);

        sandbox._now = 60;
        sandbox.pushMirrorStateFromSim();
        assert.equal(sent.length, 3);

        // Remote side: explicit stop velocity zeroes extrapolation immediately
        sandbox.handleMpRelayMessage({
            type: "state",
            fromPeerId: "pOther",
            t: 1000,
            x: 100,
            y: 100,
            vx: 200,
            vy: 0,
            radius: 20,
        });
        const rp = remotes.get("pOther");
        sandbox._now = 76;
        sandbox.handleMpRelayMessage({
            type: "state",
            fromPeerId: "pOther",
            t: 1016,
            x: 103.2,
            y: 100,
            vx: 200,
            vy: 0,
            radius: 20,
        });
        assert.equal(rp.netVelX, 200);

        // When packets stall well past remoteExtrapMaxSec (55ms), extrapolation decays back to rp.x
        sandbox._now = 76 + 200;
        sandbox.tickRemoteDisplayInterpolation(0.02);
        sandbox.tickRemoteDisplayInterpolation(0.02);
        sandbox.tickRemoteDisplayInterpolation(0.02);
        assert.ok(Math.abs(rp.displayX - 103.2) < 1.5, `stalled displayX ${rp.displayX}`);
    });
});

describe("mirror-match eat relay", () => {
    it("consumes batched and legacy dust/egg packets", () => {
        const dust = [];
        const eggs = [];
        const sandbox = makeSandbox({
            NebulaGameMode: { getRunMode: () => "mirror" },
            NebulaDust: {
                consumeRemote(id, s) {
                    dust.push({ id, s });
                },
            },
            NebulaGlass: {
                consumeRemote(id, s, peer) {
                    eggs.push({ id, s, peer });
                },
            },
        });
        loadScript(sandbox, "js/mirror-match.js");
        sandbox.onRemoteDust({ type: "dust", eats: [{ id: 2, s: 0.5 }, { id: 3, s: 1 }] });
        sandbox.onRemoteDust({ type: "dust", id: 9, s: 2 });
        sandbox.onRemoteGlass({
            type: "egg",
            eats: [{ id: 4, s: 1.2 }],
            fromPeerId: "pOther",
        });
        sandbox.onRemoteGlass({ type: "egg", id: 8, s: 0.25, fromPeerId: "pOther" });
        assert.deepEqual(dust, [
            { id: 2, s: 0.5 },
            { id: 3, s: 1 },
            { id: 9, s: 2 },
        ]);
        assert.deepEqual(eggs, [
            { id: 4, s: 1.2, peer: "pOther" },
            { id: 8, s: 0.25, peer: "pOther" },
        ]);
    });

    it("grows once per victim and ignores an ack from anyone else", () => {
        const remotes = new Map();
        const sent = [];
        const overlays = [];
        let gameActive = false;
        let runMode = "single";
        const player = { x: 100, y: 100, radius: 40, glow: "#fff", color: "#0a0a0a", cooldown: 0 };
        const settings = {
            WORLD_SIZE: 4000,
            START_RADIUS: 20,
            MAX_PLAYER_RADIUS: 60,
            BOT_EAT_THRESHOLD: 1.1,
            BOT_CONTACT_DRAIN: 24,
            GROW_FROM_BOT: 0.11,
            PLAYER_DEATH_DIST_FACTOR: 0.25,
        };
        function blank(id) {
            return {
                peerId: id,
                active: false,
                arenaOut: false,
                x: 0,
                y: 0,
                displayX: 0,
                displayY: 0,
                radius: 20,
                displayRadius: 20,
                entity: "",
                ability: "",
                cd: 0,
                cdMax: 0,
                cdAt: 0,
            };
        }
        const sandbox = makeSandbox({
            document: {
                activeElement: null,
                body: { classList: { add() {}, remove() {} } },
            },
            NebulaGameMode: {
                getRunMode: () => runMode,
                setRunMode(mode) {
                    runMode = mode;
                },
                resetRunMode() {
                    runMode = "single";
                },
            },
            NebulaMpMirror: {
                send(payload) {
                    sent.push(payload);
                    return true;
                },
            },
            NebulaMpRemotes: {
                ensureRemotePeer(id) {
                    if (!remotes.has(id)) remotes.set(id, blank(id));
                    return remotes.get(id);
                },
                clearRemotePeers() {
                    remotes.clear();
                },
                deactivateRemotePeer(id) {
                    const rp = remotes.get(id);
                    if (!rp) return;
                    rp.active = false;
                    rp.arenaOut = true;
                    rp.radius = 0;
                    rp.displayRadius = 0;
                },
            },
        });
        loadScript(sandbox, "js/mirror-match.js");
        sandbox.configureMirrorMatch({
            getPlayer: () => player,
            getGameSettings: () => settings,
            getGameActive: () => gameActive,
            getIsDying: () => false,
            setGameActive(v) {
                gameActive = v;
            },
            setIsDying() {},
            getLocalPeerId: () => "me",
            getRemotePlayer(id) {
                if (!id) return remotes.values().next().value || null;
                return remotes.get(id) || null;
            },
            getRemotePlayers: () => Array.from(remotes.values()),
            getRoundStartTime: () => 0,
            getActiveRunSkinName: () => "THE RAVENOUS",
            hideMenuOverlay() {},
            hideGameOverOverlay() {},
            showMenuOverlay() {},
            initAudio() {},
            resetRunState() {},
            setCameraPosition() {},
            setActiveRunSkinName() {},
            setSelectedAbility() {},
            initJellyBubbles() {},
            ensureDrawLoop() {},
            showMirrorMatchOverlay(view) {
                overlays.push(view && view.title);
            },
            getMultiplayerLobbyState: () => ({
                peerOrder: ["me", "pB", "pC"],
                isHost: true,
            }),
            dom: {},
        });
        sandbox._now = 1000;
        sandbox.requestStartMirrorMatch({
            isHost: true,
            skin: { name: "THE RAVENOUS", color: "#ff0000", ability: "vampire", unlocked: true },
            dustSeed: 1,
        });
        assert.equal(gameActive, true);

        sandbox.onRemoteMatchEnd({
            type: "matchEnd",
            fromPeerId: "pB",
            winnerPeerId: "pB",
            winnerCallsign: "GUEST",
            entity: "Guest",
        });
        assert.equal(gameActive, true);
        assert.equal(overlays.length, 0);

        function place(id) {
            const rp = remotes.get(id);
            rp.active = true;
            rp.arenaOut = false;
            rp.x = player.x;
            rp.y = player.y;
            rp.displayX = player.x;
            rp.displayY = player.y;
            rp.radius = 20;
            rp.displayRadius = 20;
            return rp;
        }
        place("pB");
        sandbox.tickMirrorPlayerContact(0.016);
        const claimB = sent.filter((msg) => msg.type === "claimHit").pop();
        assert.equal(claimB.targetPeerId, "pB");
        const before = player.radius;
        sandbox.onRemoteHitAck({
            type: "hitAck",
            t: claimB.t,
            kind: "kill",
            fromPeerId: "pEvil",
            targetPeerId: "pB",
            eatenRadius: 20,
            amount: 0,
        });
        assert.equal(player.radius, before);
        sandbox.onRemoteHitAck({
            type: "hitAck",
            t: claimB.t,
            kind: "kill",
            fromPeerId: "pB",
            targetPeerId: "pC",
            eatenRadius: 20,
            amount: 0,
        });
        assert.ok(Math.abs(player.radius - (before + 20 * settings.GROW_FROM_BOT)) < 1e-6);
        assert.equal(remotes.get("pB").arenaOut, true);
        assert.equal(remotes.get("pC").arenaOut, false);

        sandbox._now = 1300;
        place("pC");
        sandbox.tickMirrorPlayerContact(0.016);
        const claimC = sent.filter((msg) => msg.type === "claimHit").pop();
        assert.equal(claimC.targetPeerId, "pC");
        const mid = player.radius;
        sandbox.onRemoteHitAck({
            type: "hitAck",
            t: claimC.t,
            kind: "kill",
            fromPeerId: "pC",
            eatenRadius: 20,
            amount: 0,
        });
        assert.ok(Math.abs(player.radius - (mid + 20 * settings.GROW_FROM_BOT)) < 1e-6);
        assert.equal(overlays.length, 1);
    });

    it("ignores matchStart when this client is not in peerOrder", () => {
        let gameActive = false;
        let runMode = "single";
        const player = { x: 100, y: 100, radius: 20, glow: "#fff", color: "#0a0a0a", cooldown: 0 };
        const sandbox = makeSandbox({
            document: {
                activeElement: null,
                body: { classList: { add() {}, remove() {} } },
            },
            NebulaGameMode: {
                getRunMode: () => runMode,
                setRunMode(mode) {
                    runMode = mode;
                },
                resetRunMode() {
                    runMode = "single";
                },
            },
            NebulaMpMirror: {
                send() {
                    return true;
                },
            },
            NebulaMpRemotes: {
                ensureRemotePeer() {
                    return null;
                },
                clearRemotePeers() {},
            },
        });
        loadScript(sandbox, "js/mirror-match.js");
        sandbox.configureMirrorMatch({
            getPlayer: () => player,
            getGameSettings: () => ({
                WORLD_SIZE: 4000,
                START_RADIUS: 20,
                MAX_PLAYER_RADIUS: 60,
            }),
            getGameActive: () => gameActive,
            getIsDying: () => false,
            setGameActive(v) {
                gameActive = v;
            },
            setIsDying() {},
            getLocalPeerId: () => "me",
            getRemotePlayer: () => null,
            getRemotePlayers: () => [],
            getRoundStartTime: () => 0,
            getActiveRunSkinName: () => "THE RAVENOUS",
            hideMenuOverlay() {},
            hideGameOverOverlay() {},
            showMenuOverlay() {},
            initAudio() {},
            resetRunState() {},
            setCameraPosition() {},
            setActiveRunSkinName() {},
            setSelectedAbility() {},
            initJellyBubbles() {},
            ensureDrawLoop() {},
            getMultiplayerLobbyState: () => ({
                skin: { name: "THE RAVENOUS", color: "#ff0000", ability: "vampire", unlocked: true },
                peerOrder: ["me"],
                isHost: false,
            }),
            dom: {},
        });
        sandbox.onRemoteMatchStart({
            type: "matchStart",
            peerOrder: ["pB", "pC"],
            dustSeed: 1,
        });
        assert.equal(gameActive, false);
        assert.equal(runMode, "single");
        sandbox.onRemoteMatchStart({
            type: "matchStart",
            peerOrder: ["me", "pB"],
            dustSeed: 1,
        });
        assert.equal(gameActive, true);
        assert.equal(runMode, "mirror");
    });

    it("closes the round for remaining peers when the last opponent leaves", () => {
        const remotes = new Map();
        const sent = [];
        let gameActive = false;
        let runMode = "single";
        const player = { x: 100, y: 100, radius: 40, glow: "#fff", color: "#0a0a0a", cooldown: 0 };
        function blank(id) {
            return {
                peerId: id,
                active: true,
                arenaOut: false,
                x: 0,
                y: 0,
                displayX: 0,
                displayY: 0,
                radius: 20,
                displayRadius: 20,
                entity: "",
                ability: "",
                cd: 0,
                cdMax: 0,
                cdAt: 0,
            };
        }
        const sandbox = makeSandbox({
            document: {
                activeElement: null,
                body: { classList: { add() {}, remove() {} } },
            },
            NebulaGameMode: {
                getRunMode: () => runMode,
                setRunMode(mode) {
                    runMode = mode;
                },
                resetRunMode() {
                    runMode = "single";
                },
            },
            NebulaMpMirror: {
                send(payload) {
                    sent.push(payload);
                    return true;
                },
            },
            NebulaMpRemotes: {
                ensureRemotePeer(id) {
                    if (!remotes.has(id)) remotes.set(id, blank(id));
                    return remotes.get(id);
                },
                clearRemotePeers() {
                    remotes.clear();
                },
                deactivateRemotePeer(id) {
                    const rp = remotes.get(id);
                    if (!rp) return;
                    rp.active = false;
                    rp.arenaOut = true;
                    rp.radius = 0;
                    rp.displayRadius = 0;
                },
            },
        });
        loadScript(sandbox, "js/mirror-match.js");
        sandbox.configureMirrorMatch({
            getPlayer: () => player,
            getGameSettings: () => ({
                WORLD_SIZE: 4000,
                START_RADIUS: 20,
                MAX_PLAYER_RADIUS: 60,
                BOT_EAT_THRESHOLD: 1.1,
                BOT_CONTACT_DRAIN: 24,
                GROW_FROM_BOT: 0.11,
                PLAYER_DEATH_DIST_FACTOR: 0.25,
            }),
            getGameActive: () => gameActive,
            getIsDying: () => false,
            setGameActive(v) {
                gameActive = v;
            },
            setIsDying() {},
            getLocalPeerId: () => "me",
            getRemotePlayer(id) {
                return remotes.get(id) || null;
            },
            getRemotePlayers: () => Array.from(remotes.values()),
            getRoundStartTime: () => 0,
            getActiveRunSkinName: () => "THE RAVENOUS",
            hideMenuOverlay() {},
            hideGameOverOverlay() {},
            showMenuOverlay() {},
            initAudio() {},
            resetRunState() {},
            setCameraPosition() {},
            setActiveRunSkinName() {},
            setSelectedAbility() {},
            initJellyBubbles() {},
            ensureDrawLoop() {},
            showMirrorMatchOverlay() {},
            getMultiplayerLobbyState: () => ({
                peerOrder: ["me", "pB"],
                isHost: true,
            }),
            dom: {},
        });
        sandbox.requestStartMirrorMatch({
            isHost: true,
            skin: { name: "THE RAVENOUS", color: "#ff0000", ability: "vampire", unlocked: true },
            dustSeed: 1,
        });
        remotes.get("pB").active = true;
        remotes.get("pB").arenaOut = false;
        sandbox.noteMirrorOpponentLeft({ peerId: "pB" });
        const end = sent.filter((msg) => msg.type === "matchEnd").pop();
        assert.ok(end);
        assert.equal(end.winnerCallsign, "VOID");
        assert.equal(end.winnerPeerId, "");
        assert.equal(gameActive, false);
    });
});

describe("mirror base abilities", () => {
    const ABILITY = {
        VAMPIRE_RIFT_RADIUS: 110,
        VAMPIRE_RIFT_LIFE: 3.75,
        VAMPIRE_DAMAGE_BOTS: 6.4,
        WARP_PULSE_EXPANSION: 1000,
        WARP_PULSE_MAX: 350,
        WARP_FREEZE_DURATION: 0.75,
        SPEED_DASH_DURATION: 0.31,
    };

    function abilityEnv() {
        const sent = [];
        const remotes = [
            {
                peerId: "opp",
                active: true,
                arenaOut: false,
                x: 0,
                y: 0,
                displayX: 0,
                displayY: 0,
                radius: 20,
                displayRadius: 20,
                color: "#0a0a0a",
                glow: "#39ff14",
            },
        ];
        const player = { x: 0, y: 0, radius: 30, color: "#0a0a0a", glow: "#ff0000" };
        const effects = { shriekPulse: 0, dashTime: 0 };
        let died = false;
        let attacker = "";
        const sandbox = makeSandbox({
            NebulaGameMode: { getRunMode: () => "mirror" },
            NebulaMpMirror: {
                send(payload) {
                    sent.push(payload);
                    return true;
                },
            },
            noteMirrorAttacker(id) {
                attacker = id;
            },
            playerDeath() {
                died = true;
            },
        });
        loadScript(sandbox, "js/mp-abilities.js");
        sandbox.configureMirrorAbilities({
            getPlayer: () => player,
            getActiveEffects: () => effects,
            getAbilitySettings: () => ABILITY,
            getGameSettings: () => ({ MAX_PLAYER_RADIUS: 60 }),
            getRemotePlayers: () => remotes,
            getLocalPeerId: () => "me",
            getGameActive: () => true,
            getIsDying: () => false,
        });
        return { sandbox, sent, remotes, player, effects, died: () => died, attacker: () => attacker };
    }

    function cast(sandbox, seq, kind, x, y) {
        sandbox.onRemoteAbilityCast({
            type: "cast",
            kind,
            t: sandbox._now,
            x,
            y,
            seq,
            fromPeerId: "opp",
        });
    }

    it("drains a cell inside a rift and confirms half of that to the caster", () => {
        const env = abilityEnv();
        const { sandbox, player, sent } = env;
        sandbox._now = 1000;
        cast(sandbox, 1, "vampire", 0, 0);
        sandbox.tickMirrorAbilities(0.1);
        assert.ok(Math.abs(player.radius - (30 - 0.64)) < 1e-6);
        assert.equal(sent.length, 1);
        assert.equal(sent[0].type, "riftAck");
        assert.equal(sent[0].ownerPeerId, "opp");
        assert.equal(sent[0].amount, 0.64);

        const caster = abilityEnv();
        caster.sandbox._now = 1000;
        caster.sandbox.notifyMirrorAbilityCast("vampire", 0, 0);
        caster.player.radius = 30;
        caster.sandbox.onRemoteRiftAck({
            type: "riftAck",
            t: 1000,
            amount: 0.64,
            ownerPeerId: "me",
            fromPeerId: "opp",
        });
        assert.ok(Math.abs(caster.player.radius - 30.32) < 1e-6);
    });

    it("stacks two rifts, ignores a duplicate cast, and skips cells outside", () => {
        const env = abilityEnv();
        const { sandbox, player, sent } = env;
        sandbox._now = 500;
        cast(sandbox, 1, "vampire", 0, 0);
        cast(sandbox, 1, "vampire", 0, 0);
        cast(sandbox, 2, "vampire", 0, 0);
        sandbox.tickMirrorAbilities(0.1);
        assert.ok(Math.abs(player.radius - (30 - 1.28)) < 1e-6);
        assert.equal(sent[0].amount, 1.28);

        player.x = 500;
        player.y = 500;
        player.radius = 30;
        sent.length = 0;
        sandbox._now = 700;
        sandbox.tickMirrorAbilities(0.1);
        assert.equal(player.radius, 30);
        assert.equal(sent.length, 0);
    });

    it("drops an ack from across the map and caps a padded one", () => {
        const env = abilityEnv();
        const { sandbox, player, remotes } = env;
        sandbox._now = 2000;
        sandbox.notifyMirrorAbilityCast("vampire", 0, 0);
        remotes[0].displayX = 2000;
        remotes[0].displayY = 2000;
        sandbox.onRemoteRiftAck({
            type: "riftAck",
            amount: 10,
            ownerPeerId: "me",
            fromPeerId: "opp",
        });
        assert.equal(player.radius, 30);

        remotes[0].displayX = 0;
        remotes[0].displayY = 0;
        sandbox.onRemoteRiftAck({
            type: "riftAck",
            amount: 20,
            ownerPeerId: "me",
            fromPeerId: "opp",
        });
        const padded = player.radius - 30;
        assert.ok(padded > 0.8 && padded < 1);
        sandbox._now = 2010;
        const before = player.radius;
        sandbox.onRemoteRiftAck({
            type: "riftAck",
            amount: 20,
            ownerPeerId: "me",
            fromPeerId: "opp",
        });
        const again = player.radius - before;
        assert.ok(again > 0.3 && again < 0.4);
    });

    it("kills below radius 5 and names the rift owner", () => {
        const env = abilityEnv();
        const { sandbox, player } = env;
        sandbox._now = 1000;
        cast(sandbox, 1, "vampire", 0, 0);
        player.radius = 4.9;
        sandbox.tickMirrorAbilities(0.05);
        assert.equal(env.died(), true);
        assert.equal(env.attacker(), "opp");
        assert.ok(player.radius < 5);
    });

    it("expires a rift on the clock instead of stretching it", () => {
        const env = abilityEnv();
        const { sandbox, player } = env;
        sandbox._now = 1000;
        cast(sandbox, 1, "vampire", 0, 0);
        sandbox._now = 1000 + 3750;
        player.radius = 30;
        sandbox.tickMirrorAbilities(0.1);
        assert.equal(player.radius, 30);
    });

    it("freezes a cell inside a shriek and leaves a dash ghost", () => {
        const env = abilityEnv();
        const { sandbox, player, effects } = env;
        sandbox._now = 5000;
        cast(sandbox, 1, "warp", 0, 0);
        sandbox.tickMirrorAbilities(0.016);
        assert.ok(player.mirrorFreezeUntil > sandbox._now);
        assert.equal(sandbox.mirrorPeerFrozen("opp"), false);

        effects.shriekPulse = 80;
        sandbox.tickMirrorAbilities(0.016);
        assert.equal(sandbox.mirrorPeerFrozen("opp"), true);

        sandbox._now = 8000;
        cast(sandbox, 2, "speed", 0, 0);
        sandbox.tickMirrorAbilities(0.08);
        const arcs = [];
        const ctx = {
            save() {},
            restore() {},
            beginPath() {},
            arc(x, y, r) {
                arcs.push({ x, y, r });
            },
            fill() {},
            stroke() {},
            set fillStyle(_v) {},
            set strokeStyle(_v) {},
            set lineWidth(_v) {},
            set shadowBlur(_v) {},
            set shadowColor(_v) {},
            set globalAlpha(_v) {},
        };
        sandbox.drawMirrorAbilityFx(ctx, sandbox._now, "ghost");
        assert.equal(arcs.length, 3);
        assert.equal(arcs[0].x, 0);
        assert.ok(Math.abs(arcs[0].r - 20 * 0.92) < 1e-6);
    });

    it("routes cast through the session handler", () => {
        const env = abilityEnv();
        loadScript(env.sandbox, "js/mp-session.js");
        env.sandbox._now = 100;
        env.sandbox.handleMpRelayMessage({
            type: "cast",
            kind: "vampire",
            t: 100,
            x: 0,
            y: 0,
            seq: 4,
            fromPeerId: "opp",
        });
        env.player.radius = 30;
        env.sandbox.tickMirrorAbilities(0.1);
        assert.ok(env.player.radius < 30);
    });
});

describe("mp-taunts proximity pings", () => {
    function tauntEnv() {
        const sent = [];
        const remotes = [
            Object.assign(blankRemote("pOther"), {
                active: true,
                x: 80,
                y: 0,
                displayX: 80,
                displayY: 0,
                radius: 20,
                displayRadius: 20,
                glow: "#ff66aa",
            }),
        ];
        const player = { x: 0, y: 0, radius: 20, glow: "#39ff14", cooldown: 0 };
        const effects = { dashTime: 0 };
        const sandbox = makeSandbox({
            document: {
                body: { classList: { contains: () => true } },
                getElementById: () => null,
            },
            NebulaMpMirror: {
                send(payload) {
                    sent.push(payload);
                    return true;
                },
            },
            NebulaGameMode: { getRunMode: () => "mirror" },
        });
        loadScript(sandbox, "js/mp-taunts.js");
        sandbox.configureMpTaunts({
            getPlayer: () => player,
            getRemotePlayers: () => remotes,
            getLocalPeerId: () => "pLocal",
            getGameActive: () => true,
            getIsDying: () => false,
            getRunMode: () => "mirror",
            isOutOfArena: () => false,
            getActiveEffects: () => effects,
            getGameSettings: () => ({
                WORLD_SIZE: 4000,
                START_RADIUS: 20,
                MAX_PLAYER_RADIUS: 60,
                BOT_EAT_THRESHOLD: 1.1,
                BH_PULL_RANGE: 400,
            }),
        });
        return { sandbox, player, remotes, sent, effects };
    }

    it("accepts only whitelist lines", () => {
        const { sandbox } = tauntEnv();
        assert.equal(sandbox.isMpTauntLine("CATCH ME"), true);
        assert.equal(sandbox.isMpTauntLine("  LOSER  "), true);
        assert.equal(sandbox.isMpTauntLine("  loser  "), false);
        assert.equal(sandbox.isMpTauntLine("buy coins"), false);
        assert.equal(sandbox.isMpTauntLine("LOSER"), true);
    });

    it("sends a whitelist line only when a peer is in range", () => {
        const { sandbox, player, remotes, sent } = tauntEnv();
        sandbox._now = 1000;
        assert.equal(sandbox.mpTauntPeerInRange(player, remotes), true);
        assert.equal(sandbox.trySendMpTaunt(), true);
        assert.equal(sent.length, 1);
        assert.equal(sent[0].type, "chat");
        assert.equal(sandbox.isMpTauntLine(sent[0].text), true);
        assert.equal(sandbox.getMpTauntBubbles().length, 1);

        remotes[0].x = 3000;
        remotes[0].displayX = 3000;
        sandbox._now = 4000;
        assert.equal(sandbox.mpTauntPeerInRange(player, remotes), false);
        assert.equal(sandbox.trySendMpTaunt(), false);
        assert.equal(sent.length, 1);
    });

    it("blocks a second send until cooldown elapses", () => {
        const { sandbox, sent } = tauntEnv();
        sandbox._now = 0;
        assert.equal(sandbox.trySendMpTaunt(), true);
        sandbox._now = 500;
        assert.equal(sandbox.trySendMpTaunt(), false);
        sandbox._now = 2300;
        assert.equal(sandbox.trySendMpTaunt(), true);
        assert.equal(sent.length, 2);
        assert.notEqual(sent[0].text, sent[1].text);
        for (let i = 2; i < 10; i++) {
            sandbox._now = 2300 + i * 2300;
            assert.equal(sandbox.trySendMpTaunt(), true);
        }
        assert.equal(sent.length, 10);
        const seen = new Set(sent.map((p) => p.text));
        assert.equal(seen.size, 10);
    });

    it("shows a remote whitelist bubble and ignores junk or self echo", () => {
        const { sandbox } = tauntEnv();
        sandbox._now = 50;
        assert.equal(
            sandbox.handleMpTauntMessage({
                type: "chat",
                text: "CATCH ME",
                fromPeerId: "pOther",
                t: 1,
            }),
            true
        );
        assert.equal(sandbox.getMpTauntBubbles().length, 1);
        assert.equal(
            sandbox.handleMpTauntMessage({
                type: "chat",
                text: "hello lobby",
                fromPeerId: "pOther",
                t: 2,
            }),
            false
        );
        assert.equal(sandbox.getMpTauntBubbles().length, 1);
        assert.equal(
            sandbox.handleMpTauntMessage({
                type: "chat",
                text: "LOSER",
                fromPeerId: "pLocal",
                t: 3,
            }),
            false
        );
        assert.equal(sandbox.getMpTauntBubbles().length, 1);
    });

    it("picks an eat line when the nearest cell is prey", () => {
        const { sandbox, player, remotes, sent } = tauntEnv();
        player.radius = 40;
        remotes[0].radius = 20;
        remotes[0].displayRadius = 20;
        assert.equal(sandbox.readMpTauntMood(), "eat");
        sandbox._now = 50;
        assert.equal(sandbox.trySendMpTaunt(), true);
        const eat = new Set([
            "YOU'RE THE SNACK",
            "THIS IS OVER",
            "OPEN WIDE",
            "NO ESCAPE",
            "I'LL MAKE IT QUICK",
            "STAY RIGHT THERE",
        ]);
        assert.equal(eat.has(sent[0].text), true);
    });

    it("picks a hunted line when the nearest cell can devour you", () => {
        const { sandbox, player, remotes } = tauntEnv();
        player.radius = 20;
        remotes[0].x = 80;
        remotes[0].displayX = 80;
        remotes[0].radius = 40;
        remotes[0].displayRadius = 40;
        assert.equal(sandbox.readMpTauntMood(), "hunted");
    });

    it("reads chase after the nearest prey closes in", () => {
        const { sandbox, player, remotes } = tauntEnv();
        player.radius = 40;
        remotes[0].radius = 20;
        remotes[0].displayRadius = 20;
        remotes[0].x = 300;
        remotes[0].displayX = 300;
        sandbox._now = 0;
        sandbox.tickMpTaunts();
        remotes[0].x = 200;
        remotes[0].displayX = 200;
        sandbox._now = 300;
        sandbox.tickMpTaunts();
        assert.equal(sandbox.readMpTauntMood(), "chase");
    });

    it("reads void when both cells sit in the black hole pull", () => {
        const { sandbox, player, remotes } = tauntEnv();
        player.x = 2000;
        player.y = 2000;
        remotes[0].x = 2000;
        remotes[0].y = 2200;
        remotes[0].displayX = 2000;
        remotes[0].displayY = 2200;
        assert.equal(sandbox.readMpTauntMood(), "void");
    });
});
