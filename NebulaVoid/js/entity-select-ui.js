/**
 * NEBULA VOID — entity select carousel + Evolution Lab UI.
 * configureEntitySelectUi() from entities.js (after DOM + startGameWithSkin).
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/entity-select-ui.js");
    }

    const __META_CFG = boot.meta;
    const FEATURE_VERSION_STORAGE_KEY = __META_CFG.featureVersionStorageKey;
    const CURRENT_FEATURE_VERSION = __META_CFG.currentFeatureVersion;

    /** @type {null | Record<string, unknown>} */
    let deps = null;

    // Assigned in bootstrapEntitySelectUi(); stubs satisfy entities.js load guard.
    function renderSelectedSkinNoop() {}
    global.renderSelectedSkin = renderSelectedSkinNoop;
    global.applySkinCursor = function applySkinCursorNoop() {};

    let evolutionLabActive = false;
    let selectedSkinIndex = 0;
    let skinTriadHoverIndex = null;
    /** @type {HTMLDivElement | null} */
    let evoEntityStack = null;

    let skinSelector;
    let abilityDesc;
    let evolutionLabBtn;
    let mpUpgradeLine;
    let skinActionBtn;
    let matterDisplay;
    let skinPriceBadge;
    let startMenu;
    let menuTitle;
    let menuFullscreenBtn;
    let menuSoundBtn;

    let skins = [];
    let skinTriadRow;
    let skinTriadSlots = [];
    /** @type {Record<string, unknown>} */
    let evoBars;
    let evoEntityMods;
    let evoModDescPanel;

    function getActiveSkinKey() {
        if (!deps) return null;
        if ((deps.getGameActive() || deps.getIsDying()) && deps.getActiveRunSkinName()) {
            return deps.getActiveRunSkinName();
        }
        if (!skins.length) return null;
        const idx = typeof selectedSkinIndex === "number" ? selectedSkinIndex : 0;
        const skin = skins[idx];
        return skin && typeof skin.name === "string" ? skin.name : null;
    }

    function dismissEvolutionLabForGameStart() {
        if (!evolutionLabActive) return;
        evolutionLabActive = false;
        if (startMenu) startMenu.classList.remove("lab-mode");
        if (evolutionLabBtn) {
            evolutionLabBtn.classList.remove("lab-active");
            evolutionLabBtn.textContent = "[ EVOLUTION LAB ]";
        }
        if (evoBars) {
            Object.keys(evoBars).forEach((k) => {
                if (evoBars[k].container) evoBars[k].container.hidden = true;
            });
        }
        if (evoEntityMods) evoEntityMods.hidden = true;
        if (evoModDescPanel) evoModDescPanel.hidden = true;
    }

    function isLabModeActive() {
        return evolutionLabActive === true;
    }

    function isMultiplayerSelect() {
        return !!(
            deps &&
            typeof deps.getEntitySelectIntent === "function" &&
            deps.getEntitySelectIntent() === "multiplayer"
        );
    }

    function bootstrapEntitySelectUi() {
skins = boot.skins.map(function (entry) {
    return Object.assign({}, entry);
});

// Migrație one-time: la introducerea costMatter forțăm lock pe skin-urile
// matter-locked, indiferent dacă persistența veche le marca ca deblocate
// (utilizatorii nu aveau cum să le cumpere înainte de această versiune).
(function migrateSkinsUnlockState() {
    let savedVersion = 0;
    try {
        savedVersion = parseInt(localStorage.getItem(FEATURE_VERSION_STORAGE_KEY) || "0", 10) || 0;
    } catch (e) {
        savedVersion = 0;
    }
    // Lock-ul forțat ține doar de versiunea care a introdus costMatter.
    // Un bump ulterior de currentFeatureVersion nu mai reîncuie skin-urile cumpărate.
    const SKIN_COST_LOCK_VERSION = 2;
    if (savedVersion < SKIN_COST_LOCK_VERSION) {
        const persistedMap = readSkinsUnlockState();
        let mutated = false;
        skins.forEach((skin) => {
            if (Number.isFinite(skin.costMatter) && skin.costMatter > 0) {
                if (persistedMap[skin.name] !== false) {
                    persistedMap[skin.name] = false;
                    mutated = true;
                }
            }
        });
        if (mutated) writeSkinsUnlockState(persistedMap);
    }
    if (savedVersion >= CURRENT_FEATURE_VERSION) return;
    try {
        localStorage.setItem(FEATURE_VERSION_STORAGE_KEY, String(CURRENT_FEATURE_VERSION));
    } catch (e) {
        // Storage indisponibil; migrația va încerca din nou la următorul load.
    }
})();

const persistedSkinsUnlockState = readSkinsUnlockState();
skins.forEach((skin) => {
    const persistedState = persistedSkinsUnlockState[skin.name];
    if (typeof persistedState === "boolean") {
        skin.unlocked = persistedState;
    } else if (typeof skin.unlocked !== "boolean") {
        skin.unlocked = true;
    }
});

function persistSkinUnlockState() {
    const nextUnlockState = {};
    skins.forEach((skin) => {
        nextUnlockState[skin.name] = !!skin.unlocked;
    });
    writeSkinsUnlockState(nextUnlockState);
}

persistSkinUnlockState();

        configureEvolution({ getActiveSkinKey });

skinTriadRow = document.createElement("div");
skinTriadRow.id = "skinTriadRow";
skinTriadRow.className = "skin-triad-row";
skinTriadRow.setAttribute("role", "listbox");
skinTriadRow.setAttribute("aria-label", "Select entity");

skinTriadSlots = skins.map((skin, index) => {
    const slot = document.createElement("div");
    slot.className = "skin-triad-slot";
    slot.setAttribute("role", "option");

    const orb = document.createElement("div");
    orb.className = "skin-option skin-triad-option";
    orb.dataset.skinIndex = String(index);
    orb.setAttribute("aria-label", skin.name);

    const lock = document.createElement("div");
    lock.className = "skin-triad-lock";
    lock.hidden = true;
    lock.setAttribute("aria-hidden", "true");

    const label = document.createElement("div");
    label.className = "skin-triad-label";

    orb.appendChild(lock);
    slot.appendChild(orb);
    slot.appendChild(label);

    return { slot, orb, label, lock };
});

function syncSkinOrbPlacement() {
    if (!evoEntityStack) return;
    skinTriadSlots.forEach((ref, i) => {
        const parent = ref.slot;
        if (!ref.orb || !parent) return;
        if (evolutionLabActive && i === selectedSkinIndex) {
            if (ref.orb.parentNode !== evoEntityStack) {
                evoEntityStack.insertBefore(ref.orb, evoEntityStack.firstChild);
            }
        } else if (ref.orb.parentNode !== parent) {
            parent.insertBefore(ref.orb, parent.firstChild);
        }
    });
}

function applyAbilityDescForIndex(index) {
    const skin = skins[index];
    if (!skin || !abilityDesc) return;
    const accent = skin.glowColor || skin.color;
    abilityDesc.innerHTML = `<strong style="font-size: 1.2em;">${skin.name}</strong><br>${skin.desc}`;
    abilityDesc.style.color = accent;
    abilityDesc.style.opacity = "1";
}

function selectSkinIndex(index, opts = {}) {
    if (deps.getGameActive() || deps.getIsDying()) return;
    if (isLabModeActive()) return;
    if (!skins.length) return;
    const next = Math.max(0, Math.min(index, skins.length - 1));
    if (next === selectedSkinIndex && !opts.force) return;
    selectedSkinIndex = next;
    skinTriadHoverIndex = null;
    renderSelectedSkin(!!opts.playSound);
}

// Cursor PLUS identic ca formă cu cel de pe intro (tip `cell`), dar colorat după skin.
// Desenăm un „+” SVG cu un contur întunecat ca să fie vizibil pe orice fundal.
const _skinCursorCache = {};
function makeSkinCursor(color) {
    const key = color || "#ffffff";
    if (_skinCursorCache[key]) return _skinCursorCache[key];
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">' +
        '<g stroke-linecap="butt" fill="none">' +
        '<g stroke="rgba(0,0,0,0.6)" stroke-width="5">' +
        '<line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/>' +
        '</g>' +
        '<g stroke="' + key + '" stroke-width="3">' +
        '<line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/>' +
        '</g>' +
        '</g></svg>';
    const value = "url('data:image/svg+xml;utf8," + encodeURIComponent(svg) + "') 10 10, cell";
    _skinCursorCache[key] = value;
    return value;
}

function applySkinCursor(color) {
    try {
        document.body.style.setProperty("--skin-cursor", makeSkinCursor(color));
    } catch (e) {}
}

function morphMenuUiToSkin(skinColor) {
    if (menuTitle && isHubVisible()) {
        setHubTitleColor(readHubTitleColor(), false);
    } else if (menuTitle) {
        menuTitle.style.color = skinColor;
        menuTitle.style.textShadow = `0 0 22px ${skinColor}`;
    }

    /* SOUND / SCREEN sunt în Options și folosesc SIGNAL TINT (--opt-accent), nu culoarea skin-ului. */
}

function renderSelectedSkin(playSound = false) {
    if (skins.length > 0) {
        selectedSkinIndex = Math.max(0, Math.min(selectedSkinIndex, skins.length - 1));
    }
    const skin = skins[selectedSkinIndex];
    const glowColor = skin.glowColor || skin.color;
    const descIndex = (skinTriadHoverIndex != null && !evolutionLabActive)
        ? skinTriadHoverIndex
        : selectedSkinIndex;

    skinTriadSlots.forEach((ref, i) => {
        const s = skins[i];
        if (!s) return;
        const g = s.glowColor || s.color;
        const isSelected = i === selectedSkinIndex;
        const isHovered = i === skinTriadHoverIndex && !evolutionLabActive;

        ref.slot.classList.toggle("is-selected", isSelected);
        ref.slot.classList.toggle("is-hovered", isHovered);
        ref.slot.classList.toggle("is-locked", !s.unlocked);
        ref.slot.style.setProperty("--slot-glow", g);
        ref.orb.setAttribute("aria-selected", isSelected ? "true" : "false");

        ref.orb.style.backgroundColor = s.color;
        ref.orb.style.color = s.color;
        const outerGlow = isSelected ? 26 : (isHovered ? 18 : 11);
        const innerGlow = isSelected ? 20 : (isHovered ? 12 : 8);
        ref.orb.style.boxShadow =
            `0 0 ${outerGlow}px ${g}, inset 0 0 ${innerGlow}px ${g}`;

        ref.orb.classList.toggle("active-skin-option", isSelected);
        ref.orb.classList.toggle("skin-triad-option-idle", !isSelected);

        ref.lock.hidden = true;
    });

    applyAbilityDescForIndex(descIndex);
    morphMenuUiToSkin(glowColor);
    applySkinCursor(skin.color);
    if (skinSelector) skinSelector.style.setProperty("--skin-accent", glowColor);
    updateSkinActionBtn();
    syncEvolutionLabBtnAccess();
    syncSkinOrbPlacement();
    if (playSound) playHoverSound();
    if (evolutionLabActive) renderEntityModButtons();
}

// Lab-ul e disponibil doar pentru skin-uri deja deblocate; pe skin-uri matter-lock
// dezactivăm vizual butonul.
function syncEvolutionLabBtnAccess() {
    const mp = isMultiplayerSelect();
    if (startMenu) startMenu.classList.toggle("mp-select", mp);
    if (mpUpgradeLine) mpUpgradeLine.hidden = !mp;
    const btn = evolutionLabBtn;
    if (!btn) return;
    if (mp) {
        btn.hidden = true;
        return;
    }
    btn.hidden = false;
    const skin = skins[selectedSkinIndex];
    const locked = !!(skin && !skin.unlocked);
    btn.classList.toggle("locked", locked);
    btn.setAttribute("aria-disabled", locked ? "true" : "false");
}

function updateSkinActionBtn() {
    if (!skinActionBtn) return;

    if (evolutionLabActive) {
        // Butonul e ascuns prin CSS (`.lab-mode #skinActionBtn`); ne asigurăm doar
        // că matterDisplay rămâne vizibil, iar badge-ul de preț e ascuns.
        if (matterDisplay) {
            matterDisplay.hidden = false;
            matterDisplay.innerHTML = `VOID MATTER + <span class="matter-value">${window.totalVoidMatter.toLocaleString()}</span>`;
        }
        if (skinPriceBadge) {
            skinPriceBadge.classList.remove("visible");
            skinPriceBadge.hidden = true;
        }
        return;
    }

    const skin = skins[selectedSkinIndex];
    const isLocked = !skin.unlocked;
    const isMatterLocked = isLocked && Number.isFinite(skin.costMatter) && skin.costMatter > 0;
    const isPriceLocked = isLocked && !isMatterLocked && Number.isFinite(skin.cost) && skin.cost > 0;

    if (!isLocked) {
        skinActionBtn.hidden = true;
        skinActionBtn.dataset.state = "start";
        if (matterDisplay) matterDisplay.hidden = true;
        return;
    } else if (isMatterLocked) {
        skinActionBtn.hidden = false;
        const cost = Math.round(skin.costMatter).toLocaleString();
        const canAfford = window.totalVoidMatter >= skin.costMatter;
        skinActionBtn.textContent = canAfford
            ? "[ READY TO ALLOCATE ]"
            : `[ ALLOCATE MATTER: ${cost} ]`;
        skinActionBtn.style.color = "#ffffff";
        skinActionBtn.style.borderColor = canAfford ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)";
        skinActionBtn.style.boxShadow = canAfford ? "0 0 10px rgba(255,255,255,0.3)" : "none";
        skinActionBtn.style.textShadow = canAfford ? "0 0 8px rgba(255,255,255,0.5)" : "none";
        skinActionBtn.dataset.state = "matter";
    } else {
        skinActionBtn.hidden = true;
        if (matterDisplay) matterDisplay.hidden = true;
        skinActionBtn.dataset.state = "start";
    }

    if (matterDisplay && isMatterLocked) {
        matterDisplay.hidden = false;
        matterDisplay.innerHTML = `VOID MATTER + <span class="matter-value">${window.totalVoidMatter.toLocaleString()}</span>`;
    }

    if (skinPriceBadge) {
        skinPriceBadge.classList.remove("visible");
        skinPriceBadge.hidden = !isPriceLocked;
        if (isPriceLocked) {
            skinPriceBadge.innerText = `COST: ${Math.round(skin.cost).toLocaleString()}`;
            skinPriceBadge.classList.add("visible");
        }
    }
}

