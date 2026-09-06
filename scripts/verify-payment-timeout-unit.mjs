import test from 'node:test';
import assert from 'node:assert/strict';

// src/app/page.tsx의 결제 핸들러 상태 머신을 정확하게 모델링
class PaymentController {
  constructor() {
    this.resumePrompt = '';
    this.agreedToRefundPolicy = false;
    this.isWidgetReady = false;
    this.paymentWidget = null;
    this.paymentState = 'idle'; // 'idle' | 'processing' | 'timeout' | 'error'
    this.paymentTimeoutMsg = '';
    this.error = '';
    this.timeoutTimer = null;
    this.checkInterval = null;
    this.isPaymentRequested = false;
    this.initCallCount = 0;
  }

  initPaymentWidget() {
    this.initCallCount++;
    this.paymentState = 'idle';
    this.paymentTimeoutMsg = '';
    this.error = '';
  }

  handlePromptChange(text) {
    this.resumePrompt = text;
    if (this.error) this.error = '';
  }

  executePaymentRequest() {
    if (!this.paymentWidget) {
      this.paymentState = 'error';
      this.error = '결제 위젯이 준비되지 않았습니다. 다시 시도해 주세요.';
      return;
    }
    this.isPaymentRequested = true;
  }

  handlePaymentClick(customTimeoutMs = 10000) {
    this.error = '';
    this.paymentTimeoutMsg = '';

    // 1. 사전 유효성 검증
    if (!this.resumePrompt.trim()) {
      this.error = '자기소개서 작성 내용을 먼저 입력해 주세요.';
      return;
    }

    if (!this.agreedToRefundPolicy) {
      this.error = '결제 진행을 위해 환불 불가 정책에 동의해 주세요.';
      return;
    }

    // 2. 이미 SDK 위젯이 준비된 경우 -> 즉시 결제 실행
    if (this.isWidgetReady && this.paymentWidget) {
      this.paymentState = 'idle';
      this.executePaymentRequest();
      return;
    }

    // 3. 위젯이 아직 준비되지 않은 경우 -> 스피너 가동 및 10초 타임아웃 안전장치 시작
    this.paymentState = 'processing';

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }

    const checkInterval = setInterval(() => {
      if (this.isWidgetReady && this.paymentWidget) {
        clearInterval(checkInterval);
        if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
        this.paymentState = 'idle';
        this.executePaymentRequest();
      }
    }, 200);
    this.checkInterval = checkInterval;

    this.timeoutTimer = setTimeout(() => {
      clearInterval(checkInterval);
      if (!this.isWidgetReady) {
        this.paymentState = 'timeout';
        this.paymentTimeoutMsg =
          '결제 모듈 연결에 시간이 소요되고 있습니다. 네트워크 상태를 확인하시거나 아래 [결제 다시 시도] 버튼을 눌러주세요.';
      }
    }, customTimeoutMs);
  }

  handleRetryPayment() {
    this.paymentState = 'idle';
    this.paymentTimeoutMsg = '';
    this.error = '';
    this.initPaymentWidget();
  }

  cleanup() {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    if (this.checkInterval) clearInterval(this.checkInterval);
  }
}

test('1. 입력값 검증: 자소서 메모 미입력 시 에러 발생', () => {
  const ctrl = new PaymentController();
  ctrl.handlePaymentClick();
  assert.equal(ctrl.error, '자기소개서 작성 내용을 먼저 입력해 주세요.');
  assert.equal(ctrl.paymentState, 'idle');
});

test('2. 입력값 검증: 환불 미동의 시 에러 발생', () => {
  const ctrl = new PaymentController();
  ctrl.handlePromptChange('마케팅 인턴 경험 작성');
  ctrl.handlePaymentClick();
  assert.equal(ctrl.error, '결제 진행을 위해 환불 불가 정책에 동의해 주세요.');
  assert.equal(ctrl.paymentState, 'idle');
});

test('3. 즉시 준비 상태: 위젯이 이미 로딩된 경우 즉시 결제 요청', () => {
  const ctrl = new PaymentController();
  ctrl.handlePromptChange('개발 인턴 경험');
  ctrl.agreedToRefundPolicy = true;
  ctrl.isWidgetReady = true;
  ctrl.paymentWidget = { requestPayment: () => {} };

  ctrl.handlePaymentClick();
  assert.equal(ctrl.paymentState, 'idle');
  assert.equal(ctrl.isPaymentRequested, true);
});

test('4. 위젯 로딩 지연/차단 시 10초 후 timeout 상태 전환 및 재시도 버튼 활성화 검증', async () => {
  const ctrl = new PaymentController();
  ctrl.handlePromptChange('공공기관 행정 인턴 경험');
  ctrl.agreedToRefundPolicy = true;
  ctrl.isWidgetReady = false; // 위젯 미준비 상태 (네트워크 차단/지연 시뮬레이션)

  // 1초 단위로 빠르게 검증하기 위해 1000ms로 타임아웃 주입 (운영은 10000ms)
  const TEST_TIMEOUT_MS = 1000;
  ctrl.handlePaymentClick(TEST_TIMEOUT_MS);

  // 클릭 직후 processing 상태 확인 (스피너 가동)
  assert.equal(ctrl.paymentState, 'processing');
  assert.equal(ctrl.isPaymentRequested, false);

  // 500ms 경과 시 여전히 processing 대기 중
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(ctrl.paymentState, 'processing');

  // 1000ms 경과 후 타임아웃 발동 대기
  await new Promise((r) => setTimeout(r, 600));

  // 타임아웃 상태 전이 확인
  assert.equal(ctrl.paymentState, 'timeout', '10초 타임아웃 후 상태가 timeout으로 전이되어야 함');
  assert.match(ctrl.paymentTimeoutMsg, /결제 모듈 연결에 시간이 소요되고 있습니다/);

  // 재시도 버튼 클릭 핸들러 동작 검증
  ctrl.handleRetryPayment();
  assert.equal(ctrl.paymentState, 'idle', '재시도 클릭 시 상태가 idle로 복귀해야 함');
  assert.equal(ctrl.paymentTimeoutMsg, '', '타임아웃 안내 문구가 초기화되어야 함');
  assert.equal(ctrl.initCallCount, 1, '결제 위젯 재초기화(initPaymentWidget)가 1회 호출되어야 함');

  ctrl.cleanup();
});

test('5. 10초 이내에 위젯이 준비 완료된 경우: 타이머 해제 및 정상 결제 실행', async () => {
  const ctrl = new PaymentController();
  ctrl.handlePromptChange('기획 인턴 경험');
  ctrl.agreedToRefundPolicy = true;
  ctrl.isWidgetReady = false;

  ctrl.handlePaymentClick(2000); // 2초 타임아웃 설정
  assert.equal(ctrl.paymentState, 'processing');

  // 400ms 후 위젯 로딩 완료 시뮬레이션
  await new Promise((r) => setTimeout(r, 400));
  ctrl.paymentWidget = { requestPayment: () => {} };
  ctrl.isWidgetReady = true;

  // 300ms 대기 (폴링 인터벌 200ms 감지)
  await new Promise((r) => setTimeout(r, 300));

  assert.equal(ctrl.paymentState, 'idle');
  assert.equal(ctrl.isPaymentRequested, true, '위젯 준비 시 정상적으로 결제가 요청되어야 함');

  // 타임아웃 시간(2초) 경과 후에도 timeout 상태로 덮어씌워지지 않는지 확인
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(ctrl.paymentState, 'idle');

  ctrl.cleanup();
});
