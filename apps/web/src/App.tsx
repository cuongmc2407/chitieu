import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import AppLayout from "./layout/AppLayout";
import Login from "./routes/Login";
import QuickEntry from "./routes/QuickEntry";

const History = lazy(() => import("./routes/History"));
const Reports = lazy(() => import("./routes/Reports"));
const Categories = lazy(() => import("./routes/Categories"));
const Settings = lazy(() => import("./routes/Settings"));

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-6 text-center text-sm text-slate-400">Đang tải…</div>}>{children}</Suspense>;
}

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <QuickEntry /> },
      {
        path: "/history",
        element: (
          <LazyPage>
            <History />
          </LazyPage>
        ),
      },
      {
        path: "/reports",
        element: (
          <LazyPage>
            <Reports />
          </LazyPage>
        ),
      },
      {
        path: "/categories",
        element: (
          <LazyPage>
            <Categories />
          </LazyPage>
        ),
      },
      {
        path: "/settings",
        element: (
          <LazyPage>
            <Settings />
          </LazyPage>
        ),
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
