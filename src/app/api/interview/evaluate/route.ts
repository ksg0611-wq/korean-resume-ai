import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  commitInterviewEvaluation,
  compileInterviewPrepNote,
  formatInterviewNoteText,
  refundInterviewEvaluation,
  reserveInterviewEvaluation,
} from "@/lib/interviewSession";
import {
  evaluateInterviewAnswerWithAI,
  SELF_INTRO_QUESTION,
  SELF_INTRO_QUESTION_ID,
} from "@/lib/interviewGenerator";
import {
  buildFreeEvaluationResponse,
  buildInterviewEvaluationReport,
} from "@/lib/interviewRubric";
import { updateOrderInterviewNote } from "@/lib/orders";
import { reportServerError } from "@/lib/alerts";

import { recordFreeEndpointCall } from "@/lib/freeMetrics";

export const maxDuration = 120;

export async function POST(req: Request) {
  let reservedSessionId: string | null = null;
  let reservedLockToken: string | null = null;
  let completedCommit = false;

  try {
    const body = await req.json();
    const sessionId =
      typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const questionId =
      typeof body?.questionId === "string" ? body.questionId.trim() : "";
    const rawDepth = Number(body?.depth ?? 0);
    const depth =
      rawDepth === 0 || rawDepth === 1 || rawDepth === 2 || rawDepth === 3
        ? (rawDepth as 0 | 1 | 2 | 3)
        : null;
    const userAnswer =
      typeof body?.userAnswer === "string" ? body.userAnswer.trim() : "";

    if (!sessionId || !questionId || depth === null) {
      return NextResponse.json(
        { error: "sessionId, questionId, depth(0~3) 값이 필요합니다." },
        { status: 400 }
      );
    }

    const isSelfIntroMode = questionId === SELF_INTRO_QUESTION_ID;
    const minAnswerChars = isSelfIntroMode ? 80 : 100;
    const maxAnswerChars = isSelfIntroMode ? 600 : 800;

    if (userAnswer.length < minAnswerChars || userAnswer.length > maxAnswerChars) {
      return NextResponse.json(
        {
          error: isSelfIntroMode
            ? `1분 자기소개 대본은 공백 포함 80자 이상 600자 이내로 입력해 주세요. (현재 ${userAnswer.length}자)`
            : `면접 답변은 공백 포함 100자 이상 800자 이내로 입력해 주세요. (현재 ${userAnswer.length}자)`,
          code: "INVALID_ANSWER_LENGTH",
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "서버 AI 설정이 완료되지 않았습니다." },
        { status: 500 }
      );
    }

    // 1) Redis Lua 원자 차감 (무료 1회 / 유료 최대 45회 + 60초 동시 요청 잠금)
    const reservation = await reserveInterviewEvaluation({ sessionId, depth });
    if (!reservation.ok) {
      return NextResponse.json(
        {
          error: reservation.message,
          code: reservation.code,
        },
        { status: reservation.status }
      );
    }

    reservedSessionId = sessionId;
    reservedLockToken = reservation.lockToken;
    const { session, quota } = reservation;

    // 2) 문항 및 꼬리질문 단계 유효성 검증 (1분 자기소개 가상 문항 포함)
    const targetQuestion = isSelfIntroMode
      ? SELF_INTRO_QUESTION
      : session.questions.find((q) => q.id === questionId);
    if (!targetQuestion) {
      const refunded = await refundInterviewEvaluation({
        sessionId,
        lockToken: reservedLockToken,
      });
      completedCommit = true;
      return NextResponse.json(
        {
          error: "해당 문항을 세션에서 찾을 수 없습니다.",
          code: "QUESTION_NOT_FOUND",
          remainingEvaluations: refunded?.remaining ?? quota.remaining + 1,
        },
        { status: 400 }
      );
    }

    const thread = session.threads[questionId];
    let currentPromptQuestion = targetQuestion.question;
    const priorHistory: Array<{
      depth: number;
      question: string;
      userAnswer: string;
    }> = [];

    if (depth >= 1) {
      const targetFollowUp = thread?.followUps?.find((f) => f.depth === depth);
      if (!targetFollowUp) {
        const refunded = await refundInterviewEvaluation({
          sessionId,
          lockToken: reservedLockToken,
        });
        completedCommit = true;
        return NextResponse.json(
          {
            error: `${depth}단계 꼬리질문이 아직 생성되지 않았습니다. 이전 단계 답변을 먼저 채점해 주세요.`,
            code: "FOLLOWUP_NOT_READY",
            remainingEvaluations: refunded?.remaining ?? quota.remaining + 1,
          },
          { status: 400 }
        );
      }
      currentPromptQuestion = targetFollowUp.question;

      if (thread?.initialAnswer) {
        priorHistory.push({
          depth: 0,
          question: targetQuestion.question,
          userAnswer: thread.initialAnswer,
        });
      }
      for (const prev of thread?.followUps || []) {
        if (prev.depth < depth && prev.userAnswer) {
          priorHistory.push({
            depth: prev.depth,
            question: prev.question,
            userAnswer: prev.userAnswer,
          });
        }
      }
    }

    // 3) AI 채점 + 일관성 대조 + 다음 꼬리질문 생성 (3~5초 목표: gemini-3.8-flash + thinkingLevel: low)
    const genAI = new GoogleGenerativeAI(apiKey);
    const aiRes = await evaluateInterviewAnswerWithAI({
      genAI,
      jobCategory: session.jobCategory,
      question: targetQuestion,
      currentPromptQuestion,
      depth,
      resumeText: session.resumeText,
      userAnswer,
      priorHistory,
      generateNextFollowUp: depth < 3,
      jobContext: session.jobContext ?? null,
    });

    const allowedSourceText = [
      session.resumeText,
      userAnswer,
      ...priorHistory.map((h) => h.userAnswer),
    ]
      .filter(Boolean)
      .join("\n");

    const fullReport = buildInterviewEvaluationReport({
      questionKind: targetQuestion.kind,
      resumeText: session.resumeText,
      userAnswer,
      allowedSourceText,
      depth,
      aiEval: aiRes.evaluation,
    });

    // 4) 세션 스레드 저장 + 락 해제
    const updatedSession = await commitInterviewEvaluation({
      session,
      questionId,
      depth,
      userAnswer,
      report: fullReport,
      quota,
      lockToken: reservedLockToken,
    });
    completedCommit = true;

    if (updatedSession.isFree) {
      await recordFreeEndpointCall("interview_eval");
    }

    // 5) 유료 주문인 경우 result:{orderId} 면접 대비 노트 자동 갱신 (기존 7일 TTL·토큰 보존)
    let noteUpdated = false;
    if (!updatedSession.isFree && updatedSession.orderId) {
      const updatedNote = compileInterviewPrepNote(updatedSession);
      const updatedText = formatInterviewNoteText(updatedNote);
      const savedNote = await updateOrderInterviewNote({
        orderId: updatedSession.orderId,
        interviewSessionId: updatedSession.sessionId,
        interviewNote: updatedNote,
        text: updatedText,
      });
      noteUpdated = Boolean(savedNote);
    }

    const clientReport = updatedSession.isFree
      ? buildFreeEvaluationResponse(fullReport)
      : fullReport;

    return NextResponse.json({
      success: true,
      sessionId: updatedSession.sessionId,
      questionId,
      depth,
      isFree: updatedSession.isFree,
      maxEvaluations: updatedSession.maxEvaluations,
      usedEvaluations: updatedSession.usedEvaluations,
      remainingEvaluations: updatedSession.remainingEvaluations,
      noteUpdated,
      usedModel: aiRes.usedModel,
      attempts: aiRes.attempts,
      durationMs: aiRes.durationMs,
      report: clientReport,
    });
  } catch (error: any) {
    let restoredRemaining: number | undefined;
    if (reservedSessionId && reservedLockToken && !completedCommit) {
      try {
        const refunded = await refundInterviewEvaluation({
          sessionId: reservedSessionId,
          lockToken: reservedLockToken,
        });
        if (refunded) {
          restoredRemaining = refunded.remaining;
        }
      } catch (refundErr) {
        console.error("[POST /api/interview/evaluate] Refund failed:", refundErr);
      }
    }

    console.error("[POST /api/interview/evaluate] Error:", error);
    await reportServerError({
      route: "/api/interview/evaluate",
      statusCode: 500,
      error,
      serviceType: "interview",
      extra: { sessionId: reservedSessionId },
    });

    return NextResponse.json(
      {
        error: "답변 채점 중 오류가 발생했습니다. 횟수는 차감되지 않았으니 다시 시도해 주세요.",
        quotaRestored: typeof restoredRemaining === "number",
        ...(typeof restoredRemaining === "number"
          ? { remainingEvaluations: restoredRemaining }
          : {}),
      },
      { status: 500 }
    );
  }
}
