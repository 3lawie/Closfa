import '../index.css'
import { ImageKitProvider } from '@imagekit/react'
import { Auth0Provider } from "@auth0/auth0-react";
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clientEnv } from '@/lib/client-env';

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
            <ImageKitProvider urlEndpoint={clientEnv.imagekitUrlEndpoint}>
                <Auth0Provider
                    domain={clientEnv.auth0Domain}
                    clientId={clientEnv.auth0ClientId}
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