/**
 * NEBULA VOID — proximity taunts in a mirror match.
 * Reuses relay chat packets. Lobby chat is unchanged: arena chat never
 * writes the lobby log. Only whitelist lines float as text above the cell.
 */
(function (global) {
    "use strict";

    const LINES = [
        { text: "YOU'RE THE SNACK", tags: ["eat", "prey", "chase"] },
        { text: "THIS IS OVER", tags: ["eat"] },
        { text: "OPEN WIDE", tags: ["eat"] },
        { text: "NO ESCAPE", tags: ["eat", "chase"] },
        { text: "I'LL MAKE IT QUICK", tags: ["eat"] },
        { text: "STAY RIGHT THERE", tags: ["eat", "chase"] },
        { text: "NOT TODAY", tags: ["hunted", "flee"] },
        { text: "I'M NOT THE PREY", tags: ["hunted", "underdog"] },
        { text: "TOO EARLY", tags: ["hunted"] },
        { text: "YOU WISH", tags: ["hunted", "flee"] },
        { text: "BACK OFF", tags: ["hunted"] },
        { text: "CATCH ME", tags: ["flee", "escape"] },
        { text: "MISS ME", tags: ["flee", "escape", "dash"] },
        { text: "CHASING A GHOST", tags: ["flee", "escape"] },
        { text: "DON'T BLINK", tags: ["flee", "dash"] },
        { text: "STILL FASTER", tags: ["flee", "escape"] },
        { text: "TOO SLOW", tags: ["chase", "too_slow", "escape"] },
        { text: "RUN, SNACK", tags: ["chase", "too_slow"] },
        { text: "KEEP RUNNING", tags: ["chase", "too_slow"] },
        { text: "I ALREADY WON", tags: ["chase", "prey"] },
        { text: "YOU'RE LATE", tags: ["chase", "too_slow"] },
        { text: "COME BACK", tags: ["too_slow"] },
        { text: "COWARD", tags: ["too_slow"] },
        { text: "I'LL WAIT HERE", tags: ["too_slow", "standoff"] },
        { text: "BYE", tags: ["escape"] },
        { text: "GHOSTED YOU", tags: ["escape", "dash"] },
        { text: "GROW FIRST", tags: ["prey", "spawn"] },
        { text: "LEAVE THE CRUMBS", tags: ["prey"] },
        { text: "I EAT AMBITION", tags: ["prey"] },
        { text: "STILL HUNGRY", tags: ["prey", "max", "generic"] },
        { text: "SIZE TALKS", tags: ["prey"] },
        { text: "SIZE ISN'T SKILL", tags: ["underdog", "max"] },
        { text: "COME GET IT", tags: ["underdog"] },
        { text: "YOU TELEGRAPHED IT", tags: ["underdog", "dash", "cooldown"] },
        { text: "THAT WAS HOPE", tags: ["underdog"] },
        { text: "TRY A BIGGER CELL", tags: ["underdog"] },
        { text: "STAY SMALL", tags: ["spawn"] },
        { text: "KEEP SHRINKING", tags: ["spawn"] },
        { text: "SNACK SIZED", tags: ["spawn"] },
        { text: "TOO FRESH", tags: ["spawn"] },
        { text: "THAT'S THE CEILING", tags: ["max"] },
        { text: "TOO CHUNKY", tags: ["max"] },
        { text: "SAVE THE DASH", tags: ["dash"] },
        { text: "NICE TRAIL", tags: ["dash"] },
        { text: "WASTED THAT", tags: ["dash"] },
        { text: "COOLDOWN'S SHOWING", tags: ["cooldown"] },
        { text: "EMPTY HANDS", tags: ["cooldown"] },
        { text: "WAIT YOUR TURN", tags: ["cooldown"] },
        { text: "WRONG ORBIT", tags: ["void"] },
        { text: "THE VOID PICKED ME", tags: ["void"] },
        { text: "DON'T FEED IT", tags: ["void"] },
        { text: "BAD NEIGHBORHOOD", tags: ["void"] },
        { text: "THIS VOID PICKED ME", tags: ["void"] },
        { text: "READ THE ROOM", tags: ["standoff", "generic"] },
        { text: "AFTER YOU", tags: ["standoff"] },
        { text: "CLOSE, FOR YOU", tags: ["standoff"] },
        { text: "YOUR PLAN'S SHOWING", tags: ["standoff"] },
        { text: "MAKE A MOVE", tags: ["standoff"] },
        { text: "LOSER", tags: ["generic"] },
        { text: "OUTPLAYED", tags: ["generic"] },
        { text: "NICE TRY, VOID", tags: ["generic", "cooldown"] },
        { text: "I SAW THAT COMING", tags: ["generic"] },
        { text: "THE HUNT'S OVER", tags: ["generic", "prey"] },
        { text: "LOOK AT YOU", tags: ["generic"] },
        { text: "YOU BROUGHT A SNACK", tags: ["generic", "prey"] },
    ];

    const LINE_SET = new Set();
    for (let i = 0; i < LINES.length; i++) LINE_SET.add(LINES[i].text);

    const DEFAULT_RANGE_PX = 420;
    const DEFAULT_COOLDOWN_MS = 2200;
    const DEFAULT_BUBBLE_MS = 2400;
    const DEFAULT_GAP_PX = 16;
    const MAX_BUBBLES = 6;
    const FADE_IN_MS = 90;
    const FADE_OUT_MS = 320;
    const RECENT_CAP = 12;

    /** @type {null | Record<string, unknown>} */
    let deps = null;
    /** @type {{ peerId: string, text: string, color: string, born: number, until: number }[]} */
    let bubbles = [];
    let lastSentAt = Number.NEGATIVE_INFINITY;
    /** @type {string[]} */
    let recentLines = [];
    let lastIncomingKey = "";
    let hudBound = false;
    let keysBound = false;
    /** @type {{ id: string, gap: number, at: number, delta: number }} */
    let nearestSnap = { id: "", gap: 0, at: 0, delta: 0 };

    function nowMs() {
        const clock = (global.performance && global.performance.now) || (typeof performance !== "undefined" && performance.now);
        if (typeof clock === "function") return clock.call(global.performance || performance);
        return Date.now();
    }

    function tauntCfg() {
        const boot = global.__GAME_BOOT;
        const raw = boot && boot.multiplayer && boot.multiplayer.taunt;
        const range = raw && Number(raw.rangePx);
        const cd = raw && Number(raw.cooldownMs);
        const life = raw && Number(raw.bubbleMs);
        const gap = raw && Number(raw.gapPx);
        return {
            rangePx: Number.isFinite(range) && range >= 80 && range <= 1200 ? range : DEFAULT_RANGE_PX,
            cooldownMs: Number.isFinite(cd) && cd >= 600 && cd <= 8000 ? cd : DEFAULT_COOLDOWN_MS,
            bubbleMs: Number.isFinite(life) && life >= 800 && life <= 6000 ? life : DEFAULT_BUBBLE_MS,
            gapPx: Number.isFinite(gap) && gap >= 8 && gap <= 48 ? gap : DEFAULT_GAP_PX,
        };
    }

    function sanitizeLine(raw) {
        return String(raw || "")
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 120);
    }

    function isMpTauntLine(raw) {
        return LINE_SET.has(sanitizeLine(raw));
    }

    function runMode() {
        if (deps && typeof deps.getRunMode === "function") {
            const mode = deps.getRunMode();
            if (mode) return mode;
        }
        if (global.NebulaGameMode && typeof global.NebulaGameMode.getRunMode === "function") {
            return global.NebulaGameMode.getRunMode();
        }
        return "single";
    }

    function isMirrorRun() {
        return runMode() === "mirror";
    }

    function isOutOfArena() {
        if (deps && typeof deps.isOutOfArena === "function") return !!deps.isOutOfArena();
        return !!(
            global.isMirrorPlayerOutOfArena &&
            typeof global.isMirrorPlayerOutOfArena === "function" &&
            global.isMirrorPlayerOutOfArena()
        );
    }

    function isArenaLive() {
        return isMirrorRun();
    }

    function localPeerId() {
        if (deps && typeof deps.getLocalPeerId === "function") {
            const id = deps.getLocalPeerId();
            if (id) return id;
        }
        const api = global.NebulaMpRemotes;
        if (api && typeof api.getLocalPeerId === "function") return api.getLocalPeerId();
        return "";
    }

    function asList(value) {
        if (!value) return [];
        if (typeof value.length === "number") return value;
        return [];
    }

    function remoteList() {
        if (deps && typeof deps.getRemotePlayers === "function") {
            return asList(deps.getRemotePlayers());
        }
        const api = global.NebulaMpRemotes;
        if (api && typeof api.getRemotePlayers === "function") return asList(api.getRemotePlayers());
        return [];
    }

    function localPlayer() {
        if (deps && typeof deps.getPlayer === "function") return deps.getPlayer();
        return null;
    }

    function cellPos(rp) {
        const x = typeof rp.displayX === "number" && Number.isFinite(rp.displayX) ? rp.displayX : rp.x;
        const y = typeof rp.displayY === "number" && Number.isFinite(rp.displayY) ? rp.displayY : rp.y;
        const r =
            typeof rp.displayRadius === "number" && Number.isFinite(rp.displayRadius)
                ? rp.displayRadius
                : rp.radius;
        return { x: x, y: y, r: r };
    }

    function settings() {
        if (deps && typeof deps.getGameSettings === "function") {
            const s = deps.getGameSettings();
            if (s && typeof s === "object") return s;
        }
        const boot = global.__GAME_BOOT;
        if (boot && boot.gameSettings && typeof boot.gameSettings === "object") return boot.gameSettings;
        return {};
    }

    function numSetting(key, fallback) {
        const s = settings();
        const v = s ? Number(s[key]) : NaN;
        return Number.isFinite(v) && v > 0 ? v : fallback;
    }

    function nearestPeer(player, remotes) {
        if (!player || typeof player.x !== "number" || typeof player.y !== "number") return null;
        const list = asList(remotes);
        const range = tauntCfg().rangePx;
        const selfR = typeof player.radius === "number" && player.radius > 0 ? player.radius : 0;
        let best = null;
        let bestGap = Infinity;
        for (let i = 0; i < list.length; i++) {
            const rp = list[i];
            if (!rp || rp.active === false || rp.arenaOut) continue;
            const pos = cellPos(rp);
            if (typeof pos.x !== "number" || typeof pos.y !== "number") continue;
            const otherR = typeof pos.r === "number" && pos.r > 0 ? pos.r : 0;
            const gap = Math.hypot(player.x - pos.x, player.y - pos.y) - selfR - otherR;
            if (gap <= range && gap < bestGap) {
                bestGap = gap;
                best = { rp: rp, pos: pos, gap: gap, otherR: otherR, selfR: selfR };
            }
        }
        return best;
    }

    function mpTauntPeerInRange(player, remotes) {
        return !!nearestPeer(player, remotes);
    }

    function commitNearestSnap(hit, now) {
        if (!hit || !hit.rp) {
            nearestSnap.id = "";
            nearestSnap.gap = 0;
            nearestSnap.at = 0;
            nearestSnap.delta = 0;
            return;
        }
        const id = String(hit.rp.peerId || "");
        if (id && nearestSnap.id === id && now - nearestSnap.at < 1200) {
            nearestSnap.delta = nearestSnap.gap - hit.gap;
        } else {
            nearestSnap.delta = 0;
        }
        if (nearestSnap.id !== id || now - nearestSnap.at >= 240) {
            nearestSnap.id = id;
            nearestSnap.gap = hit.gap;
            nearestSnap.at = now;
        }
    }

    function remoteCdLeft(rp, now) {
        if (!rp || !(rp.cd > 0)) return 0;
        const elapsed = rp.cdAt ? Math.max(0, (now - rp.cdAt) / 1000) : 0;
        return Math.max(0, Number(rp.cd) - elapsed);
    }

    function distToBlackHole(x, y) {
        const world = numSetting("WORLD_SIZE", 4000);
        const mid = world * 0.5;
        return Math.hypot(x - mid, y - mid);
    }

    function textsFor(tag) {
        const out = [];
        for (let i = 0; i < LINES.length; i++) {
            const row = LINES[i];
            const tags = row.tags;
            if (!tags) continue;
            for (let t = 0; t < tags.length; t++) {
                if (tags[t] === tag) {
                    out.push(row.text);
                    break;
                }
            }
        }
        return out;
    }

    function allLineTexts() {
        const out = [];
        for (let i = 0; i < LINES.length; i++) out.push(LINES[i].text);
        return out;
    }

    function readMood() {
        const player = localPlayer();
        const hit = nearestPeer(player, remoteList());
        if (!player || !hit) return "generic";
        const now = nowMs();
        const dGap = nearestSnap.id === String(hit.rp.peerId || "") ? nearestSnap.delta : 0;
        const selfR = hit.selfR;
        const otherR = hit.otherR > 0 ? hit.otherR : 1;
        const gap = hit.gap;
        const eatT = numSetting("BOT_EAT_THRESHOLD", 1.1);
        const startR = numSetting("START_RADIUS", 20);
        const maxR = numSetting("MAX_PLAYER_RADIUS", 60);
        const pull = numSetting("BH_PULL_RANGE", 400);
        const canEat = selfR > otherR * eatT;
        const canBeEaten = otherR > selfR * eatT;
        const closing = dGap > 14;
        const opening = dGap < -14;
        const tight = gap < 56;
        const similar = Math.abs(selfR / otherR - 1) < 0.08;

        if (canEat && tight) return "eat";
        if (canBeEaten && tight) return "hunted";
        if (closing && canEat) return "chase";
        if (closing && canBeEaten) return "flee";
        if (opening && canBeEaten) return "escape";
        if (opening && canEat) return "too_slow";
        if (canEat) return "prey";
        if (canBeEaten) return "underdog";
        if (similar && gap < 88) return "standoff";

        const fx = deps && typeof deps.getActiveEffects === "function" ? deps.getActiveEffects() : null;
        if (fx && fx.dashTime > 0) return "dash";
        if (remoteCdLeft(hit.rp, now) > 0.45) return "cooldown";
        if (typeof player.cooldown === "number" && player.cooldown > 0.45) return "cooldown";

        const bhHere = distToBlackHole(player.x, player.y);
        const bhThem = distToBlackHole(hit.pos.x, hit.pos.y);
        if (bhHere < pull * 0.85 || bhThem < pull * 0.85) return "void";

        if (otherR <= startR * 1.18) return "spawn";
        if (selfR >= maxR * 0.9 || otherR >= maxR * 0.9) return "max";
        return "generic";
    }

    function canSendNow() {
        if (!isMirrorRun()) return false;
        if (isOutOfArena()) return false;
        if (deps && typeof deps.getGameActive === "function" && !deps.getGameActive()) return false;
        if (deps && typeof deps.getIsDying === "function" && deps.getIsDying()) return false;
        const player = localPlayer();
        if (!player) return false;
        return mpTauntPeerInRange(player, remoteList());
    }

    function rememberLine(text) {
        if (!text) return;
        recentLines.push(text);
        const cap = Math.min(RECENT_CAP, Math.max(3, LINES.length - 8));
        while (recentLines.length > cap) recentLines.shift();
    }

    function pickFrom(pool, blocked) {
        const open = [];
        for (let i = 0; i < pool.length; i++) {
            if (!blocked.has(pool[i])) open.push(pool[i]);
        }
        if (!open.length) return "";
        return open[(Math.random() * open.length) | 0];
    }

    function pickLine() {
        const blocked = new Set(recentLines);
        const mood = readMood();
        const order = [mood];
        if (mood !== "generic") order.push("generic");
        for (let i = 0; i < order.length; i++) {
            const hit = pickFrom(textsFor(order[i]), blocked);
            if (hit) return hit;
        }
        return pickFrom(allLineTexts(), blocked) || allLineTexts()[0] || "";
    }

    function parseHex(hex) {
        if (!hex || typeof hex !== "string") return { r: 180, g: 180, b: 180 };
        let h = hex.trim();
        if (h[0] === "#") h = h.slice(1);
        if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        if (h.length !== 6) return { r: 180, g: 180, b: 180 };
        const n = parseInt(h, 16);
        if (!Number.isFinite(n)) return { r: 180, g: 180, b: 180 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function senderColor(peerId) {
        const self = localPeerId();
        if (peerId && self && peerId === self) {
            const player = localPlayer();
            if (player && typeof player.glow === "string" && player.glow) return player.glow;
        }
        const list = remoteList();
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].peerId === peerId) {
                return list[i].glow || list[i].color || "#c8c8c8";
            }
        }
        const player = localPlayer();
        return (player && player.glow) || "#c8c8c8";
    }

    function pruneBubbles(now) {
        let w = 0;
        for (let i = 0; i < bubbles.length; i++) {
            if (bubbles[i].until > now) bubbles[w++] = bubbles[i];
        }
        bubbles.length = w;
    }

    function spawnBubble(peerId, text, color, at) {
        const t = typeof at === "number" && Number.isFinite(at) ? at : nowMs();
        const life = tauntCfg().bubbleMs;
        const id = String(peerId || "");
        for (let i = bubbles.length - 1; i >= 0; i--) {
            if (bubbles[i].peerId === id) bubbles.splice(i, 1);
        }
        bubbles.push({
            peerId: id,
            text: text,
            color: color || "#c8c8c8",
            born: t,
            until: t + life,
        });
        while (bubbles.length > MAX_BUBBLES) bubbles.shift();
    }

    function lookupCell(peerId) {
        const self = localPeerId();
        if (peerId && self && peerId === self) {
            const player = localPlayer();
            if (!player) return null;
            return {
                x: player.x,
                y: player.y,
                r: player.radius,
                glow: player.glow,
            };
        }
        const list = remoteList();
        for (let i = 0; i < list.length; i++) {
            const rp = list[i];
            if (!rp || rp.peerId !== peerId) continue;
            if (rp.arenaOut || rp.active === false) return null;
            const pos = cellPos(rp);
            return { x: pos.x, y: pos.y, r: pos.r, glow: rp.glow || rp.color };
        }
        return null;
    }

    function tauntButton() {
        if (typeof document === "undefined" || typeof document.getElementById !== "function") return null;
        return document.getElementById("mpTauntBtn");
    }

    function syncHud() {
        const btn = tauntButton();
        if (!btn) return;
        const visible =
            isMirrorRun() &&
            !isOutOfArena() &&
            !(deps && typeof deps.getIsDying === "function" && deps.getIsDying()) &&
            !(deps && typeof deps.getGameActive === "function" && !deps.getGameActive());
        const ready = visible && canSendNow() && nowMs() - lastSentAt >= tauntCfg().cooldownMs;
        const cooling = visible && nowMs() - lastSentAt < tauntCfg().cooldownMs;
        btn.hidden = !visible;
        btn.disabled = !ready;
        btn.classList.toggle("is-ready", ready);
        btn.classList.toggle("is-cooling", cooling);
        const player = localPlayer();
        const accent = player && typeof player.glow === "string" && player.glow ? player.glow : "#c8c8c8";
        btn.style.setProperty("--mp-taunt-accent", accent);
        btn.setAttribute("aria-hidden", visible ? "false" : "true");
        btn.setAttribute(
            "aria-label",
            ready ? "Proximity taunt (M)" : "Taunt unavailable"
        );
    }

    function bindHud() {
        if (hudBound) return;
        const btn = tauntButton();
        if (!btn) return;
        hudBound = true;
        btn.addEventListener("mousedown", function (e) {
            e.preventDefault();
        });
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            trySendMpTaunt();
        });
    }

    function trySendMpTaunt() {
        if (!canSendNow()) {
            syncHud();
            return false;
        }
        const now = nowMs();
        const cd = tauntCfg().cooldownMs;
        if (now - lastSentAt < cd) {
            syncHud();
            return false;
        }
        const text = pickLine();
        if (!text) return false;
        const api = global.NebulaMpMirror;
        if (!api || typeof api.send !== "function") return false;
        if (!api.send({ type: "chat", text: text, t: now })) return false;
        lastSentAt = now;
        rememberLine(text);
        spawnBubble(localPeerId(), text, senderColor(localPeerId()), now);
        syncHud();
        return true;
    }

    function handleMpTauntMessage(msg) {
        if (!msg || msg.type !== "chat") return false;
        if (!isMirrorRun()) return false;
        const text = sanitizeLine(msg.text);
        if (!LINE_SET.has(text)) return false;
        const from =
            typeof msg.fromPeerId === "string"
                ? msg.fromPeerId
                : typeof msg.peerId === "string"
                  ? msg.peerId
                  : "";
        const self = localPeerId();
        if (from && self && from === self) return false;
        const t = typeof msg.t === "number" && Number.isFinite(msg.t) ? msg.t : 0;
        const key = from + "\0" + t + "\0" + text;
        if (key === lastIncomingKey) return false;
        lastIncomingKey = key;
        spawnBubble(from, text, senderColor(from), nowMs());
        try {
            if (deps && typeof deps.playReceiveSound === "function") deps.playReceiveSound();
        } catch (e) {}
        return true;
    }

    function resetMpTaunts() {
        bubbles.length = 0;
        lastSentAt = Number.NEGATIVE_INFINITY;
        recentLines.length = 0;
        lastIncomingKey = "";
        nearestSnap.id = "";
        nearestSnap.gap = 0;
        nearestSnap.at = 0;
        nearestSnap.delta = 0;
        const btn = tauntButton();
        if (btn) {
            btn.hidden = true;
            btn.disabled = true;
            btn.classList.remove("is-ready", "is-cooling");
        }
    }

    function tickMpTaunts() {
        const now = nowMs();
        pruneBubbles(now);
        commitNearestSnap(nearestPeer(localPlayer(), remoteList()), now);
        bindHud();
        syncHud();
    }

    function project(wx, wy, view) {
        return {
            x: view.centerX + (view.shakeX || 0) + (wx - view.cameraX) * view.zoom,
            y: view.centerY + (view.shakeY || 0) + (wy - view.cameraY) * view.zoom,
        };
    }

    function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
    }

    function bubbleAlpha(b, now) {
        const age = now - b.born;
        const left = b.until - now;
        let a = 1;
        if (age < FADE_IN_MS) a = Math.max(0, age / FADE_IN_MS);
        if (left < FADE_OUT_MS) a = Math.min(a, Math.max(0, left / FADE_OUT_MS));
        return a;
    }

    function drawOneBubble(ctx, b, view, now) {
        const cell = lookupCell(b.peerId);
        if (!cell || typeof cell.x !== "number" || typeof cell.y !== "number") return;
        const zoom = Math.max(0.05, view.zoom || 1);
        const sp = project(cell.x, cell.y, view);
        const sr = Math.max(4, (typeof cell.r === "number" && cell.r > 0 ? cell.r : 20) * zoom);
        if (
            sp.x + sr < -20 ||
            sp.x - sr > view.screenW + 20 ||
            sp.y + sr < -20 ||
            sp.y - sr > view.screenH + 20
        ) {
            return;
        }

        const alpha = bubbleAlpha(b, now);
        if (alpha <= 0.02) return;

        const rgb = parseHex(b.color || cell.glow);
        const gap = tauntCfg().gapPx;
        const tx = Math.round(clamp(sp.x, 18, view.screenW - 18));
        const ty = Math.round(clamp(sp.y - sr - gap, 16, view.screenH - 14));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 12px "Courier New", Courier, monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;

        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.strokeText(b.text, tx, ty);

        ctx.fillStyle = "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")";
        ctx.fillText(b.text, tx, ty);
        ctx.restore();
    }

    function drawMpTauntBubbles(ctx, view) {
        if (!ctx || !view || !isMirrorRun() || isOutOfArena()) return;
        if (!(view.screenW > 0) || !(view.screenH > 0) || !(view.zoom > 0)) return;
        const now = nowMs();
        pruneBubbles(now);
        for (let i = 0; i < bubbles.length; i++) {
            drawOneBubble(ctx, bubbles[i], view, now);
        }
    }

    function onKeyDown(e) {
        if (!e || e.code !== "KeyM" || e.repeat) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const target = e.target;
        const tag = target && target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (target && target.isContentEditable)) return;
        if (!isMirrorRun() || isOutOfArena()) return;
        if (deps && typeof deps.getGameActive === "function" && !deps.getGameActive()) return;
        if (deps && typeof deps.getIsDying === "function" && deps.getIsDying()) return;
        e.preventDefault();
        trySendMpTaunt();
    }

    function bindKeys() {
        if (keysBound) return;
        if (typeof global.addEventListener !== "function") return;
        keysBound = true;
        global.addEventListener("keydown", onKeyDown);
    }

    function configureMpTaunts(nextDeps) {
        deps = nextDeps || null;
        bindKeys();
        bindHud();
        syncHud();
    }

    function getMpTauntBubbles() {
        return bubbles.slice();
    }

    global.configureMpTaunts = configureMpTaunts;
    global.tickMpTaunts = tickMpTaunts;
    global.drawMpTauntBubbles = drawMpTauntBubbles;
    global.handleMpTauntMessage = handleMpTauntMessage;
    global.trySendMpTaunt = trySendMpTaunt;
    global.resetMpTaunts = resetMpTaunts;
    global.isMpTauntLine = isMpTauntLine;
    global.mpTauntPeerInRange = mpTauntPeerInRange;
    global.readMpTauntMood = readMood;
    global.isMpTauntArenaLive = isArenaLive;
    global.getMpTauntBubbles = getMpTauntBubbles;
})(typeof window !== "undefined" ? window : globalThis);
