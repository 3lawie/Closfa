import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'

// StartClient resolves the router from the server-rendered payload itself, so
// there is nothing to construct or pass here. A `createRouter()` call used to
// sit above this line, its result unused — a second, detached router instance
// built on every page load and immediately discarded.
hydrateRoot(document, <StartClient/>)