function commitSkinRun(skin) {
    if (!skin || !skin.unlocked) return;
    const intent =
        typeof deps.getEntitySelectIntent === "function" ? deps.getEntitySelectIntent() : "single";
    if (intent === "multiplayer" && typeof deps.onEnterMultiplayerLobby === "function") {
        deps.onEnterMultiplayerLobby(skin);
        return;
    }
    deps.onStartGameWithSkin(skin);
}

function unlockWithMatter(index) {
    const skin = skins[index];
    if (!skin || skin.unlocked || !Number.isFinite(skin.costMatter) || skin.costMatter <= 0) return;
    initAudio();
    if (!spendVoidMatter(skin.costMatter)) {
        if (skinActionBtn) {
            const savedText = skinActionBtn.textContent;
            skinActionBtn.classList.remove("btn-denied");
            void skinActionBtn.offsetWidth;
            skinActionBtn.textContent = "[ INSUFFICIENT MATTER ]";
            skinActionBtn.classList.add("btn-denied");
            setTimeout(() => {
                skinActionBtn.classList.remove("btn-denied");
                skinActionBtn.textContent = savedText;
            }, 700);
        }
        if (typeof playErrorSound === "function") playErrorSound();
        return;
    }

    skin.unlocked = true;
    persistSkinUnlockState();
    updateSkinActionBtn();
    commitSkinRun(skin);
}

