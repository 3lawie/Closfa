# When to Mock

Mock at **system boundaries** only — the external services this app talks to:

- Neon Postgres (`@neondatabase/serverless`) — prefer a test DB or in-memory query result where possible; mock the client call as a last resort
- Auth0 (PKCE token exchange, userinfo)
- ImageKit (media upload/transform)
- Upstash Redis (rate limiting)
- Time/randomness (session expiry, cuid2 IDs)

Don't mock:

- Your own service functions, validation schemas, or authorization functions — these are the seams under test, not boundaries to fake out
- Drizzle query builders themselves — if a service needs a fake DB response, mock the boundary call the service makes, not the ORM internals

## Designing for mockability

At real system boundaries, keep dependencies passed in rather than constructed inside the function under test:

```typescript
// Easy to mock — the boundary is a parameter
async function chargeRateLimit(key: string, redis: RedisClient) {
  return redis.limit(key)
}

// Hard to mock — the boundary is constructed internally
async function chargeRateLimit(key: string) {
  const redis = new Redis(process.env.UPSTASH_URL!)
  return redis.limit(key)
}
```

Prefer one specific function per external operation over one generic caller with conditional logic — each mock then returns one specific shape, with no branching in test setup.
