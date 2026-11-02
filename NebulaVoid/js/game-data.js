/**
 * NEBULA VOID — balans și conținut. Încărcat ca script, ca index.html să meargă la dublu-click.
 * Modifică valorile aici. js/config-loader.js validează obiectul și expune window.__GAME_BOOT.
 */
window.__GAME_DATA_SOURCE = {

  // ═══════════════════════════════════════════════════════════════════════════
  // NEBULA VOID — GAME DATA (sursă de balans & conținut)
  // ───────────────────────────────────────────────────────────────────────────
  // • Poți folosi comentarii // și /* */ — sunt comentarii JavaScript normale.
  // • Modifică doar VALORILE; nu redenumi cheile fără să actualizezi codul.
  // • Unități: px = pixeli lume · sec = secunde · ms = milisecunde · /s = pe secundă
  // • ★ = setare esențială de balans (cele mai „simțite” în joc).
  // • ⚠ NEFOLOSIT = cheia există, dar codul nu o citește încă (modificarea nu are efect).
  // • configVersion: incrementează când faci migrări majore de save (viitor).
  // ═══════════════════════════════════════════════════════════════════════════

  "configVersion": 1,

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. GAME SETTINGS — reguli globale ale rundei
  // ═══════════════════════════════════════════════════════════════════════════
  "gameSettings": {

    /* ─── 1.1 Lume & limite jucător ─── */
    "WORLD_SIZE": 4000,              // ★ px — latura hărții pătrate (gaura neagră e în centru)
    "START_RADIUS": 20,              // ★ px — raza jucătorului la spawn
    "MAX_PLAYER_RADIUS": 60,        // ★ px — plafon de creștere; la plafon jucătorul „tremură”

    /* ─── 1.2 Praf stelar (particule de mâncat) ─── */
    "MAX_PARTICLES": 200,            // ★ max particule active simultan (densitatea hranei)
    "PARTICLE_POOL_EXTRA": 40,       // sloturi extra inactive în pool (doar memorie)
    "PARTICLE_SHADOW": false,        // true = glow GPU pe particule (mai frumos, mai greu)

    /* ─── 1.3 Jeleuri (incubatoare / ouă) ─── */
    "JELLY_EGG_SPAWN_RATE": 1.5,     // sec — interval între ouă într-un jeleu
    "JELLY_MAX_EGGS": 15,            // ouă max per jeleu
    "GLASS_VAULT_COUNT": 18,         // duel — dreptunghiuri în locul jeleului
    "GLASS_EGGS_PER": 4,             // ouă max per dreptunghi; apar unul câte unul

    /* ─── 1.4 Mișcare jucător (px/sec) ─── */
    "BASE_SPEED": 260,               // ★ viteză de bază (înainte de penalizarea de mărime)
    "MIN_SPEED": 96,                 // ★ viteza nu scade niciodată sub această valoare
    "RADIUS_SPEED_DIVISOR": 0.93,    // viteză = BASE_SPEED − rază / acest număr (mai mic = mari mai lenți)
    "SPEED_BOOST_DASH": 640,         // Toxic Spore: viteză în timpul dash-ului
    "SPEED_BOOST_NORMAL": 192,       // ⚠ NEFOLOSIT — viteză Toxic Spore după dash

    /* ─── 1.5 Creștere (px de rază câștigați per acțiune / per sec) ─── */
    "GROW_FROM_NUTRIENT": 0.52,      // ★ per nutrient mâncat (× bonus GROWTH CORE din lab)
    "GROW_FROM_PARTICLE": 0.13,      // ★ per particulă de praf stelar
    "GROW_BONUS_VAMPIRE": 0.15,      // Ravenous: înlocuiește GROW_FROM_PARTICLE
    "GROW_FROM_BOT": 0.11,           // ★ fracție din raza botului mâncat (0.11 = 11%)
    "VAMPIRE_SHRINK_RATE": 0.85,     // Ravenous: px/sec pierduți pasiv (× bonus GROWTH CORE)

    /* ─── 1.6 Punctaj ─── */
    "SCORE_NUTRIENT": 5,             // ★ puncte per nutrient (× bounty)
    "SCORE_PARTICLE": 2,          // ★ puncte per particulă (× bounty)
    "SCORE_BOT_KILL": 250,           // ★ puncte per bot (× bounty)

    /* ─── 1.6b Text flotant la pickup (+2, +5…) — tipografie ca .evo-mod-price ─── */
    "PICKUP_FLOAT_COLORS": {
      "particle": { "color": "#8ecfff", "glow": "rgba(142, 207, 255, 0.82)" },
      "nutrient": { "color": "#5de87a", "glow": "rgba(93, 232, 122, 0.78)" },
      "bot":      { "color": "#ffc94a", "glow": "rgba(255, 201, 74, 0.85)" }
    },

    /* ─── 1.7 Combat — cine pe cine mănâncă ─── */
    "BOT_EAT_THRESHOLD": 1.1,        // ★ trebuie să fii de 1.1× mai mare ca să mănânci (și invers)
    "BOT_KILL_DIST_FACTOR": 0.55,    // cât de adânc trebuie să intri în bot ca să-l mănânci (× raza ta)
    "PLAYER_DEATH_DIST_FACTOR": 0.25, // cât de adânc intră botul mai mare în tine până mori instant (× raza botului)
    "BOT_CONTACT_DRAIN": 24,         // ★ px/sec transferați de la tine la botul mai mare la contact

    /* ─── 1.9 Bounty / combo ─── */
    "BOUNTY_DURATION": 15,           // ★ sec — cât rămâne activ multiplicatorul
    "COMBO_WINDOW": 4000,            // ★ ms — timp maxim între kill-uri ca să crească combo-ul
    // Praguri: la `combo` kill-uri consecutive primești `multiplier`; `color` = textul flotant.
    "BOUNTY_TIERS": [
      { "combo": 3, "multiplier": 2, "color": "#ffe600" },
      { "combo": 5, "multiplier": 3, "color": "#ff2bd6" },
      { "combo": 7, "multiplier": 4, "color": "#39ff14" }
    ],

    /* ─── 1.10 Cooldown abilități jucător (sec, înainte de bonusul ABILITY SYNC) ─── */
    "CD_VAMPIRE": 1.875,             // ★ The Ravenous — Blood Rift
    "CD_WARP": 2.5,                  // ★ The Phase Shifter — Void Shriek
    "CD_SPEED": 2.18,                // ★ The Toxic Spore — Corrosive Burst

    /* ─── 1.11 Gaura neagră (centrul hărții) ─── */
    "BH_PULL_RANGE": 400,               // ★ px — raza de atracție (și raza halo-ului desenat)
    "BH_CORE_RADIUS": 80,               // ★ px — miezul negru: boții explodează, jucătorul pierde masă rapid
    "BH_PULL_FORCE": 400,               // ★ px/sec — forța maximă de atracție (jucător și boți)
    "BH_CORE_DAMAGE": 80,               // ★ px/sec de rază pierduți de jucător în miez
    "BH_NUTRIENT_PULL_FORCE": 640,      // px/sec — atracția asupra nutrienților
    "BH_PARTICLE_PULL_RANGE": 480,      // px — raza de atracție pentru praful stelar
    "BH_PARTICLE_PULL_SPEED": 35,       // px/sec — viteza maximă (lentă) a prafului spre gaură
    "BH_SIPHON_SHRINK_RATE": 1.05,      // px/sec pierduți de jucător în raza de atracție (în afara miezului)
    "BH_SIPHON_PARTICLE_RATE": 18,      // particule vizuale/sec extrase din jucător
    "BH_BOT_SIPHON_PARTICLE_RATE": 9,   // particule vizuale/sec extrase din boți
    "BH_BOT_VISUAL_SIPHON_RANGE": 520,  // px — de la ce distanță boții încep să „curgă” vizual

    /* ─── 1.12 Overlay viziune (întunecarea marginilor ecranului) ─── */
    "VISION_OVERLAY_INNER_RADIUS_PX": 15 // px — zona clară din centru (× multiplicatorul abilității)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ABILITY SETTINGS — parametri per abilitate jucător
  // ═══════════════════════════════════════════════════════════════════════════
  "abilitySettings": {

    /* ─── 2.1 VAMPIRE — The Ravenous · Blood Rift ─── */
    "VAMPIRE_RIFT_RADIUS": 110,      // ★ px — raza zonei de damage
    "VAMPIRE_RIFT_LIFE": 3.75,       // ★ sec — cât durează rift-ul
    "VAMPIRE_DAMAGE_BOTS": 6.4,      // ★ px/sec scoși din boții din rift (tu primești jumătate)
    "VAMPIRE_COST_SIZE": 1.3,        // px de rază consumați la fiecare cast
    "VAMPIRE_MIN_RADIUS": 15,        // px — sub această rază nu poți casta și nu mai scazi pasiv

    /* ─── 2.2 WARP — The Phase Shifter · Void Shriek ─── */
    "WARP_PULSE_EXPANSION": 1000,    // px/sec — viteza de expansiune a undei
    "WARP_PULSE_MAX": 350,           // ★ px — raza maximă a undei
    "WARP_FREEZE_DURATION": 0.75,    // ★ sec — cât rămân boții înghețați
    "WARP_BORDER_PENALTY": 2,        // px de rază pierduți la trecerea prin marginea hărții

    /* ─── 2.3 SPEED — The Toxic Spore · Corrosive Burst ─── */
    "SPEED_DASH_DURATION": 0.31,     // ★ sec — durata dash-ului (viteza e SPEED_BOOST_DASH)
    "SPORE_VISION_ZOOM": 12          // multiplicator overlay viziune (mai mic = vezi mai puțin)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. ENEMY BOT SETTINGS — AI inamic & abilități boți
  // ═══════════════════════════════════════════════════════════════════════════
  "enemyBotSettings": {

    /* ─── 3.1 Creștere & shrink boți (× growthRate din entityTypes) ─── */
    "GROW_FROM_PARTICLE": 0.13,       // px per particulă (aliniat cu gameSettings.GROW_FROM_PARTICLE)
    "GROW_FROM_NUTRIENT": 0.26,       // px per nutrient (~50% față de jucător)
    "MAX_BOT_RADIUS": 96,             // plafon rază (0 = fără cap)
    "BOT_SHRINK_START_RADIUS": 80,    // peste această rază începe shrink ușor
    "BOT_SHRINK_RATE": 0.52,          // px/sec shrink ușor
    "BOT_SHRINK_HEAVY_RADIUS": 115,   // peste această rază shrink puternic (⚠ inactiv cât timp MAX_BOT_RADIUS ≤ această valoare)
    "BOT_SHRINK_HEAVY_RATE": 2.0,     // px/sec shrink puternic

    /* ─── 3.2 Abilități per tip de bot (cheie = typeKey din entityTypes) ─── */
    // Distanțe în px, durate/cooldown-uri în sec.
    "GLITCH":       { "teleportDist": 180, "triggerDist": 220, "cooldown": 3 },      // teleport aleator când ești aproape
    "WORMHOLE":     { "jumpForce": 120, "triggerDist": 280, "cooldown": 3.5 },       // salt spre tine
    "PULSAR":       { "sizeBoost": 15, "duration": 4, "cooldown": 5 },               // +px rază temporar
    "GRAVITY_WELL": { "pullForce": 140, "range": 300 },                              // px/sec la centru, falloff spre margine (ține-l sub MIN_SPEED)
    "TITAN":        { "invulnerableDuration": 8, "cooldown": 10 },                   // invulnerabil periodic; cooldown-ul pornește după scut
    "CHRONOS":      { "shrinkPower": 0.997, "range": 300 },                          // te micșorează (mai mic = mai agresiv)
    "ARCHITECT":    { "dropChance": 40, "cooldown": 0.45 },                          // procent 0–100, o aruncare la fiecare cooldown
    "NEBULA":       { "speedBoost": 2, "triggerDist": 400, "duration": 4, "cooldown": 6 },
    "NECROMANCER":  { "pullFoodRange": 280, "pullFoodForce": 52 },                   // px/sec max (la centru), falloff spre marginea razei
    "MIMIC":        { "copyDuration": 5, "triggerDist": 450, "cooldown": 7 }         // îți copiază culoarea temporar
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ENTITY TYPES — profilul de bază al fiecărui tip de bot
  // ───────────────────────────────────────────────────────────────────────────
  // speed: px/sec · growthRate: × creștere din hrană · vision: px raza de detecție
  // aggression: 0–1+ (cât de departe te urmărește)
  // ═══════════════════════════════════════════════════════════════════════════
  "entityTypes": {
    "TITAN": {
      "name": "TITAN",
      "color": "#F5F5F5",
      "speed": 55,
      "growthRate": 1.4,
      "vision": 400,
      "aggression": 0.9,
      "aboutDesc": "Slow colossus with brutal growth. Hunts aggressively when larger. Flares into a blinding white shell — invulnerable until the pulse ends."
    },
    "GLITCH": {
      "name": "GLITCH",
      "color": "#00FF7F",
      "speed": 155,
      "growthRate": 0.8,
      "vision": 600,
      "aggression": 0.95,
      "aboutDesc": "Hyper-fast hunter with wide vision. When you close the gap, it teleports in a random jitter — never trust a clean chase line."
    },
    "PULSAR": {
      "name": "PULSAR",
      "color": "#FFFF00",
      "speed": 110,
      "growthRate": 1.1,
      "vision": 450,
      "aggression": 0.75,
      "aboutDesc": "Rhythmic sweller. Surges mass in a bright pulse, then sheds the bonus when the effect fades. Most dangerous mid-pulse."
    },
    "NECROMANCER": {
      "name": "NECROMANCER",
      "color": "#32CD32",
      "speed": 90,
      "growthRate": 2.5,
      "vision": 800,
      "aggression": 0.1,
      "aboutDesc": "Quiet farmer with extreme growth. Pulls nearby stardust into its orbit — ignore it too long and it becomes a silent giant."
    },
    "GRAVITY_WELL": {
      "name": "GRAVITY WELL",
      "color": "#8A2BE2",
      "speed": 75,
      "growthRate": 1.3,
      "vision": 600,
      "aggression": 0.4,
      "aboutDesc": "Purple anchor. Drags you toward its core while you stand in its pull field — break sideways or pay the contact tax."
    },
    "ARCHITECT": {
      "name": "ARCHITECT",
      "color": "#FFD700",
      "speed": 105,
      "growthRate": 1,
      "vision": 550,
      "aggression": 0.2,
      "aboutDesc": "Gold builder. Drops nutrient debris in its wake — the same salvage as jelly bursts and bot kills, on a steady cadence."
    },
    "WORMHOLE": {
      "name": "WORMHOLE",
      "color": "#FF4500",
      "speed": 135,
      "growthRate": 1,
      "vision": 550,
      "aggression": 0.6,
      "aboutDesc": "Orange ambusher. When you enter its range, it warps along your bearing in a sudden hop — distance closes before you react."
    },
    "CHRONOS": {
      "name": "CHRONOS",
      "color": "#00BFFF",
      "speed": 115,
      "growthRate": 0.9,
      "vision": 550,
      "aggression": 0.8,
      "aboutDesc": "Cyan time-leech. In range, it erodes your radius tick by tick — trade space against it and the clock wins."
    },
    "NEBULA": {
      "name": "NEBULA",
      "color": "#4B0082",
      "speed": 145,
      "growthRate": 1.1,
      "vision": 500,
      "aggression": 0.5,
      "aboutDesc": "Violet streak. When threatened nearby, it ignites double speed — hard to pin once overdrive kicks in."
    },
    "MIMIC": {
      "name": "MIMIC",
      "color": "#A9A9A9",
      "speed": 120,
      "growthRate": 1,
      "vision": 500,
      "aggression": 0.45,
      "aboutDesc": "Ash chameleon. Copies your glow when you are in range — color alone is not proof of safety until the disguise fades."
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. WORLD — populație, spawn & pool-uri (densitate / performanță)
  // ═══════════════════════════════════════════════════════════════════════════
  "world": {

    /* ─── 5.1 Populație boți ─── */
    "initialBotTotal": 28,           // ★ boți la start rundă
    "botRespawnDelayMs": 8000,       // ★ ms — după cât timp reapare un bot mâncat

    /* ─── 5.2 Pool-uri (memorie pre-alocată) ─── */
    "poolBotBuffer": 8,              // sloturi extra în pool-ul de boți
    "maxPoolNutrients": 800,         // max nutrienți simultan
    "maxAuraParticles": 70,          // max particule de aură în jurul jucătorului
    "maxJellyBubbles": 15,           // ★ jeleuri pe hartă

    /* ─── 5.3 Decor ─── */
    "cosmicDustCount": 600           // puncte de praf decorativ (static, fără gameplay)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5b. ABOUT — texte archive (hub About screen)
  // ═══════════════════════════════════════════════════════════════════════════
  "about": {
    "intrudersLead": "Three intruder strains are cleared for deployment. Each trades power for a weakness — [SPACE] casts their signature ability.",
    "singularity": "The map revolves around a hungry Singularity at its center. It pulls stardust, nutrients, and cells across the void. Skirt the pull field or lose radius; touch the core and mass vanishes fast. Even rivals steer away from the abyss.",
    "bounty": "Hunt smaller entities in rhythm to stack combo and climb bounty tiers — higher multipliers on score from feeds and bot kills. Let the chain cool and your bonus fades; aggression pays while hesitation resets you.",
    "systemsLead": "Meta progression, scoring, and interface systems that persist between intrusions.",
    "voidMatter": "Void Matter is the archive currency. Mass you secure during a run is tallied when the intrusion ends and credited to your permanent reserve — spend it to unlock intruders and upgrade systems in the Evolution Lab.",
    "evolution": "The Evolution Lab advances your deployed intruder between runs. Three branches per skin: Velocity Drive (base speed), Growth Core (nutrient yield and Ravenous decay), and Ability Sync (cooldown relief). Each branch levels independently with Void Matter.",
    "entityMods": "Entity Mods are exclusive x1, x2, and x3 kits bound to a single intruder. Purchased in the lab with Void Matter; each mod alters combat behavior for that strain only. Review a mod's briefing before purchase — only one path per tier.",
    "entityScore": "ENTITY_SCORE is the live readout of mass consumed during an intrusion. It resets every run. Your end-of-run payout converts that total into Void Matter for the hub tally.",
    "controls": "In the arena, move with the mouse (chase the cursor) or WASD (fixed heading). Press [SPACE] to trigger your intruder's signature ability. Cooldown and cost depend on the active strain. On a tablet, the stick sets heading, the round button casts, and tapping the red mark twice ends the run.",
    "options": "From the hub, open Options to choose movement scheme, toggle sound, and switch fullscreen. Settings apply immediately and persist between sessions. A tablet uses the on-screen stick instead of the mouse or WASD picker.",
    "rivalsLead": "Ten rival cell types patrol the arena. Hue signals temperament; study the pattern or become salvage."
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. AUDIO — ambient (nu SFX)
  // ═══════════════════════════════════════════════════════════════════════════
  "audio": {
    "ambientBaseGain": 0.023,        // volum ambient de bază (0–1)
    "ambientArenaGainMult": 0.5,     // în arenă (gameActive): ambient la jumătate din base
    "ambientUpdateInterval": 0.12    // sec — interval minim între update-uri ambient
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. META — chei localStorage & versiune migrări save
  // ───────────────────────────────────────────────────────────────────────────
  // ⚠ Schimbarea unei chei = jucătorii își „pierd” progresul salvat sub cheia veche.
  // ═══════════════════════════════════════════════════════════════════════════
  "meta": {
    "bestScoreStorageKey": "nebulaVoidBestScore",
    "skinsUnlockStorageKey": "nebulaVoidSkinsUnlockState",
    "voidMatterStorageKey": "nebulaVoidTotalMatter",
    "featureVersionStorageKey": "nebulaVoidFeatureVersion",
    "evolutionUpgradesStorageKey": "nebulaVoidEvolutionUpgrades",
    "entityModsStorageKey": "nebulaVoidEntityMods",
    "controlSchemeStorageKey": "nebulaVoidControlScheme",
    "currentFeatureVersion": 2       // bump când schimbi format save obligatoriu
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. ENTITY MODS — x1 / x2 / x3 per skin (Evolution Lab)
  // ═══════════════════════════════════════════════════════════════════════════
  "entityMods": {
    "x1Cost": 1,                    // ★ Void Matter — prețul modului x1
    "x2Cost": 1,                     // ★ Void Matter — prețul modului x2 (temporar pentru test)
    "x3Cost": 1,                     // ★ Void Matter — prețul modului x3 (temporar pentru test)
    "ravenousX1": {                  // x1 pentru The Ravenous: Blood Rift care vânează
      "skinName": "THE RAVENOUS",    // skin-ul care are acces la mod
      "acquireRange": 420,           // px — raza în care rift-ul își alege prima țintă la cast
      "retargetRange": 480,          // px — raza în care caută o țintă nouă când prada moare
      "trackSpeed": 220              // ★ px/sec — viteza cu care rift-ul urmărește prada
    },
    "phaseShifterX1": {              // x1 Phase Shifter — cușcă geometrică fixă pe hartă
      "skinName": "THE PHASE SHIFTER",
      "acquireRange": 350,           // px — de la player la cast (aliniat cu WARP_PULSE_MAX)
      "paddingPx": 82,               // px — spațiu extra în jurul botului / grupului
      "minHalfSize": 96,             // px — jumătate lățime/înălțime minimă
      "extraPadPerBot": 32,          // px — + la fiecare bot în plus în rază (cage adaptiv)
      "cageLifeSec": 7.85,           // ★ sec — mult peste WARP_FREEZE_DURATION
      "fadeSec": 0.55,               // sec — fade-out la final
      "maxSimultaneous": 3,          // cage-uri active max (nu se înlocuiesc la recast)
      "cageSeparationPx": 52,        // px — spațiu minim între marginile cage-urilor (fără suprapunere)
      "cageAccentColors": [
        "#3da5ff",
        "#39ff14",
        "#ffdd22"
      ]
    },
    "phaseShifterX2": {              // x2 — Phase Cage RESONANCE: damage la perete (trapped)
      "skinName": "THE PHASE SHIFTER",
      "bleedBandPx": 14,             // px — bandă interioară de contact cu peretele
      "damageMult": 0.58,            // × VAMPIRE_DAMAGE_BOTS în bandă
      "bleedDelaySec": 0.75,         // sec după spawn (aliniat cu WARP_FREEZE)
      "minKillRadius": 5,
      "sfxCooldownSec": 0.62
    },
    "phaseShifterX3": {              // x3 VOID ASCEND — Phase Cage mobil (aceeași viață/culori ca x1)
      "skinName": "THE PHASE SHIFTER",
      "maxTrappedPerCage": 3,        // ★ pradă max per cușcă (trapped, nu ieș până expiră)
      "huntRange": 350,              // px — scan ținte de la centrul cage-ului
      "trackSpeed": 300,             // ★ px/sec — viteză de urmărire
      "huntSprintMult": 1.75,        // × trackSpeed când ținta e aproape
      "huntSprintRangePx": 140,      // px — distanță la care intră sprintul
      "captureCenterSlack": 48,      // px — toleranță centru–centru la prindere
      "huntDelaySec": 0.75           // sec după spawn înainte de vânătoare (aliniat cu freeze)
    },
    "ravenousX2": {                  // x2 — sifoane organice spre până la 3 boți
      "skinName": "THE RAVENOUS",
      "maxSiphons": 3,               // fulgere simultane max
      "siphonRange": 400,            // px — de la centrul rift-ului
      "damageMult": 0.65,            // × VAMPIRE_DAMAGE_BOTS pe fiecare sifon
      "retargetInterval": 0.22       // sec — realegere ținte
    },
    "ravenousX3": {                  // x3 — twin rift la cast + violet afterglow la fade
      "skinName": "THE RAVENOUS",
      "twinOffsetPx": 88,            // px — distanța între cele două rift-uri la Space
      "afterglowLifeSec": 1.5,       // sec — durata petelor mov după expirarea riftului mare
      "afterglowRadiusMult": 0.55,   // × raza riftului la conversie
      "afterglowDpsMult": 0.35,      // × VAMPIRE_DAMAGE_BOTS în afterglow
      "afterglowAccent": "#c86bff"   // culoare mod (Phase violet) — doar faza afterglow
    },
    "toxicSporeX1": {                // x1 — fantome după sprint se lipesc de botul cel mai apropiat
      "skinName": "THE TOXIC SPORE",
      "acquireRange": 420,           // px — de la player la sfârșitul dash-ului
      "latchLifeSec": 1.65,          // sec — durată fixă pe bot, apoi fantoma dispare
      "ghostHomingSpeed": 280,       // px/sec — viteză până se lipește
      "drainPerGhostPerSec": 1.75,   // px/sec rază bot per fantomă (ușor)
      "maxGhostsPerLatch": 4,        // max fantome per burst (≈4 per sprint)
      "latchEdgeInset": 0.35,        // × raza fantomei — centrul pe marginea botului
      "latchColors": {
        "fill": "#9b6bff",
        "glow": "#cbb8ff",
        "stroke": "rgba(186, 160, 255, 0.48)"
      }
    },
    "toxicSporeX2": {                // x2 — fantomele primului latch fac split spre alt bot în rază
      "skinName": "THE TOXIC SPORE",
      "splitAcquireRange": 400,      // px — de la primul bot la ținta secundară
      "splitGhostHomingSpeed": 300,  // px/sec — homing spre botul 2
      "splitGhostScale": 0.68,       // × raza fantomei mamă
      "splitDrainMult": 0.9,         // × drainPerGhostPerSec pe botul 2
      "splitLatchLifeSec": 1.45,     // sec — durată pe botul secundar
      "splitPopPx": 12,              // px — împingere vizuală la spawn split
      "sameTargetArcSpread": 0.78,   // rad — offset extra pe același bot (evită stack pe verzi)
      "splitColors": {
        "fill": "#6e7cff",
        "glow": "#b8c4ff",
        "stroke": "rgba(160, 178, 255, 0.52)"
      }
    },
    "toxicSporeX3": {                // x3 — split spore care revine la player (+ masă mică)
      "skinName": "THE TOXIC SPORE",
      "returnHomingSpeed": 360,
      "returnGhostScale": 0.58,
      "returnLatchLifeSec": 2.1,
      "absorbMassRadius": 0.2,       // px rază câștigată per spore absorbit (× GROWTH CORE)
      "returnColors": {
        "fill": "#7ec8e8",
        "glow": "#d4f0ff",
        "stroke": "rgba(170, 220, 255, 0.55)"
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. EVOLUTION LAB — costuri & bonus per nivel
  // ═══════════════════════════════════════════════════════════════════════════
  "evolution": {
    "maxLevel": 10,                  // ★ niveluri per ramură
    "baseCost": 5000,                // ★ Void Matter — primul upgrade pe ramură
    "costStep": 2500,                // ★ + la fiecare nivel următor
    "kineticPerLevel": 0.03,         // +3% viteză / nivel
    "coreGrowthPerLevel": 0.04,      // +4% creștere din nutrienți / nivel
    "coreShrinkPerLevel": 0.03,      // -3% decay vampir / nivel
    "signalPerLevel": 0.025,         // -2.5% cooldown abilități / nivel
    "legacyMigrationSkin": "THE RAVENOUS", // skin-ul care primește upgrade-urile din save-urile vechi
    "branches": [
      {
        "key": "kinetic",
        "label": "VELOCITY DRIVE",
        "statLabel": "SPEED",
        "color": "#00e5ff",
        "glow": "rgba(0, 229, 255, 0.85)",
        "description": "+3% BASE SPEED / LV"
      },
      {
        "key": "core",
        "label": "GROWTH CORE",
        "statLabel": "GROWTH",
        "color": "#39ff14",
        "glow": "rgba(57, 255, 20, 0.85)",
        "description": "+4% NUTRIENT MASS / LV  ·  -3% VAMPIRE DECAY / LV"
      },
      {
        "key": "signal",
        "label": "ABILITY SYNC",
        "statLabel": "ABILITY",
        "color": "#c86bff",
        "glow": "rgba(200, 107, 255, 0.85)",
        "description": "-2.5% COOLDOWN / LV"
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. SKINS — entități jucător (meniu)
  // ───────────────────────────────────────────────────────────────────────────
  // defaultUnlocked: true = gratis la prima lansare
  // costMatter: Void Matter pentru deblocare (dacă e locked)
  // ability: vampire | warp | speed
  // ⚠ `name` e folosit drept cheie de save — redenumirea resetează progresul skin-ului.
  // ═══════════════════════════════════════════════════════════════════════════
  "skins": [
    {
      "color": "#ff0000",
      "name": "THE RAVENOUS",
      "ability": "vampire",
      "defaultUnlocked": true,
      "desc": "◆ [SPACE] BLOOD RIFT: CONSUME SIZE\n▲ SPEED GROWTH | ▼ RAPID DECAY"
    },
    {
      "color": "#8a2be2",
      "glowColor": "#c86bff",
      "name": "THE PHASE SHIFTER",
      "ability": "warp",
      "costMatter": 1,
      "defaultUnlocked": false,
      "desc": "◆ [SPACE] VOID SHRIEK: FREEZE AREA\n▲ EDGE WARPING | ▼ WARP PENALTY"
    },
    {
      "color": "#39ff14",
      "name": "THE TOXIC SPORE",
      "ability": "speed",
      "costMatter": 1,
      "defaultUnlocked": false,
      "desc": "◆ [SPACE] CORROSIVE BURST: SPEED\n▲ EXTREME VELOCITY | ▼ LOW VISION"
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTIPLAYER — relay (Faza 1). SP nu folosește aceste chei.
  // ═══════════════════════════════════════════════════════════════════════════
  "multiplayer": {
    "relayWsUrl": "ws://127.0.0.1:8080",
    "maxRoomPlayers": 6,
    "minPlayersToStart": 2,
    "allowMockPeerFallback": false,
    "stateSendIntervalMs": 16,
    "remoteInterpSpeed": 32,
    "remoteSnapDistancePx": 320,
    "remoteExtrapMaxSec": 0.055,
    "matchUpgrades": {
      "barCellScore": 50,
      "barMaxLevel": 10,
      "modScores": [100, 250, 500]
    },
    "taunt": {
      "rangePx": 420,
      "cooldownMs": 2200,
      "bubbleMs": 2300,
      "gapPx": 18
    }
  }
};
