/**
 * 중복 로그인 감지 모듈
 * SSE를 통해 서버로부터 중복 로그인 알림을 받아 처리합니다.
 */

let notificationEventSource = null;

/**
 * 중복 로그인 감지기 초기화
 */
export function initDuplicateLoginDetector() {
    // SSE 연결 시작
    connectToNotifications();
}

/**
 * 사용자 알림 SSE 연결
 */
function connectToNotifications() {
    try {
        notificationEventSource = new EventSource('/api/user/notifications');

        notificationEventSource.addEventListener('duplicate-login', (event) => {
            const data = JSON.parse(event.data);
            handleDuplicateLogin(data);
        });

        notificationEventSource.onerror = (error) => {
            console.error('[중복 로그인 감지] SSE 연결 오류:', error);

            // 연결이 끊어진 경우 재연결 시도
            if (notificationEventSource.readyState === EventSource.CLOSED) {
                console.log('[중복 로그인 감지] 5초 후 재연결 시도...');
                setTimeout(() => {
                    if (notificationEventSource) {
                        notificationEventSource.close();
                    }
                    connectToNotifications();
                }, 5000);
            }
        };

        notificationEventSource.onopen = () => {
            console.log('[중복 로그인 감지] SSE 연결 성공');
        };

    } catch (error) {
        console.error('[중복 로그인 감지] 초기화 실패:', error);
    }
}

/**
 * 중복 로그인 알림 처리
 */
function handleDuplicateLogin(data) {
    console.log('[중복 로그인 감지] 중복 로그인 감지됨:', data);

    // 사용자에게 알림 표시
    alert('⚠️ 보안 알림\n\n' + (data.message || '다른 위치에서 로그인하여 현재 세션이 종료됩니다.'));

    // SSE 연결 종료
    if (notificationEventSource) {
        notificationEventSource.close();
        notificationEventSource = null;
    }

    // 잠시 후 로그인 페이지로 리다이렉트
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 1000);
}

/**
 * 연결 종료
 */
export function disconnectNotifications() {
    if (notificationEventSource) {
        notificationEventSource.close();
        notificationEventSource = null;
        console.log('[중복 로그인 감지] SSE 연결 종료');
    }
}
