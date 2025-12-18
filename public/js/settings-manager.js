/**
 * 설정 관리 모듈
 */

// 전역 상태
let state = {
    currentUser: null,
    userSettings: {
        defaultMode: 'read'
    }
};

/**
 * 상태 초기화
 */
export function initSettingsManager(appState) {
    state = appState;
}

/**
 * 설정 모달 열기
 */
export async function openSettingsModal() {
    const modal = document.querySelector("#settings-modal");
    const usernameEl = document.querySelector("#settings-username");
    const defaultModeSelect = document.querySelector("#settings-default-mode");
    const blockDuplicateLoginToggle = document.querySelector("#block-duplicate-login-toggle");

    if (!modal) return;

    // 모바일에서 설정 열 때 사이드바 닫기
    if (window.innerWidth <= 768 && window.closeSidebar) {
        window.closeSidebar();
    }

    // 현재 사용자 정보 표시
    if (usernameEl && state.currentUser) {
        usernameEl.textContent = state.currentUser.username || "-";
    }

    // 현재 설정 값 표시
    if (defaultModeSelect) {
        defaultModeSelect.value = state.userSettings.defaultMode;
    }

    // 보안 설정 로드
    if (blockDuplicateLoginToggle) {
        try {
            const { secureFetch } = await import('./ui-utils.js');
            const response = await secureFetch('/api/auth/security-settings', {
                method: 'GET'
            });

            if (response.ok) {
                const data = await response.json();
                blockDuplicateLoginToggle.checked = data.blockDuplicateLogin;
            }
        } catch (error) {
            console.error('보안 설정 로드 실패:', error);
        }
    }

    modal.classList.remove("hidden");
}

/**
 * 설정 모달 닫기
 */
export function closeSettingsModal() {
    const modal = document.querySelector("#settings-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
}

/**
 * 설정 저장
 */
export async function saveSettings() {
    const defaultModeSelect = document.querySelector("#settings-default-mode");
    const blockDuplicateLoginToggle = document.querySelector("#block-duplicate-login-toggle");

    // 로컬 설정 저장
    if (defaultModeSelect) {
        state.userSettings.defaultMode = defaultModeSelect.value;
        localStorage.setItem("userSettings", JSON.stringify(state.userSettings));
        console.log("설정 저장됨:", state.userSettings);
    }

    // 보안 설정 저장
    if (blockDuplicateLoginToggle) {
        try {
            const { secureFetch } = await import('./ui-utils.js');
            const response = await secureFetch('/api/auth/security-settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    blockDuplicateLogin: blockDuplicateLoginToggle.checked
                })
            });

            if (!response.ok) {
                throw new Error('보안 설정 저장 실패');
            }

            console.log('보안 설정 저장 완료:', blockDuplicateLoginToggle.checked);
        } catch (error) {
            console.error('보안 설정 저장 실패:', error);
            alert('보안 설정 저장에 실패했습니다.');
            return;
        }
    }

    closeSettingsModal();
    alert("설정이 저장되었습니다.");
}

/**
 * 설정 로드
 */
export function loadSettings() {
    try {
        const saved = localStorage.getItem("userSettings");
        if (saved) {
            const loaded = JSON.parse(saved);
            state.userSettings = { ...state.userSettings, ...loaded };
        }
    } catch (error) {
        console.error("설정 로드 실패:", error);
    }
    return state.userSettings;
}

/**
 * 설정 모달 이벤트 바인딩
 */
