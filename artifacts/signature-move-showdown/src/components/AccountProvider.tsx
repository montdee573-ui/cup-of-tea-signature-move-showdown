import { useEffect, useRef, type ReactNode } from "react";
import { ClerkProvider, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function ClearAccountCache() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== id) queryClient.clear();
    previous.current = id;
  }), [addListener, queryClient]);
  return null;
}

export default function AccountProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    appearance={{
      theme: dark,
      cssLayerName: "clerk",
      options: {
        logoPlacement: "inside",
        logoLinkUrl: basePath || "/",
        logoImageUrl: `${window.location.origin}${basePath}/account-logo.svg`,
      },
      variables: {
        colorPrimary: "#58ddec", colorForeground: "#f5f2fb",
        colorMutedForeground: "#b2b0c4", colorBackground: "#10101a",
        colorInput: "#090911", colorInputForeground: "#f5f2fb",
        colorDanger: "#ff929b", colorNeutral: "#f5f2fb",
        fontFamily: "Manrope, sans-serif", borderRadius: "0.75rem",
      },
      elements: {
        rootBox: { width: "100%", display: "flex", justifyContent: "center" },
        cardBox: { backgroundColor: "#10101a", width: "440px", maxWidth: "100%" },
        card: { background: "transparent" }, footer: { background: "transparent" },
        headerTitle: { color: "#f5f2fb" }, headerSubtitle: { color: "#b2b0c4" },
        formFieldLabel: { color: "#f5f2fb" }, footerActionLink: { color: "#58ddec" },
        footerActionText: { color: "#b2b0c4" }, dividerText: { color: "#b2b0c4" },
        socialButtonsBlockButtonText: { color: "#f5f2fb" },
        identityPreviewEditButton: { color: "#58ddec" },
        formFieldSuccessText: { color: "#81e8b3" }, alertText: { color: "#ff929b" },
        formFieldInput: { color: "#f5f2fb", backgroundColor: "#090911" },
      },
    }}
    localization={{
      signIn: { start: { title: "Viral Reel promoter sign-in", subtitle: "Access your private promoter account" } },
      signUp: { start: { title: "Create your Viral Reel account", subtitle: "Account creation is not approval to work or earn" } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  ><ClearAccountCache />{children}</ClerkProvider>;
}