function shiftSkin(step) {
    if (isLabModeActive() || !skins.length) return;
    const next = (selectedSkinIndex + step + skins.length) % skins.length;
    selectSkinIndex(next, { playSound: true });
}

function handleSkinOrbActivate(index) {
    if (deps.getGameActive() || deps.getIsDying()) return;
    if (isLabModeActive()) return;
    const selectedSkin = skins[index];
    if (!selectedSkin) return;
    if (index !== selectedSkinIndex) {
        selectSkinIndex(index, { playSound: true });
        return;
    }
    if (selectedSkin.unlocked) {
        commitSkinRun(selectedSkin);
    } else if (skinActionBtn && skinActionBtn.dataset.state === "matter") {
        skinActionBtn.click();
    }
}

function isLabModeActive() {
    return evolutionLabActive === true;
}

skinTriadSlots.forEach((ref, index) => {
    ref.orb.onclick = () => handleSkinOrbActivate(index);
    ref.orb.onmouseenter = () => {
        if (isLabModeActive()) return;
        skinTriadHoverIndex = index;
        renderSelectedSkin();
    };
    ref.orb.onmouseleave = () => {
        if (isLabModeActive()) return;
        if (skinTriadHoverIndex === index) {
            skinTriadHoverIndex = null;
            renderSelectedSkin();
        }
    };
});

if (skinActionBtn) {
    skinActionBtn.onclick = () => {
        if (deps.getGameActive() || deps.getIsDying()) return;
        if (isLabModeActive()) return; // în lab butonul e ascuns; nu reacționăm la activări programatice
        const state = skinActionBtn.dataset.state;
        if (state === "start") {
            commitSkinRun(skins[selectedSkinIndex]);
        } else if (state === "matter") {
            unlockWithMatter(selectedSkinIndex);
        }
    };
}

