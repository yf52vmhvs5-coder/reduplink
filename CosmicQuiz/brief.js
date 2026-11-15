/**
 * COSMIC QUIZ signal brief. Light starfield + category pills from questions.js.
 */
(function () {
    "use strict";

    function motionReduced() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function paintTopics() {
        var list = document.getElementById("topics");
        var meta = document.getElementById("categoryMeta");
        if (!list) return;

        var cats = window.CosmicTrivia && window.CosmicTrivia.CATEGORIES;
        if (!cats) {
            list.innerHTML = "";
            return;
        }

        var keys = Object.keys(cats);
        if (meta) meta.textContent = keys.length + " TOPICS";

        keys.forEach(function (key) {
            var entry = cats[key];
            var label = entry && entry.label ? entry.label : key.toUpperCase();
            var li = document.createElement("li");
            li.textContent = label.toUpperCase();
            list.appendChild(li);
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
                var n = Math.round((w * h) / 22000);
                stars = [];
                for (var i = 0; i < n; i++) {
                    stars.push({
                        x: Math.random() * w,
                        y: Math.random() * h,
                        r: Math.random() * 1.1 + 0.25,
                        v: Math.random() * 0.12 + 0.03,
                        a: Math.random() * 0.4 + 0.12,
                        hue: Math.random() > 0.75 ? "mint" : "white"
                    });
                }
            } else if (viewH > 0 && Math.abs(h - viewH) > 1) {
                var scale = h / viewH;
                for (var s = 0; s < stars.length; s++) stars[s].y *= scale;
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
                ctx.fillStyle = s.hue === "mint" ? "#8affe0" : "#e8e4ff";
                ctx.fillRect(s.x, s.y, s.r, s.r);
            }
            ctx.globalAlpha = 1;
            requestAnimationFrame(frame);
        }

        resize();
        window.addEventListener("resize", resize);
        requestAnimationFrame(frame);
    }

    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    paintTopics();
    paintField();
})();