export function bindSettingsModal() {
    const settingsBtn = document.querySelector("#settings-btn");
    const closeBtn = document.querySelector("#close-settings-btn");
    const saveBtn = document.querySelector("#save-settings-btn");
    const overlay = document.querySelector(".modal-overlay");
    const exportBackupBtn = document.querySelector("#export-backup-btn");
    const importBackupBtn = document.querySelector("#import-backup-btn");
    const importBackupInput = document.querySelector("#import-backup-input");

    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
            openSettingsModal();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            closeSettingsModal();
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            saveSettings();
        });
    }

    if (overlay) {
        overlay.addEventListener("click", () => {
            closeSettingsModal();
        });
    }

    // 백업 내보내기 버튼
    if (exportBackupBtn) {
        exportBackupBtn.addEventListener("click", async () => {
            await exportBackup();
        });
    }

    // 백업 불러오기 버튼
    if (importBackupBtn) {
        importBackupBtn.addEventListener("click", () => {
            importBackupInput.click();
        });
    }

    // 파일 선택 시 백업 불러오기
    if (importBackupInput) {
        importBackupInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
                await importBackup(file);
                // 입력 초기화
                importBackupInput.value = '';
            }
        });
    }
}

/**
 * 현재 사용자 정보 가져오기 및 표시
 */
export async function fetchAndDisplayCurrentUser() {
    try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
            throw new Error("HTTP " + res.status);
        }

        const user = await res.json();
        state.currentUser = user;

        const userNameEl = document.querySelector("#user-name");
        const userAvatarEl = document.querySelector("#user-avatar");

        if (userNameEl) {
            userNameEl.textContent = user.username || "사용자";
        }

        if (userAvatarEl) {
            userAvatarEl.textContent = user.username ? user.username[0].toUpperCase() : "?";
        }
    } catch (error) {
        console.error("사용자 정보 불러오기 실패:", error);
        const userNameEl = document.querySelector("#user-name");
        const userAvatarEl = document.querySelector("#user-avatar");

        if (userNameEl) {
            userNameEl.textContent = "로그인 필요";
        }

        if (userAvatarEl) {
            userAvatarEl.textContent = "?";
        }
    }
}

/**
 * 백업 내보내기
 */
async function exportBackup() {
    try {
        const { secureFetch } = await import('./ui-utils.js');

        // 내보내기 시작 알림
        alert('백업 생성 중입니다. 데이터 양에 따라 시간이 걸릴 수 있습니다.');

        const response = await secureFetch('/api/backup/export', {
            method: 'GET'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '백업 내보내기 실패');
        }

        // Blob으로 파일 다운로드
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // 파일명: NTEOK_Backup_YYYYMMDD_HHMMSS.zip
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 19).replace(/[-:T]/g, '').replace(/(\d{8})(\d{6})/, '$1_$2');
        a.download = `NTEOK_Backup_${dateStr}.zip`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        console.log('백업 내보내기 완료');
        alert('백업이 성공적으로 내보내졌습니다.');
    } catch (error) {
        console.error('백업 내보내기 실패:', error);
        alert(`백업 내보내기에 실패했습니다: ${error.message}`);
    }
}

/**
 * 백업 불러오기
 */
async function importBackup(file) {
    if (!file || !file.name.endsWith('.zip')) {
        alert('ZIP 파일만 선택할 수 있습니다.');
        return;
    }

    const confirmed = confirm(
        '백업을 불러오면 현재 데이터와 병합됩니다.\n' +
        '계속하시겠습니까?'
    );

    if (!confirmed) {
        return;
    }

    try {
        const { secureFetch } = await import('./ui-utils.js');

        // FormData로 파일 전송
        const formData = new FormData();
        formData.append('backup', file);

        alert('백업 불러오기 중입니다. 데이터 양에 따라 시간이 걸릴 수 있습니다.');

        const response = await secureFetch('/api/backup/import', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '백업 불러오기 실패');
        }

        const result = await response.json();
        console.log('백업 불러오기 완료:', result);

        alert(
            `백업 불러오기가 완료되었습니다!\n\n` +
            `컬렉션: ${result.collectionsCount}개\n` +
            `페이지: ${result.pagesCount}개\n` +
            `이미지: ${result.imagesCount}개\n\n` +
            `페이지를 새로고침합니다.`
        );

        // 페이지 새로고침하여 새 데이터 반영
        window.location.reload();
    } catch (error) {
        console.error('백업 불러오기 실패:', error);
        alert(`백업 불러오기에 실패했습니다: ${error.message}`);
    }
}
