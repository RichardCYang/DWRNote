/**
 * 종단간 암호화(E2EE) 유틸리티
 * AES-256-GCM을 사용한 양자 컴퓨터 저항성 암호화
 */

class CryptoManager {
    constructor() {
        this.encryptionKey = null;
        this.salt = null;
        this.password = null; // 메모리 전용 비밀번호 저장 (새로고침 시 삭제됨)
        this.inactivityTimer = null; // 자동 로그아웃 타이머
        this.INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15분 (밀리초)
    }

    /**
     * Base64 문자열을 ArrayBuffer로 변환
     */
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * ArrayBuffer를 Base64 문자열로 변환
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * 비밀번호에서 암호화 키 유도 (PBKDF2)
     * @param {string} password - 사용자 비밀번호
     * @param {Uint8Array} salt - Salt (없으면 새로 생성)
     * @returns {Promise<{key: CryptoKey, salt: Uint8Array}>}
     */
    async deriveKeyFromPassword(password, salt = null) {
        // Salt가 없으면 새로 생성 (16 bytes)
        if (!salt) {
            salt = crypto.getRandomValues(new Uint8Array(16));
        }

        // 비밀번호를 키 재료로 변환
        const encoder = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        // PBKDF2로 AES-256 키 유도
        // 반복 횟수 600,000 (2023 OWASP 권장사항)
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 600000,
                hash: 'SHA-256'
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        return { key, salt };
    }

    /**
     * 암호화 키 초기화
     * @param {string} password - 사용자 비밀번호
     * @param {string} saltBase64 - Base64 인코딩된 salt (선택사항)
     */
    async initializeKey(password, saltBase64 = null) {
        let salt = null;
        if (saltBase64) {
            salt = new Uint8Array(this.base64ToArrayBuffer(saltBase64));
        }

        const { key, salt: derivedSalt } = await this.deriveKeyFromPassword(password, salt);
        this.encryptionKey = key;
        this.salt = derivedSalt;
        this.password = password; // 메모리에만 저장 (새로고침 시 삭제)

        // 자동 로그아웃 타이머 시작
        this.resetInactivityTimer();

        return this.arrayBufferToBase64(this.salt);
    }

    /**
     * 데이터 암호화 (AES-256-GCM)
     * @param {string} plaintext - 평문
     * @returns {Promise<string>} Base64 인코딩된 암호문 (IV + ciphertext + authTag)
     */
    async encrypt(plaintext) {
        if (!this.encryptionKey) {
            throw new Error('암호화 키가 초기화되지 않았습니다.');
        }

        // IV 생성 (12 bytes, GCM 모드 권장)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // 평문을 바이트로 변환
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);

        // AES-256-GCM으로 암호화
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128 // 인증 태그 길이 (비트)
            },
            this.encryptionKey,
            data
        );

        // IV + ciphertext를 하나로 결합
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);

        // 보안 개선: 매직 바이트 추가하여 암호화 데이터 명확히 표시
        // Base64로 인코딩하고 버전 접두사 추가
        return 'ENC1:' + this.arrayBufferToBase64(combined.buffer);
    }

    /**
     * 데이터 복호화 (AES-256-GCM)
     * @param {string} encryptedBase64 - Base64 인코딩된 암호문
     * @returns {Promise<string>} 평문
     */
    async decrypt(encryptedBase64) {
        if (!this.encryptionKey) {
            throw new Error('암호화 키가 초기화되지 않았습니다.');
        }

        // 보안 개선: 매직 바이트 제거
        let dataToDecrypt = encryptedBase64;
        if (encryptedBase64.startsWith('ENC1:')) {
            dataToDecrypt = encryptedBase64.substring(5);
        }

        // Base64 디코딩
        const combined = new Uint8Array(this.base64ToArrayBuffer(dataToDecrypt));

        // IV와 ciphertext 분리
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        // 복호화
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128
            },
            this.encryptionKey,
            ciphertext
        );

        // 바이트를 문자열로 변환
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    /**
     * 보안 개선: 암호화 여부 확인 (매직 바이트 또는 Base64 패턴 검사)
     * @param {string} data - 확인할 데이터
     * @returns {boolean} 암호화 여부
     */
    isEncrypted(data) {
        if (!data || typeof data !== 'string') {
            return false;
        }

        // 새 방식: 매직 바이트 확인
        if (data.startsWith('ENC1:')) {
            return true;
        }

        // 구 방식: Base64 패턴 확인 (하위 호환성)
        // 20자 이상 + Base64 문자만 포함
        const isBase64Like = /^[A-Za-z0-9+/]+=*$/.test(data) && data.length > 20;
        return isBase64Like;
    }

    /**
     * 암호화 키 제거 (로그아웃 시)
     */
    clearKey() {
        this.encryptionKey = null;
        this.salt = null;
        this.password = null; // 메모리에서 비밀번호 제거
        this.stopInactivityTimer();
    }

    /**
     * 키가 초기화되었는지 확인
     */
    isKeyInitialized() {
        return this.encryptionKey !== null;
    }

    /**
     * 메모리에 저장된 비밀번호 가져오기
     */
    getPassword() {
        return this.password;
    }

    /**
     * 비활성 타이머 초기화 (사용자 활동 시 호출)
     */
    resetInactivityTimer() {
        this.stopInactivityTimer();

        this.inactivityTimer = setTimeout(() => {
            console.warn('비활성 시간 초과로 자동 로그아웃됩니다.');
            this.handleInactivityTimeout();
        }, this.INACTIVITY_TIMEOUT);
    }

    /**
     * 비활성 타이머 중지
     */
    stopInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }

    /**
     * 비활성 시간 초과 처리
     */
    handleInactivityTimeout() {
        this.clearKey();

        // 로그아웃 API 호출
        fetch('/api/auth/logout', { method: 'POST' })
            .then(() => {
                alert('보안을 위해 15분 동안 활동이 없어 자동 로그아웃되었습니다.');
                window.location.href = '/login';
            })
            .catch(error => {
                console.error('자동 로그아웃 중 오류:', error);
                window.location.href = '/login';
            });
    }
}

// 전역 CryptoManager 인스턴스
const cryptoManager = new CryptoManager();
