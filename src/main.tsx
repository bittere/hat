import "@fontsource-variable/geist";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { AnchoredToastProvider, ToastProvider } from "./components/ui/toast";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<ThemeProvider defaultTheme="system">
			<ToastProvider>
				<AnchoredToastProvider>
					<App />
				</AnchoredToastProvider>
			</ToastProvider>
		</ThemeProvider>
	</React.StrictMode>
);
