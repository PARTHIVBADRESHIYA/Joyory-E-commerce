import { createRedisConnection } from "../../middlewares/services/redisConnection.js";

let redis;

export const getRedis = () => {
    if (!redis) {
        redis = createRedisConnection(false);
    }
    return redis;
};