window.addEventListener("keydown", (e) => {
    if (!deps.getEntitySelectActive() || startMenu.style.display === "none" || deps.getGameActive()) return;
    // Space din meniu nu trebuie să ajungă la listener-ul de abilitate după ce pornește runda.
    if (e.code === "Space") e.stopImmediatePropagation();
    // Fără default: altfel butonul focalizat (ex. [ > ]) primește și el click după start.
    if (e.code === "Enter" || e.code === "Space") e.preventDefault();
    if (isLabModeActive()) {
        // În lab, săgețile nu fac nimic; Enter/Space închid laboratorul.
        if (e.code === "Enter" || e.code === "Space") {
            setEvolutionLabActive(false);
        }
        return;
    }
    if (e.code === "ArrowLeft") shiftSkin(-1);
    if (e.code === "ArrowRight") shiftSkin(1);
    if (e.code === "Enter" || e.code === "Space") {
        if (skinActionBtn && !skinActionBtn.hidden) { skinActionBtn.click(); return; }
        const selectedSkin = skins[selectedSkinIndex];
        if (!selectedSkin) return;
        if (selectedSkin.unlocked) {
            commitSkinRun(selectedSkin);
        } else if (Number.isFinite(selectedSkin.costMatter) && selectedSkin.costMatter > 0
            && window.totalVoidMatter >= selectedSkin.costMatter) {
            unlockWithMatter(selectedSkinIndex);
        }
    }
});

skinTriadSlots.forEach((ref) => skinTriadRow.appendChild(ref.slot));
if (skinSelector) skinSelector.appendChild(skinTriadRow);

// =============================================================================
// 🧬 EVOLUTION LAB :: UI LAYER
// =============================================================================

// `evolutionLabActive` e declarat sus, lângă data layer-ul EVOLUTION,
// pentru a fi disponibil în `updateSkinActionBtn()` la primul render.

// Cele 3 bare verticale (KINETIC / MATTER / SIGNAL).
evoBars = {
    kinetic: { branch: EVOLUTION_BRANCHES[0], container: null, header: null, price: null, cells: [], action: null },
    core:    { branch: EVOLUTION_BRANCHES[1], container: null, header: null, price: null, cells: [], action: null },
    signal:  { branch: EVOLUTION_BRANCHES[2], container: null, header: null, price: null, cells: [], action: null }
};

function buildEvoBar(barRef) {
    const branch = barRef.branch;
    const wrap = document.createElement("div");
    wrap.className = "evo-bar";
    wrap.dataset.branch = branch.key;
    wrap.style.setProperty("--evo-color", branch.color);
    wrap.style.setProperty("--evo-glow", branch.glow);
    wrap.hidden = true; // ascuns până când deschidem laboratorul

    const header = document.createElement("div");
    header.className = "evo-bar-header";
    wrap.appendChild(header);

    const price = document.createElement("div");
    price.className = "evo-bar-price";
    wrap.appendChild(price);

    const cellsWrap = document.createElement("div");
    cellsWrap.className = "evo-bar-cells";
    const cells = [];
    for (let i = 0; i < EVOLUTION_MAX_LEVEL; i++) {
        const c = document.createElement("div");
        c.className = "evo-cell";
        cellsWrap.appendChild(c);
        cells.push(c);
    }
    wrap.appendChild(cellsWrap);

    const action = document.createElement("button");
    action.type = "button";
    action.className = "evo-bar-action";
    action.textContent = "[ + ]";
    wrap.appendChild(action);

    barRef.container = wrap;
    barRef.header = header;
    barRef.price = price;
    barRef.cells = cells;
    barRef.action = action;

    action.addEventListener("click", (e) => {
        e.stopPropagation();
        purchaseEvolutionUpgrade(branch.key);
    });
    return wrap;
}

const kineticBarEl = buildEvoBar(evoBars.kinetic);
const coreBarEl    = buildEvoBar(evoBars.core);
const signalBarEl  = buildEvoBar(evoBars.signal);

// Stack entitate + moduri x1/x2/x3 (vizual only în lab, sub glob).
evoEntityStack = document.createElement("div");
evoEntityStack.className = "evo-entity-stack";
if (skinSelector) {
    skinSelector.appendChild(evoEntityStack);
}

evoEntityMods = document.createElement("div");
evoEntityMods.className = "evo-entity-mods";
evoEntityMods.hidden = true;
evoEntityMods.setAttribute("aria-label", "Entity mod tiers");

const EVO_MOD_SLOTS = [
    {
        tier: 1,
        color: "#00e5ff",
        glow: "rgba(0, 229, 255, 0.85)",
        descGlow: "rgba(0, 229, 255, 0.32)",
    },
    {
        tier: 2,
        color: "#c86bff",
        glow: "rgba(200, 107, 255, 0.85)",
        descGlow: "rgba(200, 107, 255, 0.3)",
    },
    {
        tier: 3,
        color: "#ffbe76",
        glow: "rgba(255, 190, 118, 0.85)",
        descGlow: "rgba(255, 190, 118, 0.3)",
    },
];

const evoModButtons = {};
const evoModPrices = {};

function entityModDescKw(text, variant) {
    const cls = variant ? `evo-mod-desc-kw evo-mod-desc-kw--${variant}` : "evo-mod-desc-kw";
    return `<span class="${cls}">${text}</span>`;
}

