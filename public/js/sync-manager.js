/**
 * SSE 및 Yjs 동기화 관리 모듈
 * 실시간 협업 편집을 위한 클라이언트 측 동기화 로직
 */

import * as Y from 'https://cdn.jsdelivr.net/npm/yjs@13.6.18/+esm';
import { escapeHtml } from './ui-utils.js';
import { showCover, hideCover } from './cover-manager.js';

// 전역 상태
let currentPageSync = null;
let currentCollectionSync = null;
let ydoc = null;
let yXmlFragment = null;
let yMetadata = null;

const state = {
    editor: null,
    currentPageId: null,
    currentCollectionId: null,
    fetchPageList: null
};

/**
 * 초기화
 */
export function initSyncManager(appState) {
    Object.assign(state, appState);

    // 네트워크 상태 감지
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Visibility API로 탭 전환 감지
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * 페이지 동기화 시작
 */
export async function startPageSync(pageId, isEncrypted) {
    // 암호화 페이지는 동기화 비활성화
    if (isEncrypted) {
        showInfo('암호화된 페이지는 실시간 협업이 지원되지 않습니다.');
        return;
    }

    // 기존 연결 정리
    stopPageSync();

    state.currentPageId = pageId;

    // Yjs 문서 생성
    ydoc = new Y.Doc();
    yXmlFragment = ydoc.getXmlFragment('prosemirror');
    yMetadata = ydoc.getMap('metadata');

    // SSE 연결
    const eventSource = new EventSource(`/api/pages/${pageId}/sync`);

    eventSource.addEventListener('init', (e) => {
        try {
            const data = JSON.parse(e.data);

            // Yjs 상태 복원
            const stateUpdate = Uint8Array.from(atob(data.state), c => c.charCodeAt(0));
            Y.applyUpdate(ydoc, stateUpdate);

            // Tiptap 에디터와 연결
            setupEditorBinding();
        } catch (error) {
            console.error('[SyncManager] 초기 상태 처리 오류:', error);
        }
    });

    eventSource.addEventListener('yjs-update', (e) => {
        try {
            const data = JSON.parse(e.data);
            const update = Uint8Array.from(atob(data.update), c => c.charCodeAt(0));

            // 원격 업데이트는 'remote' origin으로 표시
            Y.applyUpdate(ydoc, update, 'remote');

            // Yjs 메타데이터에서 콘텐츠 가져와서 에디터 업데이트
            const content = yMetadata.get('content');
            if (content && state.editor) {
                const currentContent = state.editor.getHTML();
                if (content !== currentContent) {
                    // 에디터에 포커스가 있는지 확인
                    const editorHasFocus = state.editor.view.hasFocus();

                    if (editorHasFocus) {
                        // 포커스가 있으면 업데이트 보류
                        if (state.editor._setPendingRemoteUpdate) {
                            state.editor._setPendingRemoteUpdate(content);
                        }
                    } else {
                        // 포커스가 없으면 즉시 업데이트
                        state.editor.commands.setContent(content, { emitUpdate: false });
                    }
                }
            }
        } catch (error) {
            console.error('[SyncManager] Yjs 업데이트 처리 오류:', error);
        }
    });

    eventSource.addEventListener('user-joined', (e) => {
        try {
            const data = JSON.parse(e.data);
            showUserNotification(`${data.username}님이 입장했습니다.`, data.color);
        } catch (error) {
            console.error('[SyncManager] user-joined 처리 오류:', error);
        }
    });

    eventSource.addEventListener('user-left', (e) => {
        try {
            const data = JSON.parse(e.data);
        } catch (error) {
            console.error('[SyncManager] user-left 처리 오류:', error);
        }
    });

    eventSource.onerror = (error) => {
        console.error('[SyncManager] SSE 연결 오류:', error);
        eventSource.close();

        // 재연결 시도 (3초 후)
        setTimeout(() => {
            if (state.currentPageId === pageId) {
                startPageSync(pageId, isEncrypted);
            }
        }, 3000);
    };

    currentPageSync = {
        eventSource,
        pageId
    };

    // Yjs 변경 감지 → 서버 전송
    ydoc.on('update', (update, origin) => {
        // 로컬 변경사항만 서버로 전송 (remote는 제외)
        if (origin !== 'remote') {
            sendYjsUpdate(pageId, update);
        }
    });
}

/**
 * 페이지 동기화 중지
 */
export function stopPageSync() {
    if (currentPageSync) {
        currentPageSync.eventSource.close();
        currentPageSync = null;
    }

    if (ydoc) {
        ydoc.destroy();
        ydoc = null;
        yXmlFragment = null;
        yMetadata = null;
    }

    state.currentPageId = null;
}

/**
 * Yjs 업데이트 서버 전송
 */
async function sendYjsUpdate(pageId, update) {
    try {
        const response = await fetch(`/api/pages/${pageId}/sync-update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-CSRF-Token': getCsrfToken()
            },
            body: update
        });

        if (!response.ok) {
            console.error('[SyncManager] 업데이트 전송 실패:', response.status);
            const text = await response.text();
            console.error('[SyncManager] 응답:', text);
        }
    } catch (error) {
        console.error('[SyncManager] 업데이트 전송 오류:', error);
    }
}

/**
 * 컬렉션 메타데이터 동기화 시작
 */
export function startCollectionSync(collectionId) {
    stopCollectionSync();

    state.currentCollectionId = collectionId;

    const eventSource = new EventSource(`/api/collections/${collectionId}/sync`);

    eventSource.addEventListener('metadata-change', (e) => {
        try {
            const data = JSON.parse(e.data);

            // 커버 이미지 동기화
            if (data.field === 'coverImage' && data.pageId === state.currentPageId) {
                if (data.value) {
                    showCover(data.value, 50);
                } else {
                    hideCover();
                }
            }

            // 커버 위치 동기화
            if (data.field === 'coverPosition' && data.pageId === state.currentPageId) {
                const imageEl = document.getElementById('page-cover-image');
                if (imageEl) {
                    imageEl.style.backgroundPositionY = `${data.value}%`;
                }
            }

            // 사이드바 업데이트
            updatePageInSidebar(data.pageId, data.field, data.value);
        } catch (error) {
            console.error('[SyncManager] metadata-change 처리 오류:', error);
        }
    });

    eventSource.addEventListener('page-created', (e) => {
        try {
            const data = JSON.parse(e.data);

            // 페이지 목록 새로고침
            if (state.fetchPageList) {
                state.fetchPageList();
            }
        } catch (error) {
            console.error('[SyncManager] page-created 처리 오류:', error);
        }
    });

    eventSource.addEventListener('page-deleted', (e) => {
        try {
            const data = JSON.parse(e.data);

            // 페이지 목록 새로고침
            if (state.fetchPageList) {
                state.fetchPageList();
            }
        } catch (error) {
            console.error('[SyncManager] page-deleted 처리 오류:', error);
        }
    });

    eventSource.onerror = (error) => {
        console.error('[SyncManager] 컬렉션 SSE 오류:', error);
        eventSource.close();
    };

    currentCollectionSync = {
        eventSource,
        collectionId
    };
}

/**
 * 컬렉션 동기화 중지
 */
export function stopCollectionSync() {
    if (currentCollectionSync) {
        currentCollectionSync.eventSource.close();
        currentCollectionSync = null;
    }

    state.currentCollectionId = null;
}

/**
 * 사이드바 페이지 정보 업데이트
 */
function updatePageInSidebar(pageId, field, value) {
    const pageElement = document.querySelector(`[data-page-id="${pageId}"]`);
    if (!pageElement) {
        return;
    }

    if (field === 'title') {
        const titleSpan = pageElement.querySelector('.page-list-item-title');
        if (titleSpan) {
            const icon = titleSpan.querySelector('i, span.page-icon');
            const iconHtml = icon ? icon.outerHTML : '';
            titleSpan.innerHTML = iconHtml + escapeHtml(value);
        }
    } else if (field === 'icon') {
        const titleSpan = pageElement.querySelector('.page-list-item-title');
        if (titleSpan) {
            const textContent = titleSpan.textContent.trim();
            let iconHtml = '';
            if (value) {
                if (value.startsWith('fa-')) {
                    iconHtml = `<i class="${value}" style="margin-right: 6px; color: #2d5f5d;"></i>`;
                } else {
                    iconHtml = `<span class="page-icon" style="margin-right: 6px; font-size: 16px;">${value}</span>`;
                }
            }
            titleSpan.innerHTML = iconHtml + escapeHtml(textContent);
        }
    }
}

/**
 * 사용자 알림 표시
 */
function showUserNotification(message, color) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${color};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        font-size: 14px;
        font-weight: 500;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * 정보 메시지 표시
 */
function showInfo(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4ECDC4;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 5000);
}

/**
 * CSRF 토큰 가져오기
 */
function getCsrfToken() {
    const cookies = document.cookie.split('; ');
    const csrfCookie = cookies.find(row => row.startsWith('nteok_csrf='));
    return csrfCookie ? csrfCookie.split('=')[1] : '';
}

/**
 * 온라인 복구 핸들러
 */
function handleOnline() {
    if (state.currentPageId && !currentPageSync) {
        startPageSync(state.currentPageId, false);
    }

    if (state.currentCollectionId && !currentCollectionSync) {
        startCollectionSync(state.currentCollectionId);
    }

    showInfo('네트워크 연결이 복구되었습니다.');
}

/**
 * 오프라인 핸들러
 */
function handleOffline() {
    showInfo('네트워크 연결이 끊어졌습니다. 로컬 변경사항은 보존됩니다.');
}

/**
 * Tiptap 에디터와 Yjs 바인딩 설정
 */
function setupEditorBinding() {
    if (!state.editor || !ydoc || !yMetadata) {
        console.error('[SyncManager] 에디터 바인딩 실패: 필수 요소 없음');
        return;
    }

    // 현재 에디터 콘텐츠를 Yjs에 저장
    const currentContent = state.editor.getHTML();
    yMetadata.set('content', currentContent);

    // 보류 중인 원격 업데이트
    let remoteUpdatePending = null;

    // Tiptap 에디터 변경 시 Yjs 업데이트
    let updateTimeout = null;
    let isUpdating = false;

    state.editor.on('update', ({ editor }) => {
        // 원격 업데이트로 인한 변경은 무시
        if (isUpdating) {
            return;
        }

        // Debounce (200ms)
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }

        updateTimeout = setTimeout(() => {
            const newContent = editor.getHTML();
            const oldContent = yMetadata.get('content');

            if (newContent !== oldContent) {
                // origin을 지정하지 않으면 로컬 업데이트로 처리됨
                yMetadata.set('content', newContent);
            }
        }, 200);
    });

    // 에디터 포커스 해제 시 보류 중인 원격 업데이트 적용
    state.editor.on('blur', () => {
        if (remoteUpdatePending) {
            isUpdating = true;
            state.editor.commands.setContent(remoteUpdatePending, { emitUpdate: false });
            remoteUpdatePending = null;
            isUpdating = false;
        }
    });

    // 보류 중인 업데이트를 저장하는 함수
    state.editor._setPendingRemoteUpdate = (content) => {
        remoteUpdatePending = content;
    };

    // Yjs 원격 업데이트를 에디터에 적용할 때 사용할 플래그 저장
    state.editor._syncIsUpdating = false;
}

/**
 * Visibility 변경 핸들러
 */
function handleVisibilityChange() {
    if (!document.hidden) {
        // SSE 연결 확인 및 재연결
        if (currentPageSync && currentPageSync.eventSource.readyState !== EventSource.OPEN) {
            startPageSync(currentPageSync.pageId, false);
        }

        if (currentCollectionSync && currentCollectionSync.eventSource.readyState !== EventSource.OPEN) {
            startCollectionSync(currentCollectionSync.collectionId);
        }
    }
}
