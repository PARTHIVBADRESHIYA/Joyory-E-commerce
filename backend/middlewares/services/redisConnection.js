// middlewares/services/redisConnection.js
import IORedis from "ioredis";

let redisAvailable = true;
let connection = null;

export const createRedisConnection = () => {
    if (!redisAvailable) {
        console.warn("🚫 Redis permanently disabled (limit exceeded)");
        return { connection: null, redisAvailableRef: () => false };
    }

    connection = new IORedis(process.env.REDIS_URL, {
        tls: {},
        maxRetriesPerRequest: 0, // ❌ no retries
        enableReadyCheck: false,
        reconnectOnError: false,
    });

    connection.on("error", (err) => {
        if (err.message.includes("max requests limit exceeded")) {
            console.error("❌ Upstash Redis limit exceeded. Disabling Redis globally.");

            redisAvailable = false;
            process.env.DISABLE_BULL = "true";

            try {
                connection.removeAllListeners();
                connection.disconnect();
            } catch (e) {
                console.error("Error while closing Redis:", e.message);
            }
        }
    });

    connection.on("close", () => {
        if (redisAvailable) {
            console.warn("⚠️ Redis connection closed.");
            redisAvailable = false;
        }
    });

    return { connection, redisAvailableRef: () => redisAvailable };
};
