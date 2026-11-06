/**
 * NEBULA VOID — mirror 1v1 match lifecycle, cards, and PvP net (claimHit / hitAck).
 * configureMirrorMatch() from entities.js after run state exists.
 */
(function (global) {
    "use strict";

    /** @type {null | Record<string, unknown>} */
    let deps = null;

    /** @type {null | "consumed" | "victor" | "lost"} */
    let mirrorCard = null;

    const MIRROR_CLAIM_WINDOW_MS = 100;

    function knownPlayerAbility(kind) {
        if (typeof global.playerAbilityKnown === "function") return global.playerAbilityKnown(kind);
        return kind === "vampire" || kind === "warp" || kind === "speed";
    }

    let mirrorClaimSentAt = 0;
    /** @type {{ t: number, targetPeerId: string }[]} */
    let mirrorOpenClaims = [];
    let mirrorClaimAcceptedAt = 0;
    /** Exact radius the victim has lost to each attacker since the last drain ack. */
    /** @type {Record<string, number>} */
    let mirrorContactDebtByPeer = {};
    let mirrorLastDrainGrantAt = 0;

    let mirrorArenaSize = 0;
    /** Sorted peer ids for current round (includes self). */
    /** @type {string[]} */
    let mirrorMatchPeerOrder = [];
    let mirrorInArena = false;
    /** @type {string} */
    let mirrorLastAttackerPeerId = "";

    let nobodyAliveCheckTimer = null;
    let mirrorPvpDeathPending = false;
    /** Frozen at match start so a dropped socket cannot erase our id mid-round. */
    let mirrorLocalPeerId = "";
    /** @type {null | { msg: Record<string, unknown>, snapshot: Record<string, unknown> }} */
    let pendingMirrorMatchEnd = null;

    function configureMirrorMatch(nextDeps) {
        if (!nextDeps || typeof nextDeps.getPlayer !== "function") {
            throw new Error("configureMirrorMatch requires getPlayer, getRemotePlayer, and run callbacks");
        }
        deps = nextDeps;
    }

    function settings() {
        return deps.getGameSettings();
    }

    function localPeerId() {
        if (mirrorLocalPeerId) return mirrorLocalPeerId;
        if (typeof deps.getLocalPeerId === "function") return deps.getLocalPeerId();
        return null;
    }

    function remoteList() {
        if (typeof deps.getRemotePlayers === "function") return deps.getRemotePlayers();
        const one = deps.getRemotePlayer();
        return one ? [one] : [];
    }

    function primaryOpponentCell() {
        let best = null;
        const list = remoteList();
        for (let i = 0; i < list.length; i++) {
            const rp = list[i];
            if (!rp || !rp.active) continue;
            if (!best || rp.radius > best.radius) best = rp;
        }
        return best || deps.getRemotePlayer();
    }

    function mirrorSpawnSlots(n, mid, off) {
        const slots = [];
        const count = Math.max(1, n);
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 - Math.PI / 2;
            slots.push({
                x: mid + Math.cos(a) * off,
                y: mid + Math.sin(a) * off,
            });
        }
        return slots;
    }

    function setupArenaSpawns(peerOrder, GAME_SETTINGS) {
        const player = deps.getPlayer();
        const mid = GAME_SETTINGS.WORLD_SIZE / 2;
        const spawnOff = 500;
        const selfId = localPeerId();
        const api = global.NebulaMpRemotes;
        if (api && typeof api.clearRemotePeers === "function") api.clearRemotePeers();

        let order = Array.isArray(peerOrder) ? peerOrder.slice() : [];
        if (selfId && order.indexOf(selfId) < 0) order.push(selfId);
        if (order.length < 2 && selfId) {
            order = selfId ? [selfId] : order;
        }
        order = order.filter(Boolean).sort();
        const slots = mirrorSpawnSlots(order.length, mid, spawnOff);
        const myIdx = selfId ? order.indexOf(selfId) : 0;
        const idx = myIdx >= 0 ? myIdx : 0;

        player.x = slots[idx].x;
        player.y = slots[idx].y;
        deps.setCameraPosition(player.x, player.y);

        const lobbyState =
            typeof deps.getMultiplayerLobbyState === "function"
                ? deps.getMultiplayerLobbyState()
                : null;
        const roster =
            lobbyState && lobbyState.peers && typeof lobbyState.peers === "object"
                ? lobbyState.peers
                : null;

        for (let i = 0; i < order.length; i++) {
            const pid = order[i];
            if (selfId && pid === selfId) continue;
            const rp = api && api.ensureRemotePeer ? api.ensureRemotePeer(pid) : null;
            if (!rp) continue;
            const meta = roster && roster[pid] ? roster[pid] : null;
            rp.peerId = pid;
            rp.active = false;
            rp.arenaOut = false;
            rp.entity = meta && typeof meta.skinName === "string" ? meta.skinName : "";
            rp.ability = meta && typeof meta.ability === "string" ? meta.ability : "";
            if (meta && typeof meta.color === "string" && meta.color) {
                rp.glow = meta.color;
            }
            rp.cd = 0;
            rp.cdMax = 0;
            rp.cdAt = 0;
            rp.netVelX = 0;
            rp.netVelY = 0;
            rp.netStateT = 0;
            rp.netSenderT = 0;
            rp.radius = GAME_SETTINGS.START_RADIUS;
            rp.x = slots[i].x;
            rp.y = slots[i].y;
            rp.displayX = rp.x;
            rp.displayY = rp.y;
            rp.displayRadius = rp.radius;
        }
        mirrorMatchPeerOrder = order.slice();
    }

    function clearRemoteAbilityState() {
        const list = remoteList();
        for (let i = 0; i < list.length; i++) {
            const rp = list[i];
            if (!rp) continue;
            rp.ability = "";
            rp.cd = 0;
            rp.cdMax = 0;
            rp.cdAt = 0;
        }
    }

    function resetMirrorCombatNet() {
        mirrorClaimSentAt = 0;
        mirrorOpenClaims = [];
        mirrorClaimAcceptedAt = 0;
        mirrorContactDebtByPeer = {};
        mirrorLastDrainGrantAt = 0;
    }

    function addContactDebt(peerId, amount) {
        if (!peerId || !(amount > 0)) return;
        mirrorContactDebtByPeer[peerId] = (mirrorContactDebtByPeer[peerId] || 0) + amount;
    }

    function contactDrainCap(now) {
        const rate = settings().BOT_CONTACT_DRAIN;
        const minSec = MIRROR_CLAIM_WINDOW_MS / 1000;
        const elapsed =
            mirrorLastDrainGrantAt > 0 ? (now - mirrorLastDrainGrantAt) / 1000 : minSec * 3;
        const sec = Math.min(1, Math.max(minSec, elapsed) + 0.03);
        return rate * sec;
    }

    function grantContactDrain(player, amount, now) {
        if (!(amount > 0)) return;
        const grant = Math.min(amount, contactDrainCap(now));
        if (!(grant > 0)) return;
        const maxR = settings().MAX_PLAYER_RADIUS;
        player.radius = Math.min(maxR, player.radius + grant);
        mirrorLastDrainGrantAt = now;
    }

    function mirrorEntityLabel(raw) {
        const name = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 32);
        return name ? name.toUpperCase() : "OPPONENT";
    }

    function peerCallsign(peerId) {
        if (peerId && typeof global.getPeerCallsign === "function") {
            const tag = global.getPeerCallsign(peerId);
            if (tag) return tag;
        }
        return "";
    }

    function killerDisplayLabel() {
        if (!mirrorLastAttackerPeerId) return "THE VOID";
        const tag = peerCallsign(mirrorLastAttackerPeerId);
        if (tag) return tag;
        const rp = deps.getRemotePlayer(mirrorLastAttackerPeerId);
        if (rp && rp.entity) return mirrorEntityLabel(rp.entity).slice(0, 12);
        return "THE VOID";
    }

    function noteMirrorAttacker(peerId) {
        if (typeof peerId === "string" && peerId) mirrorLastAttackerPeerId = peerId;
    }

    function markMirrorEnvironmentalDeath() {
        mirrorPvpDeathPending = false;
        mirrorLastAttackerPeerId = "";
    }

    function mirrorEliminationDeathUi() {
        if (!mirrorEliminationMode()) return false;
        if (!global.NebulaGameMode || global.NebulaGameMode.getRunMode() !== "mirror") return false;
        if (deps.getIsDying()) return true;
        return mirrorCard === "consumed" && !mirrorInArena;
    }

    function canMirrorDeathMenuAction() {
        if (!mirrorEliminationMode() || mirrorInArena) return false;
        return mirrorCard === "consumed";
    }

    function mirrorTerminalCard() {
        return mirrorCard === "victor" || mirrorCard === "roundover" || mirrorCard === "lost";
    }

    function scheduleNobodyAliveCheck() {
        if (nobodyAliveCheckTimer) clearTimeout(nobodyAliveCheckTimer);
        nobodyAliveCheckTimer = setTimeout(() => {
            nobodyAliveCheckTimer = null;
            tryDeclareMirrorVictory();
            tryEndRoundIfNobodyAlive();
        }, 220);
    }

    let mirrorVictoryPollAt = 0;

    function tickMirrorVictoryPoll() {
        if (!mirrorEliminationMode()) return;
        if (!global.NebulaGameMode || global.NebulaGameMode.getRunMode() !== "mirror") return;
        if (mirrorCard === "victor" || mirrorCard === "roundover" || mirrorCard === "lost") return;
        const now = performance.now();
        if (now - mirrorVictoryPollAt < 450) return;
        mirrorVictoryPollAt = now;
        tryDeclareMirrorVictory();
    }

    function tryEndRoundIfNobodyAlive() {
        if (!mirrorEliminationMode()) return;
        if (!global.NebulaGameMode || global.NebulaGameMode.getRunMode() !== "mirror") return;
        if (mirrorCard === "victor" || mirrorCard === "roundover") return;
        if (countAliveInArena() > 0) return;
        sendMirror({
            type: "matchEnd",
            entity: "THE VOID",
            winnerCallsign: "VOID",
            winnerPeerId: "",
        });
        const snapshot = captureMirrorSnapshot();
        snapshot.opponent = "VOID";
        snapshot.title = "VOID DOMINATED THE VOID";
        endMirrorMatch();
        presentMirrorCard("roundover", snapshot, {
            retry: "RETURN TO LOBBY",
            change: "CHANGE ENTITY",
            totalStatLabel: "WINNER",
        });
    }

    function setRemoteOutOfArena(peerId) {
        const id = String(peerId || "").trim();
        if (!id) return;
        if (typeof global.clearMirrorPeerAbilities === "function") global.clearMirrorPeerAbilities(id);
        const api = global.NebulaMpRemotes;
        if (api && typeof api.ensureRemotePeer === "function") api.ensureRemotePeer(id);
        if (api && typeof api.deactivateRemotePeer === "function") {
            api.deactivateRemotePeer(id);
            return;
        }
        const rp = deps.getRemotePlayer(id);
        if (rp) {
            rp.active = false;
            rp.entity = "";
            rp.displayRadius = 0;
            rp.radius = 0;
            rp.arenaOut = true;
        }
    }

    function mirrorEliminationMode() {
        return mirrorArenaSize >= 2;
    }

    function countAliveInArena() {
        let n = 0;
        if (mirrorInArena && deps.getGameActive() && !deps.getIsDying()) n += 1;

        const selfId = localPeerId();
        const order =
            mirrorMatchPeerOrder.length > 0
                ? mirrorMatchPeerOrder
                : remoteList()
                      .map((rp) => (rp && rp.peerId) || "")
                      .filter(Boolean);

        for (let i = 0; i < order.length; i++) {
            const pid = order[i];
            if (!pid || (selfId && pid === selfId)) continue;
            const rp = deps.getRemotePlayer(pid);
            if (rp && rp.arenaOut) continue;
            n += 1;
        }
        return n;
    }

    /** The one peer still in the arena, or "" when the count is not exactly one. */
    function soleAlivePeerId() {
        const ids = [];
        const selfId = localPeerId();
        if (mirrorInArena && deps.getGameActive() && !deps.getIsDying() && selfId) ids.push(selfId);
        const order =
            mirrorMatchPeerOrder.length > 0
                ? mirrorMatchPeerOrder
                : remoteList()
                      .map((rp) => (rp && rp.peerId) || "")
                      .filter(Boolean);
        for (let i = 0; i < order.length; i++) {
            const pid = order[i];
            if (!pid || (selfId && pid === selfId)) continue;
            const rp = deps.getRemotePlayer(pid);
            if (rp && rp.arenaOut) continue;
            ids.push(pid);
        }
        return ids.length === 1 ? ids[0] : "";
    }

    function clearNutrientsNear(x, y, rangePx) {
        const pool = deps.getPoolNutrients();
        if (!pool || !Array.isArray(pool)) return;
        const r2 = rangePx * rangePx;
        for (let i = 0; i < pool.length; i++) {
            const n = pool[i];
            if (!n || !n.active) continue;
            const dx = n.x - x;
            const dy = n.y - y;
            if (dx * dx + dy * dy <= r2) n.active = false;
        }
    }

    function nudgeSpawnFromNutrients(px, py, radius, pool) {
        const list = pool || [];
        const pad = radius + 34;
        let x = px;
        let y = py;
        for (let pass = 0; pass < 10; pass++) {
            let moved = false;
            for (let i = 0; i < list.length; i++) {
                const n = list[i];
                if (!n || !n.active) continue;
                const dx = x - n.x;
                const dy = y - n.y;
                const d = Math.hypot(dx, dy);
                if (d < pad && d > 0.001) {
                    const push = (pad - d) / d;
                    x += dx * push;
                    y += dy * push;
                    moved = true;
                }
            }
            if (!moved) break;
        }
        const max = settings().WORLD_SIZE - radius;
        x = Math.max(radius, Math.min(max, x));
        y = Math.max(radius, Math.min(max, y));
        return { x, y };
    }

    function respawnLocalInArena(peerOrder) {
        const GAME_SETTINGS = settings();
        const player = deps.getPlayer();
        const mid = GAME_SETTINGS.WORLD_SIZE / 2;
        const spawnOff = 500;
        const selfId = localPeerId();
        let order = Array.isArray(peerOrder) ? peerOrder.slice() : [];
        if (selfId && order.indexOf(selfId) < 0) order.push(selfId);
        order = order.filter(Boolean).sort();
        const slots = mirrorSpawnSlots(order.length, mid, spawnOff);
        const idx = selfId ? order.indexOf(selfId) : 0;
        const slot = slots[idx >= 0 ? idx : 0];
        const poolNutrients = deps.getPoolNutrients();
        const nudged = nudgeSpawnFromNutrients(
            slot.x,
            slot.y,
            GAME_SETTINGS.START_RADIUS,
            poolNutrients
        );
        player.x = nudged.x;
        player.y = nudged.y;
        clearNutrientsNear(nudged.x, nudged.y, 200);
        player.radius = GAME_SETTINGS.START_RADIUS;
        player.score = 0;
        player.cooldown = 0;
        deps.setCameraPosition(player.x, player.y);
        if (typeof deps.setCameraLookAhead === "function") deps.setCameraLookAhead(0, 0);
        if (typeof deps.resetScreenShake === "function") deps.resetScreenShake();
        if (typeof deps.setScoreHudText === "function") deps.setScoreHudText("0");
        const screenW = typeof deps.getScreenW === "function" ? deps.getScreenW() : 0;
        const screenH = typeof deps.getScreenH === "function" ? deps.getScreenH() : 0;
        if (typeof deps.setInterpolatedZoom === "function" && screenW && screenH) {
            deps.setInterpolatedZoom(Math.min(1.0, Math.min(screenW, screenH) / 700));
        }
        resetMirrorCombatNet();
        if (typeof deps.clearLocalAbilityEffects === "function") deps.clearLocalAbilityEffects();
        const glass = global.NebulaGlass;
        if (glass && typeof glass.forgetPresence === "function") glass.forgetPresence();
        if (glass && typeof glass.discardBodyGrants === "function") glass.discardBodyGrants();
    }

    function captureMirrorSnapshot() {
        const player = deps.getPlayer();
        const remotePlayer = primaryOpponentCell();
        const roundStartTime = deps.getRoundStartTime();
        const activeRunSkinName = deps.getActiveRunSkinName();
        return {
            score: Math.max(0, Math.floor(player.score) || 0),
            seconds: Math.max(0, (performance.now() - roundStartTime) / 1000),
            opponent: mirrorEntityLabel(remotePlayer && remotePlayer.entity),
            accent: (player && (player.glow || player.color)) || "#b482ff",
            selfName: mirrorEntityLabel(activeRunSkinName),
        };
    }

    function presentMirrorCard(kind, snapshot, overlayOpts) {
        const shot = snapshot || captureMirrorSnapshot();
        const opponent = shot.opponent || "OPPONENT";
        let title = "OPPONENT DISCONNECTED";
        if (kind === "consumed") title = `${opponent} CONSUMED YOU`;
        else if (kind === "victor") title = `YOU DOMINATED THE VOID`;
        else if (kind === "roundover") title = shot.title || `${opponent} DOMINATED THE VOID`;
        mirrorCard = kind;
        if (typeof deps.showMirrorMatchOverlay === "function") {
            deps.showMirrorMatchOverlay({
                title,
                opponent,
                score: shot.score,
                seconds: shot.seconds,
                accent: shot.accent,
                ...(overlayOpts || {}),
            });
        }
        deps.ensureDrawLoop();
    }

    function presentMirrorEliminationOverlay(snapshot) {
        const shot = snapshot || captureMirrorSnapshot();
        const killer = shot.opponent || killerDisplayLabel();
        shot.opponent = killer;
        mirrorCard = "consumed";
        if (typeof deps.showMirrorMatchOverlay === "function") {
            deps.showMirrorMatchOverlay({
                title: `${killer} CONSUMED YOU`,
                opponent: killer,
                totalStatLabel: "KILLED BY",
                retry: "RE-ENTER ARENA",
                change: "RETURN TO LOBBY",
                score: shot.score,
                seconds: shot.seconds,
                accent: shot.accent,
            });
        }
        deps.ensureDrawLoop();
    }

    function tryDeclareMirrorVictory() {
        if (!mirrorEliminationMode() || !mirrorInArena) return;
        if (!deps.getGameActive() || deps.getIsDying()) return;
        if (countAliveInArena() !== 1) return;
        const selfId = localPeerId();
        const snapshot = captureMirrorSnapshot();
        const tag = (selfId && peerCallsign(selfId)) || snapshot.selfName;
        snapshot.opponent = tag;
        sendMirror({
            type: "matchEnd",
            entity: snapshot.selfName,
            winnerCallsign: tag,
            winnerPeerId: selfId || "",
        });
        mirrorCard = "victor";
        endMirrorMatch();
        presentMirrorCard("victor", snapshot, {
            retry: "RETURN TO LOBBY",
            change: "CHANGE ENTITY",
            totalStatLabel: "CALLSIGN",
        });
    }

    function endMirrorMatch() {
        resetMirrorCombatNet();
        if (typeof global.resetMirrorAbilities === "function") global.resetMirrorAbilities();
        pendingMirrorMatchEnd = null;
        mirrorLocalPeerId = "";
        mirrorMatchPeerOrder = [];
        mirrorInArena = false;
        if (typeof global.NebulaDust !== "undefined" && global.NebulaDust.end) global.NebulaDust.end();
        if (typeof global.NebulaGlass !== "undefined" && global.NebulaGlass.end) global.NebulaGlass.end();
        if (typeof global.stopMpNetworkTick === "function") global.stopMpNetworkTick();
        deps.setGameActive(false);
        deps.setIsDying(false);
        const api = global.NebulaMpRemotes;
        if (api && typeof api.clearRemotePeers === "function") api.clearRemotePeers();
        clearRemoteAbilityState();
        if (global.NebulaGameMode && typeof global.NebulaGameMode.resetRunMode === "function") {
            global.NebulaGameMode.resetRunMode();
        }
        if (typeof global.hideMpMatchUpgradeHud === "function") global.hideMpMatchUpgradeHud();
        if (typeof global.resetMpTaunts === "function") global.resetMpTaunts();
        document.body.classList.remove("game-running");
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();
        if (typeof deps.setAmbientLevel === "function") deps.setAmbientLevel(0.0001, 1.1);
        if (typeof deps.updateBlackHoleAudio === "function") deps.updateBlackHoleAudio(9999, 9999);
        deps.hideMenuOverlay(deps.dom.multiplayerLobbyScreen);
        deps.ensureDrawLoop();
    }

    function mirrorAbilitySnapshot() {
        const player = deps.getPlayer();
        const selectedAbility = deps.getSelectedAbility();
        const GAME_SETTINGS = settings();
        const ability = knownPlayerAbility(selectedAbility) ? selectedAbility : "";
        const base = ability ? Number(GAME_SETTINGS[`CD_${ability.toUpperCase()}`]) || 0 : 0;
        const mul =
            typeof deps.getSignalCooldownMultiplier === "function"
                ? deps.getSignalCooldownMultiplier()
                : 1;
        const cdMax = base * mul;
        const cd = player.cooldown > 0 ? player.cooldown : 0;
        return { ability, cd, cdMax };
    }

    function mirrorRunActive() {
        return !!(
            mirrorInArena &&
            deps.getGameActive() &&
            !deps.getIsDying() &&
            global.NebulaGameMode &&
            global.NebulaGameMode.getRunMode() === "mirror"
        );
    }

    const MAX_EATS_PER_FLUSH = 24;

    function eatItemsFromRelay(msg) {
        if (!msg || typeof msg !== "object") return [];
        if (Array.isArray(msg.eats)) {
            const out = [];
            const n = Math.min(msg.eats.length, MAX_EATS_PER_FLUSH);
            for (let i = 0; i < n; i++) {
                const item = msg.eats[i];
                if (!item || !Number.isInteger(item.id)) continue;
                out.push(item);
            }
            return out;
        }
        if (Number.isInteger(msg.id)) return [{ id: msg.id, s: msg.s }];
        return [];
    }

    function flushRelayEats(kind, source) {
        if (!source || typeof source.takeLocalEats !== "function") return;
        let batch = source.takeLocalEats();
        if (!batch.length) return;
        if (batch.length > MAX_EATS_PER_FLUSH) {
            const extra = batch.slice(MAX_EATS_PER_FLUSH);
            batch = batch.slice(0, MAX_EATS_PER_FLUSH);
            if (typeof source.restoreLocalEats === "function") source.restoreLocalEats(extra);
        }
        const sent = sendMirror({ type: kind, eats: batch });
        if (!sent && typeof source.restoreLocalEats === "function") source.restoreLocalEats(batch);
    }

    function flushMirrorDustEats() {
        if (!mirrorRunActive()) return;
        const dust = global.NebulaDust;
        if (!dust || typeof dust.takeLocalEats !== "function") return;
        flushRelayEats("dust", dust);
    }

    function flushMirrorGlassEats() {
        if (!global.NebulaGameMode || global.NebulaGameMode.getRunMode() !== "mirror") return;
        const glass = global.NebulaGlass;
        if (!glass || !glass.isActive() || typeof glass.takeLocalEats !== "function") return;
        flushRelayEats("egg", glass);
    }

    function onRemoteGlass(msg) {
        if (!msg || !global.NebulaGameMode || global.NebulaGameMode.getRunMode() !== "mirror") return;
        const glass = global.NebulaGlass;
        if (!glass || typeof glass.consumeRemote !== "function") return;
        const peer = typeof msg.fromPeerId === "string" ? msg.fromPeerId : "";
        const items = eatItemsFromRelay(msg);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (typeof item.s !== "number" || !Number.isFinite(item.s) || item.s < 0) continue;
            glass.consumeRemote(item.id, item.s, peer);
        }
    }

    function onRemoteDust(msg) {
        if (!msg || !global.NebulaGameMode || global.NebulaGameMode.getRunMode() !== "mirror") return;
        const dust = global.NebulaDust;
        if (!dust || typeof dust.consumeRemote !== "function") return;
        const items = eatItemsFromRelay(msg);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const bornAt = typeof item.s === "number" && item.s >= 0 ? item.s : 0;
            dust.consumeRemote(item.id, bornAt);
        }
    }

    function sendMirror(payload) {
        const api = global.NebulaMpMirror;
        if (!api || typeof api.send !== "function") return false;
        return api.send(payload) === true;
    }

    function isMirrorEliminationOverlayActive() {
        return mirrorCard === "consumed" && !mirrorInArena && mirrorEliminationMode();
    }

    function isMirrorPlayerOutOfArena() {
        if (!mirrorEliminationMode()) return false;
        if (!global.NebulaGameMode || global.NebulaGameMode.getRunMode() !== "mirror") return false;
        return !mirrorInArena;
    }

    function tryMirrorReEnterArena() {
        if (!canMirrorDeathMenuAction()) return false;
        if (global.NebulaGameMode && typeof global.NebulaGameMode.setRunMode === "function") {
            global.NebulaGameMode.setRunMode("mirror");
        }
        const st =
            typeof deps.getMultiplayerLobbyState === "function"
                ? deps.getMultiplayerLobbyState()
                : null;
        const peerOrder = (st && st.peerOrder) || [];
        deps.hideGameOverOverlay();
        deps.setIsDying(false);
        mirrorLastAttackerPeerId = "";
        mirrorPvpDeathPending = false;
        mirrorInArena = true;
        respawnLocalInArena(peerOrder);
        deps.setGameActive(true);
        mirrorCard = null;
        if (typeof global.beginMpMatchUpgradeHud === "function") global.beginMpMatchUpgradeHud();
        document.body.classList.add("game-running");
        if (typeof deps.setAmbientLevel === "function") {
            deps.setAmbientLevel(deps.getAmbientArenaGain(), 2.8);
        }
        if (typeof global.startMpNetworkTick === "function") global.startMpNetworkTick();
        const player = deps.getPlayer();
        const GAME_SETTINGS = settings();
        sendMirror({
            type: "respawn",
            x: player.x,
            y: player.y,
            radius: GAME_SETTINGS.START_RADIUS,
        });
        if (typeof global.restartDrawLoop === "function") global.restartDrawLoop();
        else deps.ensureDrawLoop();
        return true;
    }

    function resumeLobby(releaseRoom) {
        if (typeof deps.resumeMultiplayerLobby !== "function") return;
        deps.resumeMultiplayerLobby({ releaseRoom: releaseRoom === true });
    }

    function tryMirrorForfeitToLobby() {
        if (!canMirrorDeathMenuAction()) return false;
        const releaseRoom = !remoteOpponentsStillInArena();
        sendMirror({ type: "forfeit" });
        mirrorCard = null;
        mirrorInArena = false;
        deps.hideGameOverOverlay();
        endMirrorMatch();
        resumeLobby(releaseRoom);
        deps.showMenuOverlay(deps.dom.multiplayerLobbyScreen);
        deps.ensureDrawLoop();
        return true;
    }

    function tryMirrorReturnToLobbyUi() {
        const releaseRoom = !remoteOpponentsStillInArena();
        mirrorCard = null;
        mirrorInArena = false;
        deps.hideGameOverOverlay();
        endMirrorMatch();
        resumeLobby(releaseRoom);
        deps.showMenuOverlay(deps.dom.multiplayerLobbyScreen);
        deps.ensureDrawLoop();
        return true;
    }

    function tryMirrorEscapeToLobby() {
        if (!mirrorRunActive()) return false;
        sendMirror({ type: "forfeit", esc: true });
        return tryMirrorReturnToLobbyUi();
    }

    function tryMirrorGameOverRetry() {
        if (mirrorCard === "lost" || mirrorCard === "victor" || mirrorCard === "roundover") {
            return tryMirrorReturnToLobbyUi();
        }
        if (tryMirrorReEnterArena()) return true;
        if (
            canMirrorDeathMenuAction() &&
            global.NebulaGameMode &&
            global.NebulaGameMode.getRunMode() === "mirror"
        ) {
            mirrorCard = "consumed";
            if (tryMirrorReEnterArena()) return true;
        }
        if (!mirrorCard) return false;
        if (global.NebulaGameMode && global.NebulaGameMode.getRunMode() === "mirror") {
            if (mirrorCard === "victor" || mirrorCard === "roundover") {
                return tryMirrorReturnToLobbyUi();
            }
            return false;
        }
        const releaseRoom = !remoteOpponentsStillInArena();
        mirrorCard = null;
        deps.hideGameOverOverlay();
        resumeLobby(releaseRoom);
        deps.showMenuOverlay(deps.dom.multiplayerLobbyScreen);
        deps.ensureDrawLoop();
        return true;
    }

    function tryMirrorGameOverChangeEntity() {
        if (mirrorCard === "lost" || mirrorCard === "victor" || mirrorCard === "roundover") {
            mirrorCard = null;
            deps.hideGameOverOverlay();
            if (typeof deps.resetMultiplayerLobby === "function") deps.resetMultiplayerLobby();
            deps.returnFromMultiplayerLobbyToEntitySelect();
            return true;
        }
        if (tryMirrorForfeitToLobby()) return true;
        if (!mirrorCard) return false;
        mirrorCard = null;
        deps.hideGameOverOverlay();
        if (typeof deps.resetMultiplayerLobby === "function") deps.resetMultiplayerLobby();
        deps.returnFromMultiplayerLobbyToEntitySelect();
        return true;
    }

    function remoteOpponentsStillInArena() {
        const selfId = localPeerId();
        const order =
            mirrorMatchPeerOrder.length > 0
                ? mirrorMatchPeerOrder
                : remoteList()
                      .map((rp) => (rp && rp.peerId) || "")
                      .filter(Boolean);
        for (let i = 0; i < order.length; i++) {
            const pid = order[i];
            if (!pid || (selfId && pid === selfId)) continue;
            const rp = deps.getRemotePlayer(pid);
            if (rp && rp.arenaOut) continue;
            return true;
        }
        return false;
    }

    function presentOpponentLeftCard() {
        const snapshot = captureMirrorSnapshot();
        sendMirror({
            type: "matchEnd",
            entity: "THE VOID",
            winnerCallsign: "VOID",
            winnerPeerId: "",
        });
        endMirrorMatch();
        presentMirrorCard("lost", snapshot, {
            retry: "RETURN TO LOBBY",
            change: "CHANGE ENTITY",
        });
    }

    function returnToLobbyOverlay() {
        if (typeof deps.showMenuOverlay === "function") {
            deps.showMenuOverlay(deps.dom.multiplayerLobbyScreen);
        }
        if (typeof deps.ensureDrawLoop === "function") deps.ensureDrawLoop();
    }

    function abortMirrorMatchToLobby() {
        const inMirror =
            global.NebulaGameMode &&
            typeof global.NebulaGameMode.getRunMode === "function" &&
            global.NebulaGameMode.getRunMode() === "mirror";
        if (!inMirror && !mirrorInArena && !mirrorCard) return false;
        pendingMirrorMatchEnd = null;
        mirrorCard = null;
        mirrorInArena = false;
        if (typeof deps.hideGameOverOverlay === "function") deps.hideGameOverOverlay();
        endMirrorMatch();
        resumeLobby(true);
        returnToLobbyOverlay();
        return true;
    }

    function noteMirrorRelayLost() {
        const inMirror =
            global.NebulaGameMode &&
            typeof global.NebulaGameMode.getRunMode === "function" &&
            global.NebulaGameMode.getRunMode() === "mirror";
        if (!inMirror && !mirrorInArena && !mirrorCard) return;
        pendingMirrorMatchEnd = null;
        mirrorCard = null;
        mirrorInArena = false;
        if (typeof deps.hideGameOverOverlay === "function") deps.hideGameOverOverlay();
        endMirrorMatch();
        returnToLobbyOverlay();
    }

    function noteMirrorOpponentLeft(msg) {
        const leftId = msg && typeof msg.peerId === "string" ? msg.peerId : "";
        if (leftId) setRemoteOutOfArena(leftId);
        const inMirrorRun =
            mirrorEliminationMode() &&
            global.NebulaGameMode &&
            global.NebulaGameMode.getRunMode() === "mirror";
        if (!inMirrorRun || mirrorTerminalCard()) return;
        if (remoteOpponentsStillInArena()) return;
        if (!deps.getGameActive() && !deps.getIsDying() && mirrorCard !== "consumed") return;
        presentOpponentLeftCard();
    }

    function matchEndNamesVoid(msg) {
        return (
            !!msg &&
            (msg.winnerCallsign === "VOID" || mirrorEntityLabel(msg.entity) === "THE VOID")
        );
    }

    /**
     * A matchEnd is real only when this client already sees the round as over.
     * Two or more cells still in the arena means the packet is early or forged,
     * except a local re-enter that lands on a round someone else already closed.
     */
    function matchEndIsCredible(msg) {
        const winnerPeerId = msg && typeof msg.winnerPeerId === "string" ? msg.winnerPeerId : "";
        if (!mirrorEliminationMode()) return !winnerPeerId;
        if (!mirrorInArena && (mirrorCard === "consumed" || deps.getIsDying())) return true;
        const alive = countAliveInArena();
        if (alive > 1) {
            if (!mirrorInArena) return false;
            const selfPlaying =
                mirrorInArena && deps.getGameActive() && !deps.getIsDying() ? 1 : 0;
            if (alive - selfPlaying > 1) return false;
            if (winnerPeerId) {
                const selfId = localPeerId();
                return !selfId || winnerPeerId !== selfId;
            }
            return matchEndNamesVoid(msg);
        }
        if (alive === 1) return !!winnerPeerId && soleAlivePeerId() === winnerPeerId;
        return !winnerPeerId && matchEndNamesVoid(msg);
    }

    function presentRemoteMatchEnd(msg, snapshotOverride) {
        const snapshot = snapshotOverride || captureMirrorSnapshot();
        const winnerPeerId = msg && typeof msg.winnerPeerId === "string" ? msg.winnerPeerId : "";
        const winnerTag =
            (msg && msg.winnerCallsign && String(msg.winnerCallsign).slice(0, 5).toUpperCase()) ||
            (msg && msg.entity ? mirrorEntityLabel(msg.entity) : "OPPONENT");
        snapshot.opponent = winnerTag;
        const wasEliminated = mirrorCard === "consumed" && !mirrorInArena;
        const voidRound = !winnerPeerId && matchEndNamesVoid(msg);
        endMirrorMatch();
        const overlayBtns = {
            retry: "RETURN TO LOBBY",
            change: "CHANGE ENTITY",
            totalStatLabel: "WINNER",
        };
        if (winnerPeerId || wasEliminated || voidRound) {
            snapshot.title = `${winnerTag} DOMINATED THE VOID`;
            presentMirrorCard("roundover", snapshot, overlayBtns);
            return;
        }
        if (mirrorCard) return;
        presentMirrorCard("victor", snapshot, overlayBtns);
    }

    function onRemoteMatchEnd(msg) {
        if (mirrorCard === "victor") return;
        if (!global.NebulaGameMode || global.NebulaGameMode.getRunMode() !== "mirror") return;
        const selfId = localPeerId();
        const winnerPeerId = msg && typeof msg.winnerPeerId === "string" ? msg.winnerPeerId : "";
        if (winnerPeerId && selfId && winnerPeerId === selfId) return;
        if (!matchEndIsCredible(msg)) return;

        if (deps.getIsDying()) {
            pendingMirrorMatchEnd = { msg: msg, snapshot: captureMirrorSnapshot() };
            return;
        }
        presentRemoteMatchEnd(msg);
    }

    function onRemoteEliminated(msg) {
        if (!msg || global.NebulaGameMode?.getRunMode() !== "mirror") return;
        const victimId = typeof msg.fromPeerId === "string" ? msg.fromPeerId : "";
        if (!victimId || victimId === localPeerId()) return;
        setRemoteOutOfArena(victimId);
        scheduleNobodyAliveCheck();
    }

    function onRemoteArenaRespawn(msg) {
        if (!msg || global.NebulaGameMode?.getRunMode() !== "mirror") return;
        const pid = typeof msg.fromPeerId === "string" ? msg.fromPeerId : "";
        if (!pid || pid === localPeerId()) return;
        if (typeof global.clearMirrorPeerAbilities === "function") global.clearMirrorPeerAbilities(pid);
        const api = global.NebulaMpRemotes;
        if (api && typeof api.reactivateRemotePeer === "function") api.reactivateRemotePeer(pid);
        const rp =
            (api && api.ensureRemotePeer && api.ensureRemotePeer(pid)) ||
            deps.getRemotePlayer(pid);
        if (!rp) return;
        const GAME_SETTINGS = settings();
        rp.active = true;
        rp.netVelX = 0;
        rp.netVelY = 0;
        rp.netStateT = performance.now();
        rp.netSenderT = 0;
        if (typeof msg.x === "number" && typeof msg.y === "number") {
            rp.x = msg.x;
            rp.y = msg.y;
            rp.displayX = msg.x;
            rp.displayY = msg.y;
        }
        const r =
            typeof msg.radius === "number" && msg.radius > 0
                ? msg.radius
                : GAME_SETTINGS.START_RADIUS;
        rp.radius = r;
        rp.displayRadius = r;
    }

    function onRemoteForfeit(msg) {
        if (!msg || global.NebulaGameMode?.getRunMode() !== "mirror") return;
        const pid = typeof msg.fromPeerId === "string" ? msg.fromPeerId : "";
        if (!pid || pid === localPeerId()) return;
        if (msg.esc === true) {
            noteMirrorOpponentLeft({ peerId: pid });
            return;
        }
        setRemoteOutOfArena(pid);
        tryDeclareMirrorVictory();
    }

    function mirrorPlayerDeath() {
        if (deps.getIsDying() || mirrorCard) return;
        mirrorPvpDeathPending = false;
        const snapshot = captureMirrorSnapshot();
        const killerLabel = killerDisplayLabel();
        snapshot.opponent = killerLabel;
        const elimination = mirrorEliminationMode();
        if (elimination) {
            sendMirror({
                type: "eliminated",
                byPeerId: mirrorLastAttackerPeerId || "",
                killerCallsign: killerLabel !== "THE VOID" ? killerLabel : "",
            });
            scheduleNobodyAliveCheck();
        } else {
            mirrorCard = "consumed";
            sendMirror({ type: "matchEnd", entity: snapshot.selfName });
        }
        deps.addScreenShake(4.5, 0.3);
        if (typeof deps.playDeathSound === "function") deps.playDeathSound();
        if (typeof deps.updateBlackHoleAudio === "function") deps.updateBlackHoleAudio(9999, 9999);
        deps.setIsDying(true);
        deps.setGameActive(false);
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();
        if (typeof global.restartDrawLoop === "function") global.restartDrawLoop();
        else deps.ensureDrawLoop();
        const player = deps.getPlayer();
        const poolNutrients = deps.getPoolNutrients();
        const getFromPool = deps.getFromPool;
        const deathBurstX = player.x;
        const deathBurstY = player.y;
        for (let i = 0; i < 10; i++) {
            const n = getFromPool(poolNutrients);
            if (n) {
                n.spawn(deathBurstX, deathBurstY, player.glow);
                n.vx = (Math.random() - 0.5) * 3200;
                n.vy = (Math.random() - 0.5) * 3200;
            }
        }
        setTimeout(() => {
            if (mirrorTerminalCard()) {
                deps.setIsDying(false);
                return;
            }
            if (pendingMirrorMatchEnd) {
                const pending = pendingMirrorMatchEnd;
                pendingMirrorMatchEnd = null;
                deps.setIsDying(false);
                presentRemoteMatchEnd(pending.msg, pending.snapshot);
                return;
            }
            if (elimination) {
                if (mirrorInArena && deps.getGameActive()) return;
                clearNutrientsNear(deathBurstX, deathBurstY, 220);
                mirrorInArena = false;
                if (typeof global.resetMpTaunts === "function") global.resetMpTaunts();
                document.body.classList.remove("game-running");
                deps.setIsDying(false);
                presentMirrorEliminationOverlay(snapshot);
                scheduleNobodyAliveCheck();
                return;
            }
            if (mirrorCard !== "consumed" && mirrorCard !== "lost") return;
            const kind = mirrorCard === "lost" ? "lost" : "consumed";
            deps.setIsDying(false);
            deps.resetRunState();
            endMirrorMatch();
            presentMirrorCard(kind, snapshot);
        }, 2500);
    }

    function startMirrorMatch(skin, ctx) {
        if (!skin || !skin.unlocked) return;
        if (
            deps.getGameActive() &&
            global.NebulaGameMode &&
            global.NebulaGameMode.getRunMode() === "mirror"
        ) {
            return;
        }

        const GAME_SETTINGS = settings();
        const player = deps.getPlayer();
        const peerOrder =
            (ctx && Array.isArray(ctx.peerOrder) && ctx.peerOrder.length ? ctx.peerOrder : null) ||
            (typeof deps.getMultiplayerLobbyState === "function"
                ? (deps.getMultiplayerLobbyState() || {}).peerOrder
                : null);

        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        deps.hideMenuOverlay(deps.dom.multiplayerLobbyScreen);
        if (typeof deps.dismissEvolutionLabForGameStart === "function") {
            deps.dismissEvolutionLabForGameStart();
        }
        deps.hideGameOverOverlay();
        deps.initAudio();
        if (typeof deps.setAmbientLevel === "function") {
            deps.setAmbientLevel(deps.getAmbientArenaGain(), 2.8);
        }

        if (global.NebulaGameMode && typeof global.NebulaGameMode.setRunMode === "function") {
            global.NebulaGameMode.setRunMode("mirror");
        }
        if (typeof global.beginMpMatchUpgradeHud === "function") global.beginMpMatchUpgradeHud();

        player.glow = skin.color;
        player.color = "#0a0a0a";
        if (typeof deps.applySkinCursor === "function") deps.applySkinCursor(skin.color);
        deps.setActiveRunSkinName(skin.name);
        deps.setSelectedAbility(skin.ability);

        deps.resetRunState();
        const dustSeed = ctx && typeof ctx.dustSeed === "number" ? ctx.dustSeed >>> 0 : 0;
        if (typeof global.NebulaDust !== "undefined" && global.NebulaDust.begin) {
            global.NebulaDust.begin(dustSeed);
        }
        if (typeof global.NebulaGlass !== "undefined" && global.NebulaGlass.begin) {
            global.NebulaGlass.begin(dustSeed);
        }
        resetMirrorCombatNet();
        if (typeof global.resetMirrorAbilities === "function") global.resetMirrorAbilities();
        if (typeof global.resetMpTaunts === "function") global.resetMpTaunts();
        mirrorCard = null;
        mirrorLastAttackerPeerId = "";
        pendingMirrorMatchEnd = null;
        mirrorLocalPeerId =
            (typeof deps.getLocalPeerId === "function" && deps.getLocalPeerId()) || "";
        mirrorArenaSize = Array.isArray(peerOrder) && peerOrder.length ? peerOrder.length : 2;
        mirrorInArena = true;
        clearRemoteAbilityState();
        setupArenaSpawns(peerOrder, GAME_SETTINGS);

        if (!(global.NebulaGlass && global.NebulaGlass.isActive && global.NebulaGlass.isActive())) {
            deps.initJellyBubbles();
        }
        const uiContainer = deps.dom.uiContainer;
        if (uiContainer) {
            uiContainer.style.color = `color-mix(in srgb, ${skin.color} 82%, #252525)`;
            uiContainer.style.setProperty(
                "--score-glow",
                `color-mix(in srgb, ${skin.color} 42%, transparent)`
            );
        }

        const startMenu = deps.dom.startMenu;
        if (startMenu) {
            startMenu.style.opacity = "0";
            startMenu.style.display = "none";
            startMenu.style.pointerEvents = "none";
            startMenu.classList.remove("ready");
        }

        document.body.classList.add("game-running");
        deps.setIsDying(false);
        deps.setGameActive(true);
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();
        if (typeof global.startMpNetworkTick === "function") global.startMpNetworkTick();
        deps.ensureDrawLoop();
    }

    function requestStartMirrorMatch(ctx) {
        if (!ctx || !ctx.skin) return;
        if (ctx.isHost !== true) return;
        const st =
            typeof deps.getMultiplayerLobbyState === "function"
                ? deps.getMultiplayerLobbyState()
                : null;
        const peerOrder =
            (st && Array.isArray(st.peerOrder) && st.peerOrder.length ? st.peerOrder : null) ||
            [];
        const api = global.NebulaMpMirror;
        const dustSeed = (Math.random() * 0x100000000) >>> 0;
        if (api && typeof api.send === "function") {
            api.send({
                type: "matchStart",
                t0: performance.now(),
                roomId: ctx.roomId,
                peerOrder,
                dustSeed,
            });
        }
        startMirrorMatch(ctx.skin, { ...ctx, peerOrder, dustSeed });
    }

    function onRemoteMatchStart(msg) {
        if (
            deps.getGameActive() &&
            global.NebulaGameMode &&
            global.NebulaGameMode.getRunMode() === "mirror"
        ) {
            return;
        }
        const selfId = localPeerId();
        if (
            selfId &&
            msg &&
            Array.isArray(msg.peerOrder) &&
            msg.peerOrder.length > 0 &&
            msg.peerOrder.indexOf(selfId) < 0
        ) {
            return;
        }
        const st =
            typeof deps.getMultiplayerLobbyState === "function"
                ? deps.getMultiplayerLobbyState()
                : null;
        const skin = (st && st.skin) || null;
        if (!skin) return;
        const peerOrder =
            (msg && Array.isArray(msg.peerOrder) && msg.peerOrder.length ? msg.peerOrder : null) ||
            (st && Array.isArray(st.peerOrder) ? st.peerOrder : null) ||
            [];
        const ctx = {
            roomId: msg.roomId || (st && st.roomId),
            isHost: st && st.isHost === true,
            skin,
            peerOrder,
            dustSeed: typeof msg.dustSeed === "number" ? msg.dustSeed >>> 0 : 0,
        };
        startMirrorMatch(skin, ctx);
    }

    /** Circle actually drawn for this remote (smoothed pose, not the raw snapshot). */
    function remoteVisiblePose(rp) {
        const x =
            typeof rp.displayX === "number" && Number.isFinite(rp.displayX) ? rp.displayX : rp.x;
        const y =
            typeof rp.displayY === "number" && Number.isFinite(rp.displayY) ? rp.displayY : rp.y;
        const r =
            typeof rp.displayRadius === "number" &&
            Number.isFinite(rp.displayRadius) &&
            rp.displayRadius > 0
                ? rp.displayRadius
                : rp.radius;
        return { x: x, y: y, r: r };
    }

    function noteMirrorClaim(t, targetPeerId) {
        mirrorOpenClaims.push({
            t: t,
            targetPeerId: typeof targetPeerId === "string" ? targetPeerId : "",
        });
        if (mirrorOpenClaims.length > 8) mirrorOpenClaims.shift();
    }

    function takeMirrorClaim(t, fromPeerId) {
        const sender = typeof fromPeerId === "string" ? fromPeerId : "";
        const i = mirrorOpenClaims.findIndex((claim) => claim.t === t && claim.targetPeerId === sender);
        if (i < 0) return false;
        mirrorOpenClaims.splice(i, 1);
        return true;
    }

    function tickMirrorVictimContact(dt) {
        if (!mirrorEliminationMode()) return;
        if (!global.NebulaGameMode || global.NebulaGameMode.getRunMode() !== "mirror") return;
        if (!mirrorInArena || !deps.getGameActive() || deps.getIsDying()) return;

        const player = deps.getPlayer();
        const GAME_SETTINGS = settings();
        const list = remoteList();
        const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
        if (!(step > 0)) return;

        for (let i = 0; i < list.length; i++) {
            const rp = list[i];
            if (!rp || !rp.active || !rp.peerId) continue;
            const pose = remoteVisiblePose(rp);
            if (!(pose.r > player.radius * GAME_SETTINGS.BOT_EAT_THRESHOLD)) continue;

            const dx = player.x - pose.x;
            const dy = player.y - pose.y;
            const distSq = dx * dx + dy * dy;
            const touch = player.radius + pose.r;
            if (distSq >= touch * touch) continue;

            mirrorLastAttackerPeerId = rp.peerId;
            const drain = GAME_SETTINGS.BOT_CONTACT_DRAIN * step;
            player.radius -= drain;
            addContactDebt(rp.peerId, drain);
            if (typeof deps.pulseDamageShake === "function") deps.pulseDamageShake(2.4);
            if (player.radius < 5) {
                mirrorPvpDeathPending = true;
                deps.invokePlayerDeath();
                return;
            }
        }
    }

    function tickMirrorPlayerContact(_dt) {
        const player = deps.getPlayer();
        const GAME_SETTINGS = settings();
        if (!mirrorRunActive()) return;

        const list = remoteList();
        let target = null;
        let bestRadius = 0;
        for (let i = 0; i < list.length; i++) {
            const rp = list[i];
            if (!rp || !rp.active || !rp.peerId) continue;
            const pose = remoteVisiblePose(rp);
            if (!(player.radius > pose.r * GAME_SETTINGS.BOT_EAT_THRESHOLD)) continue;
            const dx = player.x - pose.x;
            const dy = player.y - pose.y;
            const distSq = dx * dx + dy * dy;
            const touchSq = (player.radius + pose.r) ** 2;
            if (distSq >= touchSq) continue;
            if (!target || pose.r > bestRadius) {
                target = rp;
                bestRadius = pose.r;
            }
        }
        if (!target) return;

        const now = Math.round(performance.now());
        if (now - mirrorClaimSentAt < MIRROR_CLAIM_WINDOW_MS) return;
        mirrorClaimSentAt = now;
        noteMirrorClaim(now, target.peerId);
        sendMirror({
            type: "claimHit",
            t: now,
            kind: "eat",
            targetPeerId: target.peerId,
            x: player.x,
            y: player.y,
            radius: player.radius,
        });
    }

    function onRemoteClaimHit(msg) {
        const player = deps.getPlayer();
        const GAME_SETTINGS = settings();
        if (!mirrorRunActive() || !msg) return;

        const selfId = localPeerId();
        const targetId =
            typeof msg.targetPeerId === "string" ? msg.targetPeerId : "";
        if (targetId && selfId && targetId !== selfId) return;

        const attackerId =
            typeof msg.fromPeerId === "string" ? msg.fromPeerId : "";
        let remotePlayer = attackerId ? deps.getRemotePlayer(attackerId) : deps.getRemotePlayer();
        if (!remotePlayer || !remotePlayer.active) return;

        const now = performance.now();
        if (mirrorClaimAcceptedAt && now - mirrorClaimAcceptedAt < MIRROR_CLAIM_WINDOW_MS * 0.85) {
            return;
        }

        const pose = remoteVisiblePose(remotePlayer);
        if (!(pose.r > player.radius * GAME_SETTINGS.BOT_EAT_THRESHOLD)) return;

        const dx = player.x - pose.x;
        const dy = player.y - pose.y;
        const distSq = dx * dx + dy * dy;
        const touch = player.radius + pose.r;
        if (distSq >= touch * touch) return;

        mirrorClaimAcceptedAt = now;
        const claimT = typeof msg.t === "number" ? msg.t : now;
        const victimId = selfId || targetId;
        if (attackerId) mirrorLastAttackerPeerId = attackerId;
        const owed = attackerId ? mirrorContactDebtByPeer[attackerId] || 0 : 0;

        const deathSq = (pose.r * GAME_SETTINGS.PLAYER_DEATH_DIST_FACTOR) ** 2;
        if (distSq < deathSq) {
            mirrorPvpDeathPending = true;
            const sent = sendMirror({
                type: "hitAck",
                t: claimT,
                kind: "kill",
                targetPeerId: victimId,
                eatenRadius: player.radius,
                amount: owed,
            });
            if (sent && attackerId) delete mirrorContactDebtByPeer[attackerId];
            deps.invokePlayerDeath();
            return;
        }

        if (!(owed > 0)) return;
        const sent = sendMirror({
            type: "hitAck",
            t: claimT,
            kind: "drain",
            targetPeerId: victimId,
            amount: owed,
        });
        if (sent && attackerId) delete mirrorContactDebtByPeer[attackerId];
    }

    function onRemoteHitAck(msg) {
        const player = deps.getPlayer();
        const GAME_SETTINGS = settings();
        if (!mirrorRunActive() || !msg) return;
        const t = typeof msg.t === "number" ? msg.t : null;
        const fromPeerId = typeof msg.fromPeerId === "string" ? msg.fromPeerId : "";
        if (t == null || !fromPeerId || !takeMirrorClaim(t, fromPeerId)) return;

        const remotePlayer = deps.getRemotePlayer(fromPeerId);

        if (msg.kind === "drain") {
            const amount = typeof msg.amount === "number" ? msg.amount : 0;
            grantContactDrain(player, amount, performance.now());
            return;
        }

        if (msg.kind === "kill") {
            const drained = typeof msg.amount === "number" ? msg.amount : 0;
            grantContactDrain(player, drained, performance.now());
            const reported =
                typeof msg.eatenRadius === "number"
                    ? msg.eatenRadius
                    : remotePlayer && remotePlayer.radius;
            const seen =
                remotePlayer && remotePlayer.radius > 0 ? remotePlayer.radius : reported;
            const eaten = Math.min(Math.max(reported, 0), seen * 1.5);
            player.radius += eaten * GAME_SETTINGS.GROW_FROM_BOT;
            setRemoteOutOfArena(fromPeerId);
            tryDeclareMirrorVictory();
        }
    }

    if (!global.__nebulaMirrorEscWired) {
        global.__nebulaMirrorEscWired = true;
        global.addEventListener("keydown", (e) => {
            if (e.code !== "Escape" || e.repeat) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (typeof document !== "undefined" && document.fullscreenElement) return;
            const target = e.target;
            const tag = target && target.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || (target && target.isContentEditable)) return;
            if (!tryMirrorEscapeToLobby()) return;
            e.preventDefault();
        });
    }

    global.configureMirrorMatch = configureMirrorMatch;
    global.mirrorPlayerDeath = mirrorPlayerDeath;
    global.mirrorAbilitySnapshot = mirrorAbilitySnapshot;
    global.requestStartMirrorMatch = requestStartMirrorMatch;
    global.onRemoteMatchStart = onRemoteMatchStart;
    global.onRemoteMatchEnd = onRemoteMatchEnd;
    global.onRemoteArenaRespawn = onRemoteArenaRespawn;
    global.onRemoteForfeit = onRemoteForfeit;
    global.onRemoteEliminated = onRemoteEliminated;
    global.onRemoteClaimHit = onRemoteClaimHit;
    global.onRemoteHitAck = onRemoteHitAck;
    global.tickMirrorPlayerContact = tickMirrorPlayerContact;
    global.tickMirrorVictimContact = tickMirrorVictimContact;
    global.tickMirrorVictoryPoll = tickMirrorVictoryPoll;
    global.flushMirrorDustEats = flushMirrorDustEats;
    global.onRemoteDust = onRemoteDust;
    global.flushMirrorGlassEats = flushMirrorGlassEats;
    global.onRemoteGlass = onRemoteGlass;
    global.noteMirrorOpponentLeft = noteMirrorOpponentLeft;
    global.noteMirrorRelayLost = noteMirrorRelayLost;
    global.abortMirrorMatchToLobby = abortMirrorMatchToLobby;
    global.tryMirrorEscapeToLobby = tryMirrorEscapeToLobby;
    global.tryMirrorGameOverRetry = tryMirrorGameOverRetry;
    global.tryMirrorGameOverChangeEntity = tryMirrorGameOverChangeEntity;
    global.isMirrorEliminationOverlayActive = isMirrorEliminationOverlayActive;
    global.isMirrorPlayerOutOfArena = isMirrorPlayerOutOfArena;
    global.noteMirrorAttacker = noteMirrorAttacker;
    global.markMirrorEnvironmentalDeath = markMirrorEnvironmentalDeath;
})(typeof window !== "undefined" ? window : globalThis);
