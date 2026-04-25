import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ImageKitProvider } from '@imagekit/react'
import { Auth0Provider } from "@auth0/auth0-react";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ImageKitProvider urlEndpoint={import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT}>
      <Auth0Provider
        domain={import.meta.env.VITE_AUTH0_DOMAIN}
        clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
        authorizationParams={{ redirect_uri: window.location.origin }}>
        <App />
      </Auth0Provider>
    </ImageKitProvider>

  </StrictMode>
)

