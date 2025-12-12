async function handleLogin(event) {
    event.preventDefault();

    const usernameInput = document.querySelector("#username");
    const passwordInput = document.querySelector("#password");
    const errorEl = document.querySelector("#login-error");

    if (!usernameInput || !passwordInput || !errorEl) {
        return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    errorEl.textContent = "";

    if (!username || !password) {
        errorEl.textContent = "아이디와 비밀번호를 모두 입력해 주세요.";
        return;
    }

    try {
        // 보안: CSRF 토큰 추가 (일관성 유지)
        const options = window.csrfUtils.addCsrfHeader({
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const res = await fetch("/api/auth/login", options);

        if (!res.ok) {
            let message = "로그인에 실패했습니다.";
            try {
                const data = await res.json();
                if (data && data.error) {
                    message = data.error;
                }
            } catch (_) {
                // ignore
            }
            errorEl.textContent = message;
            return;
        }

        const data = await res.json();

        // 로그인 성공 → 메인 페이지로 이동
        window.location.href = "/";
    } catch (error) {
        console.error("로그인 요청 오류:", error);
        errorEl.textContent = "서버와 통신 중 오류가 발생했습니다.";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("#login-form");
    if (form) {
        form.addEventListener("submit", handleLogin);
    }
});