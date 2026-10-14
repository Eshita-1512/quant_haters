import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { Big_Shoulders, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { UNAUTHORIZED_EVENT } from "@/lib/api";
import { applyBruteForceDom, useBruteForceTheme } from "@/lib/bruteforce";

const display = Big_Shoulders({ variable: "--font-display-face", subsets: ["latin"] });
const sans = IBM_Plex_Sans({ variable: "--font-sans-face", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono-face", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { enabled } = useBruteForceTheme();

  useEffect(() => {
    applyBruteForceDom(enabled);
  }, [enabled]);

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
      <div className={`${display.variable} ${sans.variable} ${mono.variable} min-h-screen font-sans`}>
        <Component {...pageProps} />
      </div>
    </>
  );
}