function getEntityModDescriptionHtml(skinName, tier) {
    const isRavenous = skinName === RAVENOUS_X1_CFG.skinName;
    const isPhase = skinName === PHASE_SHIFTER_X1_CFG.skinName;
    const x1Available = isEntityModX1AvailableForSkin(skinName);
    const x2Available = isEntityModX2AvailableForSkin(skinName);
    const x3Available = isEntityModX3AvailableForSkin(skinName);
    const ownedX1 = hasEntityModX1(skinName);
    const ownedX2 = hasEntityModX2(skinName);

    if (tier === 1) {
        if (!x1Available) {
            return `<span class="evo-mod-desc-muted">ENTITY MOD x1 — NOT AVAILABLE FOR THIS SKIN</span>`;
        }
        if (isPhase) {
            return [
                entityModDescKw("VOID SHRIEK", "tier"),
                " SPAWNS ",
                entityModDescKw("PHASE CAGE", "phase"),
                " — ",
                entityModDescKw("FIXED", "cyan"),
                " GEOMETRY TRAP · UP TO ",
                entityModDescKw("3", "lime"),
                " ACTIVE CAGES",
            ].join("");
        }
        if (isRavenous) {
            return [
                entityModDescKw("BLOOD RIFT", "crimson"),
                " ",
                entityModDescKw("HUNTS", "violet"),
                " NEAREST PREY · TRACKS UNTIL ",
                entityModDescKw("FADE", "gold"),
            ].join("");
        }
        if (skinName === TOXIC_SPORE_X1_CFG.skinName) {
            return [
                entityModDescKw("CORROSIVE BURST", "tier"),
                " — AFTER SPRINT, ",
                entityModDescKw("SPORE GHOSTS", "lime"),
                " LATCH ",
                entityModDescKw("NEAREST BOT", "gold"),
                " & ",
                entityModDescKw("DRAIN", "lime"),
                " SLOWLY",
            ].join("");
        }
    }
    if (tier === 2) {
        if (!x2Available) {
            return `<span class="evo-mod-desc-muted">ENTITY MOD x2 — NOT AVAILABLE FOR THIS SKIN</span>`;
        }
        if (!ownedX1) {
            return [
                `<span class="evo-mod-desc-muted">REQUIRES</span> `,
                entityModDescKw("x1", "tier"),
                `<span class="evo-mod-desc-muted"> FIRST</span>`,
            ].join("");
        }
        if (isPhase) {
            return [
                entityModDescKw("PHASE CAGE", "phase"),
                " ",
                entityModDescKw("RESONANCE", "phase"),
                " — TRAPPED PREY TAKES ",
                entityModDescKw("PHASE DAMAGE", "cyan"),
                " AT ",
                entityModDescKw("CAGE WALLS", "lime"),
                " · DEBRIS AS ",
                entityModDescKw("NUTRIENTS", "gold"),
            ].join("");
        }
        if (skinName === TOXIC_SPORE_X1_CFG.skinName) {
            return [
                entityModDescKw("SPORE SPLIT", "gold"),
                " — LATCHED ",
                entityModDescKw("GHOSTS", "lime"),
                " BURST TOWARD A ",
                entityModDescKw("SECOND BOT", "gold"),
                " IN RANGE · ",
                entityModDescKw("ACID", "lime"),
                " TRAIL COLOR",
            ].join("");
        }
        return [
            entityModDescKw("ORGANIC SIPHONS", "violet"),
            " — UP TO ",
            entityModDescKw("3", "lime"),
            " BOLTS DRAIN BOTS IN ",
            entityModDescKw("BLOOD RIFT", "crimson"),
        ].join("");
    }
    if (tier === 3) {
        if (!x3Available) {
            return `<span class="evo-mod-desc-muted">ENTITY MOD x3 — NOT AVAILABLE FOR THIS SKIN</span>`;
        }
        if (!ownedX2) {
            return [
                `<span class="evo-mod-desc-muted">REQUIRES</span> `,
                entityModDescKw("x2", "tier"),
                `<span class="evo-mod-desc-muted"> FIRST</span>`,
            ].join("");
        }
        if (isPhase) {
            return [
                entityModDescKw("VOID ASCEND", "phase"),
                " — ",
                entityModDescKw("MOBILE", "cyan"),
                " ",
                entityModDescKw("PHASE CAGE", "phase"),
                " HUNTS UP TO ",
                entityModDescKw("3", "lime"),
                " PREY · DRAGS ",
                entityModDescKw("TRAPPED", "gold"),
                " INSIDE",
            ].join("");
        }
        if (skinName === TOXIC_SPORE_X1_CFG.skinName) {
            return [
                entityModDescKw("SPORE RETURN", "cyan"),
                " — ",
                entityModDescKw("CYAN", "cyan"),
                " SPLIT SEEK ",
                entityModDescKw("YOU", "gold"),
                " · ",
                entityModDescKw("SMALL MASS", "lime"),
                " ON ABSORB",
            ].join("");
        }
        return [
            entityModDescKw("TWIN RIFTS", "crimson"),
            " ON CAST · ",
            entityModDescKw("VIOLET AFTERGLOW", "violet"),
            " BURNS AFTER ",
            entityModDescKw("FADE", "crimson"),
        ].join("");
    }
    return "";
}

evoModDescPanel = document.createElement("div");
evoModDescPanel.className = "evo-mod-desc-panel is-empty";
evoModDescPanel.setAttribute("aria-live", "polite");
evoModDescPanel.hidden = true;

let tabletModArmedTier = null;
let tabletModArmedAt = 0;

function clearEntityModDescription() {
    if (performance.now() - tabletModArmedAt < 500) return;
    tabletModArmedTier = null;
    if (!evoModDescPanel) return;
    delete evoModDescPanel.dataset.modTier;
    const tablet =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("tablet-mode");
    evoModDescPanel.innerHTML = tablet
        ? `<span class="evo-mod-desc-muted">TAP x1 · x2 · x3 — TAP AGAIN TO INSTALL</span>`
        : `<span class="evo-mod-desc-muted">HOVER x1 · x2 · x3 FOR DETAILS</span>`;
    evoModDescPanel.classList.add("is-empty");
}

function showEntityModDescription(tier) {
    if (!evoModDescPanel || !evolutionLabActive) return;
    const skin = skins[selectedSkinIndex];
    const skinName = skin ? skin.name : "";
    const slot = EVO_MOD_SLOTS.find((s) => s.tier === tier);
    if (slot) {
        evoModDescPanel.dataset.modTier = String(slot.tier);
        evoModDescPanel.style.setProperty("--mod-color", slot.color);
        evoModDescPanel.style.setProperty("--mod-glow", slot.glow);
        evoModDescPanel.style.setProperty("--mod-desc-glow", slot.descGlow || slot.glow);
    }
    const html = getEntityModDescriptionHtml(skinName, tier);
    evoModDescPanel.innerHTML = html || `<span class="evo-mod-desc-muted">—</span>`;
    evoModDescPanel.classList.remove("is-empty");
}

