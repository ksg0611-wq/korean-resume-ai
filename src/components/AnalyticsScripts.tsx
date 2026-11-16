"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { syncAnalyticsSourceFromLocation } from "@/lib/analytics";

const GA_MEASUREMENT_ID_REGEX = /^(G|AW|UA)-[A-Za-z0-9-]+$/;

export default function AnalyticsScripts({
  gaId,
}: {
  gaId?: string | null;
}) {
  const pathname = usePathname();
  const cleanGaId =
    typeof gaId === "string" && GA_MEASUREMENT_ID_REGEX.test(gaId.trim())
      ? gaId.trim()
      : "";

  useEffect(() => {
    syncAnalyticsSourceFromLocation();
  }, [pathname]);

  if (!cleanGaId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cleanGaId)}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${cleanGaId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
