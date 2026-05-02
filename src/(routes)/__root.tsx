import '../index.css'
import { ImageKitProvider } from '@imagekit/react'
import { Auth0Provider } from "@auth0/auth0-react";
import { createRootRoute, Outlet } from '@tanstack/react-router';

const RootLayout = () => {
    return (
        <ImageKitProvider urlEndpoint={import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT}>
            <Auth0Provider
                domain={import.meta.env.VITE_AUTH0_DOMAIN}
                clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
                authorizationParams={{ redirect_uri: window.location.origin }}>
                <Outlet />
            </Auth0Provider>
        </ImageKitProvider>
    )
}

export const Route = createRootRoute({
    component: RootLayout,
})