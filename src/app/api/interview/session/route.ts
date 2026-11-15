import { NextResponse } from "next/server";
import {
  buildResultUrl,
  findOrderById,
  hashResultToken,
  timingSafeEqualStrings,
  verifyAndGetStoredResult,
} from "@/lib/results";
import {
  getInterviewSession,
  type InterviewSessionRecord,
} from "@/lib/interviewSession";
import { buildFreeEvaluationResponse } from "@/lib/interviewRubric";
import { reportServerError } from "@/lib/alerts";

export const dynamic = "force-dynamic";

const SESSION_SECURITY_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

function sanitizeFreeSessionForResponse(
  session: InterviewSessionRecord
): InterviewSessionRecord {
  const sanitizedThreads: InterviewSessionRecord["threads"] = {};
  for (const [qId, thread] of Object.entries(session.threads || {})) {
    sanitizedThreads[qId] = {
      ...thread,
      initialEvaluation: thread.initialEvaluation
        ? buildFreeEvaluationResponse(thread.initialEvaluation)
        : null,
    };
  }
  return {
    ...session,
    threads: sanitizedThreads,
  };
}

/**
 * 진행 중인 면접 세션 복구 엔드포인트 (유료 7일 재열람 토큰 이어하기 / 무료 2시간 새로고침 복구)
 * - 유료 세션은 order.resultTokenHash + token 상수 시간 검증 통과 시에만 반환
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionIdParam = url.searchParams.get("sessionId")?.trim() || "";
    const orderIdParam = url.searchParams.get("orderId")?.trim() || "";
    const tokenParam =
      url.searchParams.get("token")?.trim() ||
      req.headers.get("x-result-token")?.trim() ||
      "";

    // 1) 재열람 토큰(orderId + token) 기반 복구
    if (orderIdParam && tokenParam) {
      const outcome = await verifyAndGetStoredResult(orderIdParam, tokenParam);
      if (outcome.status === 403) {
        return NextResponse.json(
          { error: "유효하지 않은 재열람 인증 토큰입니다.", code: "FORBIDDEN" },
          { status: 403, headers: SESSION_SECURITY_HEADERS }
        );
      }
      if (outcome.status === 410) {
        return NextResponse.json(
          { error: "면접 세션 및 결과 보관 기간(7일)이 만료되었습니다.", code: "GONE" },
          { status: 410, headers: SESSION_SECURITY_HEADERS }
        );
      }

      const targetSessionId =
        outcome.order.activeSessionId || outcome.result.interviewSessionId || sessionIdParam;
      if (!targetSessionId) {
        return NextResponse.json(
          { error: "연결된 모의면접 세션을 찾을 수 없습니다.", code: "SESSION_NOT_FOUND" },
          { status: 404, headers: SESSION_SECURITY_HEADERS }
        );
      }

      const session = await getInterviewSession(targetSessionId);
      if (!session) {
        return NextResponse.json(
          { error: "면접 세션 보관 기간(7일)이 만료되었습니다.", code: "SESSION_EXPIRED" },
          { status: 410, headers: SESSION_SECURITY_HEADERS }
        );
      }

      return NextResponse.json(
        {
          success: true,
          session,
          order: {
            orderId: outcome.order.orderId,
            status: outcome.order.status,
            remainingGenerations: outcome.order.remainingGenerations,
            resultUrl: buildResultUrl(outcome.order.orderId, outcome.result.token),
            resultExpiresAt: outcome.result.expiresAt,
            receiptUrl: outcome.order.receiptUrl ?? null,
          },
        },
        { status: 200, headers: SESSION_SECURITY_HEADERS }
      );
    }

    // 2) sessionId 기반 조회
    if (!sessionIdParam) {
      return NextResponse.json(
        { error: "sessionId 또는 orderId+token 파라미터가 필요합니다." },
        { status: 400, headers: SESSION_SECURITY_HEADERS }
      );
    }

    const session = await getInterviewSession(sessionIdParam);
    if (!session) {
      return NextResponse.json(
        { error: "면접 세션이 만료되었거나 존재하지 않습니다.", code: "SESSION_EXPIRED" },
        { status: 410, headers: SESSION_SECURITY_HEADERS }
      );
    }

    if (session.isFree) {
      return NextResponse.json(
        {
          success: true,
          session: sanitizeFreeSessionForResponse(session),
        },
        { status: 200, headers: SESSION_SECURITY_HEADERS }
      );
    }

    // 유료 세션인데 orderId/token을 함께 주지 않은 경우 인증 차단
    if (!session.orderId || !tokenParam) {
      return NextResponse.json(
        { error: "유료 세션 접근에는 유효한 결과 토큰이 필요합니다.", code: "FORBIDDEN" },
        { status: 403, headers: SESSION_SECURITY_HEADERS }
      );
    }

    const orderFound = await findOrderById(session.orderId);
    if (!orderFound || !orderFound.order.resultTokenHash) {
      return NextResponse.json(
        { error: "유효한 주문 정보를 찾을 수 없습니다.", code: "FORBIDDEN" },
        { status: 403, headers: SESSION_SECURITY_HEADERS }
      );
    }

    const candidateHash = await hashResultToken(tokenParam);
    if (!timingSafeEqualStrings(candidateHash, orderFound.order.resultTokenHash)) {
      return NextResponse.json(
        { error: "결과 인증 토큰이 일치하지 않습니다.", code: "FORBIDDEN" },
        { status: 403, headers: SESSION_SECURITY_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        session,
        order: {
          orderId: orderFound.order.orderId,
          status: orderFound.order.status,
          remainingGenerations: orderFound.order.remainingGenerations,
          resultUrl: buildResultUrl(orderFound.order.orderId, tokenParam),
          resultExpiresAt: orderFound.order.resultExpiresAt ?? null,
          receiptUrl: orderFound.order.receiptUrl ?? null,
        },
      },
      { status: 200, headers: SESSION_SECURITY_HEADERS }
    );
  } catch (error) {
    console.error("[GET /api/interview/session] Error:", error);
    await reportServerError({
      route: "/api/interview/session",
      statusCode: 500,
      error,
      serviceType: "interview",
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: SESSION_SECURITY_HEADERS }
    );
  }
}
