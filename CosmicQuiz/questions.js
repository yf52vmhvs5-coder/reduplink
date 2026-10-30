/**
 * Cosmic Quiz — Trivia content pipeline (v4, space / tech / strange)
 *
 * Builds window.TRIVIA_DATA (default play deck) and window.CosmicTrivia (authoring API).
 * Curated question packs + category pools → smart distractors → validated runtime deck.
 */
(function () {
    'use strict';

    // =========================================================================
    // CATEGORY TAXONOMY
    // Per-topic answer pools used to generate plausible wrong choices (distractors).
    // =========================================================================
    const CATEGORIES = {
        planet: {
            label: 'Planets & Moons',
            pool: [
                'MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE',
                'PLUTO', 'THE SUN', 'THE MOON', 'EUROPA', 'TITAN', 'GANYMEDE', 'CALLISTO',
                'IO', 'TRITON', 'CERES', 'ERIS', 'ENCELADUS', 'DEIMOS', 'PHOBOS',
            ],
        },
        number: {
            label: 'Numbers',
            pool: [
                '2', '7', '8', '9', '10', '88', '365', '1968', '1969', '1970', '1972',
                '10 HOURS', '24 HOURS', '1,300',
            ],
        },
        scientist: {
            label: 'Space Science',
            pool: [
                'ALBERT EINSTEIN', 'ISAAC NEWTON', 'GALILEO GALILEI', 'MARIE CURIE',
                'STEPHEN HAWKING', 'NEIL ARMSTRONG', 'BUZZ ALDRIN', 'YURI GAGARIN',
                'VALENTINA TERESHKOVA', 'SALLY RIDE', 'JOHANNES KEPLER', 'NICOLAUS COPERNICUS',
                'EDWIN HUBBLE', 'CARL SAGAN',
            ],
        },
        chemistry: {
            label: 'Stellar Matter',
            pool: [
                'HYDROGEN', 'HELIUM', 'CARBON', 'OXYGEN', 'IRON', 'LITHIUM', 'NEON',
            ],
        },
        physics: {
            label: 'Physics',
            pool: [
                'GRAVITY', 'INERTIA', 'LIGHT', 'PHOTON', 'RELATIVITY', 'FUSION', 'FISSION',
            ],
        },
        tech: {
            label: 'Technology',
            pool: [
                'APPLE', 'MICROSOFT', 'GOOGLE', 'IBM', 'INTEL', 'NVIDIA', 'LINUX',
                'PYTHON', 'JAVASCRIPT', 'HTML', 'WIFI', 'USB', 'CERN', 'NASA',
                'CENTRAL PROCESSING UNIT', 'GRAPHICS PROCESSING UNIT', 'RAM',
                'HYPERTEXT MARKUP LANGUAGE', 'UNIVERSAL SERIAL BUS',
            ],
        },
        space: {
            label: 'Space',
            pool: [
                'HUBBLE', 'VOYAGER 1', 'APOLLO', 'ISS', 'SPUTNIK 1', 'JWST', 'NASA', 'ESA',
                'SPACEX', 'MILKY WAY', 'ANDROMEDA', 'BLACK HOLE', 'SUPERNOVA', 'PULSAR',
                'BIG BANG', 'DARK MATTER', 'DARK ENERGY', 'KUIPER BELT', 'OORT CLOUD',
                'THE SUN', 'THE MOON', 'METEOR', 'COMET', 'AURORA', 'SOLAR WIND',
            ],
        },
        weird: {
            label: 'Strange',
            pool: [
                'FLOAT', 'SINK', 'BLUE', 'RED', 'WHITE', 'YELLOW', 'A MOTH', 'A SOL',
                'A HEART', 'A GOLDEN RECORD', 'EMAIL', 'THE WEB', 'ONE ROTATION', 'ONE ORBIT',
            ],
        },
    };

    const DIFFICULTY = {
        easy: 1,
        normal: 2,
        medium: 3,
        hard: 4,
        expert: 5,
    };

    // =========================================================================
    // AUTHORING — QUESTION PACKS
    // Hand-curated items. Schema: { id, q, a, c, d?, w?, tags?, fact? }
    // Optional w[] overrides auto-generated wrong answers for key questions.
    // =========================================================================
    const PACKS = {
        // ---------------------------------------------------------------------
        // Pack: space — planets, missions, cosmology, space history (sp-*)
        // ---------------------------------------------------------------------
        space: [
            { id: 'sp-01', q: 'WHAT IS THE RED PLANET?', a: 'MARS', c: 'planet', d: 1 },
            { id: 'sp-02', q: 'WHAT IS THE LARGEST PLANET IN OUR SOLAR SYSTEM?', a: 'JUPITER', c: 'planet', d: 1 },
            { id: 'sp-03', q: 'WHAT IS THE SMALLEST PLANET IN OUR SOLAR SYSTEM?', a: 'MERCURY', c: 'planet', d: 2 },
            { id: 'sp-04', q: 'WHICH PLANET IS KNOWN AS THE BLUE PLANET?', a: 'EARTH', c: 'planet', d: 1 },
            { id: 'sp-05', q: 'WHICH PLANET HAS THE GREAT RED SPOT?', a: 'JUPITER', c: 'planet', d: 2 },
            { id: 'sp-06', q: 'WHICH PLANET IS FAMOUS FOR ITS RINGS?', a: 'SATURN', c: 'planet', d: 1 },
            { id: 'sp-07', q: 'WHICH PLANET ROTATES ON ITS SIDE?', a: 'URANUS', c: 'planet', d: 3, w: ['NEPTUNE', 'SATURN', 'VENUS'] },
            { id: 'sp-08', q: 'WHAT IS THE HOTTEST PLANET IN OUR SOLAR SYSTEM?', a: 'VENUS', c: 'planet', d: 3, w: ['MERCURY', 'MARS', 'JUPITER'] },
            { id: 'sp-09', q: 'HOW MANY PLANETS ARE IN OUR SOLAR SYSTEM?', a: '8', c: 'number', d: 2, w: ['7', '9', '10'] },
            { id: 'sp-10', q: 'WHAT GALAXY IS HOME TO OUR SOLAR SYSTEM?', a: 'MILKY WAY', c: 'space', d: 2, w: ['ANDROMEDA', 'TRIANGULUM', 'SOMBRERO'] },
            { id: 'sp-11', q: 'WHAT IS A LIGHT-YEAR A MEASURE OF?', a: 'DISTANCE', c: 'space', d: 3, w: ['TIME', 'SPEED', 'MASS'] },
            { id: 'sp-12', q: 'WHO WAS THE FIRST PERSON TO WALK ON THE MOON?', a: 'NEIL ARMSTRONG', c: 'scientist', d: 2 },
            { id: 'sp-13', q: 'WHAT YEAR DID APOLLO 11 LAND ON THE MOON?', a: '1969', c: 'number', d: 3, w: ['1968', '1970', '1972'] },
            { id: 'sp-14', q: 'WHAT IS THE NAME OF EARTH\'S NATURAL SATELLITE?', a: 'THE MOON', c: 'planet', d: 1, w: ['TITAN', 'EUROPA', 'PHOBOS'] },
            { id: 'sp-15', q: 'WHAT IS THE SECOND LARGEST PLANET IN OUR SOLAR SYSTEM?', a: 'SATURN', c: 'planet', d: 2, w: ['JUPITER', 'URANUS', 'NEPTUNE'] },
            { id: 'sp-16', q: 'WHAT IS THE CLOSEST STAR TO EARTH?', a: 'THE SUN', c: 'space', d: 1, w: ['PROXIMA CENTAURI', 'SIRIUS', 'POLARIS'] },
            { id: 'sp-17', q: 'WHAT PLANET IS CLOSEST TO THE SUN?', a: 'MERCURY', c: 'planet', d: 1 },
            { id: 'sp-18', q: 'WHICH SPACE TELESCOPE LAUNCHED IN 1990 STILL INSPIRED A GENERATION?', a: 'HUBBLE', c: 'space', d: 3, w: ['JWST', 'KEPLER', 'SPITZER'] },
            { id: 'sp-19', q: 'WHAT IS THE FARTHEST HUMAN-MADE OBJECT FROM EARTH?', a: 'VOYAGER 1', c: 'space', d: 4, w: ['VOYAGER 2', 'PIONEER 10', 'NEW HORIZONS'] },
            { id: 'sp-20', q: 'WHAT REMNANT CAN A MASSIVE STAR\'S CORE COLLAPSE LEAVE BEHIND?', a: 'BLACK HOLE', c: 'space', d: 3, w: ['WHITE DWARF', 'RED GIANT', 'BROWN DWARF'] },
            { id: 'sp-21', q: 'WHAT IS THE LARGEST MOON IN THE SOLAR SYSTEM?', a: 'GANYMEDE', c: 'planet', d: 4, w: ['TITAN', 'THE MOON', 'CALLISTO'] },
            { id: 'sp-22', q: 'WHICH PLANET HAS THE LONGEST DAY (ROTATION PERIOD)?', a: 'VENUS', c: 'planet', d: 5, w: ['MERCURY', 'JUPITER', 'NEPTUNE'] },

            { id: 'sp-23', q: 'WHICH JOVIAN MOON IS THE MOST VOLCANICALLY ACTIVE BODY IN THE SOLAR SYSTEM?', a: 'IO', c: 'planet', d: 4, w: ['EUROPA', 'GANYMEDE', 'TITAN'], fact: 'Io has hundreds of active volcanoes driven by Jupiter\'s tidal forces.' },
            { id: 'sp-24', q: 'WHICH MOON OF JUPITER IS A TOP CANDIDATE FOR A SUBSURFACE OCEAN?', a: 'EUROPA', c: 'planet', d: 3, w: ['IO', 'CALLISTO', 'TRITON'], fact: 'Europa may hide more liquid water beneath its ice than all of Earth\'s oceans combined.' },
            { id: 'sp-25', q: 'WHAT IS THE LARGEST MOON OF SATURN, WITH THICK METHANE CLOUDS?', a: 'TITAN', c: 'planet', d: 3, w: ['RHEA', 'ENCELADUS', 'IAPETUS'], fact: 'Titan is the only moon with a dense atmosphere and liquid lakes on its surface.' },
            { id: 'sp-26', q: 'WHICH SATURN MOON SHOOTS ICE GEYSERS FROM ITS SOUTH POLE?', a: 'ENCELADUS', c: 'planet', d: 4, w: ['TITAN', 'MIMAS', 'DIONE'] },
            { id: 'sp-27', q: 'WHICH PLANET HAS THE FASTEST WINDS IN THE SOLAR SYSTEM (OVER 2,000 KM/H)?', a: 'NEPTUNE', c: 'planet', d: 4, w: ['JUPITER', 'SATURN', 'URANUS'] },
            { id: 'sp-28', q: 'THE ASTEROID BELT LIES MOSTLY BETWEEN WHICH TWO PLANETS?', a: 'MARS AND JUPITER', c: 'space', d: 3, w: ['EARTH AND MARS', 'JUPITER AND SATURN', 'SATURN AND URANUS'] },
            { id: 'sp-29', q: 'WHAT WAS THE FIRST ARTIFICIAL SATELLITE TO ORBIT EARTH?', a: 'SPUTNIK 1', c: 'space', d: 3, w: ['EXPLORER 1', 'VOYAGER 1', 'HUBBLE'], fact: 'Sputnik 1 launched in 1957 and kicked off the space race.' },
            { id: 'sp-30', q: 'WHAT ORBITING LAB DO ASTRONAUTS USE FOR LONG-DURATION MISSIONS?', a: 'ISS', c: 'space', d: 2, w: ['MIR', 'SKYLAB', 'TIANGONG'] },
            { id: 'sp-31', q: 'WHO WAS THE FIRST WOMAN TO FLY IN SPACE?', a: 'VALENTINA TERESHKOVA', c: 'scientist', d: 4, w: ['SALLY RIDE', 'MAE JEMISON', 'PEGGY WHITSON'] },
            { id: 'sp-32', q: 'WHO WAS THE FIRST HUMAN TO ORBIT EARTH?', a: 'YURI GAGARIN', c: 'scientist', d: 3, w: ['ALAN SHEPARD', 'JOHN GLENN', 'NEIL ARMSTRONG'] },
            { id: 'sp-33', q: 'WHAT MARS ROVER LANDED IN FEBRUARY 2021 WITH THE INGENUITY HELICOPTER?', a: 'PERSEVERANCE', c: 'space', d: 3, w: ['CURIOSITY', 'OPPORTUNITY', 'SPIRIT'] },
            { id: 'sp-34', q: 'WHAT NASA ROVER HAS BEEN EXPLORING MARS SINCE 2012?', a: 'CURIOSITY', c: 'space', d: 3, w: ['PERSEVERANCE', 'SOJOURNER', 'SPIRIT'] },
            { id: 'sp-35', q: 'WHICH TELESCOPE USES A GOLD-PLATED MIRROR AT THE L2 LAGRANGE POINT?', a: 'JWST', c: 'space', d: 4, w: ['HUBBLE', 'KEPLER', 'CHANDRA'] },
            { id: 'sp-36', q: 'THE CASSINI MISSION SPENT OVER A DECADE STUDYING WHICH PLANET?', a: 'SATURN', c: 'planet', d: 3, w: ['JUPITER', 'URANUS', 'NEPTUNE'] },
            { id: 'sp-37', q: 'NEW HORIZONS MADE A FAMOUS FLYBY OF WHICH DWARF PLANET IN 2015?', a: 'PLUTO', c: 'planet', d: 3, w: ['ERIS', 'CERES', 'HAUMEA'] },
            { id: 'sp-38', q: 'WHAT IS PLUTO CLASSIFIED AS SINCE 2006?', a: 'DWARF PLANET', c: 'planet', d: 2, w: ['ASTEROID', 'COMET', 'MOON'] },
            { id: 'sp-39', q: 'WHAT IS THE BRIGHTEST STAR IN EARTH\'S NIGHT SKY?', a: 'SIRIUS', c: 'space', d: 3, w: ['POLARIS', 'VEGA', 'BETELGEUSE'] },
            { id: 'sp-40', q: 'WHAT IS THE NEAREST STAR SYSTEM TO THE SUN?', a: 'ALPHA CENTAURI', c: 'space', d: 4, w: ['SIRIUS', 'PROCYON', 'BARNARD\'S STAR'] },
            { id: 'sp-41', q: 'WHICH GALAXY IS THE CLOSEST LARGE NEIGHBOR TO THE MILKY WAY?', a: 'ANDROMEDA', c: 'space', d: 3, w: ['TRIANGULUM', 'SOMBRERO', 'WHIRLPOOL'] },
            { id: 'sp-42', q: 'WHAT SUPERMASSIVE BLACK HOLE LURKS AT THE CENTER OF THE MILKY WAY?', a: 'SAGITTARIUS A*', c: 'space', d: 5, w: ['CYGNUS X-1', 'M87*', 'TON 618'], fact: 'Sagittarius A* is about 4 million times the mass of our Sun.' },
            { id: 'sp-43', q: 'WHAT THEORY DESCRIBES THE UNIVERSE BEGINNING FROM AN EXTREMELY HOT, DENSE STATE?', a: 'BIG BANG', c: 'space', d: 2, w: ['STEADY STATE', 'STRING THEORY', 'INFLATION ONLY'], fact: 'Cosmic microwave background radiation is a key piece of evidence for the Big Bang.' },
            { id: 'sp-44', q: 'WHAT MYSTERIOUS SUBSTANCE DOES NOT EMIT LIGHT BUT SHAPES GALAXY ROTATION?', a: 'DARK MATTER', c: 'space', d: 4, w: ['DARK ENERGY', 'ANTIMATTER', 'NEUTRINOS'] },
            { id: 'sp-45', q: 'WHAT IS THOUGHT TO DRIVE THE ACCELERATING EXPANSION OF THE UNIVERSE?', a: 'DARK ENERGY', c: 'space', d: 5, w: ['DARK MATTER', 'GRAVITY WAVES', 'COSMIC STRINGS'] },
            { id: 'sp-46', q: 'WHAT FAINT GLOW IS RELIC RADIATION FROM THE EARLY UNIVERSE?', a: 'COSMIC MICROWAVE BACKGROUND', c: 'space', d: 5, w: ['SOLAR WIND', 'GAMMA RAY BURST', 'ZODIACAL LIGHT'] },
            { id: 'sp-47', q: 'WHAT DO WE CALL A STAR THAT SUDDENLY BRIGHTENS MASSIVELY AT THE END OF ITS LIFE?', a: 'SUPERNOVA', c: 'space', d: 3, w: ['NOVA', 'QUASAR', 'WHITE DWARF'] },
            { id: 'sp-48', q: 'WHAT ULTRA-DENSE STELLAR REMNANT CAN SPIN AND PULSE LIKE A COSMIC LIGHTHOUSE?', a: 'PULSAR', c: 'space', d: 4, w: ['RED GIANT', 'BROWN DWARF', 'PROTOSTAR'] },
            { id: 'sp-49', q: 'WHAT WILL OUR SUN BECOME AFTER IT EXHAUSTS CORE HYDROGEN (IN BILLIONS OF YEARS)?', a: 'RED GIANT', c: 'space', d: 4, w: ['WHITE DWARF', 'NEUTRON STAR', 'BLACK HOLE'] },
            { id: 'sp-50', q: 'WHAT IS THE NAME OF THE LARGEST VOLCANO IN THE SOLAR SYSTEM, ON MARS?', a: 'OLYMPUS MONS', c: 'space', d: 4, w: ['MAUNA LOA', 'EVEREST', 'ARSIA MONS'], fact: 'Olympus Mons is roughly three times the height of Mount Everest.' },
            { id: 'sp-51', q: 'WHAT IS THE GIANT CANYON SYSTEM STRETCHING ACROSS MARS?', a: 'VALLES MARINERIS', c: 'space', d: 4, w: ['GRAND CANYON', 'HELLAS BASIN', 'OLYMPUS MONS'] },
            { id: 'sp-52', q: 'MARS HAS TWO SMALL MOONS NAMED PHOBOS AND WHAT ELSE?', a: 'DEIMOS', c: 'planet', d: 4, w: ['CHARON', 'PHOEBE', 'HYPERION'] },
            { id: 'sp-53', q: 'HOW MANY MOONS DOES MARS HAVE?', a: '2', c: 'number', d: 3, w: ['0', '1', '4'] },
            { id: 'sp-54', q: 'WHAT REGION BEYOND NEPTUNE HOLDS PLUTO AND THOUSANDS OF ICY BODIES?', a: 'KUIPER BELT', c: 'space', d: 4, w: ['ASTEROID BELT', 'OORT CLOUD', 'HELIOSPHERE'] },
            { id: 'sp-55', q: 'WHAT DISTANT SPHERICAL SHELL IS THOUGHT TO BE THE SOURCE OF LONG-PERIOD COMETS?', a: 'OORT CLOUD', c: 'space', d: 5, w: ['KUIPER BELT', 'ASTEROID BELT', 'MAGNETOSPHERE'] },
            { id: 'sp-56', q: 'WHAT STREAK OF LIGHT IS A METEOR BURNING IN EARTH\'S ATMOSPHERE?', a: 'METEOR', c: 'space', d: 2, w: ['COMET', 'ASTEROID', 'SATELLITE'] },
            { id: 'sp-57', q: 'WHAT IS A SPACE ROCK THAT SURVIVES IMPACT WITH EARTH\'S SURFACE CALLED?', a: 'METEORITE', c: 'space', d: 3, w: ['METEOR', 'METEOROID', 'MICROMETEORITE'] },
            { id: 'sp-58', q: 'A COMET\'S TAIL ALWAYS POINTS AWAY FROM WHAT?', a: 'THE SUN', c: 'space', d: 3, w: ['EARTH', 'JUPITER', 'THE MOON'] },
            { id: 'sp-59', q: 'WHAT BLOCKS SUNLIGHT TO CREATE A TOTAL SOLAR ECLIPSE ON EARTH?', a: 'THE MOON', c: 'space', d: 2, w: ['THE SUN', 'MARS', 'VENUS'] },
            { id: 'sp-60', q: 'WHAT COLORFUL SKY LIGHTS ARE CAUSED BY CHARGED PARTICLES FROM THE SUN?', a: 'AURORA', c: 'space', d: 3, w: ['RAINBOW', 'HALO', 'MIRAGE'] },
            { id: 'sp-61', q: 'WHAT STREAM OF CHARGED PARTICLES FLOWS FROM THE SUN INTO SPACE?', a: 'SOLAR WIND', c: 'space', d: 4, w: ['COSMIC RAYS', 'SOLAR FLARE', 'MAGNETOSPHERE'] },
            { id: 'sp-62', q: 'WHAT ELEMENT FUSES IN THE SUN\'S CORE TO RELEASE ENORMOUS ENERGY?', a: 'HYDROGEN', c: 'chemistry', d: 3, w: ['HELIUM', 'CARBON', 'OXYGEN'] },
            { id: 'sp-63', q: 'WHAT ELEMENT IS PRODUCED WHEN HYDROGEN FUSES IN MAIN-SEQUENCE STARS?', a: 'HELIUM', c: 'chemistry', d: 3, w: ['LITHIUM', 'IRON', 'NEON'] },
            { id: 'sp-64', q: 'WHAT IS THE OUTERMOST LAYER OF THE SUN\'S ATMOSPHERE VISIBLE DURING ECLIPSES?', a: 'CORONA', c: 'space', d: 4, w: ['CHROMOSPHERE', 'PHOTOSPHERE', 'CORE'] },
            { id: 'sp-65', q: 'WHAT BOUNDARY AROUND A BLACK HOLE IS THE POINT OF NO RETURN FOR LIGHT?', a: 'EVENT HORIZON', c: 'space', d: 5, w: ['PHOTOSPHERE', 'ERGOSPHERE', 'ACCRETION DISK'] },
            { id: 'sp-66', q: 'SATURN\'S RINGS ARE MOSTLY MADE OF WHAT?', a: 'ICE AND ROCK', c: 'space', d: 3, w: ['METAL', 'GAS', 'DUST ONLY'] },
            { id: 'sp-67', q: 'WHICH PLANET WAS DISCOVERED THROUGH MATHEMATICAL PREDICTION BEFORE IT WAS SEEN?', a: 'NEPTUNE', c: 'planet', d: 5, w: ['URANUS', 'PLUTO', 'CERES'] },
            { id: 'sp-68', q: 'WHICH PLANET HAS A GREAT DARK SPOT SIMILAR TO JUPITER\'S RED SPOT?', a: 'NEPTUNE', c: 'planet', d: 4, w: ['URANUS', 'SATURN', 'MARS'] },
            { id: 'sp-69', q: 'WHICH PLANET ROTATES BACKWARD COMPARED TO MOST PLANETS (RETROGRADE)?', a: 'VENUS', c: 'planet', d: 4, w: ['MARS', 'JUPITER', 'SATURN'] },
            { id: 'sp-70', q: 'WHICH PLANET HAS THE SHORTEST YEAR IN OUR SOLAR SYSTEM?', a: 'MERCURY', c: 'planet', d: 3, w: ['VENUS', 'EARTH', 'MARS'] },
            { id: 'sp-71', q: 'ABOUT HOW LONG IS ONE MERCURY YEAR IN EARTH DAYS?', a: '88', c: 'number', d: 4, w: ['225', '365', '687'] },
            { id: 'sp-72', q: 'ABOUT HOW LONG IS ONE DAY ON JUPITER (ROTATION PERIOD)?', a: '10 HOURS', c: 'number', d: 4, w: ['24 HOURS', '48 HOURS', '30 DAYS'] },
            { id: 'sp-73', q: 'HOW MANY EARTHS WOULD FIT INSIDE JUPITER (APPROXIMATELY)?', a: '1,300', c: 'number', d: 5, w: ['130', '50', '10,000'] },
            { id: 'sp-74', q: 'WHAT NASA MISSION PROGRAM PUT HUMANS ON THE MOON?', a: 'APOLLO', c: 'space', d: 2, w: ['GEMINI', 'MERCURY', 'ARTEMIS'] },
            { id: 'sp-75', q: 'WHAT NASA PROGRAM AIMS TO RETURN HUMANS TO THE MOON?', a: 'ARTEMIS', c: 'space', d: 3, w: ['APOLLO', 'ORION', 'SKYLAB'] },
            { id: 'sp-76', q: 'WHO WAS THE SECOND PERSON TO WALK ON THE MOON?', a: 'BUZZ ALDRIN', c: 'scientist', d: 3, w: ['NEIL ARMSTRONG', 'MICHAEL COLLINS', 'PETE CONRAD'] },
            { id: 'sp-77', q: 'WHO PERFORMED THE FIRST HUMAN SPACEWALK IN 1965?', a: 'ALEXEI LEONOV', c: 'scientist', d: 5, w: ['NEIL ARMSTRONG', 'BUZZ ALDRIN', 'YURI GAGARIN'] },
            { id: 'sp-78', q: 'WHAT U.S. AGENCY LEADS MOST AMERICAN SPACE EXPLORATION?', a: 'NASA', c: 'space', d: 1, w: ['ESA', 'SPACEX', 'ROSCOSMOS'] },
            { id: 'sp-79', q: 'WHAT EUROPEAN ORGANIZATION BUILDS ROCKETS LIKE ARIANE AND RUNS SPACE SCIENCE?', a: 'ESA', c: 'space', d: 4, w: ['NASA', 'JAXA', 'ISRO'] },
            { id: 'sp-80', q: 'WHAT COMPANY LAUNCHED THE REUSABLE FALCON 9 ROCKET?', a: 'SPACEX', c: 'space', d: 2, w: ['BLUE ORIGIN', 'BOEING', 'LOCKHEED MARTIN'] },
            { id: 'sp-81', q: 'WHAT ORBITAL STATE DO ASTRONAUTS EXPERIENCE AS "WEIGHTLESSNESS"?', a: 'FREE FALL', c: 'space', d: 4, w: ['ZERO MASS', 'ANTI-GRAVITY', 'VACUUM FLOAT'] },
            { id: 'sp-82', q: 'WHAT MINIMUM SPEED MUST A ROCKET REACH TO LEAVE EARTH WITHOUT FURTHER PROPULSION?', a: 'ESCAPE VELOCITY', c: 'space', d: 5, w: ['ORBITAL VELOCITY', 'TERMINAL VELOCITY', 'LIGHT SPEED'] },
            { id: 'sp-83', q: 'WHAT STABLE POINTS IN SPACE LET OBJECTS "PARK" WITH LITTLE FUEL?', a: 'LAGRANGE POINTS', c: 'space', d: 5, w: ['PERIHELION', 'APOGEE', 'NADIR'] },
            { id: 'sp-84', q: 'WHAT INSTRUMENT USES A PARABOLIC DISH TO COLLECT RADIO WAVES FROM SPACE?', a: 'RADIO TELESCOPE', c: 'space', d: 3, w: ['REFRACTING TELESCOPE', 'SEISMOGRAPH', 'SPECTROMETER'] },
            { id: 'sp-85', q: 'WHAT SPACE-BASED OBSERVATORY DETECTED THOUSANDS OF EXOPLANET CANDIDATES?', a: 'KEPLER', c: 'space', d: 4, w: ['HUBBLE', 'JWST', 'GAIA'] },
            { id: 'sp-86', q: 'WHAT IS A PLANET ORBITING A STAR OTHER THAN THE SUN CALLED?', a: 'EXOPLANET', c: 'space', d: 3, w: ['DWARF PLANET', 'MOON', 'ASTEROID'] },
            { id: 'sp-87', q: 'WHAT METHOD DETECTS EXOPLANETS WHEN A STAR DIMS AS A PLANET CROSSES IN FRONT?', a: 'TRANSIT METHOD', c: 'space', d: 5, w: ['RADIAL VELOCITY', 'MICROLENSING', 'ASTROMETRY'] },
            { id: 'sp-88', q: 'WHAT FAMOUS NEBULA IN ORION IS A STELLAR NURSERY VISIBLE TO THE NAKED EYE?', a: 'ORION NEBULA', c: 'space', d: 3, w: ['CRAB NEBULA', 'RING NEBULA', 'HORSEHEAD NEBULA'] },
            { id: 'sp-89', q: 'WHAT CONSTELLATION CONTAINS THE NORTH STAR (POLARIS)?', a: 'URSA MINOR', c: 'space', d: 4, w: ['URSA MAJOR', 'CASSIOPEIA', 'DRACO'] },
            { id: 'sp-90', q: 'WHAT STAR DO SAILORS AND EXPLORERS USE NEAR THE NORTH CELESTIAL POLE?', a: 'POLARIS', c: 'space', d: 2, w: ['SIRIUS', 'VEGA', 'ALTAIR'] },
            { id: 'sp-91', q: 'WHAT RED SUPERGIANT IN ORION IS NEAR THE END OF ITS LIFE?', a: 'BETELGEUSE', c: 'space', d: 4, w: ['RIGEL', 'SIRIUS', 'PROCYON'] },
            { id: 'sp-92', q: 'WHAT TYPE OF GALAXY IS THE MILKY WAY (BAR AND SPIRAL ARMS)?', a: 'BARRED SPIRAL', c: 'space', d: 5, w: ['ELLIPTICAL', 'IRREGULAR', 'LENTICULAR'] },
            { id: 'sp-93', q: 'WHAT EXTREMELY LUMINOUS GALACTIC CORE IS POWERED BY A FEEDING BLACK HOLE?', a: 'QUASAR', c: 'space', d: 5, w: ['PULSAR', 'NOVA', 'BROWN DWARF'] },
            { id: 'sp-94', q: 'WHAT 1958 U.S. SPACE AGENCY REPLACED NACA?', a: 'NASA', c: 'space', d: 4, w: ['USAF', 'NOAA', 'DARPA'] },
            { id: 'sp-95', q: 'WHAT WAS THE FIRST U.S. SPACE STATION, LAUNCHED IN 1973?', a: 'SKYLAB', c: 'space', d: 5, w: ['MIR', 'ISS', 'SALYUT'] },
            { id: 'sp-96', q: 'WHAT SOVIET SPACE STATION OPERATED UNTIL 2001?', a: 'MIR', c: 'space', d: 4, w: ['SKYLAB', 'ISS', 'TIANGONG'] },
            { id: 'sp-97', q: 'WHAT SPACE SHUTTLE WAS THE FIRST TO REACH ORBIT IN 1981?', a: 'COLUMBIA', c: 'space', d: 4, w: ['CHALLENGER', 'DISCOVERY', 'ATLANTIS'] },
            { id: 'sp-98', q: 'WHAT TRAGIC SHUTTLE BROKE UP DURING RE-ENTRY IN 2003?', a: 'COLUMBIA', c: 'space', d: 5, w: ['CHALLENGER', 'ENDEAVOUR', 'DISCOVERY'] },
            { id: 'sp-99', q: 'WHAT SMALL MARS ROVER LANDED IN 1997 AS PART OF THE PATHFINDER MISSION?', a: 'SOJOURNER', c: 'space', d: 4, w: ['SPIRIT', 'OPPORTUNITY', 'CURIOSITY'] },
            { id: 'sp-100', q: 'WHAT TWIN MARS ROVERS LANDED IN 2004 AND EXCEEDED THEIR 90-DAY MISSION?', a: 'SPIRIT AND OPPORTUNITY', c: 'space', d: 4, w: ['CURIOSITY AND PERSEVERANCE', 'SOJOURNER AND PATHFINDER', 'VIKING 1 AND 2'] },
            { id: 'sp-101', q: 'WHAT HELICOPTER MADE THE FIRST POWERED FLIGHT ON ANOTHER WORLD?', a: 'INGENUITY', c: 'space', d: 4, w: ['DRAGONFLY', 'MARSCOPTER', 'SKYCRANE'] },
            { id: 'sp-102', q: 'WHAT GAS GIANT HAS A MAGNETIC FIELD SO STRONG IT CREATES A VAST MAGNETOSPHERE?', a: 'JUPITER', c: 'planet', d: 4, w: ['SATURN', 'NEPTUNE', 'URANUS'] },
            { id: 'sp-103', q: 'WHAT ICY MOON OF NEPTUNE ORBITS BACKWARD AND MAY BE A CAPTURED KUIPER OBJECT?', a: 'TRITON', c: 'planet', d: 5, w: ['TITAN', 'EUROPA', 'OBERON'] },
            { id: 'sp-104', q: 'WHAT IS THE LARGEST ASTEROID IN THE MAIN BELT?', a: 'CERES', c: 'planet', d: 4, w: ['VESTA', 'PALLAS', 'HYGEIA'] },
            { id: 'sp-105', q: 'CERES LIVES IN THE ASTEROID BELT BUT IS ALSO CLASSIFIED AS A WHAT?', a: 'DWARF PLANET', c: 'planet', d: 4, w: ['COMET', 'MOON', 'METEOR'] },
            { id: 'sp-106', q: 'WHAT UNIT MEASURES DISTANCE USED IN ASTRONOMY (ABOUT 150 MILLION KM)?', a: 'ASTRONOMICAL UNIT', c: 'space', d: 4, w: ['LIGHT-YEAR', 'PARSEC', 'KILOMETER'] },
            { id: 'sp-107', q: 'WHAT UNIT IS ROUGHLY 3.26 LIGHT-YEARS AND USED FOR STELLAR DISTANCES?', a: 'PARSEC', c: 'space', d: 5, w: ['ASTRONOMICAL UNIT', 'ANGSTROM', 'KILOPARSEC'] },
            { id: 'sp-108', q: 'WHAT PHENOMENON RIPPLES SPACETIME AND WAS FIRST DIRECTLY DETECTED IN 2015?', a: 'GRAVITATIONAL WAVES', c: 'space', d: 5, w: ['SOLAR FLARES', 'COSMIC RAYS', 'MAGNETIC RECONNECTION'], fact: 'LIGO detected waves from two merging black holes over a billion light-years away.' },
            { id: 'sp-109', q: 'WHAT COLLABORATION DETECTED GRAVITATIONAL WAVES WITH LASER INTERFEROMETERS?', a: 'LIGO', c: 'space', d: 5, w: ['HUBBLE', 'JWST', 'KEPLER'] },
            { id: 'sp-110', q: 'WHAT IS THE NAME OF THE ROCKET NASA USES FOR ARTEMIS MOON MISSIONS?', a: 'SLS', c: 'space', d: 5, w: ['SATURN V', 'FALCON HEAVY', 'DELTA IV'] },
            { id: 'sp-111', q: 'WHAT CREW CAPSULE WILL CARRY ASTRONAUTS FOR NASA\'S ARTEMIS FLIGHTS?', a: 'ORION', c: 'space', d: 4, w: ['DRAGON', 'STARLINER', 'SOYUZ'] },
            { id: 'sp-112', q: 'WHAT RUSSIAN CRAFT HAS FERRIED ASTRONAUTS TO THE ISS FOR DECADES?', a: 'SOYUZ', c: 'space', d: 3, w: ['APOLLO', 'SHENZHOU', 'GEMINI'] },
            { id: 'sp-113', q: 'WHAT CHINESE SPACE STATION MODULE BEGAN ASSEMBLY IN LOW EARTH ORBIT?', a: 'TIANGONG', c: 'space', d: 4, w: ['MIR', 'SKYLAB', 'FREEDOM'] },
            { id: 'sp-114', q: 'IN WHAT DECADE DID NASA\'S VIKING PROBES FIRST LAND ON MARS?', a: '1970s', c: 'number', d: 4, w: ['1960s', '1980s', '1990s'] },
            { id: 'sp-115', q: 'WHAT COMET\'S FRAGMENTS CRASHED INTO JUPITER IN 1994 IN A SPECTACULAR EVENT?', a: 'SHOEMAKER-LEVY 9', c: 'space', d: 5, w: ['HALLEY\'S COMET', 'HALE-BOPP', 'TEMPEL 1'] },
            { id: 'sp-116', q: 'WHAT IS THE HELIOSPHERE\'S OUTER BOUNDARY WHERE SOLAR WIND MEETS INTERSTELLAR SPACE?', a: 'HELIOPAUSE', c: 'space', d: 5, w: ['MAGNETOPAUSE', 'TERMINATION SHOCK', 'BOW SHOCK'] },
            { id: 'sp-117', q: 'WHO FORMULATED E = mc² IN SPECIAL RELATIVITY?', a: 'ALBERT EINSTEIN', c: 'scientist', d: 3, w: ['ISAAC NEWTON', 'STEPHEN HAWKING', 'JOHANNES KEPLER'] },
            { id: 'sp-118', q: 'WHO PROPOSED THREE LAWS OF PLANETARY MOTION IN THE 1600s?', a: 'JOHANNES KEPLER', c: 'scientist', d: 4, w: ['GALILEO GALILEI', 'ISAAC NEWTON', 'NICOLAUS COPERNICUS'] },
            { id: 'sp-119', q: 'WHO FIRST PROPOSED A HELIOCENTRIC MODEL OF THE SOLAR SYSTEM?', a: 'NICOLAUS COPERNICUS', c: 'scientist', d: 4, w: ['PTOLEMY', 'ARISTOTLE', 'TYCHO BRAHE'] },
            { id: 'sp-120', q: 'WHO USED A TELESCOPE TO DISCOVER JUPITER\'S FOUR LARGEST MOONS?', a: 'GALILEO GALILEI', c: 'scientist', d: 3, w: ['ISAAC NEWTON', 'JOHANNES KEPLER', 'EDWIN HUBBLE'] },
            { id: 'sp-121', q: 'WHAT ASTRONOMER SHOWED THE UNIVERSE CONTAINS GALAXIES BEYOND THE MILKY WAY?', a: 'EDWIN HUBBLE', c: 'scientist', d: 5, w: ['GALILEO GALILEI', 'CARL SAGAN', 'STEPHEN HAWKING'] },
            { id: 'sp-122', q: 'WHAT COSMOLOGIST WROTE "A BRIEF HISTORY OF TIME" AND STUDIED BLACK HOLES?', a: 'STEPHEN HAWKING', c: 'scientist', d: 3, w: ['ALBERT EINSTEIN', 'NEIL DEGRASSE TYSON', 'CARL SAGAN'] },
        ],
        // ---------------------------------------------------------------------
        // Pack: tech — machines, networks, and the tools that reach space (tec-*)
        // ---------------------------------------------------------------------
        tech: [
            { id: 'tec-01', q: 'WHO CO-FOUNDED APPLE WITH STEVE JOBS?', a: 'STEVE WOZNIAK', c: 'tech', d: 3, w: ['BILL GATES', 'TIM COOK', 'MARK ZUCKERBERG'] },
            { id: 'tec-02', q: 'WHAT DOES CPU STAND FOR?', a: 'CENTRAL PROCESSING UNIT', c: 'tech', d: 3, w: ['COMPUTER POWER UNIT', 'CORE PROGRAM UTILITY', 'CENTRAL PRINT UNIT'] },
            { id: 'tec-03', q: 'WHAT DOES HTML STAND FOR?', a: 'HYPERTEXT MARKUP LANGUAGE', c: 'tech', d: 3, w: ['HIGH TECH MODERN LANGUAGE', 'HOME TOOL MARKUP LANGUAGE', 'HYPER TRANSFER MODULE LINK'] },
            { id: 'tec-04', q: 'WHAT COMPANY CREATED THE WINDOWS OPERATING SYSTEM?', a: 'MICROSOFT', c: 'tech', d: 1 },
            { id: 'tec-05', q: 'WHAT IS THE WORLD\'S LARGEST SEARCH ENGINE?', a: 'GOOGLE', c: 'tech', d: 1 },
            { id: 'tec-06', q: 'WHAT DOES USB STAND FOR?', a: 'UNIVERSAL SERIAL BUS', c: 'tech', d: 4, w: ['UNITED SYSTEM BUS', 'UNIVERSAL SYSTEM BYTE', 'UNIFIED SERIAL BUFFER'] },
            { id: 'tec-07', q: 'WHAT DOES GPU STAND FOR?', a: 'GRAPHICS PROCESSING UNIT', c: 'tech', d: 4, w: ['GENERAL PURPOSE UNIT', 'GRAPHIC POWER UTILITY', 'GLOBAL PROCESS UPGRADE'] },
            { id: 'tec-08', q: 'WHO CREATED THE LINUX KERNEL?', a: 'LINUS TORVALDS', c: 'tech', d: 5, w: ['RICHARD STALLMAN', 'BILL GATES', 'DENNIS RITCHIE'] },
        
            { id: 'tec-09', q: 'WHO SENT THE FIRST NETWORK EMAIL?', a: 'RAY TOMLINSON', c: 'tech', d: 4, w: ['TIM BERNERS-LEE', 'BILL GATES', 'LINUS TORVALDS'], fact: 'Tomlinson picked the @ sign to separate a person from their machine.' },
            { id: 'tec-10', q: 'WHAT CAME FIRST, EMAIL OR THE WORLD WIDE WEB?', a: 'EMAIL', c: 'tech', d: 3, w: ['THE WEB', 'SMARTPHONES', 'WIFI'], fact: 'Email dates to 1971. The web was proposed in 1989.' },
            { id: 'tec-11', q: 'WHERE WAS THE WORLD WIDE WEB FIRST PROPOSED?', a: 'CERN', c: 'tech', d: 4, w: ['NASA', 'MIT', 'IBM'], fact: 'Tim Berners-Lee wrote the proposal at the particle-physics lab in 1989.' },
            { id: 'tec-12', q: 'WHAT WAS THE FIRST .COM DOMAIN EVER REGISTERED?', a: 'SYMBOLICS.COM', c: 'tech', d: 5, w: ['GOOGLE.COM', 'APPLE.COM', 'MICROSOFT.COM'], fact: 'Symbolics.com was registered on 15 March 1985.' },
            { id: 'tec-13', q: 'WHAT DOES A COMPUTER LOSE FROM RAM WHEN THE POWER GOES OFF?', a: 'ITS DATA', c: 'tech', d: 2, w: ['ITS PROCESSOR', 'ITS KEYBOARD', 'ITS SCREEN'] },
            { id: 'tec-14', q: 'WHY DO GPS SATELLITES CORRECT THEIR CLOCKS?', a: 'RELATIVITY', c: 'tech', d: 5, w: ['THE WEATHER', 'THE MOON', 'MAGNETIC NORTH'], fact: 'Orbit speed and weaker gravity both shift the clocks. Without the correction, maps would drift.' },
        ],
        // ---------------------------------------------------------------------
        // Pack: weird — strange but real space and tech (wrd-*)
        // ---------------------------------------------------------------------
        weird: [
            { id: 'wrd-01', q: 'WHAT LASTS LONGER ON VENUS, ONE ROTATION OR ONE TRIP AROUND THE SUN?', a: 'ONE ROTATION', c: 'weird', d: 4, w: ['ONE ORBIT', 'ONE HOUR', 'ONE ECLIPSE'], fact: 'Venus spins so slowly that a day there is longer than its year.' },
            { id: 'wrd-02', q: 'IF YOU HAD A BATHTUB BIG ENOUGH, WHAT WOULD SATURN DO?', a: 'FLOAT', c: 'weird', d: 3, w: ['SINK', 'DISSOLVE', 'FREEZE SOLID'], fact: 'Saturn\'s average density is lower than water.' },
            { id: 'wrd-03', q: 'WHAT COLOR ARE SUNSETS ON MARS?', a: 'BLUE', c: 'weird', d: 4, w: ['RED', 'GREEN', 'BLACK'], fact: 'Martian dust scatters red light by day and leaves a blue glow around the setting Sun.' },
            { id: 'wrd-04', q: 'WHAT COLOR IS THE SUN WHEN YOU SEE IT FROM SPACE, WITHOUT EARTH\'S AIR?', a: 'WHITE', c: 'weird', d: 3, w: ['YELLOW', 'RED', 'GREEN'], fact: 'The atmosphere scatters blue light and makes the Sun look yellow from the ground.' },
            { id: 'wrd-05', q: 'WHAT DO ASTRONAUTS SAY CLINGS TO THEIR SUITS AFTER A SPACEWALK?', a: 'A SEARED-STEAK SMELL', c: 'weird', d: 4, w: ['A ROSE SCENT', 'NOTHING AT ALL', 'A WET-DOG SMELL'], fact: 'Several astronauts have described hot metal and seared steak.' },
            { id: 'wrd-06', q: 'IN ORBIT, WHAT DO TEARS DO?', a: 'BALL UP ON THE EYE', c: 'weird', d: 3, w: ['FALL UPWARD', 'FREEZE AT ONCE', 'VANISH'], fact: 'Without gravity pulling them down, tears stay as a wobbling blob.' },
            { id: 'wrd-07', q: 'WHAT HAPPENS TO AN ASTRONAUT\'S HEIGHT IN ORBIT?', a: 'THEY GROW A LITTLE', c: 'weird', d: 3, w: ['THEY SHRINK', 'THEY STAY IDENTICAL', 'THEY GROW WIDER'], fact: 'The spine stretches when it is no longer compressed. The gain is a few centimeters.' },
            { id: 'wrd-08', q: 'HOW LONG CAN BOOT PRINTS LAST ON THE MOON?', a: 'MILLIONS OF YEARS', c: 'weird', d: 3, w: ['ONE DAY', 'ONE YEAR', 'UNTIL IT RAINS'], fact: 'The Moon has no wind or rain to wipe them away.' },
            { id: 'wrd-09', q: 'EACH YEAR, THE MOON IS...', a: 'DRIFTING AWAY', c: 'weird', d: 3, w: ['FALLING CLOSER', 'STOPPING', 'SHRINKING'], fact: 'Tides push the Moon outward by about 3.8 centimeters a year.' },
            { id: 'wrd-10', q: 'ABOUT HOW MUCH WOULD A TEASPOON OF NEUTRON STAR WEIGH ON EARTH?', a: 'A BILLION TONS', c: 'weird', d: 4, w: ['A KILOGRAM', 'A TON', 'NOTHING'], fact: 'That matter is packed as tightly as an atomic nucleus.' },
            { id: 'wrd-11', q: 'WHAT HAVE ASTRONOMERS FOUND IN THE GIANT CLOUD SAGITTARIUS B2?', a: 'ALCOHOL', c: 'weird', d: 5, w: ['OLIVE OIL', 'MILK', 'HONEY'], fact: 'The cloud holds ethanol, the same molecule as drinking alcohol, spread across space.' },
            { id: 'wrd-12', q: 'WHAT WHIPS SIDEWAYS THROUGH THE AIR OF EXOPLANET HD 189733 B?', a: 'GLASS-LIKE GRIT', c: 'weird', d: 5, w: ['SNOW', 'LIQUID WATER', 'FEATHERS'], fact: 'Silicate particles ride winds of several thousand kilometers per hour.' },
            { id: 'wrd-13', q: 'WHAT TINY ANIMAL SURVIVED BEING LEFT IN OPEN SPACE?', a: 'A TARDIGRADE', c: 'weird', d: 4, w: ['A GOLDFISH', 'A FROG', 'A BEE'], fact: 'In a 2007 experiment, tardigrades lived through the vacuum outside a spacecraft.' },
            { id: 'wrd-14', q: 'WHAT SHAPE IS THE BRIGHT ICY PLAIN ON PLUTO CALLED TOMBAUGH REGIO?', a: 'A HEART', c: 'weird', d: 3, w: ['A RING', 'A SMILE', 'A SQUARE'], fact: 'New Horizons photographed it in 2015.' },
            { id: 'wrd-15', q: 'IN THE VACUUM OF SPACE, SOUND...', a: 'CANNOT TRAVEL', c: 'weird', d: 2, w: ['TRAVELS FASTER', 'TURNS INTO LIGHT', 'ECHOES FOREVER'] },
            { id: 'wrd-16', q: 'WHAT CAN SPIN HUNDREDS OF TIMES EVERY SECOND?', a: 'A PULSAR', c: 'weird', d: 4, w: ['THE MOON', 'SATURN', 'THE ISS'], fact: 'Some neutron stars rotate faster than a kitchen blender.' },
            { id: 'wrd-17', q: 'HOW DOES THE GREAT RED SPOT COMPARE WITH EARTH?', a: 'IT IS WIDER', c: 'weird', d: 3, w: ['IT IS A CITY', 'IT IS A SMALL CLOUD', 'IT IS THE SIZE OF A CAR'] },
            { id: 'wrd-18', q: 'WHAT DID THE VOYAGER PROBES CARRY FOR ANYONE WHO MIGHT FIND THEM?', a: 'A GOLDEN RECORD', c: 'weird', d: 3, w: ['A PAPER MAP', 'A FLAG', 'A RADIO PLAYLIST ON TAPE'], fact: 'The record holds sounds and images from Earth.' },
            { id: 'wrd-19', q: 'WHAT WAS LITERALLY FOUND IN A 1947 COMPUTER AND LOGGED AS THE FIRST BUG?', a: 'A MOTH', c: 'weird', d: 4, w: ['A SPIDER', 'A LOOSE WIRE', 'A TYPO'], fact: 'The team taped the moth into the Harvard Mark II log.' },
            { id: 'wrd-20', q: 'BLUETOOTH IS NAMED AFTER WHOM?', a: 'A VIKING KING', c: 'weird', d: 4, w: ['A TOOTH COLOR', 'A RADIO BAND', 'A FISH'], fact: 'Harald Bluetooth united Denmark. The tech was meant to unite devices.' },
            { id: 'wrd-21', q: 'WHAT DID THE FIRST WEBCAM WATCH?', a: 'A COFFEE POT', c: 'weird', d: 4, w: ['THE MOON', 'A CAT', 'TRAFFIC'], fact: 'The Trojan Room pot at Cambridge went online in 1991 so people could see if coffee was left.' },
            { id: 'wrd-22', q: 'WHAT DOES THE HTTP STATUS 418 MEAN?', a: 'I AM A TEAPOT', c: 'weird', d: 4, w: ['PAGE NOT FOUND', 'ACCESS DENIED', 'SERVER ASLEEP'], fact: 'It began as an April Fools\' note and never quite died.' },
            { id: 'wrd-23', q: 'WHAT IS A MARTIAN DAY CALLED?', a: 'A SOL', c: 'weird', d: 3, w: ['A CYCLE', 'A TICK', 'A DRIFT'], fact: 'A sol is about 24 hours and 37 minutes.' },
            { id: 'wrd-24', q: 'WHAT HAPPENED TO NASA\'S ORIGINAL APOLLO 11 MOONWALK TAPES?', a: 'THEY WERE ERASED', c: 'weird', d: 4, w: ['THEY BURNED ON REENTRY', 'THEY ARE STILL ON THE MOON', 'THEY WERE NEVER RECORDED'], fact: 'The slow-scan originals were erased and reused. Later restorations used broadcast copies.' },
        ],
};

    // =========================================================================
    // ENGINE — UTILITIES
    // Normalization, seeded PRNG (mulberry32), and Fisher–Yates shuffle.
    // =========================================================================
    function norm(value) {
        return String(value).toUpperCase().trim();
    }

    function mulberry32(seed) {
        let t = seed >>> 0;
        return function () {
            t += 0x6D2B79F5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    function shuffle(items, rand) {
        const list = items.slice();
        const random = rand || Math.random;
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    // =========================================================================
    // ENGINE — DISTRACTOR SCORING
    // Rank wrong-answer candidates by length, shape, and difficulty tier.
    // =========================================================================
    function allPoolsFlat() {
        const out = [];
        Object.values(CATEGORIES).forEach((cat) => out.push(...cat.pool));
        return out;
    }

    function letterScore(a, b) {
        if (!a || !b) return 0;
        return a[0] === b[0] ? 1 : 0;
    }

    function lengthScore(a, b) {
        const la = a.length;
        const lb = b.length;
        const ratio = Math.min(la, lb) / Math.max(la, lb);
        return ratio > 0.65 ? 2 : ratio > 0.4 ? 1 : 0;
    }

    function wordCountScore(a, b) {
        const wa = a.split(/\s+/).length;
        const wb = b.split(/\s+/).length;
        return wa === wb ? 2 : Math.abs(wa - wb) === 1 ? 1 : 0;
    }

    /** Higher score = more plausible (better for hard questions). */
    function distractorScore(answer, option, difficulty) {
        const a = norm(answer);
        const o = norm(option);
        if (a === o) return -999;

        let score = 0;
        score += letterScore(a, o) * (difficulty >= 3 ? 2 : 1);
        score += lengthScore(a, o) * (difficulty >= 4 ? 3 : 2);
        score += wordCountScore(a, o) * (difficulty >= 3 ? 2 : 1);

        if (/\d/.test(a) && /\d/.test(o)) score += 3;
        if (a.includes(' ') && o.includes(' ')) score += 1;

        if (difficulty <= 2) {
            score -= lengthScore(a, o);
        }

        return score;
    }

    // =========================================================================
    // ENGINE — WRONG ANSWER GENERATION
    // pickWrong: curated w[] → category pool → global pool, then plausibility slice.
    // =========================================================================
    function uniqueOptions(answer, candidates) {
        const used = new Set([norm(answer)]);
        const result = [];

        for (const option of candidates) {
            const key = norm(option);
            if (!used.has(key)) {
                used.add(key);
                result.push(option);
            }
            if (result.length === 3) break;
        }
        return result;
    }

    function pickWrong(item, rand) {
        const random = rand || Math.random;
        const curated = Array.isArray(item.w) ? uniqueOptions(item.a, item.w) : [];

        // Hand-written wrong answers are the question. The generator only fills gaps.
        if (curated.length >= 3) return curated.slice(0, 3);

        const answer = norm(item.a);
        const difficulty = item.d || DIFFICULTY.normal;
        const pools = [];

        curated.forEach((text, i) => pools.push({ text, tier: 0, idx: i }));

        const category = CATEGORIES[item.c];
        if (category) {
            category.pool.forEach((text) => pools.push({ text, tier: 1 }));
        }

        if (pools.length < 12) {
            allPoolsFlat().forEach((text) => pools.push({ text, tier: 2 }));
        }

        const ranked = shuffle(
            pools
                .filter((entry) => norm(entry.text) !== answer)
                .map((entry) => ({
                    text: entry.text,
                    tier: entry.tier,
                    score: distractorScore(item.a, entry.text, difficulty) - entry.tier * 4,
                })),
            random
        ).sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.tier - b.tier;
        });

        const targetPlausibility = difficulty >= 4 ? 'high' : difficulty <= 2 ? 'low' : 'mid';
        let slice;

        if (targetPlausibility === 'high') {
            slice = ranked.slice(0, Math.min(14, ranked.length));
        } else if (targetPlausibility === 'low') {
            slice = ranked.slice(-Math.min(14, ranked.length));
        } else {
            const mid = Math.floor(ranked.length / 2);
            slice = ranked.slice(Math.max(0, mid - 7), mid + 7);
        }

        const wrong = curated.slice();
        uniqueOptions(item.a, shuffle(slice, random).map((r) => r.text)).forEach((option) => {
            if (wrong.length < 3 && !wrong.some((w) => norm(w) === norm(option))) wrong.push(option);
        });

        if (wrong.length < 3) {
            const backup = uniqueOptions(
                item.a,
                shuffle(ranked.map((r) => r.text), random)
            );
            backup.forEach((b) => {
                if (wrong.length < 3 && !wrong.some((w) => norm(w) === norm(b))) {
                    wrong.push(b);
                }
            });
        }

        return wrong.slice(0, 3);
    }

    // =========================================================================
    // ENGINE — RUNTIME QUESTION BUILD
    // Map authoring item → play-ready object with generated wrong[] array.
    // =========================================================================
    function buildRuntimeQuestion(item, rand) {
        return {
            id: item.id,
            q: item.q,
            a: item.a,
            wrong: pickWrong(item, rand),
            category: item.c,
            difficulty: item.d || DIFFICULTY.normal,
            fact: item.fact || null,
            tags: item.tags || [],
        };
    }

    // =========================================================================
    // ENGINE — DECK PIPELINE
    // Flatten packs, dedupe, validate, balance categories, buildDeck(options).
    // =========================================================================
    function flattenPacks() {
        return Object.values(PACKS).flat();
    }

    function dedupePool(pool) {
        const seen = new Set();
        return pool.filter((item) => {
            const key = `${norm(item.q)}|${norm(item.a)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function validateDeck(deck) {
        const issues = [];
        deck.forEach((item, index) => {
            if (!item.q || !item.a) {
                issues.push({ index, id: item.id, msg: 'missing q/a' });
            }
            if (!Array.isArray(item.wrong) || item.wrong.length < 3) {
                issues.push({ index, id: item.id, msg: 'needs 3 wrong answers' });
            }
            const all = [item.a, ...(item.wrong || [])].map(norm);
            if (new Set(all).size < 4) {
                issues.push({ index, id: item.id, msg: 'duplicate choices' });
            }
        });
        if (issues.length) {
            console.warn('[CosmicTrivia] Deck validation:', issues);
        }
        return issues;
    }

    function balanceByCategory(pool, maxPerCategory, rand) {
        const buckets = {};
        pool.forEach((item) => {
            const key = item.c || 'misc';
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(item);
        });

        const balanced = [];
        const keys = shuffle(Object.keys(buckets), rand);
        let added = true;

        while (added) {
            added = false;
            keys.forEach((key) => {
                const bucket = buckets[key];
                const count = balanced.filter((q) => q.c === key).length;
                if (bucket.length && count < maxPerCategory) {
                    balanced.push(bucket.shift());
                    added = true;
                }
            });
        }

        keys.forEach((key) => {
            balanced.push(...buckets[key]);
        });

        return balanced;
    }

    function buildDeck(options) {
        const opts = options || {};
        const seed = opts.seed;
        const rand = typeof seed === 'number' ? mulberry32(seed) : Math.random;

        let source = dedupePool(flattenPacks());

        if (opts.categories && opts.categories.length) {
            const allowed = new Set(opts.categories);
            source = source.filter((item) => allowed.has(item.c));
        }

        if (typeof opts.minDifficulty === 'number') {
            source = source.filter((item) => (item.d || 2) >= opts.minDifficulty);
        }
        if (typeof opts.maxDifficulty === 'number') {
            source = source.filter((item) => (item.d || 2) <= opts.maxDifficulty);
        }

        if (opts.balanceCategories !== false) {
            source = balanceByCategory(source, opts.maxPerCategory || 8, rand);
        }

        if (opts.difficultyRamp) {
            source = source.slice().sort((a, b) => (a.d || 2) - (b.d || 2));
            const easy = source.filter((q) => (q.d || 2) <= 2);
            const mid = source.filter((q) => (q.d || 2) === 3);
            const hard = source.filter((q) => (q.d || 2) >= 4);
            source = shuffle(easy, rand).concat(shuffle(mid, rand), shuffle(hard, rand));
        } else {
            source = shuffle(source, rand);
        }

        if (typeof opts.limit === 'number' && opts.limit > 0) {
            source = source.slice(0, opts.limit);
        }

        const deck = source.map((item) => buildRuntimeQuestion(item, rand));
        validateDeck(deck);
        return deck;
    }

    // =========================================================================
    // PUBLISH — DEFAULT DECK
    // Build balanced default session; aggregate stats by category and difficulty.
    // =========================================================================
    const AUTHORING_POOL = dedupePool(flattenPacks());
    const DEFAULT_DECK = buildDeck({ difficultyRamp: true, balanceCategories: true });

    const stats = {
        total: DEFAULT_DECK.length,
        byCategory: {},
        byDifficulty: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };

    DEFAULT_DECK.forEach((q) => {
        stats.byCategory[q.category] = (stats.byCategory[q.category] || 0) + 1;
        const d = q.difficulty || 2;
        stats.byDifficulty[d] = (stats.byDifficulty[d] || 0) + 1;
    });

    // =========================================================================
    // PUBLISH — GLOBAL EXPORTS
    // window.TRIVIA_DATA (runtime deck), TRIVIA_META, CosmicTrivia public API.
    // =========================================================================
    window.TRIVIA_DATA = DEFAULT_DECK;
    window.TRIVIA_META = {
        total: stats.total,
        categories: Object.keys(CATEGORIES),
        version: 4,
        engine: 'CosmicTrivia',
    };

    window.CosmicTrivia = {
        version: 4,
        DIFFICULTY,
        CATEGORIES,
        buildDeck,
        getAuthoringPool: () => AUTHORING_POOL.slice(),
        getQuestionById: (id) => DEFAULT_DECK.find((q) => q.id === id) || null,
        stats,
        validate: () => validateDeck(DEFAULT_DECK),
    };
})();
