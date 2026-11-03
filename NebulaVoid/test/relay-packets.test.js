"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
    buildRelayPayload,
    sanitizeState,
    sanitizeDustOrEgg,
    sanitizeChat,
    allowStateRelay,
    STATE_TOKEN_BURST,
    CAST_TOKEN_BURST,
    RIFT_ACK_TOKEN_BURST,
    RIFT_ACK_MAX_AMOUNT,
    MAX_RELAY_RADIUS,
    CHAT_MIN_INTERVAL_MS,
    CHAT_MAX_LEN,
} = require("../server/relay-packets");

function ctx(over) {
    return Object.assign(
        {
            ws: {},
            peerId: "pHost01",
            isHost: true,
            callsign: "VOID",
            now: 1000,
        },
        over
    );
}

describe("sanitizeState", () => {
    it("keeps pose + appearance and drops unknown fields", () => {
        const out = sanitizeState({
            type: "state",
            t: 12.5,
            x: 100.04,
            y: 200.06,
            vx: 150.24,
            vy: -80.06,
            radius: 20.123,
            color: "#0a0a0a",
            glow: "#88ffcc",
            entity: "Ravenous",
            ability: "speed",
            cd: 1.234,
            cdMax: 8,
            hack: true,
            __proto__: { admin: true },
        });
        assert.equal(out.type, "state");
        assert.equal(out.x, 100);
        assert.equal(out.y, 200.1);
        assert.equal(out.vx, 150.2);
        assert.equal(out.vy, -80.1);
        assert.equal(out.radius, 20.12);
        assert.equal(out.glow, "#88ffcc");
        assert.equal(out.entity, "Ravenous");
        assert.equal(out.cd, 1.23);
        assert.equal(out.hack, undefined);
        assert.equal(out.admin, undefined);
    });

    it("allows delta packets without color/glow/entity", () => {
        const out = sanitizeState({
            type: "state",
            t: 1,
            x: 10,
            y: 20,
            radius: 22,
            ability: "",
            cd: 0,
            cdMax: 0,
        });
        assert.equal(out.color, undefined);
        assert.equal(out.glow, undefined);
        assert.equal(out.entity, undefined);
        assert.equal(out.ability, "");
    });

    it("rejects non-finite or absurd pose", () => {
        assert.equal(sanitizeState({ t: 1, x: NaN, y: 1 }), null);
        assert.equal(sanitizeState({ t: 1, x: 1, y: Infinity }), null);
        assert.equal(sanitizeState({ t: 1, x: 2e6, y: 1 }), null);
        assert.equal(sanitizeState({ t: 1, x: 1 }), null);
    });
});

describe("sanitizeDustOrEgg", () => {
    it("keeps legacy single eat", () => {
        assert.deepEqual(sanitizeDustOrEgg("dust", { id: 7, s: 1.5 }), {
            type: "dust",
            id: 7,
            s: 1.5,
        });
    });

    it("keeps batched eats and caps the list", () => {
        const eats = [];
        for (let i = 1; i <= 40; i++) eats.push({ id: i, s: 0 });
        const out = sanitizeDustOrEgg("egg", { eats });
        assert.equal(out.type, "egg");
        assert.equal(out.eats.length, 24);
        assert.equal(out.eats[0].id, 1);
        assert.equal(out.id, undefined);
    });

    it("drops invalid eat ids", () => {
        assert.equal(sanitizeDustOrEgg("dust", { id: 0, s: 1 }), null);
        assert.equal(sanitizeDustOrEgg("dust", { eats: [{ id: "x", s: 1 }] }), null);
    });
});

