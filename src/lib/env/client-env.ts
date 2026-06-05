/**
 * Client-safe environment variables.
 * These are safe to expose to the browser.
 */
export const clientEnv = {
  imagekitPublicKey:
    (typeof process !== 'undefined' ? process.env.VITE_PUBLIC_IMAGEKIT_PUBLIC_KEY : undefined) ||
    'public_JPXQ10vjwmEkmxjXUIe/FHzUYas=',
  imagekitUrlEndpoint:
    (typeof process !== 'undefined' ? process.env.VITE_PUBLIC_IMAGEKIT_URL_ENDPOINT : undefined) ||
    'https://ik.imagekit.io/9npwwo7fb',
  auth0Domain:
    (typeof process !== 'undefined' ? process.env.VITE_PUBLIC_AUTH0_DOMAIN : undefined) ||
    'dev-im6zt3z1m1b3c48l.eu.auth0.com',
  auth0ClientId:
    (typeof process !== 'undefined' ? process.env.VITE_PUBLIC_AUTH0_CLIENT_ID : undefined) ||
    'wJqSyaGcXjVewNfF7RGsyVnKypxx0nte',
}
