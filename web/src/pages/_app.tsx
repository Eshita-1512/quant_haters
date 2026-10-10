import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { UNAUTHORIZED_EVENT } from "@/lib/api";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    const onUnauthorized = () => {
      if (router.pathname === "/dashboard") router.replace("/login?expired=1");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  return (
    <>
      <Head>
        <title>BigShort</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={`${geistSans.variable} ${geistMono.variable} min-h-screen font-sans`}>
        <Component {...pageProps} />
      </div>
    </>
  );
}
