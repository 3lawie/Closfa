import { useAuth0 } from "@auth0/auth0-react";
import ImageRenderer from "../Media Handler/ImageRenderer";
import { createFileRoute, Link } from '@tanstack/react-router';
import ImageUploader from "../Media Handler/ImageUploader";

// 1. TanStack Router Configuration
export const Route = createFileRoute('/')({
    component: IndexPage,
});

// 2. Clean, Reusable Auth Buttons
function LoginButton() {
    const { loginWithRedirect } = useAuth0();
    return (
        <button
            onClick={() => loginWithRedirect()}
            // 1. Added "group" to the button
            className="group text-black bg-gray-100 border-[3px] border-blue-500 transition-colors px-5 py-2 rounded-lg font-medium shadow-amber-200 shadow-md"
        >
            {/* 2. Changed to group-hover */}
            <span className="inline-block text-amber-500 transition-all duration-300  group-hover:-translate-y-1">
                Log
            </span> In to Closfa
        </button>
    );
}

function LogoutButton() {
    const { logout } = useAuth0();
    return (
        <button
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            className="bg-red-50 text-red-600 hover:bg-red-100 transition-colors px-5 py-2 rounded-lg font-medium border border-blue-500"
        >
            Log Out
        </button>
    );
}

// 3. The Main UI Component
function IndexPage() {
    const { isLoading, isAuthenticated, user } = useAuth0();

    // The Auth0 boot-up state
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-pulse flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Loading Closfa...</p>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen w-full bg-gray-50 pb-20">
            {/* Top Navigation Bar */}
            <nav className="bg-white border-b sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
                    <h1 className="text-2xl font-bold tracking-tight !text-amber-500">Closfa.</h1>

                    <div className="flex items-center gap-6">
                        {/* Notice the <Link> here instead of <a> */}
                        <Link
                            to="/Todo"
                            className="text-gray-600 hover:text-black transition-colors font-medium !text-blue-500"
                        >
                            Vision Board
                        </Link>
                        {isAuthenticated ? <LogoutButton /> : <LoginButton />}
                    </div>
                </div>
            </nav>

            <div className="max-w-5xl mx-auto px-4 mt-8 text-left">

                {/* User Profile Banner (Only shows if logged in) */}
                {isAuthenticated && user && (
                    <section className="mb-10 p-6 bg-white rounded-2xl shadow-sm border flex items-center gap-5">
                        <img
                            src={user.picture}
                            alt={user.name}
                            className='w-16 h-16 rounded-full border border-gray-100 shadow-sm'
                        />
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
                            <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                    </section>
                )}

                {/* The Media Feed */}
                <section className="flex flex-col gap-12">

                    {/* Video Post 1 */}
                    <article className="bg-white p-4 rounded-2xl shadow-sm border">
                        <video
                            src="videos/زيارة.mp4"
                            controls
                            className='w-full rounded-xl bg-black max-h-[600px] object-contain'
                        />
                    </article>

                    {/* Video Post 2 */}
                    <article className="bg-white p-4 rounded-2xl shadow-sm border">
                        <video
                            src="videos/3 HOUR STUDY WITH ME  Background noise, Rain Sounds, 10-min break, No Music - Merve (1080p, h264, youtube).mp4"
                            controls
                            className='w-full rounded-xl bg-black max-h-[600px] object-contain'
                        />
                    </article>

                    {/* ImageKit Post */}
                    <article className="bg-white p-4 rounded-2xl shadow-sm border flex justify-evenly items-center gap-80">
                        <ImageRenderer />
                        <Link to="/Todo">
                            <button className="bg-amber-500 text-white px-4 py-2 rounded-lg mt-4">Go to Todo</button>
                        </Link>
                    </article>

                    {/* Footer */}
                    <footer className="mt-20 text-center text-gray-400 text-sm border-t pt-6">
                        Closfa © {new Date().getFullYear()} - <ImageUploader />                </footer>

                </section>
            </div>
        </main>
    );
}

export default IndexPage;