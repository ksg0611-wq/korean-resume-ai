import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  reserveFreeRateLimit,
  type FreeRateLimitReservation,
} from "@/lib/redis";
import {
  DEFAULT_INTERVIEW_JOB_CATEGORY,
  FREE_LIMITS,
  FREE_LIMIT_WINDOW,
  INTERVIEW_FREE_SESSION_TTL_SECONDS,
  INTERVIEW_PAID_SESSION_TTL_SECONDS,
  INTERVIEW_TOTAL_QUESTIONS,
  normalizeEmail,
} from "@/lib/policy";
import {
  beginPaidGeneration,
  completePaidGeneration,
  handlePaidGenerationFailure,
} from "@/lib/orders";
import { sendResultEmail } from "@/lib/email";
import { generateInterviewQuestionSet } from "@/lib/interviewGenerator";
import {
  compileInterviewPrepNote,
  createInterviewSession,
  formatInterviewNoteText,
  type InterviewJobContext,
} from "@/lib/interviewSession";
import { getJobDetail } from "@/lib/db/jobs";
import { BUSINESS_INFO } from "@/lib/siteConfig";
import { reportServerError } from "@/lib/alerts";

export const maxDuration = 60;

export async function POST(req: Request) {
  let parsedOrderId: string | null = null;
  let freeReservation: FreeRateLimitReservation | null = null;

  try {
    const body = await req.json();
    const rawJobCategory =
      typeof body?.jobCategory === "string" && body.jobCategory.trim()
        ? body.jobCategory.trim()
        : DEFAULT_INTERVIEW_JOB_CATEGORY;
    const resumeText =
      typeof body?.resumeText === "string" ? body.resumeText.trim() : "";
    const isFree = body?.isFree;
    parsedOrderId =
      typeof body?.orderId === "string" && body.orderId.trim()
        ? body.orderId.trim()
        : null;
    const optionalEmail = normalizeEmail(body?.email);
    const rawJobSn = Number(body?.jobSn);
    const validJobSn =
      Number.isFinite(rawJobSn) && rawJobSn > 0 ? Math.trunc(rawJobSn) : null;

    if (typeof isFree !== "boolean" || !resumeText) {
      return NextResponse.json(
        { error: "자기소개서 본문과 이용 방식(isFree)을 확인해 주세요." },
        { status: 400 }
      );
    }

    if (resumeText.length < 50) {
      return NextResponse.json(
        { error: "정확한 맞춤형 면접 질문 생성을 위해 자기소개서를 최소 50자 이상 입력해 주세요." },
        { status: 400 }
      );
    }

    if (resumeText.length > 4000) {
      return NextResponse.json(
        { error: "자기소개서 입력은 최대 4,000자까지 지원합니다." },
        { status: 400 }
      );
    }

    if (!isFree && !parsedOrderId) {
      return NextResponse.json(
        { error: "유료 이용을 위해 주문번호(orderId)가 필요합니다." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      await reportServerError({
        route: "/api/interview/generate",
        statusCode: 500,
        error: "GEMINI_API_KEY is not configured",
        orderId: parsedOrderId,
        serviceType: "interview",
      });
      return NextResponse.json(
        { error: "서버 AI 설정이 완료되지 않았습니다." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    let verifiedJobContext: InterviewJobContext | null = null;
    if (validJobSn) {
      try {
        const job = await getJobDetail(validJobSn);
        if (job) {
          verifiedJobContext = {
            sn: job.sn,
            instName: job.inst_name,
            title: job.title,
            ncsNames: job.ncs_names || [],
            qualification: job.qualification ?? null,
            preference: job.preference ?? null,
            procedureInfo: job.procedure_info ?? null,
          };
        }
      } catch (jobErr) {
        console.warn("[/api/interview/generate] Job context lookup failed:", jobErr);
      }
    }

    // ── 유료 이용권 경로 (15문항 생성 + 7일 세션 + 즉시 result:* 대비 노트 생성 및 이메일 발송) ──
    if (!isFree && parsedOrderId) {
      const begin = await beginPaidGeneration({
        orderId: parsedOrderId,
        serviceType: "interview",
      });

      if (!begin.ok) {
        if (begin.code === "REFUND_PENDING") {
          return NextResponse.json(
            {
              error: begin.message,
              code: begin.code,
              refundPending: true,
              refunded: false,
              supportEmail: BUSINESS_INFO.email,
              kakaoChannelUrl: BUSINESS_INFO.kakaoChannelUrl,
            },
            { status: begin.status }
          );
        }
        return NextResponse.json(
          { error: begin.message, code: begin.code },
          { status: begin.status }
        );
      }

      const order = {
        ...begin.order,
        email: begin.order.email || optionalEmail,
      };

      try {
        const genOutcome = await generateInterviewQuestionSet({
          genAI,
          jobCategory: rawJobCategory,
          resumeText,
          isFree: false,
          jobContext: verifiedJobContext,
        });

        const session = await createInterviewSession({
          isFree: false,
          orderId: parsedOrderId,
          jobCategory: rawJobCategory,
          jobContext: verifiedJobContext,
          resumeText,
          questions: genOutcome.questions,
        });

        const initialNote = compileInterviewPrepNote(session);
        const noteText = formatInterviewNoteText(initialNote);

        const completed = await completePaidGeneration({
          orderKey: begin.orderKey,
          order,
          title: `공공기관 AI 면접 대비 노트 (${rawJobCategory})`,
          text: noteText,
          usedModel: genOutcome.usedModel,
          interviewSessionId: session.sessionId,
          interviewNote: initialNote,
          jobTitle: rawJobCategory,
        });

        const emailOutcome = await sendResultEmail({
          to: completed.order.email,
          orderId: completed.order.orderId,
          serviceType: "interview",
          resultUrl: completed.resultUrl,
          expiresAt: completed.resultExpiresAt,
          receiptUrl: completed.order.receiptUrl ?? null,
        });

        return NextResponse.json({
          success: true,
          isFree: false,
          sessionId: session.sessionId,
          ttlSeconds: INTERVIEW_PAID_SESSION_TTL_SECONDS,
          expiresAt: session.expiresAt,
          maxEvaluations: session.maxEvaluations,
          usedEvaluations: session.usedEvaluations,
          remainingEvaluations: session.remainingEvaluations,
          jobCategory: rawJobCategory,
          questions: session.questions,
          lockedQuestionCount: 0,
          text: noteText,
          interviewNote: initialNote,
          usedModel: genOutcome.usedModel,
          attempts: genOutcome.attempts,
          durationMs: genOutcome.durationMs,
          resultToken: completed.resultToken,
          order: {
            orderId: completed.order.orderId,
            serviceType: completed.order.serviceType,
            status: completed.order.status,
            usedCount: completed.order.usedCount,
            remainingGenerations: completed.order.remainingGenerations,
            doneAt: completed.order.doneAt,
            resultUrl: completed.resultUrl,
            resultExpiresAt: completed.resultExpiresAt,
            receiptUrl: completed.order.receiptUrl ?? null,
            emailSent: emailOutcome.sent,
          },
        });
      } catch (genError) {
        await reportServerError({
          route: "/api/interview/generate",
          statusCode: 500,
          error: genError,
          orderId: parsedOrderId,
          serviceType: "interview",
          extra: { stage: "paid_interview_question_set" },
        });

        const failure = await handlePaidGenerationFailure({
          orderKey: begin.orderKey,
          order,
          error: genError,
          route: "/api/interview/generate",
        });

        if (failure.outcome === "refunded") {
          return NextResponse.json(
            {
              error: "생성 오류로 결제가 자동 전액 환불되었습니다",
              code: "AUTO_REFUNDED",
              refunded: true,
              order: {
                orderId: failure.order.orderId,
                status: failure.order.status,
                paid: failure.order.paid,
                remainingGenerations: failure.order.remainingGenerations,
                refundedAt: failure.order.refundedAt,
                refundAmount: failure.order.refundAmount,
              },
            },
            { status: 500 }
          );
        }

        if (failure.outcome === "refund_failed") {
          return NextResponse.json(
            {
              error:
                "환불 처리 중입니다(영업일 기준 1~2일 내 처리). 지연 시 고객센터로 문의해 주세요.",
              refundPending: true,
              refunded: false,
              supportEmail: BUSINESS_INFO.email,
              kakaoChannelUrl: BUSINESS_INFO.kakaoChannelUrl,
              order: {
                orderId: failure.order.orderId,
                status: failure.order.status,
              },
            },
            { status: 502 }
          );
        }

        return NextResponse.json(
          {
            error:
              order.planType === "bundle_companion"
                ? "통합 패키지 내 면접 질문 초기 생성이 일시 지연되었습니다(interview_pending). 횟수는 차감되지 않았으니 잠시 후 다시 시도해 주세요. 장애 지속 시 고객센터 확인 후 차액 부분 환불을 도와드립니다."
                : "일시적인 생성 오류로 실패했습니다. 결제 횟수는 차감되지 않았으니 잠시 후 다시 시도해 주세요.",
            code: "GENERATION_RETRY_ALLOWED",
            interviewPending: order.planType === "bundle_companion",
            refunded: false,
          },
          { status: 503 }
        );
      }
    }

    // ── 무료 체험 경로 (일 1회 제한 + 질문 3개 + 2시간 세션 + 오류 시 횟수 복구) ──
    const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1")
      .split(",")[0]
      .trim();
    freeReservation = await reserveFreeRateLimit({
      key: `ratelimit:interview:ip:${ip}`,
      maxRequests: FREE_LIMITS.interview,
      window: FREE_LIMIT_WINDOW,
    });

    if (!freeReservation.allowed) {
      return NextResponse.json(
        {
          error: `하루 무료 면접 체험 한도(${FREE_LIMITS.interview}회)를 초과했습니다.`,
          code: "FREE_LIMIT_EXCEEDED",
          freeRemaining: 0,
        },
        { status: 429 }
      );
    }

    const freeOutcome = await generateInterviewQuestionSet({
      genAI,
      jobCategory: rawJobCategory,
      resumeText,
      isFree: true,
      jobContext: verifiedJobContext,
    });

    const freeSession = await createInterviewSession({
      isFree: true,
      orderId: null,
      jobCategory: rawJobCategory,
      jobContext: verifiedJobContext,
      resumeText,
      questions: freeOutcome.questions,
    });

    const freeNoteText = freeSession.questions
      .map((q) => `Q${q.number}. [${q.ncsCompetency}] ${q.question}`)
      .join("\n\n");

    return NextResponse.json({
      success: true,
      isFree: true,
      freeRemaining: freeReservation.remaining,
      sessionId: freeSession.sessionId,
      ttlSeconds: INTERVIEW_FREE_SESSION_TTL_SECONDS,
      expiresAt: freeSession.expiresAt,
      maxEvaluations: freeSession.maxEvaluations,
      usedEvaluations: freeSession.usedEvaluations,
      remainingEvaluations: freeSession.remainingEvaluations,
      jobCategory: rawJobCategory,
      questions: freeSession.questions,
      lockedQuestionCount: Math.max(
        0,
        INTERVIEW_TOTAL_QUESTIONS - freeSession.questions.length
      ),
      text: freeNoteText,
      usedModel: freeOutcome.usedModel,
      attempts: freeOutcome.attempts,
      durationMs: freeOutcome.durationMs,
    });
  } catch (error: any) {
    const restoredRemaining = freeReservation?.reserved
      ? await freeReservation.refund()
      : undefined;

    console.error("[POST /api/interview/generate] Error:", error);
    await reportServerError({
      route: "/api/interview/generate",
      statusCode: 500,
      error,
      orderId: parsedOrderId,
      serviceType: "interview",
    });

    return NextResponse.json(
      {
        error: "면접 질문 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        freeQuotaRestored: Boolean(freeReservation?.reserved),
        ...(typeof restoredRemaining === "number"
          ? { freeRemaining: restoredRemaining }
          : {}),
      },
      { status: 500 }
    );
  }
}
