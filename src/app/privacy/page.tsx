import type { Metadata } from "next";
import PolicyShell, { PolicySection } from "@/components/PolicyShell";
import { BUSINESS_INFO } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "개인정보처리방침 | Korea Resume AI",
  description: "Korea Resume AI 개인정보처리방침 (처리위탁 및 국외 이전 고지 포함)",
  alternates: { canonical: "/privacy" },
};

const th = "border border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-800 align-top";
const td = "border border-gray-200 px-3 py-2 align-top";

export default function PrivacyPage() {
  const b = BUSINESS_INFO;
  return (
    <PolicyShell title="개인정보처리방침">
      <p>
        {b.companyName}(이하 &quot;회사&quot;)는 {b.serviceName} 서비스(이하 &quot;서비스&quot;) 제공을 위해 필요한 최소한의 정보만 처리하며, 회원가입 없이 이용할 수 있습니다.
      </p>

      <PolicySection heading="1. 수집하는 개인정보 항목 및 목적">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs sm:text-sm">
            <thead>
              <tr>
                <th className={th}>구분</th>
                <th className={th}>항목</th>
                <th className={th}>목적</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}>AI 생성 이용</td>
                <td className={td}>이용자가 입력한 자기소개서·경험 메모 텍스트, 모의면접 답변 텍스트, 지원 직무명</td>
                <td className={td}>AI 자기소개서 초안·진단, 공공기관 모의면접 질문·답변 채점 및 일관성 검증·대비 노트 생성</td>
              </tr>
              <tr>
                <td className={td}>유료 결제</td>
                <td className={td}>주문번호, 결제 상품·금액, 결제 승인·환불 결과, 이메일 주소 (카드번호 등 결제수단 정보는 토스페이먼츠 결제창에서 직접 처리되며 회사는 수집·저장하지 않습니다)</td>
                <td className={td}>결제 승인·자동 환불 처리, 이용권 관리, 생성 결과 및 면접 세션 7일 재열람·이어하기 링크·영수증 안내 발송</td>
              </tr>
              <tr>
                <td className={td}>무료 체험 제한</td>
                <td className={td}>접속 IP 주소</td>
                <td className={td}>무료 체험 횟수 제한(부정 이용 방지)</td>
              </tr>
              <tr>
                <td className={td}>채용공고 새 공고 알림 신청 (선택)</td>
                <td className={td}>이메일 주소, 공고(기관) 일련번호</td>
                <td className={td}>해당 기관 신규 채용공고 오픈 알림 발송</td>
              </tr>
              <tr>
                <td className={td}>결제 오픈 알림 신청 (선택)</td>
                <td className={td}>이메일 주소, 광고성 정보 수신 동의 여부·동의 일시</td>
                <td className={td}>유료 결제 기능 오픈 안내 이메일 1회 발송</td>
              </tr>
              <tr>
                <td className={td}>서비스 이용·전환 분석 (비식별)</td>
                <td className={td}>세션 유입 경로 구분(blog / jobs / direct), 선택한 상품 유형(planType), 기능 실행 및 결제 단계 이벤트명 (자소서 본문·답변·이메일·이름·IP 등 개인식별정보는 일절 포함하지 않음)</td>
                <td className={td}>기능 이용 현황 파악, 오류 대응 및 서비스 품질 개선 (일별 집계 카운터 및 Google Analytics 4 연동 시 비식별 통계 측정)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-red-600 font-semibold">
          주민등록번호·연락처·계좌번호 등 민감한 개인정보는 입력하지 마세요.
        </p>
      </PolicySection>

      <PolicySection heading="2. 보유 및 이용 기간">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs sm:text-sm">
            <thead>
              <tr>
                <th className={th}>정보</th>
                <th className={th}>저장 위치</th>
                <th className={th}>보유 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}>자기소개서·경험 입력 원문 (자소서 진단·생성 모드)</td>
                <td className={td}>자소서 서비스 DB·Redis에 영구 저장하지 않음 (진단 원문은 이용자 브라우저 로컬에만 임시 보관 후 완성본 생성 시 즉시 폐기)</td>
                <td className={td}>자소서 생성·진단 요청을 처리하는 동안에만 서버 메모리에서 처리하며 요청 처리 즉시 폐기합니다 (미저장).</td>
              </tr>
              <tr>
                <td className={td}>AI 생성 결과물·미리보기 및 면접 시뮬레이터 세션 (interview_session:*)</td>
                <td className={td}>무료 미리보기(preview:*)·무료 면접 세션(interview_session:*) / 유료 결제 결과·면접 대비 노트(result:*) 및 유료 면접 세션 Redis 임시 저장</td>
                <td className={td}>
                  무료 자소서 미리보기 데이터(preview:*, order_preview:*)와 무료 면접 시뮬레이터 세션(interview_session:*)은{" "}
                  <strong>최대 2시간(7,200초) 보관 후 만료 시 자동 파기</strong>됩니다. 유료 자소서·면접 대비 노트(result:*) 및 유료 면접 세션(일관성 검사·꼬리질문 이어하기를 위한 입력 자소서·답변 맥락 포함)은{" "}
                  <strong>최초 생성일로부터 7일(604,800초)</strong>간 보관되어 재열람 및 이어하기에 활용된 뒤 만료 시 자동 파기되며, 자소서 화면에서 면접으로 이어갈 때의 임시 전달 토큰은 최대 10분 보관 후 조회 즉시 삭제됩니다.
                </td>
              </tr>
              <tr>
                <td className={td}>작성 중인 입력 내용</td>
                <td className={td}>이용자 브라우저의 localStorage (서버로 전송되지 않음)</td>
                <td className={td}>이용자가 브라우저 데이터를 삭제할 때까지</td>
              </tr>
              <tr>
                <td className={td}>접속 IP (무료 체험 제한)</td>
                <td className={td}>Redis (이용 횟수 카운터 키)</td>
                <td className={td}>24시간 윈도우 기준, 최대 약 48시간 후 자동 만료</td>
              </tr>
              <tr>
                <td className={td}>서비스 이용권 식별 키(order:*) · 잔여 생성 횟수</td>
                <td className={td}>Redis</td>
                <td className={td}>구매일로부터 1년간(31,536,000초) 보관 후 자동 파기됩니다. 삭제를 요청하시면 그 전이라도 지체 없이 삭제합니다.</td>
              </tr>
              <tr>
                <td className={td}>대금결제 기록</td>
                <td className={td}>토스페이먼츠</td>
                <td className={td}>「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 5년간 보관</td>
              </tr>
              <tr>
                <td className={td}>새 공고 알림 신청 이메일 (기존 사전신청 포함)</td>
                <td className={td}>회사 DB (waitlist_signups)</td>
                <td className={td}>해당 기관 신규 공고 알림 발송 목적 달성 시(기존 사전신청 건은 정식 오픈 알림 1회 발송 후)까지 보관·파기하며, 삭제 요청 시 지체 없이 삭제합니다.</td>
              </tr>
              <tr>
                <td className={td}>결제 오픈 알림 신청 이메일</td>
                <td className={td}>회사 DB (launch_notify_signups)</td>
                <td className={td}>결제 오픈 안내 1회 발송 후 지체 없이 파기하며, 그 전이라도 수신 거부·삭제 요청 시 즉시 삭제합니다.</td>
              </tr>
              <tr>
                <td className={td}>비식별 전환·이용 통계 카운터 (analytics:funnel:*)</td>
                <td className={td}>Redis 일별 통계 카운터 (개인정보 미포함)</td>
                <td className={td}>집계일(KST)로부터 최대 35일 보관 후 자동 파기됩니다.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600">
          대금결제 기록은 전자상거래법에 따라 토스페이먼츠를 통해 5년간 보관되며, 서비스 이용권 식별 키(order:*)는 구매일로부터 1년간 보관 후 자동 파기됩니다.
        </p>
      </PolicySection>

      <PolicySection heading="3. 개인정보 처리위탁 및 국외 이전">
        <p>회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁하고 있으며, 일부는 국외로 이전됩니다.</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs sm:text-sm">
            <tbody>
              <tr><th className={th}>수탁자(이전받는 자)</th><td className={td}>Google LLC (Gemini API)</td></tr>
              <tr><th className={th}>이전 국가</th><td className={td}>미국</td></tr>
              <tr><th className={th}>이전 일시 및 방법</th><td className={td}>이용자가 &quot;생성&quot;을 요청하는 시점에 암호화된 네트워크(HTTPS)를 통해 전송</td></tr>
              <tr><th className={th}>이전 항목</th><td className={td}>이용자가 입력한 자기소개서 텍스트, 모의면접 답변 텍스트(및 지원 직무명)</td></tr>
              <tr><th className={th}>이용 목적</th><td className={td}>AI 문장 생성, 면접 질문·답변 루브릭 채점 및 꼬리질문 생성</td></tr>
              <tr><th className={th}>보유·이용 기간</th><td className={td}>AI 생성·채점 요청 처리 목적으로 전송되며 Google의 유료 API 정책에 따라 입력 데이터는 모델 학습에 사용되지 않습니다. (세션 이어하기용 Redis 임시 보관은 위 기간 만료 후 자동 파기되며, 그 밖의 처리 정책은 Google의 API 약관 및 개인정보처리방침에 따릅니다.)</td></tr>
              <tr><th className={th}>이전 거부 방법 및 효과</th><td className={td}>이용자는 생성 기능을 사용하지 않음으로써 국외 이전을 거부할 수 있으며, 이 경우 AI 생성 기능은 이용할 수 없습니다. 문의: {b.email}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto mt-3">
          <table className="w-full border-collapse text-xs sm:text-sm">
            <thead>
              <tr>
                <th className={th}>수탁자</th>
                <th className={th}>위탁 업무</th>
                <th className={th}>국가</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}>토스페이먼츠(주)</td>
                <td className={td}>결제 처리(결제창 제공, 결제 승인, 영수증 발급)</td>
                <td className={td}>대한민국</td>
              </tr>
              <tr>
                <td className={td}>Vercel Inc. / Upstash, Inc. / Supabase, Inc.</td>
                <td className={td}>웹 호스팅, 이용 횟수 카운터·재열람 링크 임시 저장(Redis) 및 데이터베이스 운영 등 클라우드 인프라, Vercel Web Analytics를 통한 비식별 방문 통계(쿠키 미사용, 페이지 경로·유입 경로·기기 유형, 주문번호·쿼리 정보 제외)</td>
                <td className={td}>미국(사업자 소재국). 실제 데이터 저장 지역은 각 서비스 설정에 따릅니다.</td>
              </tr>
              <tr>
                <td className={td}>Resend, Inc.</td>
                <td className={td}>유료 결제 이용자에게 생성 결과 재열람 링크 및 결제 영수증 안내 이메일 발송 (이메일 발송 기능 연동 시)</td>
                <td className={td}>미국</td>
              </tr>
              <tr>
                <td className={td}>Google LLC (Google Analytics 4)</td>
                <td className={td}>비식별 서비스 이용 현황 및 유입경로별 전환 통계 분석 (측정 ID 연동 시, IP 익명화 적용 · 개인정보 미전송)</td>
                <td className={td}>미국</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          이용자는 브라우저의 쿠키 차단 설정 또는 Google Analytics 차단 브라우저 부가기능을 통해 비식별 이용 통계 수집을 거부할 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection heading="4. 개인정보의 제3자 제공">
        <p>회사는 법령에 근거가 있는 경우를 제외하고 이용자의 개인정보를 제3자에게 제공하지 않습니다. 위 3항의 처리위탁은 서비스 제공 목적에 한정됩니다.</p>
      </PolicySection>

      <PolicySection heading="5. 이용자의 권리">
        <p>이용자는 개인정보의 열람·정정·삭제·처리정지를 요청할 수 있으며, 아래 책임자 이메일로 요청하시면 지체 없이 조치합니다.</p>
      </PolicySection>

      <PolicySection heading="6. 개인정보 보호책임자">
        <p>
          {b.csPhone
            ? `성명: ${b.representative} (대표자) · 이메일: ${b.email} · 고객센터: ${b.csPhone}`
            : `성명: ${b.representative} (대표자) · 이메일: ${b.email}`}
        </p>
      </PolicySection>

      <PolicySection heading="7. 방침의 변경">
        <p>본 방침이 변경되는 경우 시행일자와 함께 본 페이지에 공지합니다.</p>
      </PolicySection>
    </PolicyShell>
  );
}
