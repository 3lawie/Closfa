/** Client-safe env — supports NEXT_PUBLIC_* and legacy NEXT_* names from .env */
export const clientEnv = {
  imagekitUrlEndpoint:
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ??
    process.env.NEXT_IMAGEKIT_URL_ENDPOINT ??
    '',
  imagekitPublicKey:
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY ??
    process.env.NEXT_IMAGEKIT_PUBLIC_KEY ??
    '',
  auth0Domain:
    process.env.NEXT_PUBLIC_AUTH0_DOMAIN ?? process.env.NEXT_AUTH0_DOMAIN ?? '',
  auth0ClientId:
    process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID ??
    process.env.NEXT_AUTH0_CLIENT_ID ??
    '',
}
