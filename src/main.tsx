import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ImageKitProvider } from '@imagekit/react'
import { Auth0Provider } from "@auth0/auth0-react";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ImageKitProvider urlEndpoint='https://ik.imagekit.io/9npwwo7fb/'>
      <Auth0Provider
        domain="dev-im6zt3z1m1b3c48l.eu.auth0.com"
        clientId="wJqSyaGcXjVewNfF7RGsyVnKypxx0nte"
        authorizationParams={{ redirect_uri: window.location.origin }}>
        <App />
      </Auth0Provider>
    </ImageKitProvider>

  </StrictMode>
)

