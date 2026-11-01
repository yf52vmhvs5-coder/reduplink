/**
 * NEBULA VOID — off-screen arrows for mirror opponents.
 * Reads positions the relay already delivered. No messages, no server work.
 * Drawn in screen pixels, after the vision vignette.
 */
(function (global) {
    "use strict";

    const OUT_PAD = 8;
    const IN_MARGIN = 28;
    const SIDE_INSET = 32;
    const TOP_INSET = 88;
    const BOTTOM_INSET = 32;
    const SEPARATE_PX = 18;
    const ARROW = 8;
    /** După colțul ecranului, distanța (px lume) la care săgeata ajunge la minim. */
    const FADE_SPAN = 1100;
    const FADE_FLOOR = 0.06;

    /** @type {Map<string, boolean>} */
    const shown = new Map();
    let lastPassAt = 0;
    const SHOWN_STALE_MS = 1000;

    function num(v, fallback) {
        return typeof v === "number" && Number.isFinite(v) ? v : fallback;
    }

    function insets(screenW, screenH) {
        const tablet =
            typeof document !== "undefined" &&
            document.documentElement.classList.contains("tablet-mode");
        const rightInset = tablet ? 100 : SIDE_INSET;
        const bottomInset = tablet ? 168 : BOTTOM_INSET;
        let left = Math.min(SIDE_INSET, screenW * 0.08);
        let right = screenW - Math.min(rightInset, screenW * 0.16);
        let top = Math.min(TOP_INSET, screenH * 0.22);
        let bottom = screenH - Math.min(bottomInset, screenH * 0.28);
        if (right - left < 40) {
            const mid = screenW * 0.5;
            left = mid - 20;
            right = mid + 20;
        }
        if (bottom - top < 40) {
            const mid = screenH * 0.5;
            top = mid - 20;
            bottom = mid + 20;
        }
        return { left: left, right: right, top: top, bottom: bottom };
    }

    function project(wx, wy, opts) {
        return {
            x: opts.centerX + opts.shakeX + (wx - opts.cameraX) * opts.zoom,
            y: opts.centerY + opts.shakeY + (wy - opts.cameraY) * opts.zoom,
        };
    }

    function fullyOutside(sx, sy, rad, screenW, screenH) {
        return (
            sx + rad < -OUT_PAD ||
            sx - rad > screenW + OUT_PAD ||
            sy + rad < -OUT_PAD ||
            sy - rad > screenH + OUT_PAD
        );
    }

    function centerInside(sx, sy, screenW, screenH) {
        return sx >= IN_MARGIN && sx <= screenW - IN_MARGIN && sy >= IN_MARGIN && sy <= screenH - IN_MARGIN;
    }

    function rayHit(dx, dy, box, cx, cy) {
        let t = Infinity;
        let edge = "";
        if (dx > 1e-6) {
            const tt = (box.right - cx) / dx;
            if (tt > 0 && tt < t) {
                t = tt;
                edge = "r";
            }
        } else if (dx < -1e-6) {
            const tt = (box.left - cx) / dx;
            if (tt > 0 && tt < t) {
                t = tt;
                edge = "l";
            }
        }
        if (dy > 1e-6) {
            const tt = (box.bottom - cy) / dy;
            if (tt > 0 && tt < t) {
                t = tt;
                edge = "b";
            }
        } else if (dy < -1e-6) {
            const tt = (box.top - cy) / dy;
            if (tt > 0 && tt < t) {
                t = tt;
                edge = "t";
            }
        }
        if (!edge || !Number.isFinite(t)) return null;
        return { x: cx + t * dx, y: cy + t * dy, edge: edge };
    }

    function spread(items, min, max) {
        if (items.length < 2) return;
        items.sort(function (a, b) {
            return a.along - b.along;
        });
        for (let i = 1; i < items.length; i++) {
            const need = items[i - 1].along + SEPARATE_PX;
            if (items[i].along < need) items[i].along = need;
        }
        const overflow = items[items.length - 1].along - max;
        if (overflow > 0) {
            for (let i = 0; i < items.length; i++) items[i].along -= overflow;
        }
        for (let i = items.length - 2; i >= 0; i--) {
            const need = items[i + 1].along - SEPARATE_PX;
            if (items[i].along > need) items[i].along = need;
        }
        for (let i = 0; i < items.length; i++) {
            if (items[i].along < min) items[i].along = min;
            else if (items[i].along > max) items[i].along = max;
        }
    }

    function distanceFade(worldDist, screenW, screenH, zoom) {
        const viewRadius = Math.hypot(screenW, screenH) * 0.5 / zoom;
        const past = Math.max(0, worldDist - viewRadius);
        const t = Math.min(1, past / FADE_SPAN);
        const s = Math.pow(t, 0.55);
        return 1 - s * (1 - FADE_FLOOR);
    }

    /** Aceeași respirație ca bariera hărții: 15 ± 10. */
    function barrierPulse(timeNow) {
        const now = typeof timeNow === "number" ? timeNow : Date.now();
        return 15 + Math.sin(now * 0.005) * 10;
    }

    function paintArrow(ctx, x, y, angle, color, fade, pulseBlur) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(ARROW, 0);
        ctx.lineTo(-ARROW * 0.75, ARROW * 0.72);
        ctx.lineTo(-ARROW * 0.28, 0);
        ctx.lineTo(-ARROW * 0.75, -ARROW * 0.72);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.globalAlpha = 0.9 * fade;
        ctx.shadowBlur = pulseBlur;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.fill();
        ctx.restore();
    }

    function drawMpOffscreenIndicators(ctx, opts) {
        if (!ctx || !opts) return;
        const screenW = num(opts.screenW, 0);
        const screenH = num(opts.screenH, 0);
        const zoom = num(opts.zoom, 0);
        if (!(screenW > 0) || !(screenH > 0) || !(zoom > 0)) return;

        const peers = Array.isArray(opts.peers) ? opts.peers : [];
        const nowMs = num(opts.timeNow, Date.now());
        if (lastPassAt !== 0 && nowMs - lastPassAt > SHOWN_STALE_MS) shown.clear();
        lastPassAt = nowMs;
        const view = {
            cameraX: num(opts.cameraX, 0),
            cameraY: num(opts.cameraY, 0),
            zoom: zoom,
            centerX: num(opts.centerX, screenW * 0.5),
            centerY: num(opts.centerY, screenH * 0.5),
            shakeX: num(opts.shakeX, 0),
            shakeY: num(opts.shakeY, 0),
        };
        const box = insets(screenW, screenH);
        const cx = screenW * 0.5;
        const cy = screenH * 0.5;
        const seen = new Set();
        const pulseBlur = barrierPulse(opts.timeNow);
        /** @type {Record<string, { along: number, angle: number, color: string, fade: number }[]>} */
        const groups = { l: [], r: [], t: [], b: [] };

        for (let i = 0; i < peers.length; i++) {
            const rp = peers[i];
            if (!rp || !rp.active || rp.arenaOut) continue;
            const id = typeof rp.peerId === "string" ? rp.peerId : "";
            if (!id) continue;
            const wx = num(rp.displayX, num(rp.x, NaN));
            const wy = num(rp.displayY, num(rp.y, NaN));
            if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
            seen.add(id);
            const at = project(wx, wy, view);
            const rad = Math.max(0, num(rp.displayRadius, num(rp.radius, 20))) * zoom;
            const prev = shown.get(id) === true;
            const outside = fullyOutside(at.x, at.y, rad, screenW, screenH);
            const inside = centerInside(at.x, at.y, screenW, screenH);
            let show = prev;
            if (inside) show = false;
            else if (outside) show = true;
            shown.set(id, show);
            if (!show) continue;
            const dx = at.x - cx;
            const dy = at.y - cy;
            const hit = rayHit(dx, dy, box, cx, cy);
            if (!hit) continue;
            const along = hit.edge === "l" || hit.edge === "r" ? hit.y : hit.x;
            const color = typeof rp.glow === "string" && rp.glow ? rp.glow : "#888888";
            const worldDist = Math.hypot(wx - view.cameraX, wy - view.cameraY);
            groups[hit.edge].push({
                along: along,
                angle: Math.atan2(dy, dx),
                color: color,
                fade: distanceFade(worldDist, screenW, screenH, zoom),
            });
        }

        shown.forEach(function (_on, id) {
            if (!seen.has(id)) shown.delete(id);
        });

        spread(groups.l, box.top, box.bottom);
        spread(groups.r, box.top, box.bottom);
        spread(groups.t, box.left, box.right);
        spread(groups.b, box.left, box.right);

        const edges = [
            ["l", function (item) { return { x: box.left, y: item.along }; }],
            ["r", function (item) { return { x: box.right, y: item.along }; }],
            ["t", function (item) { return { x: item.along, y: box.top }; }],
            ["b", function (item) { return { x: item.along, y: box.bottom }; }],
        ];
        ctx.save();
        for (let e = 0; e < edges.length; e++) {
            const key = edges[e][0];
            const place = edges[e][1];
            const list = groups[key];
            for (let i = 0; i < list.length; i++) {
                const at = place(list[i]);
                paintArrow(ctx, at.x, at.y, list[i].angle, list[i].color, list[i].fade, pulseBlur * list[i].fade);
            }
        }
        ctx.restore();
    }

    global.drawMpOffscreenIndicators = drawMpOffscreenIndicators;
})(typeof window !== "undefined" ? window : globalThis);
