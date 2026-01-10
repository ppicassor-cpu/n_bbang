import React from "react";
import { AppProvider } from "./src/app/providers/AppContext";
import RootNavigator from "./src/app/navigation/RootNavigator";

export default function App() {
  return (
    <AppProvider>
      <RootNavigator />
    </AppProvider>
  );
}
