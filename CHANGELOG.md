# CHANGELOG

## [Unreleased] - 2026-06-20

### Added
- **Upstash Redis Rate Limiting**: Added composite key rate limiting (User-Agent + IP for anonymous requests) with `@upstash/ratelimit`.
- **Cloudflare Turnstile**: Added `TurnstileWidget` for the frontend and `turnstile.ts` verification logic for the backend to prevent automated submissions.
- **Session Sliding Window**: Introduced a 25% sliding window renewal mechanism to seamlessly refresh sessions, with an absolute 30-day cap for security.

### Changed
- **Folder Restructure**: Reorganized `src/server/auth` into `src/server/lib` and grouped Third-Party integrations (`Auth0`, `ImageKit`) under `src/server/actions/ThirdParty` for clarity.
- **CSRF Protection**: Upgraded `authMiddleware` to enforce strict `Origin` and `Host` header checks, mitigating cross-site request forgery effectively.
- **Drizzle Best Practices**: Standardized query syntax to use object filters for `.query` methods and strict operator syntax for `.update/delete` methods.
- **Zod Error Rewiring**: Transitioned from throwing raw exceptions to a robust `ServerResult<T>` union type system across all Database services, coupled with robust Zod validation.
