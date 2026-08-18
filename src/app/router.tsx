import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import PaginaRaiz from './PaginaRaiz';

const rootRoute = createRootRoute();

const raizRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PaginaRaiz,
});

const routeTree = rootRoute.addChildren([raizRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