EVO_MOD_SLOTS.forEach((slot) => {
    const wrap = document.createElement("div");
    wrap.className = "evo-mod-slot";
    wrap.style.setProperty("--mod-color", slot.color);
    wrap.style.setProperty("--mod-glow", slot.glow);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "evo-mod-btn";
    btn.dataset.mod = String(slot.tier);
    btn.style.setProperty("--mod-color", slot.color);
    btn.style.setProperty("--mod-glow", slot.glow);
    btn.innerHTML = `<span class="evo-mod-x">x</span><span class="evo-mod-num">${slot.tier}</span>`;
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tablet =
            typeof document !== "undefined" &&
            document.documentElement.classList.contains("tablet-mode");
        if (tablet && tabletModArmedTier !== slot.tier) {
            tabletModArmedTier = slot.tier;
            tabletModArmedAt = performance.now();
            showEntityModDescription(slot.tier);
            return;
        }
        purchaseEntityMod(slot.tier);
    });
    btn.addEventListener("mouseenter", () => showEntityModDescription(slot.tier));
    btn.addEventListener("focus", () => showEntityModDescription(slot.tier));

    const price = document.createElement("div");
    price.className = "evo-mod-price";
    price.setAttribute("aria-hidden", "true");

    wrap.appendChild(btn);
    wrap.appendChild(price);
    evoModButtons[slot.tier] = btn;
    evoModPrices[slot.tier] = price;
    evoEntityMods.appendChild(wrap);
});

evoEntityMods.addEventListener("mouseleave", clearEntityModDescription);

