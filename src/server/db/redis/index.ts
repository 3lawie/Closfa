import { Redis } from '@upstash/redis'

// We store the actual connection here once it is created
let _redis: Redis | null = null

// We export a "Proxy" object. 
// Every time your app tries to call redis.get() or redis.set(), this proxy intercepts it.
export const redis = new Proxy({} as Redis, {
    get(target, prop, receiver) {
        // If the connection doesn't exist yet, build it NOW (lazy initialization)
        if (!_redis) {
            if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
                throw new Error("CRITICAL: Upstash Redis credentials not found in environment variables.");
            }

            _redis = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN,
            });
        }

        // Pass the function call to the real Redis instance
        const value = Reflect.get(_redis, prop, receiver)
        return typeof value === 'function' ? value.bind(_redis) : value
    }
})
