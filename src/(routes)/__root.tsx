import '../index.css'
import { ImageKitProvider } from '@imagekit/react'
import { Auth0Provider } from "@auth0/auth0-react";
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 10,
            retry: 1,
        }
    }
})



const RootLayout = () => {

    return (
        <QueryClientProvider client={queryClient}>
            <ImageKitProvider urlEndpoint={import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT}>
                <Auth0Provider
                    domain={import.meta.env.VITE_AUTH0_DOMAIN}
                    clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
                    authorizationParams={{ redirect_uri: window.location.origin }}>
                    <Outlet />
                </Auth0Provider>
            </ImageKitProvider>
        </QueryClientProvider>
    )
}

export const Route = createRootRoute({
    component: RootLayout,
})