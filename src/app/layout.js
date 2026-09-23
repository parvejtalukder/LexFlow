import { Inter } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/context/AuthProvider";
import { Toaster } from "react-hot-toast";

  const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
  });

export const metadata = {
  title: "LexFlow | Emtiaj & Co",
  description: "Law Firm Case & Financial Management",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    // The `dark` class lives on <html> so the dark theme is part of the
    // server-rendered markup: it is in effect before the first paint, and every
    // `dark:` variant in the app keys off it (see `@custom-variant dark` in
    // src/templates/main.css). There is deliberately no theme toggle - the
    // application is dark-only.
    <html
      lang="en"
      suppressHydrationWarning={true}
      className={`${inter.variable} dark h-full bg-gray-950 text-gray-100`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AuthProvider>
          {children}
        </AuthProvider> 
        <Toaster
            position="top-center"
            reverseOrder={false}
          /> 
      </body>
    </html>
  );
}