/**
 * App.tsx — Platform Router
 *
 * File này chỉ làm một việc duy nhất: phát hiện môi trường (Electron vs Web)
 * và render đúng UI cho từng nền tảng.
 *
 * ┌──────────────────────────────────────────────┐
 * │  Electron  →  src/desktop/AppDesktop.tsx     │
 * │  Browser   →  src/webapp/AppWeb.tsx          │
 * └──────────────────────────────────────────────┘
 *
 * Để thêm tính năng:
 *   - Tính năng chỉ cho Desktop → chỉnh AppDesktop.tsx
 *   - Tính năng chỉ cho Web     → chỉnh AppWeb.tsx
 *   - Tính năng dùng chung      → đặt trong src/shared/
 */
import React from "react";
import { platform } from "./src/shared/platformBridge";

const AppDesktop = React.lazy(() => import("./src/desktop/AppDesktop"));
const AppWeb     = React.lazy(() => import("./src/webapp/AppWeb"));

const App: React.FC = () => {
  if (platform.isElectron) {
    return (
      <React.Suspense fallback={null}>
        <AppDesktop />
      </React.Suspense>
    );
  }

  return (
    <React.Suspense fallback={null}>
      <AppWeb />
    </React.Suspense>
  );
};

export default App;
