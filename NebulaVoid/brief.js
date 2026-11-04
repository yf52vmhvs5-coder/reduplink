/**
 * NEBULA VOID signal brief. Reads js/game-data.js and paints the dossier.
 * Does not boot the game.
 */
(function () {
    "use strict";

    var RIVAL_ORDER = [
        "TITAN",
        "GLITCH",
        "PULSAR",
        "NECROMANCER",
        "GRAVITY_WELL",
        "ARCHITECT",
        "WORMHOLE",
        "CHRONOS",
        "NEBULA",
        "MIMIC"
    ];

    var NOTES = [
        ["SINGULARITY", "singularity"],
        ["BOUNTY", "bounty"],
        ["CONTROLS", "controls"],
        ["VOID MATTER", "voidMatter"],
        ["EVOLUTION LAB", "evolution"],
        ["ENTITY MODS", "entityMods"]
    ];

    function data() {
        var source = window.__GAME_DATA_SOURCE;
        return source && typeof source === "object" ? source : null;
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function hex(value, fallback) {
        return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    }

    var eyes = [];
    var pointer = { x: 0, y: 0 };
    var eyeLoopOn = false;
    var eyeLast = 0;

    /** Same iris, pupil, rays, and blink as EnemyBot.draw / drawReactiveEye. */
    function drawGameEye(ctx, x, y, radius, color, lookX, lookY, host, dt) {
        var step = dt > 0 ? dt : 0;
        if (typeof host.blinkTimer !== "number") host.blinkTimer = 0.31 + Math.random() * 0.93;
        host.blinkTimer -= step;
        if (host.blinkTimer <= 0) {
            host.isBlinking = true;
            host.blinkDuration = 0.05;
            host.blinkTimer = 0.31 + Math.random() * 0.93;
        }
        ctx.save();
        var ang = Math.atan2(lookY - y, lookX - x);
        var eyeR = radius * 0.45;
        var pupilR = eyeR * 0.4;
        var lookO = radius * 0.25;
        ctx.translate(x + Math.cos(ang) * lookO, y + Math.sin(ang) * lookO);
        if (host.isBlinking && host.blinkDuration > 0) {
            host.blinkDuration -= step;
            ctx.beginPath();
            ctx.moveTo(-eyeR, 0);
            ctx.lineTo(eyeR, 0);
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#050505";
            ctx.stroke();
        } else {
            host.isBlinking = false;
            ctx.beginPath();
            ctx.arc(0, 0, eyeR, 0, 6.28);
            ctx.fillStyle = "#111";
            ctx.fill();
            ctx.save();
            var curR = Math.round(radius);
            if (!host.cachedIrisGrad || host.lastR !== curR || host.lastCol !== color) {
                host.cachedIrisGrad = ctx.createRadialGradient(0, 0, pupilR, 0, 0, eyeR);
                host.cachedIrisGrad.addColorStop(0, color);
                host.cachedIrisGrad.addColorStop(1, "#000");
                host.lastR = curR;
                host.lastCol = color;
            }
            ctx.beginPath();
            ctx.arc(0, 0, eyeR * 0.9, 0, 6.28);
            ctx.fillStyle = host.cachedIrisGrad;
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#fff";
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            var frame = window._drawFrameTime || 0;
            var i;
            for (i = 0; i < 30; i++) {
                ctx.rotate((Math.PI * 2) / 30);
                ctx.moveTo(pupilR, 0);
                ctx.lineTo(eyeR * (0.75 + Math.sin(frame * 0.0022 + i * 0.628) * 0.15), 0);
            }
            ctx.stroke();
            ctx.restore();
            ctx.beginPath();
            ctx.arc(0, 0, pupilR, 0, 6.28);
            ctx.fillStyle = "#000";
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(-pupilR * 0.4, -pupilR * 0.4, pupilR * 0.3, 0, 6.28);
            ctx.fillStyle = "rgba(255,255,255,0.8)";
            ctx.fill();
        }
        ctx.restore();
    }

    function paintEyes(dt, frameTime) {
        window._drawFrameTime = frameTime == null ? performance.now() : frameTime;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        eyes.forEach(function (entry) {
            var canvas = entry.canvas;
            var rect = canvas.getBoundingClientRect();
            if (rect.width < 2) return;
            var w = Math.max(1, Math.round(rect.width * dpr));
            var h = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                entry.host.cachedIrisGrad = null;
            }
            var ctx = canvas.getContext("2d");
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, rect.width, rect.height);
            var radius = Math.min(rect.width, rect.height) / 2;
            drawGameEye(
                ctx,
                rect.width / 2,
                rect.height / 2,
                radius,
                entry.color,
                pointer.x - rect.left,
                pointer.y - rect.top,
                entry.host,
                dt
            );
        });
    }

    function tickEyes(ts) {
        var dt = eyeLast ? Math.min(0.05, (ts - eyeLast) / 1000) : 0.016;
        eyeLast = ts;
        paintEyes(dt);
        requestAnimationFrame(tickEyes);
    }

    function motionReduced() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function ensureEyeLoop() {
        if (eyeLoopOn) return;
        eyeLoopOn = true;
        var reduced = motionReduced();
        window.addEventListener("pointermove", function (ev) {
            pointer.x = ev.clientX;
            pointer.y = ev.clientY;
            if (reduced) paintEyes(0, 0);
        }, { passive: true });
        if (reduced) {
            paintEyes(0, 0);
            window.addEventListener("resize", function () {
                paintEyes(0, 0);
            });
            return;
        }
        requestAnimationFrame(tickEyes);
    }

    function splitSkinDesc(desc) {
        var raw = String(desc || "")
            .split("\n")
            .map(function (line) {
                return line.replace(/\s+/g, " ").trim();
            })
            .filter(Boolean);
        var ability = "";
        var up = "";
        var down = "";
        var plain = [];
        raw.forEach(function (line) {
            var marked = false;
            if (/^◆/.test(line)) {
                ability = line.replace(/^◆\s*/, "");
                marked = true;
            }
            line.split("|").forEach(function (chunk) {
                var bit = chunk.trim();
                if (/^▲/.test(bit)) {
                    up = bit.replace(/^▲\s*/, "");
                    marked = true;
                } else if (/^▼/.test(bit)) {
                    down = bit.replace(/^▼\s*/, "");
                    marked = true;
                }
            });
            if (!marked) plain.push(line);
        });
        return { ability: ability, up: up, down: down, plain: plain };
    }

    function tradeLine(kind, text) {
        var p = el("p", kind === "up" ? "strain-up" : "strain-down");
        p.appendChild(el("span", "strain-mark", kind === "up" ? "▲ " : "▼ "));
        p.appendChild(document.createTextNode(text));
        return p;
    }

    function specItem(label, value) {
        var wrap = document.createElement("div");
        wrap.appendChild(el("p", "spec-k", label));
        wrap.appendChild(el("p", "spec-v", value));
        return wrap;
    }

    function paintStrains(root, skins) {
        root.replaceChildren();
        (skins || []).forEach(function (skin) {
            if (!skin || !skin.name) return;
            var item = el("li", "strain");
            item.appendChild(cellOrb(skin.color));

            var copy = el("div", "strain-copy");
            var tag = skin.defaultUnlocked === true ? "CLEARED" : "VOID MATTER";
            copy.appendChild(el("p", "strain-tag", tag));
            copy.appendChild(el("h3", "", skin.name));
            var parsed = splitSkinDesc(skin.desc);
            if (parsed.ability) {
                var ability = el("p", "");
                ability.innerHTML = formatControls(parsed.ability);
                copy.appendChild(ability);
            }
            parsed.plain.forEach(function (line) {
                var extra = el("p", "");
                extra.innerHTML = formatControls(line);
                copy.appendChild(extra);
            });
            if (parsed.up) copy.appendChild(tradeLine("up", parsed.up));
            if (parsed.down) copy.appendChild(tradeLine("down", parsed.down));
            item.appendChild(copy);
            root.appendChild(item);
        });
    }

    function rivalKeys(types) {
        var seen = {};
        var keys = [];
        RIVAL_ORDER.forEach(function (key) {
            if (types[key]) {
                keys.push(key);
                seen[key] = true;
            }
        });
        Object.keys(types).forEach(function (key) {
            if (!seen[key]) keys.push(key);
        });
        return keys;
    }

    function cellOrb(color) {
        var fill = hex(color, "#888888");
        var orb = el("span", "orb");
        orb.style.setProperty("--cell", fill);
        orb.setAttribute("aria-hidden", "true");
        var canvas = document.createElement("canvas");
        orb.appendChild(canvas);
        eyes.push({
            canvas: canvas,
            color: fill,
            host: {
                blinkTimer: 0.31 + Math.random() * 0.93,
                isBlinking: false,
                blinkDuration: 0,
                cachedIrisGrad: null,
                lastR: -1,
                lastCol: ""
            }
        });
        return orb;
    }

    function paintRivals(root, types) {
        root.replaceChildren();
        rivalKeys(types || {}).forEach(function (key) {
            var bot = types[key];
            if (!bot) return;
            var item = el("li", "rival");
            var copy = el("div", "");
            copy.appendChild(el("h3", "", bot.name || key));
            copy.appendChild(el("p", "", bot.aboutDesc || ""));
            item.appendChild(cellOrb(bot.color));
            item.appendChild(copy);
            root.appendChild(item);
        });
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function keycap(label, kind) {
        return '<kbd class="key key--' + kind + '">' + label + "</kbd>";
    }

    function formatControls(text) {
        return escapeHtml(text)
            .replace(/\[SPACE\]/g, keycap("[ SPACE ]", "cast"))
            .replace(/\bWASD\b/g, keycap("WASD", "move"))
            .replace(/\bmouse\b/gi, keycap("MOUSE", "move"))
            .replace(/\bthe stick\b/gi, "the " + keycap("STICK", "pad"))
            .replace(/\bround button\b/gi, keycap("ROUND", "cast"))
            .replace(/\bred mark\b/gi, keycap("RED MARK", "leave"));
    }

    var TINT_TERMS = ["Evolution Lab", "Void Matter", "Singularity", "Bounty", "Controls"];

    function tintTerms(text) {
        var safe = escapeHtml(text);
        TINT_TERMS.forEach(function (term) {
            var re = new RegExp(term.replace(/ /g, "\\s+"), "gi");
            safe = safe.replace(re, function (match) {
                return '<span class="tint-word">' + match + "</span>";
            });
        });
        return safe;
    }

    /** Same tier colors as .about-mod-kw--1/2/3. x2 requires x1, x3 requires x2. */
    var MOD_TIERS = [
        {
            mark: "x1",
            kicker: "FIRST",
            line: "Opens the kit for this intruder. Nothing is required before it.",
            color: "#00e5ff"
        },
        {
            mark: "x2",
            kicker: "NEEDS x1",
            line: "One path at this tier. Locked until x1 is owned.",
            color: "#c86bff"
        },
        {
            mark: "x3",
            kicker: "NEEDS x2",
            line: "The last kit. Locked until x2 is owned. Nothing past it.",
            color: "#ffbe76"
        }
    ];

    function formatSeconds(value) {
        var n = Number(value);
        if (!Number.isFinite(n) || n <= 0) return "";
        return String(Math.round(n * 10) / 10);
    }

    function formatMods(text) {
        return tintTerms(text)
            .replace(/\bx1\b/gi, '<span class="mod-tier mod-tier--1">$&</span>')
            .replace(/\bx2\b/gi, '<span class="mod-tier mod-tier--2">$&</span>')
            .replace(/\bx3\b/gi, '<span class="mod-tier mod-tier--3">$&</span>');
    }

    function paintTierRow(note, tiers) {
        var row = el("div", "lab-row");
        tiers.forEach(function (tier) {
            if (!tier) return;
            var chip = el("div", "lab-tier");
            var color = hex(tier.color, "#888888");
            chip.style.color = color;
            chip.style.borderColor = color;
            chip.appendChild(el("strong", "", tier.mark));
            if (tier.kicker) chip.appendChild(el("span", "lab-kicker", tier.kicker));
            if (tier.line) chip.appendChild(el("p", "", tier.line));
            row.appendChild(chip);
        });
        if (row.childNodes.length) note.appendChild(row);
    }

    function paintLabBranches(note, evolution) {
        var branches = evolution && evolution.branches;
        if (!Array.isArray(branches) || !branches.length) return;
        var maxLevel = Number(evolution.maxLevel);
        var tiers = branches.filter(Boolean).map(function (branch) {
            return {
                mark: branch.label || branch.key || "",
                kicker: Number.isFinite(maxLevel) && maxLevel > 0 ? "MAX LV " + maxLevel : "INDEPENDENT",
                line: branch.description || "",
                color: branch.color
            };
        });
        paintTierRow(note, tiers);
    }

    function paintBounty(note, settings) {
        var cfg = settings || {};
        var tiers = cfg.BOUNTY_TIERS;
        if (Array.isArray(tiers) && tiers.length) {
            var row = el("div", "bounty-row");
            tiers.forEach(function (tier) {
                if (!tier || typeof tier.color !== "string") return;
                var chip = el("div", "bounty-tier");
                chip.style.color = tier.color;
                chip.appendChild(el("strong", "", "X" + tier.multiplier));
                chip.appendChild(el("span", "", tier.combo + " BOT KILLS"));
                row.appendChild(chip);
            });
            if (row.childNodes.length) note.appendChild(row);
        }
        var windowSec = formatSeconds((Number(cfg.COMBO_WINDOW) || 0) / 1000);
        var holdSec = formatSeconds(cfg.BOUNTY_DURATION);
        var bits = [];
        if (windowSec) bits.push("Combo window " + windowSec + " sec, bot kills only.");
        if (holdSec) bits.push("The multiplier holds " + holdSec + " sec from the last kill that still meets a tier.");
        if (bits.length) note.appendChild(el("p", "bounty-rule", bits.join(" ")));
    }

    function paintNotes(root, about, settings, evolution) {
        root.replaceChildren();
        NOTES.forEach(function (row) {
            var text = about && about[row[1]];
            if (!text) return;
            var note = el("article", "note");
            if (row[1] === "controls") note.classList.add("note--controls");
            if (row[1] === "evolution") note.classList.add("note--lab");
            if (row[1] === "entityMods") note.classList.add("note--mods");
            note.appendChild(el("h3", "", row[0]));
            var body = el("p", "");
            if (row[1] === "controls") body.innerHTML = formatControls(text);
            else if (row[1] === "entityMods") body.innerHTML = formatMods(text);
            else body.innerHTML = tintTerms(text);
            note.appendChild(body);
            if (row[1] === "bounty") paintBounty(note, settings);
            if (row[1] === "evolution") paintLabBranches(note, evolution);
            if (row[1] === "entityMods") paintTierRow(note, MOD_TIERS);
            root.appendChild(note);
        });
    }

    function paintField() {
        var canvas = document.getElementById("field");
        if (!canvas || motionReduced()) return;
        var ctx = canvas.getContext("2d");
        var stars = [];
        var viewW = 0;
        var viewH = 0;

        function resize() {
            var w = window.innerWidth;
            var h = window.innerHeight;
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (!stars.length || Math.abs(w - viewW) > 1) {
                var n = Math.round((w * h) / 18000);
                stars = [];
                for (var i = 0; i < n; i++) {
                    stars.push({
                        x: Math.random() * w,
                        y: Math.random() * h,
                        r: Math.random() * 1.2 + 0.3,
                        v: Math.random() * 0.15 + 0.04,
                        a: Math.random() * 0.45 + 0.15
                    });
                }
            }
            viewW = w;
            viewH = h;
        }

        function frame() {
            ctx.clearRect(0, 0, viewW, viewH);
            for (var i = 0; i < stars.length; i++) {
                var s = stars[i];
                s.y -= s.v;
                if (s.y < 0) s.y = viewH;
                ctx.globalAlpha = s.a;
                ctx.fillStyle = "#f4f4f4";
                ctx.fillRect(s.x, s.y, s.r, s.r);
            }
            ctx.globalAlpha = 1;
            requestAnimationFrame(frame);
        }

        resize();
        window.addEventListener("resize", resize);
        requestAnimationFrame(frame);
    }

    function paint() {
        var source = data();
        var spec = document.getElementById("spec");
        var strains = document.getElementById("strains");
        var rivals = document.getElementById("rivals");
        var notes = document.getElementById("notes");
        var year = document.getElementById("year");
        var intrudersLead = document.getElementById("intrudersLead");
        var rivalsLead = document.getElementById("rivalsLead");
        var intrudersMeta = document.getElementById("intrudersMeta");
        var rivalsMeta = document.getElementById("rivalsMeta");
        if (year) year.textContent = String(new Date().getFullYear());
        if (!source || !spec || !strains || !rivals || !notes) {
            if (spec) spec.appendChild(el("p", "brief-empty", "Signal data did not load."));
            if (intrudersMeta) intrudersMeta.textContent = "—";
            if (rivalsMeta) rivalsMeta.textContent = "—";
            if (intrudersLead) intrudersLead.textContent = "";
            if (rivalsLead) rivalsLead.textContent = "";
            return;
        }

        var settings = source.gameSettings || {};
        var world = source.world || {};
        var about = source.about || {};
        var room = source.multiplayer || {};
        var types = source.entityTypes || {};
        var typeCount = Object.keys(types).length;
        var solo = Number(world.initialBotTotal) || 0;
        var respawn = Math.round((Number(world.botRespawnDelayMs) || 0) / 1000);
        var arena = Number(settings.WORLD_SIZE) || 0;
        var seats = Number(room.maxRoomPlayers) || 0;

        spec.replaceChildren(
            specItem("ARENA", arena ? arena.toLocaleString("en") + " PX" : "—"),
            specItem("SOLO FIELD", solo ? String(solo) + " RIVALS" : "—"),
            specItem("CELL TYPES", typeCount ? String(typeCount) : "—"),
            specItem("BOT RETURN", respawn ? respawn + " SEC" : "—"),
            specItem("ROOM", seats ? "UP TO " + seats : "—")
        );

        if (intrudersLead) intrudersLead.innerHTML = formatControls(about.intrudersLead || "");
        if (rivalsLead) {
            var counted = solo ? "A solo run fields " + solo + " cells from these strains." : "";
            rivalsLead.textContent = [about.rivalsLead || "", counted].filter(Boolean).join(" ");
        }
        if (intrudersMeta && Array.isArray(source.skins)) {
            intrudersMeta.textContent = source.skins.length + " STRAINS";
        }
        if (rivalsMeta) rivalsMeta.textContent = typeCount + " STRAINS";

        paintStrains(strains, source.skins);
        paintRivals(rivals, types);
        paintNotes(notes, about, settings, source.evolution);
        ensureEyeLoop();
    }

    paintField();
    paint();
})();
