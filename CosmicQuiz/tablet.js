/**
 * COSMIC QUIZ — tablet shell.
 * Desktop keeps the 1280 layout. This only tracks orientation, the size
 * band, and the on-screen keyboard. Questions, scoring, and rooms stay put.
 *
 * Size bands use the screen short side in CSS pixels (not innerHeight —
 * Safari chrome on a sideways iPad mini must not drop the band):
 *   mini  600–779   iPad mini 744×1133, small Android ~600–768
 *   air   780–899   iPad 810×1080, iPad / Air 11" 820×1180, Pro 11" 834×1194
 *   pro   ≥ 900     Air 13" and Pro 12.9" 1024×1366, Pro 13" 1032×1376
 */
(function () {
    "use strict";

    var VIEW_DESKTOP = "width=1280";
    var VIEW_TABLET = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

    function isTabletDevice() {
        var ua = navigator.userAgent || "";
        var iPad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        var androidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
        var sw = (window.screen && screen.width) || 0;
        var sh = (window.screen && screen.height) || 0;
        var shortSide = Math.min(sw, sh);
        if (shortSide > 0 && shortSide < 600) return false;
        if (iPad || androidTablet) return true;
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
        var coarse = window.matchMedia("(pointer: coarse)").matches;
        var noHover = window.matchMedia("(hover: none)").matches;
        return (coarse || noHover) && navigator.maxTouchPoints > 0;
    }

    function shortSide() {
        var sw = (window.screen && screen.width) || 0;
        var sh = (window.screen && screen.height) || 0;
        return Math.min(sw, sh);
    }

    function sizeName(side) {
        if (side >= 900) return "tablet-pro";
        if (side >= 600 && side < 780) return "tablet-mini";
        return "tablet-air";
    }

    function setViewport(content) {
        var viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport || viewport.getAttribute("content") === content) return;
        viewport.setAttribute("content", content);
    }

    function syncFrame() {
        var root = document.documentElement;
        var on = isTabletDevice();
        root.classList.toggle("tablet-mode", on);
        if (document.body) document.body.classList.toggle("tablet-mode", on);
        root.classList.remove("tablet-mini", "tablet-air", "tablet-pro", "tablet-land", "tablet-port");
        if (!on) {
            setViewport(VIEW_DESKTOP);
            root.style.removeProperty("--app-height");
            root.style.removeProperty("--tablet-kb");
            root.classList.remove("tablet-keyboard");
            return;
        }
        var side = shortSide();
        root.classList.add(sizeName(side));
        var land = window.matchMedia("(orientation: landscape)").matches;
        root.classList.add(land ? "tablet-land" : "tablet-port");
        setViewport(VIEW_TABLET);
        syncVisibleHeight();
    }

    function syncVisibleHeight() {
        var root = document.documentElement;
        if (!root.classList.contains("tablet-mode")) {
            root.style.removeProperty("--app-height");
            return;
        }
        var vv = window.visualViewport;
        var height = vv ? vv.height : window.innerHeight;
        if (!height) return;
        root.style.setProperty("--app-height", Math.round(height) + "px");
    }

    function onRotate() {
        syncFrame();
        window.setTimeout(function () {
            syncFrame();
            window.dispatchEvent(new Event("resize"));
        }, 60);
        window.setTimeout(function () {
            syncFrame();
            window.dispatchEvent(new Event("resize"));
        }, 320);
    }

    syncFrame();
    window.addEventListener("resize", syncFrame);
    window.addEventListener("orientationchange", onRotate);

    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", syncVisibleHeight);
        window.visualViewport.addEventListener("scroll", syncVisibleHeight);
    }

    document.addEventListener("focusin", function (e) {
        if (!document.documentElement.classList.contains("tablet-mode")) return;
        var target = e.target;
        if (!target || (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA")) return;
        window.setTimeout(function () {
            try { target.scrollIntoView({ block: "center" }); } catch (err) { /* ignore */ }
        }, 280);
    });

    document.addEventListener("gesturestart", function (e) {
        if (document.documentElement.classList.contains("tablet-mode")) e.preventDefault();
    }, { passive: false });
})();
