import { createRedisConnection } from "../../middlewares/services/redisConnection.js";

const redis = createRedisConnection(false);

export default redis;
