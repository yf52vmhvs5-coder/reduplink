/**
 * NEBULA VOID — WebSocket relay (max 6 clients per room). No game simulation.
 */
"use strict";

const http = require("http");
const { WebSocketServer } = require("ws");
const { assignCallsign } = require("./callsign-pool");
const { buildRelayPayload } = require("./relay-packets");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_PER_ROOM = 6;
const MAX_WS_MESSAGE_BYTES = 4096;
const PING_INTERVAL_MS = 15000;
const MAX_PUBLIC_WAITING = 8;
const MAX_ROOM_CHAT = 40;

/** @returns {Set<string> | null} null means any Origin is accepted */
function originAllowlistFrom(raw) {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const set = new Set();
    for (const part of text.split(",")) {
        const origin = part.trim().replace(/\/+$/, "");
        if (origin) set.add(origin);
    }
    return set.size ? set : null;
}

function requestOrigin(info) {
    const raw = info && typeof info.origin === "string" ? info.origin : "";
    return raw.trim().replace(/\/+$/, "");
}

function send(ws, payload) {
    if (!ws || ws.readyState !== 1) return false;
    try {
        ws.send(JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

function sendRaw(ws, raw) {
    if (!ws || ws.readyState !== 1) return;
    try {
        ws.send(raw);
    } catch {
        /* ignore closed sockets mid-broadcast */
    }
}

function broadcastRoom(room, payload, except) {
    let raw;
    try {
        raw = JSON.stringify(payload);
    } catch {
        return;
    }
    for (const client of room.keys()) {
        if (client === except) continue;
        sendRaw(client, raw);
    }
}

function normalizeRoomId(raw) {
    return String(raw || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
}

function joinProfile(msg) {
    const skinName = String(msg.skinName || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 48);
    const color = typeof msg.color === "string" ? msg.color.slice(0, 32) : undefined;
    const ability = typeof msg.ability === "string" ? msg.ability.slice(0, 16) : undefined;
    return { skinName, color, ability };
}

function rosterForRoom(room, hostPeerId) {
    const peers = [];
    for (const meta of room.values()) {
        peers.push({
            peerId: meta.peerId,
            callsign: meta.callsign || "",
            skinName: meta.skinName || "",
            color: meta.color,
            ability: meta.ability,
            isHost: meta.peerId === hostPeerId,
        });
    }
    return peers;
}

function createRelayServer(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const pingIntervalMs =
        typeof options.pingIntervalMs === "number" && Number.isFinite(options.pingIntervalMs)
            ? options.pingIntervalMs
            : PING_INTERVAL_MS;
    const allowedOrigins = originAllowlistFrom(options.allowedOrigins);

    /** @type {Map<string, Map<import('ws').WebSocket, { peerId: string, callsign: string, skinName?: string, color?: string, ability?: string }>>} */
    const rooms = new Map();
    /** @type {Map<string, string>} */
    const roomHosts = new Map();
    /** @type {Map<string, { public: boolean, inMatch: boolean }>} */
    const roomFlags = new Map();
    /** Peers still in the current round. Room stays hidden until this set is empty. */
    /** @type {Map<string, Set<string>>} */
    const roomMatchPeers = new Map();
    /** Chat said before a peer connects. Dropped with the room. */
    /** @type {Map<string, Array<{ type: "chat", text: string, t: number, fromPeerId: string, callsign: string }>>} */
    const roomChats = new Map();

    function rememberRoomChat(roomId, entry) {
        if (!roomId || !entry || entry.type !== "chat" || !entry.text) return;
        let log = roomChats.get(roomId);
        if (!log) {
            log = [];
            roomChats.set(roomId, log);
        }
        log.push({
            type: "chat",
            text: entry.text,
            t: entry.t,
            fromPeerId: entry.fromPeerId,
            callsign: entry.callsign || "",
        });
        if (log.length > MAX_ROOM_CHAT) log.splice(0, log.length - MAX_ROOM_CHAT);
    }

    function sendRoomChatLog(ws, roomId) {
        const log = roomChats.get(roomId);
        if (!log || !log.length) return;
        send(ws, { type: "chatLog", messages: log.slice() });
    }

    function publicWaitingList() {
        const out = [];
        for (const [roomId, room] of rooms) {
            const flags = roomFlags.get(roomId);
            if (!flags || !flags.public || flags.inMatch) continue;
            if (room.size < 1 || room.size >= MAX_PER_ROOM) continue;
            const hostId = roomHosts.get(roomId) || "";
            let host = "";
            for (const meta of room.values()) {
                if (meta.peerId === hostId) {
                    host = meta.callsign || "";
                    break;
                }
            }
            out.push({
                roomId: roomId,
                host: host,
                n: room.size,
                max: MAX_PER_ROOM,
            });
        }
        out.sort(function (a, b) {
            if (b.n !== a.n) return b.n - a.n;
            return a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0;
        });
        return out;
    }

    function countPublicWaiting() {
        return publicWaitingList().length;
    }

    let broadcastDirectory = function () {};

    function setRoomInMatch(roomId, inMatch) {
        const flags = roomFlags.get(roomId);
        if (!flags) return;
        const next = !!inMatch;
        if (flags.inMatch === next) return;
        flags.inMatch = next;
        broadcastDirectory();
    }

    function syncRoomMatchFlag(roomId) {
        const set = roomMatchPeers.get(roomId);
        setRoomInMatch(roomId, !!(set && set.size > 0));
    }

    function markRoomMatchStart(roomId, room) {
        const set = new Set();
        for (const meta of room.values()) {
            if (meta && meta.peerId) set.add(meta.peerId);
        }
        if (set.size) roomMatchPeers.set(roomId, set);
        else roomMatchPeers.delete(roomId);
        syncRoomMatchFlag(roomId);
    }

    function clearPeerFromMatch(roomId, peerId) {
        if (!roomId || !peerId) return;
        const set = roomMatchPeers.get(roomId);
        if (!set || !set.has(peerId)) return;
        set.delete(peerId);
        if (set.size === 0) roomMatchPeers.delete(roomId);
        syncRoomMatchFlag(roomId);
    }

    function removeClient(ws) {
        const roomId = ws._nebulaRoomId;
        const leftPeerId = ws._nebulaPeerId;
        if (!roomId || !rooms.has(roomId)) return;
        const room = rooms.get(roomId);
        room.delete(ws);
        if (room.size === 0) {
            rooms.delete(roomId);
            roomHosts.delete(roomId);
            roomFlags.delete(roomId);
            roomMatchPeers.delete(roomId);
            roomChats.delete(roomId);
        } else if (roomHosts.get(roomId) === leftPeerId) {
            const next = room.values().next().value;
            if (next && next.peerId) roomHosts.set(roomId, next.peerId);
        }
        const peerCount = room.size;
        const hostPeerId = roomHosts.get(roomId) || "";
        clearPeerFromMatch(roomId, leftPeerId);
        for (const client of room.keys()) {
            send(client, { type: "peerLeft", roomId, peerId: leftPeerId, peerCount, hostPeerId });
        }
        ws._nebulaRoomId = null;
        ws._nebulaPeerId = null;
        ws._nebulaLastChatAt = 0;
        broadcastDirectory();
    }

    function handleJoin(ws, msg) {
        const roomId = normalizeRoomId(msg.roomId);
        if (roomId.length < 4) {
            send(ws, { type: "error", code: "BAD_ROOM" });
            return;
        }
        if (ws._nebulaRoomId) {
            removeClient(ws);
        }
        if (!rooms.has(roomId)) {
            if (msg.create !== true) {
                send(ws, { type: "error", code: "NO_ROOM" });
                return;
            }
            const wantPublic = msg.public === true;
            if (wantPublic && countPublicWaiting() >= MAX_PUBLIC_WAITING) {
                send(ws, { type: "error", code: "PUBLIC_FULL" });
                return;
            }
            rooms.set(roomId, new Map());
            roomFlags.set(roomId, { public: wantPublic, inMatch: false });
        } else if (msg.create === true) {
            send(ws, { type: "error", code: "ROOM_TAKEN" });
            return;
        }
        const liveFlags = roomFlags.get(roomId);
        if (liveFlags && liveFlags.inMatch) {
            send(ws, { type: "error", code: "MATCH_LIVE" });
            return;
        }
        const room = rooms.get(roomId);
        if (room.size >= MAX_PER_ROOM) {
            send(ws, { type: "error", code: "ROOM_FULL" });
            return;
        }
        const peerId = "p" + Math.random().toString(36).slice(2, 10);
        const profile = joinProfile(msg);
        const callsign = assignCallsign(room);
        room.set(ws, { peerId, callsign, ...profile });
        ws._nebulaRoomId = roomId;
        ws._nebulaPeerId = peerId;
        ws._nebulaWatch = false;

        if (room.size === 1) {
            roomHosts.set(roomId, peerId);
        }
        const hostPeerId = roomHosts.get(roomId) || peerId;
        const peerCount = room.size;

        send(ws, {
            type: "joined",
            roomId,
            peerId,
            callsign,
            peerCount,
            isHost: peerId === hostPeerId,
            peers: rosterForRoom(room, hostPeerId),
        });

        for (const client of room.keys()) {
            if (client === ws) continue;
            send(client, {
                type: "peerJoined",
                roomId,
                peerCount,
                peerId,
                callsign,
                skinName: profile.skinName,
                color: profile.color,
                ability: profile.ability,
            });
        }
        sendRoomChatLog(ws, roomId);
        broadcastDirectory();
    }

    const server = http.createServer((req, res) => {
        const path = String(req.url || "/").split("?")[0];
        if (path === "/health") {
            res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
            });
            res.end('{"ok":true,"service":"nebula-void-relay"}\n');
            return;
        }
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("NEBULA VOID relay — use WebSocket\n");
    });

    /** @type {import('ws').ServerOptions} */
    const wssOptions = {
        server,
        maxPayload: MAX_WS_MESSAGE_BYTES,
        perMessageDeflate: false,
    };
    if (allowedOrigins) {
        wssOptions.verifyClient = function (info) {
            const origin = requestOrigin(info);
            return origin.length > 0 && allowedOrigins.has(origin);
        };
    }

    const wss = new WebSocketServer(wssOptions);

    broadcastDirectory = function () {
        let raw;
        try {
            raw = JSON.stringify({ type: "roomList", rooms: publicWaitingList() });
        } catch {
            return;
        }
        for (const client of wss.clients) {
            if (!client._nebulaWatch) continue;
            sendRaw(client, raw);
        }
    };

    wss.on("connection", (ws) => {
        ws._nebulaLastChatAt = 0;
        ws._nebulaAlive = true;
        ws._nebulaWatch = false;
        ws.on("error", () => {
            /* prevent unhandled 'error' from taking down the relay */
        });
        ws.on("pong", () => {
            ws._nebulaAlive = true;
        });
        ws.on("message", (raw) => {
            const rawStr =
                typeof raw === "string"
                    ? raw
                    : Buffer.isBuffer(raw)
                      ? raw.toString("utf8")
                      : String(raw);
            if (rawStr.length > MAX_WS_MESSAGE_BYTES) return;
            let msg;
            try {
                msg = JSON.parse(rawStr);
            } catch {
                send(ws, { type: "error", code: "BAD_JSON" });
                return;
            }
            if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;

            if (msg.type === "lobby") {
                ws._nebulaWatch = !ws._nebulaRoomId;
                if (ws._nebulaWatch) send(ws, { type: "roomList", rooms: publicWaitingList() });
                return;
            }

            if (msg.type === "leave") {
                if (ws._nebulaRoomId) removeClient(ws);
                ws._nebulaWatch = true;
                send(ws, { type: "roomList", rooms: publicWaitingList() });
                return;
            }

            if (msg.type === "join") {
                handleJoin(ws, msg);
                return;
            }

            const roomId = ws._nebulaRoomId;
            const peerId = ws._nebulaPeerId;
            if (!roomId || !rooms.has(roomId)) return;
            const room = rooms.get(roomId);
            const meta = room.get(ws);
            const hostPeerId = roomHosts.get(roomId) || "";

            if (msg.type === "roomIdle") {
                clearPeerFromMatch(roomId, peerId);
                return;
            }

            const out = buildRelayPayload(msg, {
                ws,
                peerId,
                isHost: peerId === hostPeerId,
                callsign: meta && meta.callsign ? meta.callsign : "",
                now: Date.now(),
            });
            if (!out) return;
            if (out.type === "matchStart") {
                const live = roomMatchPeers.get(roomId);
                if (live && live.size > 0) {
                    send(ws, { type: "error", code: "MATCH_LIVE" });
                    return;
                }
                markRoomMatchStart(roomId, room);
            }
            if (out.type === "chat") rememberRoomChat(roomId, out);
            broadcastRoom(room, out, ws);
        });

        ws.on("close", () => removeClient(ws));
    });

    let pingTimer = null;
    if (pingIntervalMs > 0) {
        pingTimer = setInterval(() => {
            for (const client of wss.clients) {
                if (client._nebulaAlive === false) {
                    try {
                        client.terminate();
                    } catch {
                        /* ignore */
                    }
                    continue;
                }
                client._nebulaAlive = false;
                try {
                    client.ping();
                } catch {
                    try {
                        client.terminate();
                    } catch {
                        /* ignore */
                    }
                }
            }
        }, pingIntervalMs);
    }

    function close() {
        return new Promise((resolve) => {
            if (pingTimer) {
                clearInterval(pingTimer);
                pingTimer = null;
            }
            for (const client of wss.clients) {
                try {
                    client.terminate();
                } catch {
                    /* ignore */
                }
            }
            wss.close();
            server.close(() => resolve());
        });
    }

    return { server, wss, close };
}

if (require.main === module) {
    const { server, close } = createRelayServer({
        allowedOrigins: process.env.ALLOWED_ORIGINS,
    });
    let shuttingDown = false;

    function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[NEBULA relay] ${signal}, closing`);
        const force = setTimeout(() => process.exit(1), 8000);
        if (typeof force.unref === "function") force.unref();
        close().then(
            () => process.exit(0),
            () => process.exit(1)
        );
    }

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    server.listen(PORT, HOST, () => {
        console.log(`[NEBULA relay] ${HOST}:${PORT} (max ${MAX_PER_ROOM}/room)`);
    });
}

module.exports = {
    createRelayServer,
    PORT,
    MAX_PER_ROOM,
    MAX_WS_MESSAGE_BYTES,
    MAX_PUBLIC_WAITING,
};
