"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { WebSocket } = require("../server/node_modules/ws");
const { createRelayServer, MAX_WS_MESSAGE_BYTES, MAX_PUBLIC_WAITING } = require("../server/index.js");

function collect(ws) {
    const queued = [];
    const waiters = [];
    ws.on("message", (data) => {
        const msg = JSON.parse(String(data));
        if (waiters.length) waiters.shift()(msg);
        else queued.push(msg);
    });
    return {
        take(ms) {
            if (queued.length) return Promise.resolve(queued.shift());
            return new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error("timeout waiting for ws message")), ms || 2000);
                waiters.push((msg) => {
                    clearTimeout(t);
                    resolve(msg);
                });
            });
        },
        drain() {
            const out = queued.slice();
            queued.length = 0;
            return out;
        },
    };
}

function open(url) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.once("open", () => resolve(ws));
        ws.once("error", reject);
    });
}

async function joinRoom(url, roomId, create, extra) {
    const ws = await open(url);
    const inbox = collect(ws);
    ws.send(
        JSON.stringify({
            type: "join",
            roomId,
            create: create === true,
            skinName: "Ravenous",
            ...(extra && typeof extra === "object" ? extra : {}),
        })
    );
    const joined = await inbox.take();
    return { ws, inbox, joined };
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("relay server", () => {
    let relay;
    let url;

    before(async () => {
        relay = createRelayServer({ pingIntervalMs: 0 });
        await new Promise((resolve) => relay.server.listen(0, "127.0.0.1", resolve));
        const addr = relay.server.address();
        url = `ws://127.0.0.1:${addr.port}`;
    });

    after(async () => {
        if (relay) await relay.close();
    });

    it("joins two peers and relays a sanitized state snapshot", async () => {
        const room = "ST01";
        const host = await joinRoom(url, room, true);
        assert.equal(host.joined.type, "joined");
        assert.equal(host.joined.isHost, true);
        const guest = await joinRoom(url, room, false);
        assert.equal(guest.joined.type, "joined");
        assert.equal(guest.joined.isHost, false);
        const sawJoin = await host.inbox.take();
        assert.equal(sawJoin.type, "peerJoined");

        host.ws.send(
            JSON.stringify({
                type: "state",
                t: 16,
                x: 111.11,
                y: 222.22,
                radius: 20.129,
                color: "#0a0a0a",
                glow: "#abcabc",
                entity: "Ravenous",
                ability: "speed",
                cd: 1.111,
                cdMax: 8,
                pwn: "nope",
            })
        );
        const state = await guest.inbox.take();
        assert.equal(state.type, "state");
        assert.equal(state.fromPeerId, host.joined.peerId);
        assert.equal(state.x, 111.1);
        assert.equal(state.y, 222.2);
        assert.equal(state.radius, 20.13);
        assert.equal(state.glow, "#abcabc");
        assert.equal(state.pwn, undefined);

        host.ws.close();
        guest.ws.close();
    });

    it("relays batched dust and legacy single dust", async () => {
        const room = "DU01";
        const host = await joinRoom(url, room, true);
        const guest = await joinRoom(url, room, false);
        await host.inbox.take();

        host.ws.send(JSON.stringify({ type: "dust", eats: [{ id: 4, s: 0.5 }, { id: 5, s: 1 }] }));
        const batch = await guest.inbox.take();
        assert.equal(batch.type, "dust");
        assert.equal(batch.eats.length, 2);
        assert.equal(batch.eats[1].id, 5);

        host.ws.send(JSON.stringify({ type: "dust", id: 9, s: 2 }));
        const one = await guest.inbox.take();
        assert.equal(one.type, "dust");
        assert.equal(one.id, 9);
        assert.equal(one.s, 2);
        assert.equal(one.eats, undefined);

        host.ws.close();
        guest.ws.close();
    });

    it("relays cast and riftAck without dropping them as unknown", async () => {
        const room = "AB01";
        const host = await joinRoom(url, room, true);
        const guest = await joinRoom(url, room, false);
        await host.inbox.take();

        guest.ws.send(
            JSON.stringify({
                type: "cast",
                kind: "warp",
                t: 8,
                x: 40.04,
                y: 12,
                seq: 1,
                injected: true,
            })
        );
        const cast = await host.inbox.take();
        assert.equal(cast.type, "cast");
        assert.equal(cast.kind, "warp");
        assert.equal(cast.x, 40);
        assert.equal(cast.seq, 1);
        assert.equal(cast.fromPeerId, guest.joined.peerId);
        assert.equal(cast.injected, undefined);

        guest.ws.send(
            JSON.stringify({
                type: "riftAck",
                t: 9,
                amount: 0.64,
                ownerPeerId: host.joined.peerId,
            })
        );
        const ack = await host.inbox.take();
        assert.equal(ack.type, "riftAck");
        assert.equal(ack.amount, 0.64);
        assert.equal(ack.ownerPeerId, host.joined.peerId);
        assert.equal(ack.fromPeerId, guest.joined.peerId);

        host.ws.close();
        guest.ws.close();
    });

    it("drops matchStart from a non-host and unknown types", async () => {
        const room = "HS01";
        const host = await joinRoom(url, room, true);
        const guest = await joinRoom(url, room, false);
        await host.inbox.take();

        guest.ws.send(
            JSON.stringify({
                type: "matchStart",
                t0: 1,
                roomId: room,
                peerOrder: [guest.joined.peerId],
                dustSeed: 1,
            })
        );
        guest.ws.send(JSON.stringify({ type: "notAThing", x: 1 }));
        await wait(80);
        assert.equal(host.inbox.drain().length, 0);

        host.ws.send(
            JSON.stringify({
                type: "matchStart",
                t0: 9,
                roomId: room,
                peerOrder: [host.joined.peerId, guest.joined.peerId],
                dustSeed: 42,
            })
        );
        const start = await guest.inbox.take();
        assert.equal(start.type, "matchStart");
        assert.equal(start.fromPeerId, host.joined.peerId);
        assert.equal(start.dustSeed, 42);

        host.ws.close();
        guest.ws.close();
    });

    it("relays claimHit even after a state flood", async () => {
        const room = "HT01";
        const host = await joinRoom(url, room, true);
        const guest = await joinRoom(url, room, false);
        await host.inbox.take();

        for (let i = 0; i < 40; i++) {
            host.ws.send(JSON.stringify({ type: "state", t: i, x: i, y: 1, radius: 20 }));
        }
        await wait(40);
        const states = guest.inbox.drain().filter((m) => m.type === "state");
        assert.ok(states.length <= 12, `expected burst cap, got ${states.length}`);
        assert.ok(states.length >= 1);

        host.ws.send(
            JSON.stringify({ type: "claimHit", t: 500, kind: "eat", targetPeerId: guest.joined.peerId, x: 1, y: 2, radius: 40 })
        );
        const hit = await guest.inbox.take();
        assert.equal(hit.type, "claimHit");
        assert.equal(hit.targetPeerId, guest.joined.peerId);

        host.ws.close();
        guest.ws.close();
    });

    it("relays chat and rejects join to a missing room", async () => {
        const missing = await joinRoom(url, "ZZZZ", false);
        assert.equal(missing.joined.type, "error");
        assert.equal(missing.joined.code, "NO_ROOM");
        missing.ws.close();

        const room = "CH01";
        const host = await joinRoom(url, room, true);
        const guest = await joinRoom(url, room, false);
        await host.inbox.take();
        host.ws.send(JSON.stringify({ type: "chat", text: "  hello void  ", t: 3 }));
        const chat = await guest.inbox.take();
        assert.equal(chat.type, "chat");
        assert.equal(chat.text, "hello void");
        assert.equal(chat.callsign, host.joined.callsign);

        host.ws.close();
        guest.ws.close();
    });

    it("replays chat spoken before a peer arrives", async () => {
        const room = "CH02";
        const host = await joinRoom(url, room, true);
        host.ws.send(JSON.stringify({ type: "chat", text: "before you", t: 11 }));
        await wait(30);
        const guest = await joinRoom(url, room, false);
        const joinedHost = await host.inbox.take();
        assert.equal(joinedHost.type, "peerJoined");
        const log = await guest.inbox.take();
        assert.equal(log.type, "chatLog");
        assert.equal(log.messages.length, 1);
        assert.equal(log.messages[0].text, "before you");
        assert.equal(log.messages[0].fromPeerId, host.joined.peerId);
        assert.equal(log.messages[0].callsign, host.joined.callsign);

        await wait(650);
        host.ws.send(JSON.stringify({ type: "chat", text: "after you", t: 12 }));
        const live = await guest.inbox.take();
        assert.equal(live.type, "chat");
        assert.equal(live.text, "after you");
        assert.equal(guest.inbox.drain().some((msg) => msg.type === "chatLog"), false);

        host.ws.close();
        guest.ws.close();
    });

    it("drops the chat log when the room empties", async () => {
        const room = "CH03";
        const host = await joinRoom(url, room, true);
        host.ws.send(JSON.stringify({ type: "chat", text: "gone soon", t: 1 }));
        await wait(20);
        const guest = await joinRoom(url, room, false);
        await host.inbox.take();
        const log = await guest.inbox.take();
        assert.equal(log.type, "chatLog");
        assert.equal(log.messages[0].text, "gone soon");

        const hostClosed = new Promise((resolve) => host.ws.once("close", resolve));
        const guestClosed = new Promise((resolve) => guest.ws.once("close", resolve));
        host.ws.close();
        guest.ws.close();
        await Promise.all([hostClosed, guestClosed]);

        const next = await joinRoom(url, room, true);
        const again = await joinRoom(url, room, false);
        assert.equal(again.joined.type, "joined");
        await next.inbox.take();
        await wait(30);
        assert.equal(again.inbox.drain().some((msg) => msg.type === "chatLog"), false);

        next.ws.close();
        again.ws.close();
    });

    it("rejects a join while a round is live", async () => {
        const room = "LV02";
        const host = await joinRoom(url, room, true);
        const guest = await joinRoom(url, room, false);
        await host.inbox.take();
        host.ws.send(
            JSON.stringify({
                type: "matchStart",
                t0: 1,
                roomId: room,
                peerOrder: [host.joined.peerId, guest.joined.peerId],
                dustSeed: 4,
            })
        );
        const started = await guest.inbox.take();
        assert.equal(started.type, "matchStart");

        const late = await joinRoom(url, room, false);
        assert.equal(late.joined.type, "error");
        assert.equal(late.joined.code, "MATCH_LIVE");
        await wait(30);
        assert.equal(
            host.inbox.drain().some((msg) => msg.type === "peerJoined"),
            false
        );

        late.ws.close();
        guest.ws.send(JSON.stringify({ type: "roomIdle" }));
        host.ws.send(JSON.stringify({ type: "roomIdle" }));
        await wait(50);
        const after = await joinRoom(url, room, false);
        assert.equal(after.joined.type, "joined");

        after.ws.close();
        host.ws.close();
        guest.ws.close();
    });

    it("closes oversized frames via maxPayload", async () => {
        const room = "MX01";
        const host = await joinRoom(url, room, true);
        const closed = new Promise((resolve) => host.ws.once("close", resolve));
        host.ws.send(JSON.stringify({ type: "chat", text: "x".repeat(MAX_WS_MESSAGE_BYTES + 64) }));
        await closed;
    });

    it("relays matchEnd, respawn, and forfeit", async () => {
        const room = "EV01";
        const host = await joinRoom(url, room, true);
        const guest = await joinRoom(url, room, false);
        await host.inbox.take();
        host.ws.send(JSON.stringify({ type: "matchEnd", entity: "Ravenous", winnerCallsign: "VOID", winnerPeerId: host.joined.peerId, junk: 1 }));
        const end = await guest.inbox.take();
        assert.equal(end.type, "matchEnd");
        assert.equal(end.winnerCallsign, "VOID");
        assert.equal(end.junk, undefined);
        host.ws.send(JSON.stringify({ type: "respawn", x: 10, y: 20, radius: 18 }));
        const respawn = await guest.inbox.take();
        assert.equal(respawn.type, "respawn");
        assert.equal(respawn.x, 10);
        host.ws.send(JSON.stringify({ type: "forfeit", esc: true }));
        const forfeit = await guest.inbox.take();
        assert.equal(forfeit.esc, true);
        host.ws.close();
        guest.ws.close();
    });

    it("rejects creating a code that is already in use", async () => {
        const room = "TAK1";
        const host = await joinRoom(url, room, true);
        assert.equal(host.joined.type, "joined");
        const again = await joinRoom(url, room, true);
        assert.equal(again.joined.type, "error");
        assert.equal(again.joined.code, "ROOM_TAKEN");
        const guest = await joinRoom(url, room, false);
        assert.equal(guest.joined.type, "joined");
        host.ws.close();
        again.ws.close();
        guest.ws.close();
    });
});

describe("public room directory", () => {
    let relay;
    let url;

    before(async () => {
        relay = createRelayServer({ pingIntervalMs: 0 });
        await new Promise((resolve) => relay.server.listen(0, "127.0.0.1", resolve));
        url = `ws://127.0.0.1:${relay.server.address().port}`;
    });

    after(async () => {
        if (relay) await relay.close();
    });

    it("lists only public waiting rooms and hides them in match", async () => {
        const watcher = await open(url);
        const inbox = collect(watcher);
        watcher.send(JSON.stringify({ type: "lobby" }));
        const empty = await inbox.take();
        assert.equal(empty.type, "roomList");
        assert.equal(empty.rooms.length, 0);

        const pub = await joinRoom(url, "PUB1", true, { public: true });
        const listed = await inbox.take();
        assert.equal(listed.type, "roomList");
        assert.equal(listed.rooms.length, 1);
        assert.equal(listed.rooms[0].roomId, "PUB1");
        assert.equal(listed.rooms[0].n, 1);
        assert.ok(listed.rooms[0].host);

        const priv = await joinRoom(url, "HID1", true);
        await wait(40);
        const afterPriv = inbox.drain().filter((m) => m.type === "roomList");
        for (let i = 0; i < afterPriv.length; i++) {
            assert.equal(afterPriv[i].rooms.length, 1);
            assert.equal(afterPriv[i].rooms[0].roomId, "PUB1");
        }

        pub.ws.send(
            JSON.stringify({
                type: "matchStart",
                t0: 1,
                roomId: "PUB1",
                peerOrder: [pub.joined.peerId],
                dustSeed: 1,
            })
        );
        const hidden = await inbox.take();
        assert.equal(hidden.type, "roomList");
        assert.equal(hidden.rooms.length, 0);

        pub.ws.send(JSON.stringify({ type: "roomIdle" }));
        const idle = await inbox.take();
        assert.equal(idle.rooms.length, 1);

        pub.ws.send(JSON.stringify({ type: "leave" }));
        const afterLeave = await inbox.take();
        assert.equal(afterLeave.rooms.length, 0);

        watcher.close();
        pub.ws.close();
        priv.ws.close();
    });

    it("keeps a live match hidden unless the host releases it", async () => {
        const watcher = await open(url);
        const inbox = collect(watcher);
        watcher.send(JSON.stringify({ type: "lobby" }));
        await inbox.take();

        const host = await joinRoom(url, "LIVE", true, { public: true });
        const listed = await inbox.take();
        assert.equal(listed.type, "roomList");
        assert.equal(
            listed.rooms.some((room) => room.roomId === "LIVE"),
            true
        );

        const guest = await joinRoom(url, "LIVE", false);
        await host.inbox.take();
        await inbox.take();

        host.ws.send(
            JSON.stringify({
                type: "matchStart",
                t0: 1,
                roomId: "LIVE",
                peerOrder: [host.joined.peerId, guest.joined.peerId],
                dustSeed: 1,
            })
        );
        const started = await guest.inbox.take();
        assert.equal(started.type, "matchStart");
        const hidden = await inbox.take();
        assert.equal(hidden.type, "roomList");
        assert.equal(
            hidden.rooms.some((room) => room.roomId === "LIVE"),
            false
        );

        guest.ws.send(
            JSON.stringify({
                type: "matchEnd",
                entity: "Guest",
                winnerCallsign: "GUEST",
                winnerPeerId: guest.joined.peerId,
            })
        );
        const relayed = await host.inbox.take();
        assert.equal(relayed.type, "matchEnd");
        assert.equal(relayed.fromPeerId, guest.joined.peerId);
        await wait(60);
        const afterEnd = inbox.drain().filter((msg) => msg.type === "roomList");
        for (let i = 0; i < afterEnd.length; i++) {
            assert.equal(
                afterEnd[i].rooms.some((room) => room.roomId === "LIVE"),
                false
            );
        }

        guest.ws.send(JSON.stringify({ type: "roomIdle" }));
        await wait(60);
        assert.equal(inbox.drain().filter((msg) => msg.type === "roomList").length, 0);

        host.ws.send(JSON.stringify({ type: "roomIdle" }));
        const relisted = await inbox.take();
        assert.equal(relisted.type, "roomList");
        assert.equal(
            relisted.rooms.some((room) => room.roomId === "LIVE"),
            true
        );

        watcher.close();
        host.ws.close();
        guest.ws.close();
    });

    it("rejects matchStart while a round is still live", async () => {
        const room = "LV01";
        const host = await joinRoom(url, room, true);
        const guest = await joinRoom(url, room, false);
        await host.inbox.take();
        host.ws.send(
            JSON.stringify({
                type: "matchStart",
                t0: 1,
                roomId: room,
                peerOrder: [host.joined.peerId, guest.joined.peerId],
                dustSeed: 1,
            })
        );
        const start = await guest.inbox.take();
        assert.equal(start.type, "matchStart");

        host.ws.send(JSON.stringify({ type: "roomIdle" }));
        await wait(40);
        host.ws.send(
            JSON.stringify({
                type: "matchStart",
                t0: 2,
                roomId: room,
                peerOrder: [host.joined.peerId, guest.joined.peerId],
                dustSeed: 2,
            })
        );
        const err = await host.inbox.take();
        assert.equal(err.type, "error");
        assert.equal(err.code, "MATCH_LIVE");
        await wait(40);
        assert.equal(guest.inbox.drain().filter((msg) => msg.type === "matchStart").length, 0);

        guest.ws.send(JSON.stringify({ type: "roomIdle" }));
        await wait(40);
        host.ws.send(
            JSON.stringify({
                type: "matchStart",
                t0: 3,
                roomId: room,
                peerOrder: [host.joined.peerId, guest.joined.peerId],
                dustSeed: 3,
            })
        );
        const start2 = await guest.inbox.take();
        assert.equal(start2.type, "matchStart");
        assert.equal(start2.dustSeed, 3);

        host.ws.close();
        guest.ws.close();
    });

    it("relists a public room when the last in-match peer idles, even if not host", async () => {
        const watcher = await open(url);
        const inbox = collect(watcher);
        watcher.send(JSON.stringify({ type: "lobby" }));
        await inbox.take();

        const host = await joinRoom(url, "LAST", true, { public: true });
        await inbox.take();
        const guest = await joinRoom(url, "LAST", false);
        await host.inbox.take();
        await inbox.take();

        host.ws.send(
            JSON.stringify({
                type: "matchStart",
                t0: 1,
                roomId: "LAST",
                peerOrder: [host.joined.peerId, guest.joined.peerId],
                dustSeed: 1,
            })
        );
        const started = await guest.inbox.take();
        assert.equal(started.type, "matchStart");
        const hidden = await inbox.take();
        assert.equal(
            hidden.rooms.some((room) => room.roomId === "LAST"),
            false
        );

        host.ws.send(JSON.stringify({ type: "roomIdle" }));
        await wait(60);
        const afterHost = inbox.drain().filter((msg) => msg.type === "roomList");
        for (let i = 0; i < afterHost.length; i++) {
            assert.equal(
                afterHost[i].rooms.some((room) => room.roomId === "LAST"),
                false
            );
        }

        guest.ws.send(JSON.stringify({ type: "roomIdle" }));
        const relisted = await inbox.take();
        assert.equal(relisted.type, "roomList");
        assert.equal(
            relisted.rooms.some((room) => room.roomId === "LAST"),
            true
        );

        watcher.close();
        host.ws.close();
        guest.ws.close();
    });
});

describe("public room cap", () => {
    it("rejects a new public room when the waiting cap is full", async () => {
        const capRelay = createRelayServer({ pingIntervalMs: 0 });
        await new Promise((resolve) => capRelay.server.listen(0, "127.0.0.1", resolve));
        const capUrl = `ws://127.0.0.1:${capRelay.server.address().port}`;
        const hosts = [];
        try {
            for (let i = 0; i < MAX_PUBLIC_WAITING; i++) {
                const code = "C" + String(i).padStart(3, "0");
                hosts.push(await joinRoom(capUrl, code, true, { public: true }));
            }
            const overflow = await joinRoom(capUrl, "C999", true, { public: true });
            assert.equal(overflow.joined.type, "error");
            assert.equal(overflow.joined.code, "PUBLIC_FULL");
            overflow.ws.close();
        } finally {
            for (let i = 0; i < hosts.length; i++) hosts[i].ws.close();
            await capRelay.close();
        }
    });
});

describe("relay ping watchdog", () => {
    it("terminates a client that never answers pong", async () => {
        const pingRelay = createRelayServer({ pingIntervalMs: 40 });
        await new Promise((resolve) => pingRelay.server.listen(0, "127.0.0.1", resolve));
        const port = pingRelay.server.address().port;
        const ws = new WebSocket(`ws://127.0.0.1:${port}`, { autoPong: false });
        await new Promise((resolve, reject) => {
            ws.once("open", resolve);
            ws.once("error", reject);
        });
        const closed = new Promise((resolve) => ws.once("close", resolve));
        await Promise.race([
            closed,
            wait(800).then(() => {
                throw new Error("dead client was not terminated");
            }),
        ]);
        await pingRelay.close();
    });
});

function getText(port, path) {
    return new Promise((resolve, reject) => {
        const req = http.get({ hostname: "127.0.0.1", port, path }, (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
                body += chunk;
            });
            res.on("end", () => resolve({ status: res.statusCode, body }));
        });
        req.on("error", reject);
    });
}

