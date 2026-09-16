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
    <html
      lang="en"
      suppressHydrationWarning={true}
      className={`${inter.variable} h-full bg-white text-black`}
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