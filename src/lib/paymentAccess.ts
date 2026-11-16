import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  isLivePaymentEnabled,
  isPaymentLockMode,
  verifyAdminSessionToken,
} from "@/lib/adminAuth";

export interface ServerPaymentLockState {
  livePaymentEnabled: boolean;
  testPaymentMode: boolean;
  isAdmin: boolean;
  paymentLocked: boolean;
}

/**
 * Server Component 전용 Fail-Closed 결제 잠금 상태 조회
 * - `TOSS_SECRET_KEY`가 `live_`로 시작할 때만 일반 방문자에게 결제 UI를 노출
 * - `test_`, 미설정, 빈 값, 오타 등 그 외 모든 경우 `kr_admin_session` HttpOnly 서명 쿠키 소지자에게만 허용
 */
export function getServerPaymentLockState(): ServerPaymentLockState {
  const livePaymentEnabled = isLivePaymentEnabled();
  if (livePaymentEnabled) {
    return {
      livePaymentEnabled: true,
      testPaymentMode: false,
      isAdmin: false,
      paymentLocked: false,
    };
  }

  const cookieStore = cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const isAdmin = verifyAdminSessionToken(sessionToken);

  return {
    livePaymentEnabled: false,
    testPaymentMode: isPaymentLockMode(),
    isAdmin,
    paymentLocked: !isAdmin,
  };
}