function openOrigin(url, origin) {
    return new Promise((resolve, reject) => {
        const headers = {};
        if (origin) headers.Origin = origin;
        const ws = new WebSocket(url, { headers });
        const timer = setTimeout(() => {
            ws.terminate();
            reject(new Error("open timed out"));
        }, 2000);
        ws.once("open", () => {
            clearTimeout(timer);
            resolve(ws);
        });
        ws.once("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

describe("relay health and origin", () => {
    it("answers /health and leaves the root page unchanged", async () => {
        const relay = createRelayServer({ pingIntervalMs: 0 });
        await new Promise((resolve) => relay.server.listen(0, "127.0.0.1", resolve));
        const port = relay.server.address().port;
        try {
            const health = await getText(port, "/health");
            assert.equal(health.status, 200);
            assert.equal(health.body, '{"ok":true,"service":"nebula-void-relay"}\n');
            const root = await getText(port, "/");
            assert.equal(root.status, 200);
            assert.equal(root.body, "NEBULA VOID relay — use WebSocket\n");
        } finally {
            await relay.close();
        }
    });

    it("accepts the configured Origin and rejects any other", async () => {
        const origin = "https://yf52vmhvs5-coder.github.io";
        const relay = createRelayServer({
            pingIntervalMs: 0,
            allowedOrigins: origin + "/",
        });
        await new Promise((resolve) => relay.server.listen(0, "127.0.0.1", resolve));
        const port = relay.server.address().port;
        const url = `ws://127.0.0.1:${port}`;
        try {
            const ws = await openOrigin(url, origin);
            ws.close();
            await assert.rejects(() => openOrigin(url, "https://evil.example"));
            await assert.rejects(() => openOrigin(url));
        } finally {
            await relay.close();
        }
    });
});
