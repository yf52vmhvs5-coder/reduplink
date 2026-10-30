/**
 * NEBULA VOID — ABOUT overlay archive pages (dynamic lore from game-data).
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/about-archive-ui.js");
    }

    const ENTITY_TYPES = boot.entityTypes;

    const ABOUT_BOT_DISPLAY_ORDER = [
        "TITAN",
        "GLITCH",
        "PULSAR",
        "NECROMANCER",
        "GRAVITY_WELL",
        "ARCHITECT",
        "WORMHOLE",
        "CHRONOS",
        "NEBULA",
        "MIMIC",
    ];

    const ABOUT_ARCHIVE_PAGE_TAGS = [
        "[ OVERVIEW ]",
        "[ INTRUDERS ]",
        "[ THE VOID ]",
        "[ SYSTEMS ]",
        "[ RIVAL ENTITIES ]",
    ];

    const ABOUT_ARCHIVE_BUILD = "6";

    let aboutArchivePageIndex = 0;
    /** @type {null | HTMLElement} */
    let aboutScreenEl = null;

    function configureAboutArchiveUi(nextDeps) {
        if (!nextDeps || !nextDeps.dom || !nextDeps.dom.aboutScreen) {
            throw new Error("configureAboutArchiveUi requires dom.aboutScreen");
        }
        aboutScreenEl = nextDeps.dom.aboutScreen;
    }

    function createAboutSectionTag(label) {
        const tag = document.createElement("p");
        tag.className = "about-section-tag";
        tag.textContent = label;
        return tag;
    }

    function createAboutEntityCard(name, accent, description) {
        const card = document.createElement("article");
        card.className = "about-bot-card";
        card.setAttribute("role", "listitem");
        card.style.setProperty("--bot-accent", accent);
        const head = document.createElement("div");
        head.className = "about-bot-card-head";
        const nameEl = document.createElement("h3");
        nameEl.className = "about-bot-name";
        nameEl.textContent = name;
        nameEl.style.color = accent;
        head.appendChild(nameEl);
        const desc = document.createElement("p");
        desc.className = "about-bot-desc";
        desc.textContent = description;
        card.appendChild(head);
        card.appendChild(desc);
        return card;
    }

    function formatSkinAboutDesc(raw) {
        if (typeof raw !== "string") return "";
        return raw.replace(/\s*\n\s*/g, " · ").trim();
    }

    function formatAboutLoreKeywords(text) {
        if (typeof text !== "string" || !text) return "";
        const span = (label, cls) => `<span class="about-lore-kw ${cls}">${label}</span>`;
        const tierSpan = (label, tier) =>
            `<span class="about-lore-kw about-mod-kw about-mod-kw--${tier}">${label}</span>`;
        return text
            .replace(/\[SPACE\]/g, (m) => span(m, "about-lore-kw--key"))
            .replace(/\bENTITY_SCORE\b/g, (m) => span(m, "about-lore-kw--score"))
            .replace(/\bVoid Matter\b/gi, (m) => span(m, "about-lore-kw--matter"))
            .replace(/\bVelocity Drive\b/g, (m) => span(m, "about-lore-kw--evo-kinetic"))
            .replace(/\bGrowth Core\b/g, (m) => span(m, "about-lore-kw--evo-core"))
            .replace(/\bAbility Sync\b/g, (m) => span(m, "about-lore-kw--evo-signal"))
            .replace(/\bx1\b/gi, (m) => tierSpan(m, 1))
            .replace(/\bx2\b/gi, (m) => tierSpan(m, 2))
            .replace(/\bx3\b/gi, (m) => tierSpan(m, 3));
    }

    function appendAboutLoreParagraph(parent, text, className) {
        if (!text) return;
        const block = document.createElement("p");
        block.className = className;
        block.innerHTML = formatAboutLoreKeywords(text);
        parent.appendChild(block);
    }

    function getAboutArchivePages() {
        if (!aboutScreenEl) return [];
        return aboutScreenEl.querySelectorAll(".about-page[data-about-page]");
    }

    function setAboutArchivePage(index, opts) {
        opts = opts || {};
        const pages = getAboutArchivePages();
        if (!pages.length) return;
        const max = pages.length - 1;
        const next = Math.max(0, Math.min(index, max));
        aboutArchivePageIndex = next;
        pages.forEach((page, i) => {
            const active = i === next;
            page.classList.toggle("is-active", active);
            page.hidden = !active;
            if (active) page.scrollTop = 0;
        });
        const tagEl = document.getElementById("aboutPageTag");
        const counterEl = document.getElementById("aboutPageCounter");
        if (tagEl) tagEl.textContent = ABOUT_ARCHIVE_PAGE_TAGS[next] || ABOUT_ARCHIVE_PAGE_TAGS[0];
        if (counterEl) counterEl.textContent = `${next + 1} / ${pages.length}`;
        const prevBtn = document.getElementById("aboutPagePrev");
        const nextBtn = document.getElementById("aboutPageNext");
        if (prevBtn) prevBtn.disabled = next <= 0;
        if (nextBtn) nextBtn.disabled = next >= max;
        if (opts.playSound) {
            try {
                if (typeof global.playHoverSound === "function") global.playHoverSound();
            } catch (e) {}
        }
    }

    function stepAboutArchivePage(delta) {
        setAboutArchivePage(aboutArchivePageIndex + delta, { playSound: true });
    }

    function isAboutScreenOpen() {
        return !!(
            aboutScreenEl &&
            !aboutScreenEl.hidden &&
            aboutScreenEl.classList.contains("menu-overlay-visible")
        );
    }

    function initAboutArchiveNavigation() {
        const prevBtn = document.getElementById("aboutPagePrev");
        const nextBtn = document.getElementById("aboutPageNext");
        if (prevBtn && prevBtn.dataset.wired !== "1") {
            prevBtn.dataset.wired = "1";
            prevBtn.addEventListener("click", () => {
                if (prevBtn.disabled) return;
                stepAboutArchivePage(-1);
            });
        }
        if (nextBtn && nextBtn.dataset.wired !== "1") {
            nextBtn.dataset.wired = "1";
            nextBtn.addEventListener("click", () => stepAboutArchivePage(1));
        }
        if (global.__nebulaAboutPagerKeysWired) return;
        global.__nebulaAboutPagerKeysWired = true;
        global.addEventListener("keydown", (e) => {
            if (!isAboutScreenOpen()) return;
            if (e.code === "ArrowLeft") {
                e.preventDefault();
                stepAboutArchivePage(-1);
            } else if (e.code === "ArrowRight") {
                e.preventDefault();
                stepAboutArchivePage(1);
            }
        });
    }

    function initAboutArchive() {
        const pageIntruders = document.getElementById("aboutPageIntruders");
        if (!pageIntruders || pageIntruders.dataset.aboutArchiveBuild === ABOUT_ARCHIVE_BUILD) return;

        const pageVoid = document.getElementById("aboutPageVoid");
        const pageSystems = document.getElementById("aboutPageSystems");
        const pageRivals = document.getElementById("aboutPageRivals");
        if (!pageVoid || !pageSystems || !pageRivals) return;

        pageIntruders.replaceChildren();
        pageVoid.replaceChildren();
        pageSystems.replaceChildren();
        pageRivals.replaceChildren();

        const aboutCopy = boot.about || {};
        const skins = Array.isArray(boot.skins) ? boot.skins : [];

        const intruderWrap = document.createElement("div");
        intruderWrap.className = "about-body";
        if (aboutCopy.intrudersLead) {
            const lead = document.createElement("p");
            lead.className = "about-section-lead";
            lead.style.marginTop = "0";
            lead.innerHTML = formatAboutLoreKeywords(aboutCopy.intrudersLead);
            intruderWrap.appendChild(lead);
        }
        const intruderRoster = document.createElement("div");
        intruderRoster.className = "about-entity-roster";
        intruderRoster.setAttribute("role", "list");
        intruderRoster.setAttribute("aria-label", "Playable intruders");
        skins.forEach((skin) => {
            if (!skin || !skin.name) return;
            const accent = skin.glowColor || skin.color || "#cccccc";
            const text = formatSkinAboutDesc(skin.desc);
            if (!text) return;
            intruderRoster.appendChild(createAboutEntityCard(skin.name, accent, text));
        });
        intruderWrap.appendChild(intruderRoster);
        pageIntruders.appendChild(intruderWrap);

        const voidWrap = document.createElement("div");
        voidWrap.className = "about-body";
        [
            { tag: "[ THE SINGULARITY ]", key: "singularity" },
            { tag: "[ BOUNTY CHAIN ]", key: "bounty" },
        ].forEach((entry, idx) => {
            const text = aboutCopy[entry.key];
            if (!text) return;
            const tag = createAboutSectionTag(entry.tag);
            if (idx === 0) tag.style.marginTop = "0";
            voidWrap.appendChild(tag);
            appendAboutLoreParagraph(voidWrap, text, "about-lore-block");
        });
        pageVoid.appendChild(voidWrap);

        const systemsWrap = document.createElement("div");
        systemsWrap.className = "about-body about-systems-body";
        if (aboutCopy.systemsLead) {
            const systemsLead = document.createElement("p");
            systemsLead.className = "about-section-lead about-systems-lead";
            systemsLead.textContent = aboutCopy.systemsLead;
            systemsWrap.appendChild(systemsLead);
        }
        [
            { tag: "[ VOID MATTER ]", key: "voidMatter" },
            { tag: "[ EVOLUTION LAB ]", key: "evolution" },
            { tag: "[ ENTITY MODS ]", key: "entityMods" },
            { tag: "[ ENTITY_SCORE ]", key: "entityScore" },
            { tag: "[ CONTROLS ]", key: "controls" },
            { tag: "[ OPTIONS ]", key: "options" },
        ].forEach((entry, idx) => {
            const text = aboutCopy[entry.key];
            if (!text) return;
            const tag = createAboutSectionTag(entry.tag);
            tag.classList.add("about-systems-section-tag");
            if (idx === 0) tag.style.marginTop = "0";
            systemsWrap.appendChild(tag);
            appendAboutLoreParagraph(systemsWrap, text, "about-lore-block about-systems-block");
        });
        pageSystems.appendChild(systemsWrap);

        const rivalsWrap = document.createElement("div");
        rivalsWrap.className = "about-body";
        if (aboutCopy.rivalsLead) {
            const rivalsLead = document.createElement("p");
            rivalsLead.className = "about-section-lead";
            rivalsLead.style.marginTop = "0";
            rivalsLead.textContent = aboutCopy.rivalsLead;
            rivalsWrap.appendChild(rivalsLead);
        }
        const botRoster = document.createElement("div");
        botRoster.className = "about-bot-roster";
        botRoster.setAttribute("role", "list");
        botRoster.setAttribute("aria-label", "Rival bots");
        ABOUT_BOT_DISPLAY_ORDER.forEach((key) => {
            const cfg = ENTITY_TYPES[key];
            if (!cfg || typeof cfg.aboutDesc !== "string") return;
            const accent = cfg.color || "#cccccc";
            botRoster.appendChild(createAboutEntityCard(cfg.name || key, accent, cfg.aboutDesc));
        });
        rivalsWrap.appendChild(botRoster);
        pageRivals.appendChild(rivalsWrap);

        initAboutArchiveNavigation();
        setAboutArchivePage(0);
        pageIntruders.dataset.aboutArchiveBuild = ABOUT_ARCHIVE_BUILD;
    }

    global.configureAboutArchiveUi = configureAboutArchiveUi;
    global.initAboutArchive = initAboutArchive;
    global.setAboutArchivePage = setAboutArchivePage;
    global.isAboutScreenOpen = isAboutScreenOpen;
})(typeof window !== "undefined" ? window : globalThis);
