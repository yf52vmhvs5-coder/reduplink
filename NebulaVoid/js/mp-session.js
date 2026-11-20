/**
 * NEBULA VOID — mirror match network tick (state relay) + remote peer state.
 */
(function (global) {
    "use strict";

    /** @type {null | Record<string, unknown>} */
    let deps = null;
    let ticking = false;

    const DEFAULT_STATE_SEND_INTERVAL_MS = 16;
    const DEFAULT_REMOTE_INTERP_SPEED = 32;
    const DEFAULT_REMOTE_SNAP_DISTANCE_PX = 320;
    const DEFAULT_REMOTE_EXTRAP_MAX_SEC = 0.055;
    const DEFAULT_REMOTE_VEL_BLEND = 0.75;
    /** Above dash speed (640) so a hitch cannot fling the predicted cell. */
    const MAX_REMOTE_SPEED = 960;
    const STATE_KEEPALIVE_MS = 300;
    const STATE_SEND_OPTS = { dropIfBuffered: true };
    /** Draw this far behind the newest sample once the buffer can cover it. */
    const INTERP_DELAY_MIN_MS = 32;
    const INTERP_DELAY_MAX_MS = 120;
    /** A long frame may advance the remote pose by at most this much. */
    const INTERP_STEP_CAP_MS = 32;
    /** Per-packet cap on how far a late arrival may nudge the clock baseline. */
    const CLOCK_SLEW_MS = 40;
    const CLOCK_CREEP = 0.02;
    const JITTER_RISE = 0.35;
    const JITTER_DECAY = 0.08;
    const POSE_BUFFER_MAX = 8;

    /** @type {Record<string, { samples: { t: number, x: number, y: number, vx: number, vy: number, r: number }[], offset: number | null, jitter: number, renderT: number | null }>} */
    const poseByPeerId = Object.create(null);

    function knownPlayerAbility(kind) {
        if (typeof global.playerAbilityKnown === "function") return global.playerAbilityKnown(kind);
        return kind === "vampire" || kind === "warp" || kind === "speed";
    }

    let stateSendIntervalMs = DEFAULT_STATE_SEND_INTERVAL_MS;
    let remoteInterpSpeed = DEFAULT_REMOTE_INTERP_SPEED;
    let remoteSnapDistancePx = DEFAULT_REMOTE_SNAP_DISTANCE_PX;
    let remoteExtrapMaxSec = DEFAULT_REMOTE_EXTRAP_MAX_SEC;
    let remoteVelBlend = DEFAULT_REMOTE_VEL_BLEND;

    let lastStateSentAt = 0;
    let lastFullStateSentAt = -1;
    /** @type {null | { x: number, y: number, radius: number, ability: string, cd: number, cdMax: number, color: string, glow: string, entity: string }} */
    let lastStatePayload = null;

    function configureMpSession(nextDeps) {
        deps = nextDeps;
        const cfg =
            nextDeps && typeof nextDeps.getMultiplayerConfig === "function"
                ? nextDeps.getMultiplayerConfig()
                : null;
        if (cfg && typeof cfg === "object") {
            const interval = Number(cfg.stateSendIntervalMs);
            if (Number.isFinite(interval) && interval >= 8 && interval <= 250) {
                stateSendIntervalMs = interval;
            }
            // Accepted so existing configs still load. The pose follows the snapshot buffer, not this gain.
            const speed = Number(cfg.remoteInterpSpeed);
            if (Number.isFinite(speed) && speed >= 4 && speed <= 64) {
                remoteInterpSpeed = speed;
            }
            const snap = Number(cfg.remoteSnapDistancePx);
            if (Number.isFinite(snap) && snap >= 80 && snap <= 1200) {
                remoteSnapDistancePx = snap;
            }
            const extrap = Number(cfg.remoteExtrapMaxSec);
            if (Number.isFinite(extrap) && extrap >= 0 && extrap <= 0.2) {
                remoteExtrapMaxSec = extrap;
            }
            const velBlend = Number(cfg.remoteVelBlend);
            if (Number.isFinite(velBlend) && velBlend >= 0.2 && velBlend <= 1) {
                remoteVelBlend = velBlend;
            }
        }
    }

    function isMirrorRun() {
        return deps && typeof deps.getRunMode === "function" && deps.getRunMode() === "mirror";
    }

    function localPeerId() {
        if (deps && typeof deps.getLocalPeerId === "function") {
            const id = deps.getLocalPeerId();
            if (id) return id;
        }
        const api = global.NebulaMpRemotes;
        if (api && typeof api.getLocalPeerId === "function") return api.getLocalPeerId();
        return null;
    }

    function ensureRemotePeer(peerId) {
        const api = global.NebulaMpRemotes;
        if (api && typeof api.ensureRemotePeer === "function") return api.ensureRemotePeer(peerId);
        if (deps && typeof deps.getRemotePlayer === "function") return deps.getRemotePlayer(peerId);
        return null;
    }

    function startMpNetworkTick() {
        ticking = true;
        lastStateSentAt = 0;
        lastFullStateSentAt = -1;
        lastStatePayload = null;
    }

    function stopMpNetworkTick() {
        ticking = false;
        lastStateSentAt = 0;
        lastFullStateSentAt = -1;
        lastStatePayload = null;
        for (const key in poseByPeerId) delete poseByPeerId[key];
    }

    function ensureRemoteDisplayFields(rp) {
        if (typeof rp.displayX !== "number") rp.displayX = rp.x;
        if (typeof rp.displayY !== "number") rp.displayY = rp.y;
        if (typeof rp.displayRadius !== "number") rp.displayRadius = rp.radius;
    }

    function snapRemoteDisplay(rp) {
        rp.displayX = rp.x;
        rp.displayY = rp.y;
        rp.displayRadius = rp.radius;
    }

    function poseOf(rp) {
        const id = rp && typeof rp.peerId === "string" && rp.peerId ? rp.peerId : "";
        if (!id) return null;
        let st = poseByPeerId[id];
        if (!st) {
            st = { samples: [], offset: null, jitter: 0, renderT: null };
            poseByPeerId[id] = st;
        }
        return st;
    }

    function resetPose(st) {
        if (!st) return;
        st.samples.length = 0;
        st.offset = null;
        st.jitter = 0;
        st.renderT = null;
    }

    function notePoseClock(st, now, senderT) {
        const raw = now - senderT;
        if (st.offset == null) {
            st.offset = raw;
            return;
        }
        const late = Math.max(0, raw - st.offset);
        const sample = Math.min(late, INTERP_DELAY_MAX_MS);
        const alpha = sample > st.jitter ? JITTER_RISE : JITTER_DECAY;
        st.jitter += (sample - st.jitter) * alpha;
        if (raw < st.offset) st.offset = raw;
        else if (late > 0) st.offset += Math.min(late, CLOCK_SLEW_MS) * CLOCK_CREEP;
    }

    function pushPoseSample(st, sample) {
        const samples = st.samples;
        const last = samples.length > 0 ? samples[samples.length - 1] : null;
        if (last && sample.t <= last.t) return;
        samples.push(sample);
        if (samples.length > POSE_BUFFER_MAX) samples.shift();
    }

    function desiredRenderTime(st, now) {
        const samples = st.samples;
        const newest = samples[samples.length - 1];
        const oldest = samples[0];
        const senderNow = now - (st.offset == null ? 0 : st.offset);
        const span = newest.t - oldest.t;
        const target = Math.min(
            INTERP_DELAY_MAX_MS,
            Math.max(INTERP_DELAY_MIN_MS, stateSendIntervalMs + st.jitter * 2)
        );
        let room = span;
        if (span > stateSendIntervalMs) room = span - stateSendIntervalMs;
        const delay = room > 0 ? Math.min(target, room) : 0;
        let renderT = senderNow - delay;
        if (renderT < oldest.t) renderT = oldest.t;
        return renderT;
    }

    function remoteViewDelayMs(peerId) {
        const id = typeof peerId === "string" ? peerId : "";
        const st = id ? poseByPeerId[id] : null;
        if (!st || st.samples.length < 2) return INTERP_DELAY_MIN_MS;
        const newest = st.samples[st.samples.length - 1];
        const oldest = st.samples[0];
        const span = newest.t - oldest.t;
        const target = Math.min(
            INTERP_DELAY_MAX_MS,
            Math.max(INTERP_DELAY_MIN_MS, stateSendIntervalMs + st.jitter * 2)
        );
        let room = span;
        if (span > stateSendIntervalMs) room = span - stateSendIntervalMs;
        return room > 0 ? Math.min(target, room) : INTERP_DELAY_MIN_MS;
    }

    function coastLeadSec(overSec) {
        const maxSec = remoteExtrapMaxSec;
        if (!(maxSec > 0) || !(overSec > 0)) return 0;
        if (overSec <= maxSec) return overSec;
        const fade = maxSec;
        const k = Math.min(1, (overSec - maxSec) / fade);
        return maxSec + fade * (k - k * k * 0.5);
    }

    function coastFrom(sample, overSec) {
        const lead = coastLeadSec(overSec);
        return {
            x: sample.x + sample.vx * lead,
            y: sample.y + sample.vy * lead,
            r: sample.r,
        };
    }

    function chordSafeTangent(v, chord) {
        if (typeof v !== "number" || !Number.isFinite(v)) return chord;
        const scale = Math.max(Math.abs(chord), 1);
        if (Math.abs(v - chord) > scale * 0.5) return chord;
        const cap = Math.max(MAX_REMOTE_SPEED, Math.abs(chord));
        if (Math.abs(v) > cap) return Math.sign(v) * cap;
        return v;
    }

    function hermite(u, p0, p1, v0, v1, dtSec) {
        const u2 = u * u;
        const u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1;
        const h10 = u3 - 2 * u2 + u;
        const h01 = -2 * u3 + 3 * u2;
        const h11 = u3 - u2;
        return h00 * p0 + h10 * v0 * dtSec + h01 * p1 + h11 * v1 * dtSec;
    }

    function poseAt(st, renderT) {
        const samples = st.samples;
        const n = samples.length;
        if (n === 0) return null;
        if (renderT <= samples[0].t) {
            return { x: samples[0].x, y: samples[0].y, r: samples[0].r };
        }
        const newest = samples[n - 1];
        if (renderT >= newest.t) return coastFrom(newest, (renderT - newest.t) / 1000);
        let i = 1;
        while (i < n - 1 && samples[i].t < renderT) i++;
        const a = samples[i - 1];
        const b = samples[i];
        const span = b.t - a.t;
        if (!(span > 0)) return { x: b.x, y: b.y, r: b.r };
        const u = (renderT - a.t) / span;
        const dtSec = span / 1000;
        const chordX = (b.x - a.x) / dtSec;
        const chordY = (b.y - a.y) / dtSec;
        return {
            x: hermite(
                u,
                a.x,
                b.x,
                chordSafeTangent(a.vx, chordX),
                chordSafeTangent(b.vx, chordX),
                dtSec
            ),
            y: hermite(
                u,
                a.y,
                b.y,
                chordSafeTangent(a.vy, chordY),
                chordSafeTangent(b.vy, chordY),
                dtSec
            ),
            r: a.r + (b.r - a.r) * u,
        };
    }

    function applyRemoteState(msg) {
        if (!msg || typeof msg !== "object") return;
        if (!isMirrorRun()) return;
        const fromId =
            typeof msg.fromPeerId === "string" ? msg.fromPeerId : typeof msg.peerId === "string" ? msg.peerId : "";
        const selfId = localPeerId();
        if (!fromId || (selfId && fromId === selfId)) return;

        const rp = ensureRemotePeer(fromId);
        if (!rp) return;
        if (rp.arenaOut) return;

        const wasActive = rp.active;
        const prevX = rp.x;
        const prevY = rp.y;
        const senderT =
            typeof msg.t === "number" && Number.isFinite(msg.t) && msg.t > 0 ? msg.t : null;
        const st = poseOf(rp);
        const freshClock = !(typeof rp.netSenderT === "number" && rp.netSenderT > 0);
        if (freshClock && st) resetPose(st);
        const prevSenderT =
            !freshClock && typeof rp.netSenderT === "number" && rp.netSenderT > 0 ? rp.netSenderT : null;
        if (senderT != null && prevSenderT != null && senderT <= prevSenderT) return;

        if (typeof msg.x === "number" && Number.isFinite(msg.x)) rp.x = msg.x;
        if (typeof msg.y === "number" && Number.isFinite(msg.y)) rp.y = msg.y;
        if (typeof msg.radius === "number" && Number.isFinite(msg.radius) && msg.radius > 0) {
            rp.radius = msg.radius;
        }

        let sampleVx = 0;
        let sampleVy = 0;

        if (wasActive && typeof prevX === "number" && typeof prevY === "number") {
            const hasExplicitVel =
                typeof msg.vx === "number" &&
                Number.isFinite(msg.vx) &&
                typeof msg.vy === "number" &&
                Number.isFinite(msg.vy);
            const dtPkt =
                senderT != null && prevSenderT != null && senderT > prevSenderT
                    ? (senderT - prevSenderT) / 1000
                    : 0;
            let instVx = 0;
            let instVy = 0;
            let validVel = false;

            if (hasExplicitVel) {
                instVx = msg.vx;
                instVy = msg.vy;
                validVel = true;
            } else if (dtPkt >= 0.004 && dtPkt <= 0.35) {
                instVx = (rp.x - prevX) / dtPkt;
                instVy = (rp.y - prevY) / dtPkt;
                validVel = true;
            } else if (dtPkt > 0 && dtPkt < 0.004) {
                if (rp.x === prevX && rp.y === prevY) {
                    instVx = 0;
                    instVy = 0;
                    validVel = true;
                } else {
                    validVel = false;
                }
            } else {
                instVx = 0;
                instVy = 0;
                validVel = true;
            }

            if (validVel) {
                const sp = Math.hypot(instVx, instVy);
                if (sp > MAX_REMOTE_SPEED) {
                    const scale = MAX_REMOTE_SPEED / sp;
                    instVx *= scale;
                    instVy *= scale;
                }
                const prevVx =
                    typeof rp.netVelX === "number" && Number.isFinite(rp.netVelX) ? rp.netVelX : 0;
                const prevVy =
                    typeof rp.netVelY === "number" && Number.isFinite(rp.netVelY) ? rp.netVelY : 0;
                const dot = prevVx * instVx + prevVy * instVy;
                if (dot > 0) {
                    rp.netVelX = prevVx + (instVx - prevVx) * remoteVelBlend;
                    rp.netVelY = prevVy + (instVy - prevVy) * remoteVelBlend;
                } else {
                    rp.netVelX = instVx;
                    rp.netVelY = instVy;
                }
                sampleVx = instVx;
                sampleVy = instVy;
            }
        } else {
            rp.netVelX = 0;
            rp.netVelY = 0;
        }
        if (senderT != null) rp.netSenderT = senderT;
        rp.netStateT = performance.now();

        const core = "#0a0a0a";
        if (typeof msg.glow === "string") rp.glow = msg.glow;
        else if (typeof msg.color === "string" && msg.color.toLowerCase() !== core) {
            rp.glow = msg.color;
        }
        rp.color = core;
        if (typeof msg.entity === "string") {
            const name = msg.entity.replace(/\s+/g, " ").trim().slice(0, 32);
            if (name) rp.entity = name;
        }
        if (knownPlayerAbility(msg.ability)) {
            rp.ability = msg.ability;
        }
        if (typeof msg.cdMax === "number" && msg.cdMax > 0 && msg.cdMax < 30) {
            rp.cdMax = msg.cdMax;
        }
        if (typeof msg.cd === "number" && msg.cd >= 0 && msg.cd < 30) {
            rp.cd = rp.cdMax > 0 ? Math.min(msg.cd, rp.cdMax) : msg.cd;
            rp.cdAt = performance.now();
        }

        ensureRemoteDisplayFields(rp);

        let jumped = false;
        if (!wasActive) {
            sampleVx = 0;
            sampleVy = 0;
        } else if (wasActive && typeof prevX === "number" && typeof prevY === "number") {
            const jx = rp.x - prevX;
            const jy = rp.y - prevY;
            if (jx * jx + jy * jy > remoteSnapDistancePx * remoteSnapDistancePx) {
                jumped = true;
                sampleVx = 0;
                sampleVy = 0;
                rp.netVelX = 0;
                rp.netVelY = 0;
            }
        }

        if (st && senderT != null) {
            if (freshClock || jumped) resetPose(st);
            const recvNow = performance.now();
            notePoseClock(st, recvNow, senderT);
            pushPoseSample(st, {
                t: senderT,
                x: rp.x,
                y: rp.y,
                vx: sampleVx,
                vy: sampleVy,
                r: rp.radius,
            });
            if (freshClock || jumped || !wasActive) {
                snapRemoteDisplay(rp);
                st.renderT = senderT;
            }
        } else if (freshClock || jumped || !wasActive) {
            snapRemoteDisplay(rp);
        }

        rp.active = true;
    }

    function tickOneRemoteInterp(rp, dt) {
        if (!rp || !rp.active) return;
        ensureRemoteDisplayFields(rp);
        const step = Math.max(0, Number(dt) || 0);
        if (step <= 0) return;

        const st = poseOf(rp);
        if (!st) return;
        if (!(typeof rp.netSenderT === "number" && rp.netSenderT > 0)) {
            resetPose(st);
            return;
        }
        if (st.samples.length === 0) return;

        const stepMs = Math.min(INTERP_STEP_CAP_MS, step * 1000);
        const desired = desiredRenderTime(st, performance.now());
        if (st.renderT == null || !Number.isFinite(st.renderT)) st.renderT = desired;
        let gap = desired - st.renderT;
        if (gap > stepMs) gap = stepMs;
        else if (gap < 0) gap = 0;
        st.renderT += gap;

        const pose = poseAt(st, st.renderT);
        if (!pose) return;
        rp.displayX = pose.x;
        rp.displayY = pose.y;
        rp.displayRadius = pose.r;
    }

    function tickRemoteDisplayInterpolation(dt) {
        if (!deps) return;
        const list =
            typeof deps.getRemotePlayers === "function" ? deps.getRemotePlayers() : [];
        for (let i = 0; i < list.length; i++) {
            tickOneRemoteInterp(list[i], dt);
        }
    }

    function quantize(n, scale) {
        if (typeof n !== "number" || !Number.isFinite(n)) return n;
        return Math.round(n * scale) / scale;
    }

    function statePayloadChanged(next) {
        if (!lastStatePayload) return true;
        const dx = next.x - lastStatePayload.x;
        const dy = next.y - lastStatePayload.y;
        const posEps = 0.2;
        if (dx * dx + dy * dy > posEps * posEps) return true;
        const wasMoving =
            typeof lastStatePayload.vx === "number" &&
            typeof lastStatePayload.vy === "number" &&
            (Math.abs(lastStatePayload.vx) > 0.5 || Math.abs(lastStatePayload.vy) > 0.5);
        const isMoving = Math.abs(next.vx) > 0.5 || Math.abs(next.vy) > 0.5;
        if (wasMoving && !isMoving) return true;
        if (Math.abs(next.radius - lastStatePayload.radius) > 0.06) return true;
        if (next.ability !== lastStatePayload.ability) return true;
        if (Math.abs(next.cd - lastStatePayload.cd) > 0.03) return true;
        if (Math.abs(next.cdMax - lastStatePayload.cdMax) > 0.01) return true;
        return false;
    }

    function appearanceChanged(next) {
        if (!lastStatePayload) return true;
        return (
            next.color !== lastStatePayload.color ||
            next.glow !== lastStatePayload.glow ||
            next.entity !== lastStatePayload.entity
        );
    }

    function handleRelayMessage(msg) {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "matchStart") {
            if (typeof deps.onRemoteMatchStart === "function") deps.onRemoteMatchStart(msg);
            return;
        }
        if (msg.type === "state") {
            applyRemoteState(msg);
            return;
        }
        if (msg.type === "cast") {
            if (typeof global.onRemoteAbilityCast === "function") global.onRemoteAbilityCast(msg);
            return;
        }
        if (msg.type === "riftAck") {
            if (typeof global.onRemoteRiftAck === "function") global.onRemoteRiftAck(msg);
            return;
        }
        if (msg.type === "claimHit") {
            if (typeof deps.onRemoteClaimHit === "function") deps.onRemoteClaimHit(msg);
            return;
        }
        if (msg.type === "hitAck") {
            if (typeof deps.onRemoteHitAck === "function") deps.onRemoteHitAck(msg);
            return;
        }
        if (msg.type === "matchEnd") {
            if (typeof deps.onRemoteMatchEnd === "function") deps.onRemoteMatchEnd(msg);
            return;
        }
        if (msg.type === "respawn") {
            if (typeof deps.onRemoteArenaRespawn === "function") deps.onRemoteArenaRespawn(msg);
            return;
        }
        if (msg.type === "forfeit") {
            if (typeof deps.onRemoteForfeit === "function") deps.onRemoteForfeit(msg);
            return;
        }
        if (msg.type === "eliminated") {
            if (typeof deps.onRemoteEliminated === "function") deps.onRemoteEliminated(msg);
            return;
        }
        if (msg.type === "dust") {
            if (typeof deps.onRemoteDust === "function") deps.onRemoteDust(msg);
            return;
        }
        if (msg.type === "egg") {
            if (typeof deps.onRemoteGlass === "function") deps.onRemoteGlass(msg);
            return;
        }
        if (msg.type === "chat") {
            if (typeof global.handleMpTauntMessage === "function") global.handleMpTauntMessage(msg);
            return;
        }
    }

    function pushMirrorStateFromSim() {
        if (!ticking || !isMirrorRun()) return;
        if (deps && typeof deps.getGameActive === "function" && !deps.getGameActive()) return;

        const api = global.NebulaMpMirror;
        const player = deps.getPlayer && deps.getPlayer();
        if (!api || !player || typeof api.send !== "function") return;

        const now = performance.now();
        if (lastStatePayload !== null && now - lastStateSentAt < stateSendIntervalMs) return;

        const entity = typeof deps.getEntityName === "function" ? deps.getEntityName() : "";
        const ability =
            typeof deps.getAbilitySnapshot === "function" ? deps.getAbilitySnapshot() : null;
        const next = {
            type: "state",
            t: now,
            x: quantize(player.x, 10),
            y: quantize(player.y, 10),
            vx: 0,
            vy: 0,
            radius: quantize(player.radius, 100),
            color: typeof player.color === "string" ? player.color : "",
            glow: typeof player.glow === "string" ? player.glow : "",
            entity: typeof entity === "string" ? entity : "",
            ability: ability && typeof ability.ability === "string" ? ability.ability : "",
            cd: ability && typeof ability.cd === "number" ? quantize(ability.cd, 100) : 0,
            cdMax: ability && typeof ability.cdMax === "number" ? quantize(ability.cdMax, 100) : 0,
        };

        if (lastStatePayload !== null) {
            const dtSend = (now - lastStateSentAt) / 1000;
            const moveDx = next.x - lastStatePayload.x;
            const moveDy = next.y - lastStatePayload.y;
            if (dtSend >= 0.004 && dtSend <= 0.35 && moveDx * moveDx + moveDy * moveDy > 0.04) {
                let vx = moveDx / dtSend;
                let vy = moveDy / dtSend;
                const sp = Math.hypot(vx, vy);
                if (sp > MAX_REMOTE_SPEED) {
                    const scale = MAX_REMOTE_SPEED / sp;
                    vx *= scale;
                    vy *= scale;
                }
                next.vx = quantize(vx, 10);
                next.vy = quantize(vy, 10);
            }
        }

        const looksChanged = appearanceChanged(next);
        const keepalive = lastFullStateSentAt < 0 || now - lastFullStateSentAt >= STATE_KEEPALIVE_MS;
        if (!statePayloadChanged(next) && !looksChanged && !keepalive) return;

        const sendFull = looksChanged || keepalive || lastStatePayload === null;
        const payload = {
            type: "state",
            t: next.t,
            x: next.x,
            y: next.y,
            vx: next.vx,
            vy: next.vy,
            radius: next.radius,
            ability: next.ability,
            cd: next.cd,
            cdMax: next.cdMax,
        };
        if (sendFull) {
            payload.color = next.color;
            payload.glow = next.glow;
            payload.entity = next.entity;
        }

        if (!api.send(payload, STATE_SEND_OPTS)) return;

        lastStateSentAt = now;
        if (sendFull) lastFullStateSentAt = now;
        lastStatePayload = {
            x: next.x,
            y: next.y,
            vx: next.vx,
            vy: next.vy,
            radius: next.radius,
            ability: next.ability,
            cd: next.cd,
            cdMax: next.cdMax,
            color: next.color,
            glow: next.glow,
            entity: next.entity,
        };
    }

    global.configureMpSession = configureMpSession;
    global.startMpNetworkTick = startMpNetworkTick;
    global.stopMpNetworkTick = stopMpNetworkTick;
    global.pushMirrorStateFromSim = pushMirrorStateFromSim;
    global.tickRemoteDisplayInterpolation = tickRemoteDisplayInterpolation;
    global.remoteViewDelayMs = remoteViewDelayMs;
    global.handleMpRelayMessage = handleRelayMessage;
})(typeof window !== "undefined" ? window : globalThis);
