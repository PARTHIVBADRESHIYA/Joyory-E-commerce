import IORedis from "ioredis";

export const createRedisConnection = (forQueue = false) => {
    const url = process.env.REDIS_URL;
    if (!url) {
        console.error("❌ Missing REDIS_URL in .env file");
        return null;
    }

    // ✅ No TLS, just plain connection
    const options = {};

    if (forQueue) {
        options.maxRetriesPerRequest = null;
        options.enableReadyCheck = false;
    } else {
        options.maxRetriesPerRequest = 1;
        options.enableReadyCheck = false;
        options.reconnectOnError = false;
    }

    const connection = new IORedis(url, options);

    connection.on("connect", () =>
        console.log("✅ Connected to Redis Cloud (No TLS)")
    );

    connection.on("error", (err) =>
        console.error("❌ Redis Error:", err.message)
    );

    return connection;
};