function purchaseEntityMod(tier) {
    initAudio();
    const skin = skins[selectedSkinIndex];
    if (!skin || !skin.unlocked) {
        if (typeof playErrorSound === "function") playErrorSound();
        return;
    }
    if (tier === 1) {
        if (!isEntityModX1AvailableForSkin(skin.name)) {
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (hasEntityModX1(skin.name)) {
            if (typeof playHoverSound === "function") playHoverSound();
            return;
        }
        if (window.totalVoidMatter < ENTITY_MOD_X1_COST) {
            const btn = evoModButtons[tier];
            if (btn) {
                btn.classList.remove("btn-denied");
                void btn.offsetWidth;
                btn.classList.add("btn-denied");
                setTimeout(() => btn.classList.remove("btn-denied"), 700);
            }
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (!spendVoidMatter(ENTITY_MOD_X1_COST)) {
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (!entityModsOwned[skin.name]) entityModsOwned[skin.name] = { x1: false, x2: false, x3: false };
        entityModsOwned[skin.name].x1 = true;
        writeEntityMods(entityModsOwned);
        if (typeof playHoverSound === "function") playHoverSound();
        renderEvolutionPanel();
        renderEntityModButtons();
        return;
    }
    if (tier === 2) {
        if (!isEntityModX2AvailableForSkin(skin.name)) {
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (!hasEntityModX1(skin.name)) {
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (hasEntityModX2(skin.name)) {
            if (typeof playHoverSound === "function") playHoverSound();
            return;
        }
        if (window.totalVoidMatter < ENTITY_MOD_X2_COST) {
            const btn = evoModButtons[tier];
            if (btn) {
                btn.classList.remove("btn-denied");
                void btn.offsetWidth;
                btn.classList.add("btn-denied");
                setTimeout(() => btn.classList.remove("btn-denied"), 700);
            }
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (!spendVoidMatter(ENTITY_MOD_X2_COST)) {
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (!entityModsOwned[skin.name]) entityModsOwned[skin.name] = { x1: false, x2: false, x3: false };
        entityModsOwned[skin.name].x2 = true;
        writeEntityMods(entityModsOwned);
        if (typeof playHoverSound === "function") playHoverSound();
        renderEvolutionPanel();
        renderEntityModButtons();
        return;
    }
    if (tier === 3) {
        if (!isEntityModX3AvailableForSkin(skin.name)) {
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (!hasEntityModX2(skin.name)) {
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (hasEntityModX3(skin.name)) {
            if (typeof playHoverSound === "function") playHoverSound();
            return;
        }
        if (window.totalVoidMatter < ENTITY_MOD_X3_COST) {
            const btn = evoModButtons[tier];
            if (btn) {
                btn.classList.remove("btn-denied");
                void btn.offsetWidth;
                btn.classList.add("btn-denied");
                setTimeout(() => btn.classList.remove("btn-denied"), 700);
            }
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (!spendVoidMatter(ENTITY_MOD_X3_COST)) {
            if (typeof playErrorSound === "function") playErrorSound();
            return;
        }
        if (!entityModsOwned[skin.name]) entityModsOwned[skin.name] = { x1: false, x2: false, x3: false };
        entityModsOwned[skin.name].x3 = true;
        writeEntityMods(entityModsOwned);
        if (typeof playHoverSound === "function") playHoverSound();
        renderEvolutionPanel();
        renderEntityModButtons();
        return;
    }
    if (typeof playErrorSound === "function") playErrorSound();
}

function renderEntityModButtons() {
    const skin = skins[selectedSkinIndex];
    const skinName = skin ? skin.name : "";
    const ownedX1 = hasEntityModX1(skinName);
    const ownedX2 = hasEntityModX2(skinName);
    const ownedX3 = hasEntityModX3(skinName);
    const x1Available = isEntityModX1AvailableForSkin(skinName);
    const x2Available = isEntityModX2AvailableForSkin(skinName);
    const x3Available = isEntityModX3AvailableForSkin(skinName);
    const canAffordX1 = window.totalVoidMatter >= ENTITY_MOD_X1_COST;
    const canAffordX2 = window.totalVoidMatter >= ENTITY_MOD_X2_COST;
    const canAffordX3 = window.totalVoidMatter >= ENTITY_MOD_X3_COST;

    [1, 2, 3].forEach((tier) => {
        const btn = evoModButtons[tier];
        const priceEl = evoModPrices[tier];
        if (!btn) return;
        btn.classList.remove("is-owned", "affordable", "locked", "is-unavailable");
        btn.disabled = false;
        if (priceEl) {
            priceEl.classList.remove("affordable", "maxed", "muted");
            priceEl.textContent = "";
        }
        btn.removeAttribute("title");
        if (tier === 1) {
            if (!x1Available) {
                btn.classList.add("is-unavailable");
                if (priceEl) {
                    priceEl.textContent = formatEntityModPrice(ENTITY_MOD_X1_COST);
                    priceEl.classList.add("muted");
                }
                return;
            }
            if (priceEl) {
                if (ownedX1) {
                    priceEl.textContent = "ACTIVE";
                    priceEl.classList.add("maxed");
                } else {
                    priceEl.textContent = formatEntityModPrice(ENTITY_MOD_X1_COST);
                    if (canAffordX1) priceEl.classList.add("affordable");
                    else priceEl.classList.add("muted");
                }
            }
            if (ownedX1) {
                btn.classList.add("is-owned");
            } else if (canAffordX1) {
                btn.classList.add("affordable");
            } else {
                btn.classList.add("locked");
            }
            return;
        }
        if (tier === 2) {
            if (!x2Available) {
                btn.classList.add("is-unavailable");
                if (priceEl) {
                    priceEl.textContent = formatEntityModPrice(ENTITY_MOD_X2_COST);
                    priceEl.classList.add("muted");
                }
                return;
            }
            if (!ownedX1) {
                btn.classList.add("locked");
                if (priceEl) {
                    priceEl.textContent = "NEED x1";
                    priceEl.classList.add("muted");
                }
                return;
            }
            if (priceEl) {
                if (ownedX2) {
                    priceEl.textContent = "ACTIVE";
                    priceEl.classList.add("maxed");
                } else {
                    priceEl.textContent = formatEntityModPrice(ENTITY_MOD_X2_COST);
                    if (canAffordX2) priceEl.classList.add("affordable");
                    else priceEl.classList.add("muted");
                }
            }
            if (ownedX2) {
                btn.classList.add("is-owned");
            } else if (canAffordX2) {
                btn.classList.add("affordable");
            } else {
                btn.classList.add("locked");
            }
            return;
        }
        if (tier === 3) {
            if (!x3Available) {
                btn.classList.add("is-unavailable");
                if (priceEl) {
                    priceEl.textContent = formatEntityModPrice(ENTITY_MOD_X3_COST);
                    priceEl.classList.add("muted");
                }
                return;
            }
            if (!ownedX2) {
                btn.classList.add("locked");
                if (priceEl) {
                    priceEl.textContent = "NEED x2";
                    priceEl.classList.add("muted");
                }
                return;
            }
            if (priceEl) {
                if (ownedX3) {
                    priceEl.textContent = "ACTIVE";
                    priceEl.classList.add("maxed");
                } else {
                    priceEl.textContent = formatEntityModPrice(ENTITY_MOD_X3_COST);
                    if (canAffordX3) priceEl.classList.add("affordable");
                    else priceEl.classList.add("muted");
                }
            }
            if (ownedX3) {
                btn.classList.add("is-owned");
            } else if (canAffordX3) {
                btn.classList.add("affordable");
            } else {
                btn.classList.add("locked");
            }
            return;
        }
        btn.classList.add("is-unavailable");
        if (priceEl) {
            priceEl.textContent = "SOON";
            priceEl.classList.add("muted");
        }
    });
    clearEntityModDescription();
}

renderEntityModButtons();

if (evoEntityStack) {
    evoEntityStack.appendChild(evoEntityMods);
    evoEntityStack.appendChild(evoModDescPanel);
}
clearEntityModDescription();

// În lab, toate cele 3 bare stau pe primul rând (KINETIC / CORE / SIGNAL),
// iar skin-ul activ e plasat pe al doilea rând prin grid (vezi style.css `.lab-mode #skinSelector`).
if (skinSelector) {
    skinSelector.insertBefore(kineticBarEl, skinTriadRow);
    skinSelector.insertBefore(coreBarEl, skinTriadRow);
    skinSelector.insertBefore(signalBarEl, skinTriadRow);
}
renderSelectedSkin();

function renderEvolutionBar(branchKey) {
    const ref = evoBars[branchKey];
    if (!ref) return;
    const lvl = getEvolutionLevel(branchKey);
    const cost = getEvolutionCost(branchKey);
    const isMax = lvl >= EVOLUTION_MAX_LEVEL;
    const canAfford = !isMax && window.totalVoidMatter >= cost;

    ref.header.textContent = ref.branch.label;

    if (isMax) {
        ref.price.textContent = `LV ${EVOLUTION_MAX_LEVEL}/${EVOLUTION_MAX_LEVEL}`;
        ref.price.classList.remove("affordable");
        ref.price.classList.add("maxed");
    } else {
        ref.price.textContent = `+ ${cost.toLocaleString()}`;
        ref.price.classList.remove("maxed");
        ref.price.classList.toggle("affordable", canAfford);
    }

    ref.cells.forEach((cell, i) => {
        cell.classList.toggle("filled", i < lvl);
    });

    ref.action.classList.remove("affordable", "locked", "is-stable");
    if (isMax) {
        ref.action.textContent = "[ STABLE ]";
        ref.action.classList.add("is-stable");
        ref.action.disabled = true;
    } else {
        ref.action.textContent = "[ + ]";
        ref.action.disabled = false;
        if (canAfford) ref.action.classList.add("affordable");
        else ref.action.classList.add("locked");
    }
}

function renderEvolutionPanel() {
    Object.keys(evoBars).forEach(renderEvolutionBar);
    if (matterDisplay) {
        matterDisplay.hidden = false;
        matterDisplay.innerHTML = `VOID MATTER + <span class="matter-value">${window.totalVoidMatter.toLocaleString()}</span>`;
    }
    renderEntityModButtons();
}

function purchaseEvolutionUpgrade(branchKey) {
    const ref = evoBars[branchKey];
    if (!ref) return;
    initAudio();
    const result = applyEvolutionUpgrade(branchKey);
    if (!result.ok) {
        if (result.reason === "matter") {
            ref.action.classList.remove("btn-denied");
            void ref.action.offsetWidth;
            const oldText = ref.action.textContent;
            ref.action.textContent = "[ LOW MATTER ]";
            ref.action.classList.add("btn-denied");
            setTimeout(() => {
                ref.action.classList.remove("btn-denied");
                ref.action.textContent = oldText;
                renderEvolutionPanel();
            }, 700);
            if (typeof playErrorSound === "function") playErrorSound();
        }
        return;
    }
    // Pop pe ultima celulă activată
    const lastCell = ref.cells[result.newLevel - 1];
    if (lastCell) {
        lastCell.classList.remove("cell-pop");
        void lastCell.offsetWidth;
        lastCell.classList.add("cell-pop");
        setTimeout(() => lastCell && lastCell.classList.remove("cell-pop"), 480);
    }
    if (typeof playHoverSound === "function") playHoverSound();
    renderEvolutionPanel();
}

function triggerTitleGlitch(newText) {
    if (!menuTitle) return;
    menuTitle.classList.remove("title-glitch");
    void menuTitle.offsetWidth;
    menuTitle.classList.add("title-glitch");
    // schimbăm textul la mijlocul animației pentru efect "remap" credibil
    setTimeout(() => { menuTitle.textContent = newText; }, 180);
    setTimeout(() => { menuTitle.classList.remove("title-glitch"); }, 600);
}

function setEvolutionLabActive(active) {
    if (active && isMultiplayerSelect()) return;
    evolutionLabActive = !!active;
    tabletModArmedTier = null;
    tabletModArmedAt = 0;
    if (!startMenu) return;

    startMenu.classList.toggle("lab-mode", evolutionLabActive);
    if (evolutionLabBtn) evolutionLabBtn.classList.toggle("lab-active", evolutionLabActive);

    // Bare: vizibile doar în lab
    [evoBars.kinetic, evoBars.core, evoBars.signal].forEach(r => { if (r.container) r.container.hidden = !evolutionLabActive; });
    if (evoEntityMods) evoEntityMods.hidden = !evolutionLabActive;
    if (evoModDescPanel) evoModDescPanel.hidden = !evolutionLabActive;

    if (evolutionLabActive) {
        // Titlul + subtitlul sunt ascunse prin CSS în lab; nu mai modificăm textul.
        if (evolutionLabBtn) evolutionLabBtn.textContent = "[ CLOSE LAB ]";
        skinTriadHoverIndex = null;
        // Mutăm VOID MATTER în interiorul grid-ului #skinSelector între bare și skin (row 2).
        if (matterDisplay && skinSelector && evoEntityStack && matterDisplay.parentNode !== skinSelector) {
            skinSelector.insertBefore(matterDisplay, evoEntityStack);
        }
        syncSkinOrbPlacement();
        renderEvolutionPanel();
        clearEntityModDescription();
    } else {
        clearEntityModDescription();
        triggerTitleGlitch(menuTitle ? (menuTitle.dataset.originalText || "NEBULA VOID") : "NEBULA VOID");
        if (evolutionLabBtn) evolutionLabBtn.textContent = "[ EVOLUTION LAB ]";
        // Restaurăm matterDisplay la poziția lui originală din #startMenu (înaintea #skinActionBtn).
        if (matterDisplay && startMenu && skinActionBtn && matterDisplay.parentNode !== startMenu) {
            startMenu.insertBefore(matterDisplay, skinActionBtn);
        }
        syncSkinOrbPlacement();
        // Reaplică morph-ul de culoare al meniului în funcție de skin-ul activ
        renderSelectedSkin();
    }
    // Sincronizăm matterDisplay-ul: în lab îl ținem vizibil, în normal urmează skin-ul.
    updateSkinActionBtn();
}

if (evolutionLabBtn) {
    evolutionLabBtn.addEventListener("click", () => {
        if (deps.getGameActive() || deps.getIsDying()) return;
        initAudio();
        // Dacă suntem deja în lab, click-ul îl închide indiferent de starea skin-ului.
        if (evolutionLabActive) { setEvolutionLabActive(false); return; }
        if (isMultiplayerSelect()) return;
        // Lab-ul e disponibil doar pentru skin-uri deblocate.
        const skin = skins[selectedSkinIndex];
        if (!skin || !skin.unlocked) {
            // Feedback de denial: schimbăm temporar textul + shake roșu
            const prevText = evolutionLabBtn.textContent;
            evolutionLabBtn.classList.remove("btn-denied");
            void evolutionLabBtn.offsetWidth;
            evolutionLabBtn.textContent = "[ UNLOCK ENTITY FIRST ]";
            evolutionLabBtn.classList.add("btn-denied");
            if (typeof playErrorSound === "function") playErrorSound();
            setTimeout(() => {
                evolutionLabBtn.classList.remove("btn-denied");
                evolutionLabBtn.textContent = prevText;
            }, 900);
            return;
        }
        setEvolutionLabActive(true);
    });
}
        global.renderSelectedSkin = renderSelectedSkin;
        global.applySkinCursor = applySkinCursor;
        global.triggerTitleGlitch = triggerTitleGlitch;

    }

    function configureEntitySelectUi(nextDeps) {
        if (!nextDeps || !nextDeps.dom || typeof nextDeps.getGameActive !== "function") {
            throw new Error("configureEntitySelectUi requires dom refs and state getters");
        }
        deps = nextDeps;
        const dom = nextDeps.dom;
        skinSelector = dom.skinSelector;
        abilityDesc = dom.abilityDesc;
        evolutionLabBtn = dom.evolutionLabBtn;
        mpUpgradeLine = document.getElementById("mpUpgradeLine");
        skinActionBtn = dom.skinActionBtn;
        matterDisplay = dom.matterDisplay;
        skinPriceBadge = dom.skinPriceBadge;
        startMenu = dom.startMenu;
        menuTitle = dom.menuTitle;
        menuFullscreenBtn = dom.menuFullscreenBtn;
        menuSoundBtn = dom.menuSoundBtn;
        bootstrapEntitySelectUi();
    }

    global.configureEntitySelectUi = configureEntitySelectUi;
    global.getActiveSkinKey = getActiveSkinKey;
    global.isLabModeActive = isLabModeActive;
    global.dismissEvolutionLabForGameStart = dismissEvolutionLabForGameStart;
    // applySkinCursor replaced in bootstrapEntitySelectUi()
})(typeof window !== "undefined" ? window : globalThis);
