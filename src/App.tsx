import { useAuth0 } from "@auth0/auth0-react";
import ImageRenderer from "./Media Handler/ImageRenderer";

function App() {
  const {
    isLoading, // Loading state, the SDK needs to reach Auth0 on load
    isAuthenticated,
    error,
    loginWithRedirect: login, // Starts the login flow
    logout: auth0Logout, // Starts the logout flow
    user, // User profile
  } = useAuth0();

  const signup = () =>
    login({ authorizationParams: { screen_hint: "signup" } });

  const logout = () =>
    auth0Logout({ logoutParams: { returnTo: window.location.origin } });

  if (isLoading) return "Loading...";

  return (
    <>
      {isAuthenticated ? (
        <>
          <p>Logged in as {user!.email}</p>

          <h1>User Profile</h1>

          <pre>{JSON.stringify(user, null, 2)}</pre>

          <button onClick={logout}>Logout</button>
        </>
      ) : (
        <>
          {error && <p>Error: {error.message}</p>}

          <button onClick={signup}>Signup</button>

          <button onClick={() => login()}>Login</button>
        </>
      )}

      <div className="h-full flex flex-col gap-[250px] relative top-[200px] mb-[200px] p-10">
        <video src="videos/زيارة.mp4" controls
          className='rounded-2xl w-[500px] h-[600px] object-contain m-auto'></video>
        <video src="videos/3 HOUR STUDY WITH ME  Background noise, Rain Sounds, 10-min break, No Music - Merve (1080p, h264, youtube).mp4"
          controls
          className='border-2 rounded-2xl'></video>
        <ImageRenderer />
      </div>
    </>

  )
    ;
}

export default App;
