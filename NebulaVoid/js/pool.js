/**
 * NEBULA VOID — object pool allocator (rotating index, zero alloc in hot path).
 * Load after config-loader.js.
 */
(function (global) {
    "use strict";

    function getFromPool(poolArray) {
        let i = poolArray._idx || 0;
        let start = i;
        let len = poolArray.length;

        do {
            let obj = poolArray[i];

            if (++i >= len) i = 0;

            if (!obj.active) {
                poolArray._idx = i;
                return obj;
            }
        } while (i !== start);

        poolArray._idx = i;
        return null;
    }

    global.getFromPool = getFromPool;
})(typeof window !== "undefined" ? window : globalThis);
