import { useEffect } from "react";
import { useRouter } from "next/router";
import { useSession } from "@/lib/session";

export function useRequireAuth() {
  const router = useRouter();
  const { hydrated, token, team } = useSession();

  useEffect(() => {
    if (hydrated && !token) router.replace("/");
  }, [hydrated, token, router]);

  return { ready: hydrated && Boolean(token), team: team ?? "" };
}
