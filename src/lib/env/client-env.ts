/** Client-safe env — uses VITE_ prefix so Vite exposes them to the browser.
 *
 * ⚠️ Only put truly PUBLIC values here. Auth0 domain/clientId have been
 *    moved to server-only env vars since we now use server-side auth flow.
 */

import dotenv from 'dotenv';
dotenv.config();

export const clientEnv = {
  imagekitUrlEndpoint: process.env.VITE_IMAGEKIT_URL_ENDPOINT! as string,
  imagekitPublicKey: process.env.VITE_IMAGEKIT_PUBLIC_KEY! as string,
}
