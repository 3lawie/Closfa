/** Client-safe env — uses NEXT_PUBLIC_* so Next.js exposes them to the browser */
export const clientEnv = {
  imagekitUrlEndpoint:
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT!,
  imagekitPublicKey:
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY!,
  auth0Domain:
    process.env.NEXT_PUBLIC_AUTH0_DOMAIN!,
  auth0ClientId:
    process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!,
}
