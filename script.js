/**
 * REDUPLINK studio deck.
 * Games live in studio/catalog.js. Add one object there, then run:
 *   node studio/stamp.js
 * That refreshes the no-JS cards in index.html and the table in README.md.
 */
(function () {
    "use strict";

    /** Set your Ko-fi page when ready, e.g. "https://ko-fi.com/yourname" */
    var KO_FI_URL = "";

    function studioGames() {
        if (!Array.isArray(window.STUDIO_GAMES)) {
            console.error("REDUPLINK: studio/catalog.js did not load.");
            return [];
        }
        return window.STUDIO_GAMES;
    }

    var TINTS = [
        { color: "#ff2d2d", label: "Blood rift" },
        { color: "#ff2ed1", label: "Void signal" },
        { color: "#c86bff", label: "Phase glow" },
        { color: "#8a2be2", label: "Shifter" },
        { color: "#00e5ff", label: "Velocity" },
        { color: "#3da5ff", label: "Phase cage" },
        { color: "#39ff14", label: "Spore" },
        { color: "#ffdd22", label: "Bounty" }
    ];

    var TINT_KEY = "spacejunkStudioTint";

    var deckTipId = 0;

    function nextDeckTipId() {
        deckTipId += 1;
        return "deck-tip-" + deckTipId;
    }

    function signalTip(tipId, kicker, text) {
        var tip = document.createElement("span");
        tip.className = "signal-tip platform-tip";
        tip.id = tipId;
        tip.setAttribute("role", "tooltip");
        var kick = document.createElement("span");
        kick.className = "signal-tip-kicker";
        kick.textContent = kicker;
        var body = document.createElement("span");
        body.className = "signal-tip-text";
        body.textContent = text;
        tip.appendChild(kick);
        tip.appendChild(body);
        return tip;
    }

    function coarsePointer() {
        return window.matchMedia("(hover: none), (pointer: coarse)").matches;
    }

    function closeOpenTips(except) {
        var open = document.querySelectorAll(".is-tip-open");
        for (var i = 0; i < open.length; i++) {
            if (except && open[i] === except) continue;
            open[i].classList.remove("is-tip-open");
        }
    }

    function toggleTip(el) {
        var willOpen = !el.classList.contains("is-tip-open");
        closeOpenTips();
        if (willOpen) el.classList.add("is-tip-open");
    }

    function bindPlatformBadge(el) {
        el.addEventListener("click", function (ev) {
            ev.stopPropagation();
            if (!coarsePointer()) return;
            toggleTip(el);
        });
    }

    function bindTipDismiss() {
        document.addEventListener(
            "pointerdown",
            function (ev) {
                if (!document.querySelector(".is-tip-open")) return;
                if (ev.target.closest && ev.target.closest(".is-tip-open")) return;
                closeOpenTips();
            },
            true
        );
        document.addEventListener("keydown", function (ev) {
            if (ev.key === "Escape") closeOpenTips();
        });
    }

    function gameHref(raw) {
        if (!raw) return "";
        if (/^https?:\/\//.test(raw)) return raw;
        try {
            return new URL(raw, document.baseURI).href;
        } catch (err) {
            return raw;
        }
    }

    function isHex(value) {
        return typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);
    }

    function readTint() {
        try {
            var saved = localStorage.getItem(TINT_KEY);
            if (saved && isHex(saved.toLowerCase())) return saved.toLowerCase();
        } catch (err) {
            /* private mode */
        }
        return TINTS[0].color;
    }

    function applyTint(color) {
        document.documentElement.style.setProperty("--signal", color);
        var buttons = document.querySelectorAll(".swatch");
        for (var i = 0; i < buttons.length; i++) {
            var on = buttons[i].getAttribute("data-color") === color;
            buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
        }
    }

    function buildTints() {
        var row = document.getElementById("tints");
        if (!row) return;
        var current = readTint();
        TINTS.forEach(function (entry) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "swatch";
            btn.style.setProperty("--swatch", entry.color);
            btn.setAttribute("data-color", entry.color);
            btn.setAttribute("aria-label", entry.label);
            btn.title = entry.label;
            btn.addEventListener("click", function () {
                applyTint(entry.color);
                try {
                    localStorage.setItem(TINT_KEY, entry.color);
                } catch (err) {
                    /* ignore */
                }
            });
            row.appendChild(btn);
        });
        applyTint(current);
    }

    function strokeEl(ns, tag, attrs) {
        var el = document.createElementNS(ns, tag);
        var key;
        for (key in attrs) {
            if (Object.prototype.hasOwnProperty.call(attrs, key)) {
                el.setAttribute(key, attrs[key]);
            }
        }
        el.setAttribute("fill", "none");
        el.setAttribute("stroke", "currentColor");
        el.setAttribute("stroke-width", "1.2");
        el.setAttribute("stroke-linecap", "round");
        el.setAttribute("stroke-linejoin", "round");
        return el;
    }

    function browserBadgeIcon() {
        var ns = "http://www.w3.org/2000/svg";
        var svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");

        svg.appendChild(
            strokeEl(ns, "circle", {
                cx: "12",
                cy: "12",
                r: "7.75"
            })
        );
        svg.appendChild(strokeEl(ns, "path", { d: "M4.25 12h15.5" }));
        svg.appendChild(
            strokeEl(ns, "path", {
                d: "M12 4.25c2.05 2.25 3.15 4.4 3.15 7.75s-1.1 5.5-3.15 7.75c-2.05-2.25-3.15-4.4-3.15-7.75s1.1-5.5 3.15-7.75z"
            })
        );
        return svg;
    }

    function tabletBadgeIcon() {
        var ns = "http://www.w3.org/2000/svg";
        var svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");

        svg.appendChild(
            strokeEl(ns, "path", {
                d: "M8 4.75h8A1.25 1.25 0 0 1 17.25 6v12A1.25 1.25 0 0 1 16 19.25H8A1.25 1.25 0 0 1 6.75 18V6A1.25 1.25 0 0 1 8 4.75z"
            })
        );
        svg.appendChild(
            strokeEl(ns, "circle", {
                cx: "12",
                cy: "17.25",
                r: "0.75"
            })
        );
        return svg;
    }

    function gameWebCompat(game) {
        if (game.web === true) return true;
        if (game.web === false) return false;
        return !!game.href;
    }

    function gameTabletCompat(game) {
        return game.tablet === true;
    }

    function browserBadge() {
        var tipId = nextDeckTipId();
        var el = document.createElement("span");
        el.className = "card-platform card-platform--on";
        el.setAttribute("tabindex", "0");
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", "Browser");
        el.setAttribute("aria-describedby", tipId);
        var hidden = document.createElement("span");
        hidden.className = "card-platform__label";
        hidden.textContent = "Browser";
        el.appendChild(hidden);
        el.appendChild(browserBadgeIcon());
        el.appendChild(
            signalTip(
                tipId,
                "[ BROWSER ]",
                "Runs in a modern browser. No install — hit [ OPEN ] and play."
            )
        );
        bindPlatformBadge(el);
        return el;
    }

    function tabletBadge(game) {
        var tipId = nextDeckTipId();
        var el = document.createElement("span");
        el.className = "card-platform card-platform--on";
        el.setAttribute("tabindex", "0");
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", "Tablet");
        el.setAttribute("aria-describedby", tipId);
        var hidden = document.createElement("span");
        hidden.className = "card-platform__label";
        hidden.textContent = "Tablet";
        el.appendChild(hidden);
        el.appendChild(tabletBadgeIcon());
        el.appendChild(
            signalTip(
                tipId,
                "[ TABLET ]",
                (game && game.tabletLine) ||
                    "Touch-friendly — on-screen pad and controls, not just a shrunk desktop view."
            )
        );
        bindPlatformBadge(el);
        return el;
    }

    function cardPlatforms(game) {
        var web = gameWebCompat(game);
        var tablet = gameTabletCompat(game);
        if (!web && !tablet) return null;
        var wrap = document.createElement("div");
        wrap.className = "card-platforms";
        wrap.setAttribute("role", "group");
        wrap.setAttribute("aria-label", "Where you can play");
        if (web) {
            wrap.appendChild(browserBadge());
        }
        if (tablet) {
            wrap.appendChild(tabletBadge(game));
        }
        return wrap;
    }

    function card(game) {
        var live = game.status === "live" && game.href;
        var li = document.createElement("li");
        li.className = "card " + (live ? "card--live" : "card--hold");

        var kicker = document.createElement("p");
        kicker.className = "card-kicker";
        var kind = document.createElement("span");
        kind.textContent = game.kind || "SIGNAL";
        var state = document.createElement("span");
        state.textContent = live ? "LIVE" : "SEALED";
        kicker.appendChild(kind);
        kicker.appendChild(state);

        var title = document.createElement("h3");
        title.textContent = game.title || "UNTITLED";

        var blurb = document.createElement("p");
        blurb.className = "blurb";
        blurb.textContent = game.line || "";

        li.appendChild(kicker);
        li.appendChild(title);
        li.appendChild(blurb);

        var foot = document.createElement("div");
        foot.className = "card-foot";

        if (live) {
            var target = gameHref(game.href);
            var actions = document.createElement("div");
            actions.className = "card-actions";
            var link = document.createElement("a");
            link.className = "open";
            link.href = target;
            link.textContent = "[ OPEN ]";
            if (/^https?:\/\//.test(game.href)) {
                link.target = "_blank";
                link.rel = "noopener noreferrer";
            }
            actions.appendChild(link);
            if (game.info) {
                var info = document.createElement("a");
                info.className = "open open--info";
                info.href = gameHref(game.info);
                info.textContent = "[ INFO ]";
                actions.appendChild(info);
            }
            foot.appendChild(actions);
            var pressX = 0;
            var pressY = 0;
            function openBeside() {
                window.open(target, "_blank", "noopener,noreferrer");
            }
            li.addEventListener("mousedown", function (ev) {
                if (ev.button !== 0) return;
                pressX = ev.clientX;
                pressY = ev.clientY;
            });
            li.addEventListener("click", function (ev) {
                if (ev.button !== 0) return;
                if (ev.target.closest("a")) return;
                if (ev.target.closest(".card-platform")) return;
                if (ev.altKey) return;
                var moved = Math.hypot(ev.clientX - pressX, ev.clientY - pressY);
                if (moved > 4) return;
                var sel = window.getSelection && window.getSelection();
                if (sel && !sel.isCollapsed && sel.anchorNode && li.contains(sel.anchorNode)) return;
                var external = /^https?:\/\//.test(game.href);
                if (ev.metaKey || ev.ctrlKey || ev.shiftKey || external) {
                    openBeside();
                    return;
                }
                window.location.assign(target);
            });
            li.addEventListener("auxclick", function (ev) {
                if (ev.button !== 1) return;
                if (ev.target.closest("a")) return;
                if (ev.target.closest(".card-platform")) return;
                ev.preventDefault();
                openBeside();
            });
        } else {
            var seal = document.createElement("span");
            seal.className = "sealed";
            seal.textContent = "[ SEALED ]";
            foot.appendChild(seal);
        }

        var platforms = cardPlatforms(game);
        if (platforms) foot.appendChild(platforms);
        li.appendChild(foot);
        return li;
    }

    function buildDeck() {
        var deck = document.getElementById("deck");
        var count = document.getElementById("signalCount");
        if (!deck) return;
        var games = studioGames();
        var live = 0;
        games.forEach(function (game) {
            if (game.status === "live" && game.href) live += 1;
            deck.appendChild(card(game));
        });
        if (count) {
            count.textContent = live + " LIVE / " + games.length;
        }
    }

    function paintField() {
        var canvas = document.getElementById("field");
        if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        var ctx = canvas.getContext("2d");
        var stars = [];
        var running = true;
        var viewW = 0;
        var viewH = 0;

        function spawn(w, h) {
            return {
                x: Math.random() * w,
                y: Math.random() * h,
                r: Math.random() * 1.2 + 0.3,
                v: Math.random() * 0.15 + 0.04,
                a: Math.random() * 0.45 + 0.15
            };
        }

        function resize() {
            var w = canvas.clientWidth || window.innerWidth;
            var h = canvas.clientHeight || window.innerHeight;
            if (!w || !h) return;
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var widthChanged = Math.abs(w - viewW) > 1;
            var heightChanged = viewH > 0 && Math.abs(h - viewH) > 1;

            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            if (!stars.length || widthChanged) {
                var n = Math.round((w * h) / 18000);
                stars = [];
                for (var i = 0; i < n; i++) stars.push(spawn(w, h));
            } else if (heightChanged) {
                var scale = h / viewH;
                for (var j = 0; j < stars.length; j++) {
                    stars[j].y *= scale;
                    if (stars[j].y >= h) stars[j].y %= h;
                }
            }

            viewW = w;
            viewH = h;
        }

        function frame() {
            if (!running) return;
            ctx.clearRect(0, 0, viewW, viewH);
            for (var i = 0; i < stars.length; i++) {
                var s = stars[i];
                s.y += s.v;
                if (s.y > viewH) s.y = 0;
                ctx.globalAlpha = s.a;
                ctx.fillStyle = "#f4f4f4";
                ctx.fillRect(s.x, s.y, s.r, s.r);
            }
            ctx.globalAlpha = 1;
            requestAnimationFrame(frame);
        }

        resize();
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", function () {
            var hidden = document.hidden;
            if (hidden) running = false;
            else if (!running) {
                running = true;
                frame();
            }
        });
        frame();
    }

    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    var fuelLink = document.getElementById("fuelLink");
    if (fuelLink) {
        var fuelKicker = fuelLink.querySelector(".signal-tip-kicker");
        var fuelText = fuelLink.querySelector(".signal-tip-text");
        if (KO_FI_URL) {
            fuelLink.href = KO_FI_URL;
            fuelLink.target = "_blank";
            fuelLink.rel = "noopener noreferrer";
            fuelLink.removeAttribute("aria-disabled");
            fuelLink.setAttribute("aria-label", "Fuel — optional support on Ko-fi");
            if (fuelKicker) fuelKicker.textContent = "[ OPTIONAL ]";
            if (fuelText) fuelText.textContent = "Small games take quiet hours. Ko-fi is a coffee if you want one — no perks, no guilt.";
        } else {
            fuelLink.setAttribute("aria-label", "Fuel — Ko-fi link coming later");
            fuelLink.addEventListener("click", function (ev) {
                ev.preventDefault();
                if (coarsePointer()) {
                    ev.stopPropagation();
                    toggleTip(fuelLink);
                }
            });
            fuelLink.addEventListener("auxclick", function (ev) {
                ev.preventDefault();
            });
        }
    }

    bindTipDismiss();
    buildTints();
    buildDeck();
    paintField();
    window.addEventListener("storage", function (ev) {
        if (ev.key !== TINT_KEY || !ev.newValue) return;
        var next = String(ev.newValue).toLowerCase();
        if (!isHex(next)) return;
        applyTint(next);
    });
})();