describe("buildRelayPayload", () => {
    it("stamps fromPeerId and strips extras", () => {
        const out = buildRelayPayload(
            { type: "forfeit", esc: true, extra: 1 },
            ctx()
        );
        assert.deepEqual(out, { type: "forfeit", esc: true, fromPeerId: "pHost01" });
    });

    it("drops matchStart from non-host", () => {
        const out = buildRelayPayload(
            { type: "matchStart", t0: 1, roomId: "ABCD", peerOrder: ["p1"], dustSeed: 9 },
            ctx({ isHost: false, peerId: "pGuest" })
        );
        assert.equal(out, null);
    });

    it("allows matchStart from host", () => {
        const out = buildRelayPayload(
            {
                type: "matchStart",
                t0: 10,
                roomId: "ABCD",
                peerOrder: ["pHost01", "pGuest"],
                dustSeed: 99,
                inject: "nope",
            },
            ctx()
        );
        assert.equal(out.type, "matchStart");
        assert.equal(out.fromPeerId, "pHost01");
        assert.equal(out.inject, undefined);
        assert.deepEqual(out.peerOrder, ["pHost01", "pGuest"]);
    });

    it("drops unknown types", () => {
        assert.equal(buildRelayPayload({ type: "hack", x: 1 }, ctx()), null);
        assert.equal(buildRelayPayload(["state"], ctx()), null);
        assert.equal(buildRelayPayload(null, ctx()), null);
    });

    it("keeps claimHit and hitAck off the state rate limiter", () => {
        const ws = {};
        for (let i = 0; i < STATE_TOKEN_BURST + 5; i++) {
            allowStateRelay(ws, 0);
        }
        const hit = buildRelayPayload(
            { type: "claimHit", t: 5, kind: "eat", targetPeerId: "pVictim", x: 1, y: 2, radius: 30 },
            ctx({ ws, now: 0 })
        );
        assert.equal(hit.type, "claimHit");
        assert.equal(hit.fromPeerId, "pHost01");
        const ack = buildRelayPayload(
            { type: "hitAck", t: 5, kind: "kill", targetPeerId: "pVictim", eatenRadius: 12, amount: 3 },
            ctx({ ws, now: 0 })
        );
        assert.equal(ack.type, "hitAck");
        assert.equal(ack.kind, "kill");
        assert.equal(ack.eatenRadius, 12);
    });

    it("caps a forged hitAck size and drain", () => {
        const ack = buildRelayPayload(
            {
                type: "hitAck",
                t: 5,
                kind: "kill",
                targetPeerId: "pVictim",
                eatenRadius: 90000,
                amount: 90000,
            },
            ctx()
        );
        assert.equal(ack.eatenRadius, MAX_RELAY_RADIUS);
        assert.equal(ack.amount, MAX_RELAY_RADIUS);
    });

    it("rate-limits state bursts but refills", () => {
        const ws = {};
        let accepted = 0;
        for (let i = 0; i < 40; i++) {
            const out = buildRelayPayload(
                { type: "state", t: i, x: 1, y: 2, radius: 20 },
                ctx({ ws, now: 0 })
            );
            if (out) accepted += 1;
        }
        assert.equal(accepted, STATE_TOKEN_BURST);
        const later = buildRelayPayload(
            { type: "state", t: 99, x: 3, y: 4, radius: 20 },
            ctx({ ws, now: 1000 })
        );
        assert.equal(later.type, "state");
        assert.equal(later.x, 3);
    });
});

describe("cast and riftAck", () => {
    it("relays a cast and strips extras", () => {
        const out = buildRelayPayload(
            {
                type: "cast",
                kind: "vampire",
                t: 4,
                x: 12.26,
                y: -8.04,
                seq: 3,
                hack: true,
            },
            ctx()
        );
        assert.deepEqual(out, {
            type: "cast",
            kind: "vampire",
            t: 4,
            x: 12.3,
            y: -8,
            seq: 3,
            fromPeerId: "pHost01",
        });
    });

    it("rejects a bad cast and caps riftAck", () => {
        assert.equal(
            buildRelayPayload({ type: "cast", kind: "hunt", t: 1, x: 0, y: 0, seq: 1 }, ctx()),
            null
        );
        assert.equal(
            buildRelayPayload({ type: "cast", kind: "warp", t: 1, x: 0, y: 0, seq: 1.5 }, ctx()),
            null
        );
        const ack = buildRelayPayload(
            { type: "riftAck", t: 2, amount: 1.239, ownerPeerId: "pVictim", extra: 1 },
            ctx()
        );
        assert.equal(ack.type, "riftAck");
        assert.equal(ack.amount, 1.24);
        assert.equal(ack.ownerPeerId, "pVictim");
        assert.equal(ack.extra, undefined);
        assert.equal(
            buildRelayPayload({ type: "riftAck", t: 2, amount: RIFT_ACK_MAX_AMOUNT + 1, ownerPeerId: "pVictim" }, ctx()),
            null
        );
        assert.equal(buildRelayPayload({ type: "riftAck", t: 2, amount: 1 }, ctx()), null);
    });

    it("rate-limits cast and riftAck on their own buckets", () => {
        const ws = {};
        let casts = 0;
        for (let i = 0; i < CAST_TOKEN_BURST + 4; i++) {
            const out = buildRelayPayload(
                { type: "cast", kind: "speed", t: 1, x: 0, y: 0, seq: i + 1 },
                ctx({ ws, now: 0 })
            );
            if (out) casts += 1;
        }
        assert.equal(casts, CAST_TOKEN_BURST);
        let acks = 0;
        for (let i = 0; i < RIFT_ACK_TOKEN_BURST + 3; i++) {
            const out = buildRelayPayload(
                { type: "riftAck", t: 1, amount: 0.5, ownerPeerId: "pOwner" },
                ctx({ ws, now: 0 })
            );
            if (out) acks += 1;
        }
        assert.equal(acks, RIFT_ACK_TOKEN_BURST);
        const state = buildRelayPayload(
            { type: "state", t: 1, x: 1, y: 2, radius: 20 },
            ctx({ ws, now: 0 })
        );
        assert.equal(state.type, "state");
    });
});

describe("sanitizeChat", () => {
    it("trims, caps, and rate-limits", () => {
        const ws = {};
        const a = sanitizeChat(ws, { text: "  hi\nthere  ", t: 8 }, 1000);
        assert.equal(a.text, "hi there");
        assert.equal(a.t, 8);
        const b = sanitizeChat(ws, { text: "again" }, 1000 + CHAT_MIN_INTERVAL_MS - 1);
        assert.equal(b, null);
        const c = sanitizeChat(ws, { text: "x".repeat(CHAT_MAX_LEN + 40) }, 1000 + CHAT_MIN_INTERVAL_MS);
        assert.equal(c.text.length, CHAT_MAX_LEN);
    });
});
