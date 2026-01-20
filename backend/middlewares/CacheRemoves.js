import {getRedis} from "../middlewares/utils/redis.js";

export const flushRedisOnBoot = async () => {
    try {
        const redis = getRedis();

        if (!redis) {
            console.log("⚠️ Redis not initialized, skipping flush");
            return;
        }

        console.log("🧹 Redis boot flush started...");

        await redis.flushdb(); // ✅ safer than FLUSHALL

        console.log("✅ Redis cache cleared on server startup");

    } catch (err) {
        console.error("❌ Redis boot flush failed:", err);
    }
};