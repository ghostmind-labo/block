import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SignedOut } from "./auth";
import { ColorsSwitch } from "./colors";
import { BlockPage, CallbackPage, HomePage, TryPage } from "./pages";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof SignedOut) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});
// A session that ended sends the person back to the first page, where signing in is offered.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.query.state.error instanceof SignedOut && location.pathname !== "/") location.assign("/");
});

const root = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <ColorsSwitch />
    </>
  ),
});
const routes = [
  createRoute({ getParentRoute: () => root, path: "/", component: HomePage }),
  createRoute({ getParentRoute: () => root, path: "/try", component: TryPage }),
  createRoute({ getParentRoute: () => root, path: "/b/$id", component: BlockPage }),
  createRoute({ getParentRoute: () => root, path: "/callback", component: CallbackPage }),
];
const router = createRouter({ routeTree: root.addChildren(routes) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Dev (localhost, block.ghostmind.app) says so in its title, so it is never mistaken for prod.
if (!location.hostname.endsWith(".ghostmind.dev")) document.title = "block dev";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
