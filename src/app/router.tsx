import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import TelaLogin from '@/features/auth/components/TelaLogin';

const rootRoute = createRootRoute();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: TelaLogin,
});

const routeTree = rootRoute.addChildren([loginRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
