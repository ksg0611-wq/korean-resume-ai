import { NextResponse } from "next/server";
import { timingSafeEqualStrings } from "@/lib/results";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  extractProvidedAdminSecret,
  getConfiguredAdminSecret,
  isAdminRequestAuthorized,
  isLivePaymentEnabled,
  isPaymentLockMode,
} from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET(req: Request) {
  return NextResponse.json(
    {
      authenticated: isAdminRequestAuthorized(req),
      livePaymentEnabled: isLivePaymentEnabled(),
      testPaymentMode: isPaymentLockMode(),
    },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(req: Request) {
  const configuredSecret = getConfiguredAdminSecret();
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured on the server." },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  let providedSecret = extractProvidedAdminSecret(req);
  if (!providedSecret) {
    try {
      const body = await req.json();
      if (typeof body?.secret === "string") {
        providedSecret = body.secret.trim();
      }
    } catch {
      // ignore empty/non-JSON body
    }
  }

  if (!providedSecret || !timingSafeEqualStrings(providedSecret, configuredSecret)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const token = createAdminSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: "Failed to create admin session token." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const res = NextResponse.json(
    {
      success: true,
      authenticated: true,
      livePaymentEnabled: isLivePaymentEnabled(),
      testPaymentMode: isPaymentLockMode(),
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );

  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });

  return res;
}

export async function DELETE() {
  const res = NextResponse.json(
    {
      success: true,
      authenticated: false,
      livePaymentEnabled: isLivePaymentEnabled(),
      testPaymentMode: isPaymentLockMode(),
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );

  res.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}
