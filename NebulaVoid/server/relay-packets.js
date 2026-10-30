/**
 * NEBULA VOID — sanitize + rate-limit relay payloads. No game simulation.
 */
"use strict";

const CHAT_MAX_LEN = 120;
const CHAT_MIN_INTERVAL_MS = 600;
const STATE_TOKEN_RATE = 70;
const STATE_TOKEN_BURST = 12;
const CAST_TOKEN_RATE = 6;
const CAST_TOKEN_BURST = 3;
const RIFT_ACK_TOKEN_RATE = 15;
const RIFT_ACK_TOKEN_BURST = 4;
const RIFT_ACK_MAX_AMOUNT = 20;
const MAX_EATS_PER_PACKET = 24;
const MAX_PEER_ORDER = 6;
const MAX_PEER_ID_LEN = 16;
const MAX_COLOR_LEN = 32;
const MAX_ENTITY_LEN = 32;
const MAX_CALLSIGN_LEN = 8;
const MAX_ROOM_ID_LEN = 6;
const ID_MAX = 8000000;
/** Same bound as a relayed cell radius. Kill size and drain cannot exceed it. */
const MAX_RELAY_RADIUS = 4000;

function finiteNumber(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function quantize(n, scale) {
    return Math.round(n * scale) / scale;
}

function sliceStr(v, max) {
    return typeof v === "string" ? v.slice(0, max) : "";
}

function sanitizeEat(item) {
    if (!item || typeof item !== "object") return null;
    const id = item.id;
    if (!Number.isInteger(id) || id < 1 || id > ID_MAX) return null;
    const s = finiteNumber(item.s);
    if (s == null || s < 0) return null;
    return { id: id, s: s };
}

function sanitizeDustOrEgg(type, msg) {
    if (Array.isArray(msg.eats) && msg.eats.length > 0) {
        const eats = [];
        const n = Math.min(msg.eats.length, MAX_EATS_PER_PACKET);
        for (let i = 0; i < n; i++) {
            const one = sanitizeEat(msg.eats[i]);
            if (one) eats.push(one);
        }
        if (!eats.length) return null;
        return { type: type, eats: eats };
    }
    const one = sanitizeEat({ id: msg.id, s: msg.s });
    if (!one) return null;
    return { type: type, id: one.id, s: one.s };
}

function allowBucket(ws, now, prefix, rate, burst) {
    if (!ws) return false;
    const t = typeof now === "number" ? now : Date.now();
    const tokensKey = prefix + "Tokens";
    const atKey = prefix + "At";
    if (typeof ws[tokensKey] !== "number") {
        ws[tokensKey] = burst;
        ws[atKey] = t;
    }
    const elapsed = Math.max(0, (t - ws[atKey]) / 1000);
    ws[tokensKey] = Math.min(burst, ws[tokensKey] + elapsed * rate);
    ws[atKey] = t;
    if (ws[tokensKey] < 1) return false;
    ws[tokensKey] -= 1;
    return true;
}

function allowStateRelay(ws, now) {
    const t = typeof now === "number" ? now : Date.now();
    if (typeof ws._nebulaStateTokens !== "number") {
        ws._nebulaStateTokens = STATE_TOKEN_BURST;
        ws._nebulaStateTokAt = t;
    }
    const elapsed = Math.max(0, (t - ws._nebulaStateTokAt) / 1000);
    ws._nebulaStateTokens = Math.min(
        STATE_TOKEN_BURST,
        ws._nebulaStateTokens + elapsed * STATE_TOKEN_RATE
    );
    ws._nebulaStateTokAt = t;
    if (ws._nebulaStateTokens < 1) return false;
    ws._nebulaStateTokens -= 1;
    return true;
}

function sanitizeChat(ws, msg, now) {
    const text = String(msg && msg.text ? msg.text : "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, CHAT_MAX_LEN);
    if (!text) return null;
    const tNow = typeof now === "number" ? now : Date.now();
    const last = typeof ws._nebulaLastChatAt === "number" ? ws._nebulaLastChatAt : 0;
    if (tNow - last < CHAT_MIN_INTERVAL_MS) return null;
    ws._nebulaLastChatAt = tNow;
    const t = finiteNumber(msg.t);
    return { type: "chat", text: text, t: t == null ? tNow : t };
}

function sanitizeState(msg) {
    const t = finiteNumber(msg.t);
    const x = finiteNumber(msg.x);
    const y = finiteNumber(msg.y);
    if (t == null || x == null || y == null) return null;
    if (Math.abs(x) > 1e6 || Math.abs(y) > 1e6) return null;
    const out = {
        type: "state",
        t: t,
        x: quantize(x, 10),
        y: quantize(y, 10),
    };
    const radius = finiteNumber(msg.radius);
    if (radius != null && radius > 0 && radius <= MAX_RELAY_RADIUS) {
        out.radius = quantize(radius, 100);
    }
    if (typeof msg.color === "string" && msg.color) {
        out.color = msg.color.slice(0, MAX_COLOR_LEN);
    }
    if (typeof msg.glow === "string" && msg.glow) {
        out.glow = msg.glow.slice(0, MAX_COLOR_LEN);
    }
    if (typeof msg.entity === "string") {
        const name = msg.entity.replace(/\s+/g, " ").trim().slice(0, MAX_ENTITY_LEN);
        if (name) out.entity = name;
    }
    if (
        msg.ability === "vampire" ||
        msg.ability === "warp" ||
        msg.ability === "speed" ||
        msg.ability === ""
    ) {
        out.ability = msg.ability;
    }
    const cd = finiteNumber(msg.cd);
    const cdMax = finiteNumber(msg.cdMax);
    if (cd != null && cd >= 0 && cd < 30) out.cd = quantize(cd, 100);
    if (cdMax != null && cdMax >= 0 && cdMax < 30) out.cdMax = quantize(cdMax, 100);
    return out;
}

function sanitizeCast(msg) {
    const kind = msg.kind;
    if (kind !== "vampire" && kind !== "warp" && kind !== "speed") return null;
    const t = finiteNumber(msg.t);
    const x = finiteNumber(msg.x);
    const y = finiteNumber(msg.y);
    if (t == null || x == null || y == null) return null;
    if (Math.abs(x) > 1e6 || Math.abs(y) > 1e6) return null;
    if (!Number.isInteger(msg.seq) || msg.seq < 1 || msg.seq > 1e9) return null;
    return {
        type: "cast",
        kind: kind,
        t: t,
        x: quantize(x, 10),
        y: quantize(y, 10),
        seq: msg.seq,
    };
}

function sanitizeRiftAck(msg) {
    const t = finiteNumber(msg.t);
    const amount = finiteNumber(msg.amount);
    if (t == null || amount == null || amount <= 0 || amount > RIFT_ACK_MAX_AMOUNT) return null;
    const quantized = quantize(amount, 100);
    if (!(quantized > 0)) return null;
    const owner = typeof msg.ownerPeerId === "string" ? msg.ownerPeerId.slice(0, MAX_PEER_ID_LEN) : "";
    if (!owner) return null;
    return {
        type: "riftAck",
        t: t,
        amount: quantized,
        ownerPeerId: owner,
    };
}

function sanitizeClaimHit(msg) {
    const t = finiteNumber(msg.t);
    if (t == null) return null;
    const out = { type: "claimHit", t: t, kind: "eat" };
    if (typeof msg.targetPeerId === "string") {
        out.targetPeerId = msg.targetPeerId.slice(0, MAX_PEER_ID_LEN);
    }
    const x = finiteNumber(msg.x);
    const y = finiteNumber(msg.y);
    const radius = finiteNumber(msg.radius);
    if (x != null) out.x = x;
    if (y != null) out.y = y;
    if (radius != null && radius > 0) out.radius = radius;
    return out;
}

function sanitizeHitAck(msg) {
    const t = finiteNumber(msg.t);
    if (t == null) return null;
    if (msg.kind !== "kill" && msg.kind !== "drain") return null;
    const out = { type: "hitAck", t: t, kind: msg.kind };
    if (typeof msg.targetPeerId === "string") {
        out.targetPeerId = msg.targetPeerId.slice(0, MAX_PEER_ID_LEN);
    }
    const eatenRadius = finiteNumber(msg.eatenRadius);
    const amount = finiteNumber(msg.amount);
    if (eatenRadius != null && eatenRadius >= 0) {
        out.eatenRadius = Math.min(eatenRadius, MAX_RELAY_RADIUS);
    }
    if (amount != null && amount >= 0) out.amount = Math.min(amount, MAX_RELAY_RADIUS);
    return out;
}

function sanitizeMatchStart(msg, isHost) {
    if (!isHost) return null;
    const t0 = finiteNumber(msg.t0);
    const dustSeed = finiteNumber(msg.dustSeed);
    const roomId = sliceStr(msg.roomId, MAX_ROOM_ID_LEN).replace(/[^A-Z0-9]/g, "");
    const peerOrder = [];
    if (Array.isArray(msg.peerOrder)) {
        const n = Math.min(msg.peerOrder.length, MAX_PEER_ORDER);
        for (let i = 0; i < n; i++) {
            if (typeof msg.peerOrder[i] === "string" && msg.peerOrder[i]) {
                peerOrder.push(msg.peerOrder[i].slice(0, MAX_PEER_ID_LEN));
            }
        }
    }
    return {
        type: "matchStart",
        t0: t0 == null ? 0 : t0,
        roomId: roomId,
        peerOrder: peerOrder,
        dustSeed: dustSeed == null ? 0 : dustSeed >>> 0,
    };
}

function sanitizeMatchEnd(msg) {
    const out = { type: "matchEnd" };
    if (typeof msg.entity === "string") {
        out.entity = msg.entity.replace(/\s+/g, " ").trim().slice(0, 48);
    }
    if (typeof msg.winnerCallsign === "string") {
        out.winnerCallsign = msg.winnerCallsign.slice(0, MAX_CALLSIGN_LEN);
    }
    if (typeof msg.winnerPeerId === "string") {
        out.winnerPeerId = msg.winnerPeerId.slice(0, MAX_PEER_ID_LEN);
    }
    return out;
}

function sanitizeRespawn(msg) {
    const out = { type: "respawn" };
    const x = finiteNumber(msg.x);
    const y = finiteNumber(msg.y);
    const radius = finiteNumber(msg.radius);
    if (x != null) out.x = x;
    if (y != null) out.y = y;
    if (radius != null && radius > 0) out.radius = radius;
    return out;
}

function sanitizeForfeit(msg) {
    const out = { type: "forfeit" };
    if (msg.esc === true) out.esc = true;
    return out;
}

function sanitizeEliminated(msg) {
    const out = { type: "eliminated" };
    if (typeof msg.byPeerId === "string") {
        out.byPeerId = msg.byPeerId.slice(0, MAX_PEER_ID_LEN);
    }
    if (typeof msg.killerCallsign === "string") {
        out.killerCallsign = msg.killerCallsign.slice(0, MAX_CALLSIGN_LEN);
    }
    return out;
}

function sanitizeGameBody(msg, ctx) {
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return null;
    switch (msg.type) {
        case "state":
            if (!allowStateRelay(ctx.ws, ctx.now)) return null;
            return sanitizeState(msg);
        case "cast":
            if (!allowBucket(ctx.ws, ctx.now, "_nebulaCast", CAST_TOKEN_RATE, CAST_TOKEN_BURST)) {
                return null;
            }
            return sanitizeCast(msg);
        case "riftAck":
            if (!allowBucket(ctx.ws, ctx.now, "_nebulaRift", RIFT_ACK_TOKEN_RATE, RIFT_ACK_TOKEN_BURST)) {
                return null;
            }
            return sanitizeRiftAck(msg);
        case "claimHit":
            return sanitizeClaimHit(msg);
        case "hitAck":
            return sanitizeHitAck(msg);
        case "matchStart":
            return sanitizeMatchStart(msg, ctx.isHost === true);
        case "matchEnd":
            return sanitizeMatchEnd(msg);
        case "respawn":
            return sanitizeRespawn(msg);
        case "forfeit":
            return sanitizeForfeit(msg);
        case "eliminated":
            return sanitizeEliminated(msg);
        case "dust":
            return sanitizeDustOrEgg("dust", msg);
        case "egg":
            return sanitizeDustOrEgg("egg", msg);
        default:
            return null;
    }
}

function buildRelayPayload(msg, ctx) {
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return null;
    if (!ctx || !ctx.peerId) return null;
    if (msg.type === "chat") {
        const chat = sanitizeChat(ctx.ws, msg, ctx.now);
        if (!chat) return null;
        chat.fromPeerId = ctx.peerId;
        chat.callsign = ctx.callsign || "";
        return chat;
    }
    const body = sanitizeGameBody(msg, ctx);
    if (!body) return null;
    body.fromPeerId = ctx.peerId;
    return body;
}

module.exports = {
    CHAT_MAX_LEN,
    CHAT_MIN_INTERVAL_MS,
    STATE_TOKEN_RATE,
    STATE_TOKEN_BURST,
    CAST_TOKEN_BURST,
    RIFT_ACK_TOKEN_BURST,
    RIFT_ACK_MAX_AMOUNT,
    MAX_RELAY_RADIUS,
    MAX_EATS_PER_PACKET,
    buildRelayPayload,
    sanitizeChat,
    sanitizeState,
    sanitizeDustOrEgg,
    allowStateRelay,
};
