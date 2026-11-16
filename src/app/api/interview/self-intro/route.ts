import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  compileInterviewPrepNote,
  formatInterviewNoteText,
  getInterviewSession,
  saveSessionSelfIntro,
} from "@/lib/interviewSession";
import { generateSelfIntroScript } from "@/lib/interviewGenerator";
import { updateOrderInterviewNote } from "@/lib/orders";
import { reportServerError } from "@/lib/alerts";

export const maxDuration = 120;

const MAX_SELF_INTRO_GENERATIONS_PER_SESSION = 5;

/**
 * POST /api/interview/self-intro
 * - 유료 면접 세션(7일) 전용: 1분 자기소개 대본(270~320자) AI 생성 + 세션 및 대비 노트 자동 반영
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId =
      typeof body?.sessionId === "string" ? body.sessionId.trim() : "";

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId가 필요합니다." },
        { status: 400 }
      );
    }

    const session = await getInterviewSession(sessionId);
    if (!session) {
      return NextResponse.json(
        {
          error: "면접 세션이 만료되었거나 존재하지 않습니다.",
          code: "SESSION_EXPIRED",
        },
        { status: 410 }
      );
    }

    if (session.isFree) {
      return NextResponse.json(
        {
          error:
            "AI 1분 자기소개 대본 자동 생성은 유료 시뮬레이터에서 이용할 수 있습니다. (무료 체험에서는 대본 직접 작성 후 1회 채점 테스트만 가능)",
          code: "FREE_SELF_INTRO_LOCKED",
        },
        { status: 403 }
      );
    }

    if ((session.selfIntroGenCount ?? 0) >= MAX_SELF_INTRO_GENERATIONS_PER_SESSION) {
      return NextResponse.json(
        {
          error: `세션당 1분 자기소개 AI 생성 한도(${MAX_SELF_INTRO_GENERATIONS_PER_SESSION}회)를 초과했습니다. 아래 대본 편집창에서 수정 후 채점을 이용해 주세요.`,
          code: "SELF_INTRO_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "서버 AI 설정이 완료되지 않았습니다." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const introRes = await generateSelfIntroScript({
      genAI,
      jobCategory: session.jobCategory,
      resumeText: session.resumeText,
      isFree: false,
      jobContext: session.jobContext ?? null,
    });

    const updatedSession = await saveSessionSelfIntro({
      sessionId: session.sessionId,
      script: introRes.script,
      hookSummary: introRes.hookSummary,
      speakingTips: introRes.speakingTips,
    });

    if (updatedSession && !updatedSession.isFree && updatedSession.orderId) {
      const updatedNote = compileInterviewPrepNote(updatedSession);
      const updatedText = formatInterviewNoteText(updatedNote);
      await updateOrderInterviewNote({
        orderId: updatedSession.orderId,
        interviewSessionId: updatedSession.sessionId,
        interviewNote: updatedNote,
        text: updatedText,
      });
    }

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      script: introRes.script,
      hookSummary: introRes.hookSummary,
      speakingTips: introRes.speakingTips,
      charCount: introRes.script.length,
      estimatedSpeechSeconds: Math.max(
        1,
        Math.round(introRes.script.length / 5.2)
      ),
      usedModel: introRes.usedModel,
      durationMs: introRes.durationMs,
      session: updatedSession ?? session,
    });
  } catch (error) {
    console.error("[POST /api/interview/self-intro] Error:", error);
    await reportServerError({
      route: "/api/interview/self-intro",
      statusCode: 500,
      error,
    });
    return NextResponse.json(
      { error: "1분 자기소개 대본 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
