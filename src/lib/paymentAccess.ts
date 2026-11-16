import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  isTestPaymentMode,
  verifyAdminSessionToken,
} from "@/lib/adminAuth";

export interface ServerPaymentLockState {
  testPaymentMode: boolean;
  isAdmin: boolean;
  paymentLocked: boolean;
}

/**
 * Server Component 전용 테스트 결제 잠금 상태 조회
 * - TOSS_SECRET_KEY가 `test_`로 시작할 때만 잠금 모드 활성화
 * - `kr_admin_session` HttpOnly 서명 쿠키가 유효한 관리자는 결제 UI 테스트 가능
 */
export function getServerPaymentLockState(): ServerPaymentLockState {
  const testPaymentMode = isTestPaymentMode();
  if (!testPaymentMode) {
    return {
      testPaymentMode: false,
      isAdmin: false,
      paymentLocked: false,
    };
  }

  const cookieStore = cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const isAdmin = verifyAdminSessionToken(sessionToken);

  return {
    testPaymentMode: true,
    isAdmin,
    paymentLocked: !isAdmin,
  };
}
