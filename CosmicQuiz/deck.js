/**
 * Cosmic Quiz — Session deck
 *
 * Seeded shuffle, category spread, and the 50-question cut.
 * A numeric seed keeps both online players on the same order.
 * Single-player skips questions already shown in this page load.
 * Exposes window.CosmicDeck for the game controller.
 */
(function () {
    'use strict';

    const SESSION_LENGTH = 50;
    const RECENTLY_SEEN_MAX = 150;
    const recentlySeenQuestions = [];

    function seededRandom(seed) {
        let s = Math.abs(Math.floor(seed)) % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    function shuffleWithSeed(items, seed) {
        const rand = seededRandom(seed);
        const list = items.slice();
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    function shuffleArray(items) {
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        return items;
    }

    function trimSessionDeck(deck) {
        const sessionLength = Math.min(SESSION_LENGTH, deck.length);
        return {
            deck: deck.slice(0, sessionLength),
            sessionLength,
        };
    }

    /** Round-robin by category so the session does not cluster one topic. */
    function spreadSessionDeck(deck, seed) {
        const buckets = new Map();
        deck.forEach((q) => {
            const key = q.category || 'misc';
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(q);
        });

        buckets.forEach((items, key) => {
            buckets.set(
                key,
                typeof seed === 'number'
                    ? shuffleWithSeed(items.slice(), seed + key.length * 17 + 3)
                    : shuffleArray(items.slice())
            );
        });

        const keys =
            typeof seed === 'number'
                ? shuffleWithSeed(Array.from(buckets.keys()), seed + 4047)
                : shuffleArray(Array.from(buckets.keys()));

        const mixed = [];
        let remaining = deck.length;

        while (remaining > 0) {
            let placed = false;
            for (const key of keys) {
                const bucket = buckets.get(key);
                if (bucket && bucket.length) {
                    mixed.push(bucket.shift());
                    remaining--;
                    placed = true;
                }
            }
            if (!placed) break;
        }

        return mixed;
    }

    function build(seed) {
        const seeded = typeof seed === 'number' && Number.isFinite(seed);
        const baseTriviaData = window.TRIVIA_DATA || [];
        let pool = baseTriviaData.slice();

        if (window.CosmicTrivia?.buildDeck) {
            pool = window.CosmicTrivia.buildDeck({
                seed: seeded ? seed : undefined,
                balanceCategories: true,
                difficultyRamp: false,
                maxPerCategory: 12,
            });
        }

        // Online decks must be identical on both machines, so local history stays out.
        if (seeded) return trimSessionDeck(spreadSessionDeck(pool, seed));

        const seenSet = new Set(recentlySeenQuestions);
        const unseen = [];
        const seen = [];
        pool.forEach((q) => {
            if (seenSet.has(q.q)) seen.push(q);
            else unseen.push(q);
        });
        shuffleArray(unseen);
        shuffleArray(seen);

        // Spread each group on its own. Mixing them first pulled repeats into the opening 50.
        const fresh = spreadSessionDeck(unseen);
        if (fresh.length >= SESSION_LENGTH) return trimSessionDeck(fresh);
        return trimSessionDeck(fresh.concat(spreadSessionDeck(seen)));
    }

    function remember(text) {
        if (!text || recentlySeenQuestions.includes(text)) return;
        recentlySeenQuestions.push(text);
        if (recentlySeenQuestions.length > RECENTLY_SEEN_MAX) {
            recentlySeenQuestions.shift();
        }
    }

    window.CosmicDeck = {
        SESSION_LENGTH,
        build,
        remember,
        shuffleWithSeed,
        shuffleArray,
    };
})();
