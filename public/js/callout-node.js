/**
 * Tiptap Callout Node Extension
 * 정보, 경고, 에러, 성공 메시지를 표시하는 콜아웃 블록
 */

const Node = Tiptap.Core.Node;

// 콜아웃 타입 정의
const CALLOUT_TYPES = {
    info: {
        icon: 'ℹ️',
        label: '정보',
        bgColor: '#e0f2fe',
        borderColor: '#0ea5e9',
        iconColor: '#0284c7'
    },
    warning: {
        icon: '⚠️',
        label: '경고',
        bgColor: '#fef3c7',
        borderColor: '#f59e0b',
        iconColor: '#d97706'
    },
    error: {
        icon: '❌',
        label: '에러',
        bgColor: '#fee2e2',
        borderColor: '#ef4444',
        iconColor: '#dc2626'
    },
    success: {
        icon: '✅',
        label: '성공',
        bgColor: '#dcfce7',
        borderColor: '#22c55e',
        iconColor: '#16a34a'
    }
};

export const CalloutBlock = Node.create({
    name: 'calloutBlock',

    group: 'block',

    atom: true,

    addAttributes() {
        return {
            type: {
                default: 'info',
                parseHTML: element => element.getAttribute('data-callout-type') || 'info',
                renderHTML: attributes => {
                    return { 'data-callout-type': attributes.type };
                }
            },
            title: {
                default: '',
                parseHTML: element => element.getAttribute('data-title') || '',
                renderHTML: attributes => {
                    return { 'data-title': attributes.title };
                }
            },
            content: {
                default: '',
                parseHTML: element => element.getAttribute('data-content') || '',
                renderHTML: attributes => {
                    return { 'data-content': attributes.content };
                }
            }
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="callout-block"]'
            }
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        return [
            'div',
            {
                ...HTMLAttributes,
                'data-type': 'callout-block',
                'class': 'callout-block',
                'data-callout-type': node.attrs.type,
                'data-title': node.attrs.title,
                'data-content': node.attrs.content
            }
        ];
    },

    addNodeView() {
        return ({ node, editor, getPos }) => {
            // 전체 wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'callout-block-wrapper';
            wrapper.setAttribute('data-callout-type', node.attrs.type);
            wrapper.contentEditable = 'false';

            let currentType = node.attrs.type || 'info';
            let currentTitle = node.attrs.title || '';
            let currentContent = node.attrs.content || '';
            let isEditingTitle = false;
            let isEditingContent = false;
            let typePopup = null;
            let lastEditableState = editor.isEditable;

            // 헤더 생성
            const header = document.createElement('div');
            header.className = 'callout-header';

            // 아이콘
            const icon = document.createElement('span');
            icon.className = 'callout-icon';
            icon.textContent = CALLOUT_TYPES[currentType].icon;

            // 제목
            const title = document.createElement('div');
            title.className = 'callout-title';
            title.textContent = currentTitle || '제목';
            title.spellcheck = false;
            title.style.flex = '1';

            // 타입 선택 버튼
            const typeSelector = document.createElement('button');
            typeSelector.className = 'callout-type-selector';
            typeSelector.textContent = CALLOUT_TYPES[currentType].label;
            typeSelector.type = 'button';

            header.appendChild(icon);
            header.appendChild(title);
            header.appendChild(typeSelector);

            // 내용 컨테이너
            const contentContainer = document.createElement('div');
            contentContainer.className = 'callout-content';

            // 내용 textarea
            const textarea = document.createElement('textarea');
            textarea.className = 'callout-content-textarea';
            textarea.placeholder = '내용을 입력하세요...';
            textarea.value = currentContent;
            textarea.rows = 1;

            contentContainer.appendChild(textarea);

            wrapper.appendChild(header);
            wrapper.appendChild(contentContainer);

            // 자동 높이 조절 함수
            const adjustTextareaHeight = () => {
                textarea.style.height = 'auto';
                // scrollHeight를 그대로 사용 (최소 높이 제한 없음)
                textarea.style.height = textarea.scrollHeight + 'px';
            };

            // 초기 높이 설정
            setTimeout(adjustTextareaHeight, 0);

            // ============================================================
            // 제목 편집 설정
            // ============================================================
            const setupTitleInteraction = () => {
                if (editor.isEditable) {
                    // 쓰기 모드: 상호작용 활성화
                    title.setAttribute('contenteditable', 'plaintext-only');
                    title.setAttribute('spellcheck', 'false');
                    title.style.cursor = 'text';
                    title.style.padding = '4px 6px';
                    title.style.borderRadius = '4px';
                    title.style.transition = 'background-color 0.2s';
                    title.style.pointerEvents = 'auto';
                    title.style.userSelect = 'text';

                    // 포커스 시 편집 모드 표시
                    title.onfocus = () => {
                        if (editor.isEditable && title.contentEditable === 'false') {
                            setupTitleInteraction();
                            return;
                        }
                        isEditingTitle = true;
                        title.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
                    };

                    // blur 시 저장
                    title.onblur = () => {
                        if (!isEditingTitle) return;
                        isEditingTitle = false;
                        const newTitle = title.textContent?.trim() || '';
                        title.textContent = newTitle || '제목';
                        title.style.backgroundColor = 'transparent';
                        currentTitle = newTitle;

                        // 저장
                        if (typeof getPos === 'function') {
                            const pos = getPos();
                            try {
                                const tr = editor.view.state.tr;
                                tr.setNodeMarkup(pos, null, {
                                    type: currentType,
                                    title: currentTitle,
                                    content: currentContent
                                });
                                editor.view.dispatch(tr);
                            } catch (error) {
                                console.error('[CalloutBlock] 제목 저장 실패:', error);
                            }
                        }
                    };

                    // keydown 이벤트 처리
                    title.onkeydown = (e) => {
                        e.stopPropagation();

                        if (e.key === 'Enter') {
                            e.preventDefault();
                            textarea.focus();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            isEditingTitle = false;
                            title.textContent = currentTitle || '제목';
                            title.style.backgroundColor = 'transparent';
                            title.blur();
                        }
                    };

                    // input 이벤트도 전파 막기
                    title.oninput = (e) => {
                        e.stopPropagation();
                    };
                } else {
                    // 읽기 모드: 상호작용 비활성화
                    title.contentEditable = 'false';
                    title.style.cursor = 'default';
                    title.style.padding = '0';
                    title.style.borderRadius = '0';
                    title.style.backgroundColor = 'transparent';
                    title.style.pointerEvents = 'none';
                    title.onfocus = null;
                    title.onblur = null;
                    title.onkeydown = null;
                    title.oninput = null;
                }
            };

            // ============================================================
            // 내용 편집 설정
            // ============================================================
            const setupContentInteraction = () => {
                if (editor.isEditable) {
                    textarea.readOnly = false;
                    textarea.style.cursor = 'text';

                    // focus 이벤트: 편집 시작
                    textarea.onfocus = (e) => {
                        if (editor.isEditable && textarea.readOnly) {
                            setupContentInteraction();
                            return;
                        }
                        isEditingContent = true;
                    };

                    // 입력 이벤트 리스너
                    textarea.oninput = (e) => {
                        e.stopPropagation();
                        isEditingContent = true;
                        adjustTextareaHeight();

                        // 현재 값만 업데이트 (저장은 blur 시에만)
                        currentContent = textarea.value;
                    };

                    // keydown 이벤트 처리
                    textarea.onkeydown = (e) => {
                        e.stopPropagation();
                    };

                    // blur 시 저장
                    textarea.onblur = () => {
                        isEditingContent = false;
                        currentContent = textarea.value;

                        // 저장
                        if (typeof getPos === 'function') {
                            const pos = getPos();
                            try {
                                const tr = editor.view.state.tr;
                                tr.setNodeMarkup(pos, null, {
                                    type: currentType,
                                    title: currentTitle,
                                    content: currentContent
                                });
                                editor.view.dispatch(tr);
                            } catch (error) {
                                console.error('[CalloutBlock] blur 저장 실패:', error);
                            }
                        }
                    };
                } else {
                    // 읽기 모드
                    isEditingContent = false;
                    textarea.readOnly = true;
                    textarea.style.cursor = 'default';
                    textarea.onfocus = null;
                    textarea.onmousedown = null;
                    textarea.oninput = null;
                    textarea.onkeydown = null;
                    textarea.onblur = null;
                }
            };

            // ============================================================
            // 타입 선택 UI
            // ============================================================
            const createTypePopup = () => {
                const popup = document.createElement('div');
                popup.className = 'callout-type-popup';

                Object.keys(CALLOUT_TYPES).forEach(typeKey => {
                    const typeInfo = CALLOUT_TYPES[typeKey];
                    const option = document.createElement('div');
                    option.className = 'callout-type-option';
                    if (typeKey === currentType) {
                        option.style.backgroundColor = '#f5f5f5';
                    }

                    const optionIcon = document.createElement('span');
                    optionIcon.textContent = typeInfo.icon;
                    optionIcon.style.fontSize = '18px';

                    const optionLabel = document.createElement('span');
                    optionLabel.textContent = typeInfo.label;
                    optionLabel.style.flex = '1';

                    option.appendChild(optionIcon);
                    option.appendChild(optionLabel);

                    option.onclick = (e) => {
                        e.stopPropagation();
                        changeCalloutType(typeKey);
                        closeTypePopup();
                    };

                    popup.appendChild(option);
                });

                return popup;
            };

            const openTypePopup = () => {
                if (typePopup) {
                    closeTypePopup();
                    return;
                }

                typePopup = createTypePopup();

                // 버튼 위치 기준으로 팝업 배치
                const rect = typeSelector.getBoundingClientRect();
                typePopup.style.position = 'absolute';
                typePopup.style.top = (rect.bottom + 5) + 'px';
                typePopup.style.right = '16px';

                document.body.appendChild(typePopup);

                // 외부 클릭 시 닫기
                setTimeout(() => {
                    const closeHandler = (e) => {
                        if (typePopup && !typePopup.contains(e.target) && e.target !== typeSelector) {
                            closeTypePopup();
                            document.removeEventListener('click', closeHandler);
                        }
                    };
                    document.addEventListener('click', closeHandler);
                }, 0);
            };

            const closeTypePopup = () => {
                if (typePopup && typePopup.parentNode) {
                    typePopup.parentNode.removeChild(typePopup);
                    typePopup = null;
                }
            };

            const changeCalloutType = (newType) => {
                currentType = newType;

                // UI 업데이트
                wrapper.setAttribute('data-callout-type', newType);
                icon.textContent = CALLOUT_TYPES[newType].icon;
                typeSelector.textContent = CALLOUT_TYPES[newType].label;

                // 에디터 저장
                if (typeof getPos === 'function') {
                    const pos = getPos();
                    try {
                        const tr = editor.view.state.tr;
                        tr.setNodeMarkup(pos, null, {
                            type: currentType,
                            title: currentTitle,
                            content: currentContent
                        });
                        editor.view.dispatch(tr);
                    } catch (error) {
                        console.error('[CalloutBlock] 타입 변경 저장 실패:', error);
                    }
                }
            };

            const setupTypeSelectorInteraction = () => {
                if (editor.isEditable) {
                    typeSelector.style.display = 'block';
                    typeSelector.onclick = (e) => {
                        e.stopPropagation();
                        openTypePopup();
                    };
                } else {
                    typeSelector.style.display = 'none';
                    typeSelector.onclick = null;
                }
            };

            // ============================================================
            // 에디터 모드 변경 감지
            // ============================================================
            const modeCheckHandler = () => {
                if (editor.isEditable !== lastEditableState) {
                    lastEditableState = editor.isEditable;
                    setupTitleInteraction();
                    setupContentInteraction();
                    setupTypeSelectorInteraction();
                }
            };

            // transaction 이벤트를 사용하여 모든 변경 감지
            editor.on('transaction', modeCheckHandler);

            // wrapper에 mouseenter 이벤트 추가 - 마우스가 들어올 때마다 모드 체크
            wrapper.onmouseenter = () => {
                if (editor.isEditable !== lastEditableState) {
                    lastEditableState = editor.isEditable;
                    setupTitleInteraction();
                    setupContentInteraction();
                    setupTypeSelectorInteraction();
                }
            };

            // 초기 설정
            setupTitleInteraction();
            setupContentInteraction();
            setupTypeSelectorInteraction();

            // 약간의 지연 후 다시 체크 (에디터 모드가 변경되었을 수 있음)
            setTimeout(() => {
                if (editor.isEditable !== lastEditableState) {
                    lastEditableState = editor.isEditable;
                    setupTitleInteraction();
                    setupContentInteraction();
                    setupTypeSelectorInteraction();
                }
            }, 100);

            // ============================================================
            // 정리 및 반환
            // ============================================================
            return {
                dom: wrapper,

                update(updatedNode) {
                    // 안전장치: updatedNode나 this.node가 없으면 false 반환
                    if (!updatedNode || !updatedNode.type || !this.node || !this.node.type) {
                        return false;
                    }

                    if (updatedNode.type.name !== this.node.type.name) {
                        return false;
                    }

                    // 속성이 변경되었을 때만 UI 업데이트
                    if (updatedNode.attrs && updatedNode.attrs.type !== currentType) {
                        currentType = updatedNode.attrs.type;
                        wrapper.setAttribute('data-callout-type', currentType);
                        icon.textContent = CALLOUT_TYPES[currentType].icon;
                        typeSelector.textContent = CALLOUT_TYPES[currentType].label;
                    }

                    // 제목 업데이트 - 편집 중이 아니고 포커스도 없을 때만
                    if (updatedNode.attrs && updatedNode.attrs.title !== currentTitle) {
                        if (!isEditingTitle && document.activeElement !== title) {
                            currentTitle = updatedNode.attrs.title;
                            title.textContent = currentTitle || '제목';
                        }
                    }

                    // 사용자가 편집 중일 때는 외부 업데이트 무시
                    if (updatedNode.attrs && updatedNode.attrs.content !== currentContent) {
                        // 편집 중이 아닐 때만 업데이트
                        if (!isEditingContent) {
                            currentContent = updatedNode.attrs.content;
                            textarea.value = currentContent;
                            adjustTextareaHeight();
                        }
                    }

                    return true;
                },

                destroy() {
                    // 팝업 정리
                    closeTypePopup();

                    // 이벤트 리스너 정리
                    editor.off('transaction', modeCheckHandler);

                    // 편집 중이었다면 마지막 저장
                    if (isEditingContent || isEditingTitle) {
                        currentTitle = title.textContent?.trim() || '';
                        currentContent = textarea.value;

                        if (typeof getPos === 'function') {
                            const pos = getPos();
                            try {
                                const tr = editor.view.state.tr;
                                tr.setNodeMarkup(pos, null, {
                                    type: currentType,
                                    title: currentTitle,
                                    content: currentContent
                                });
                                editor.view.dispatch(tr);
                            } catch (error) {
                                console.error('[CalloutBlock] destroy 저장 실패:', error);
                            }
                        }
                    }
                },

                stopEvent(event) {
                    // 내부 이벤트가 에디터로 전파되지 않도록
                    const target = event.target;
                    return (
                        target === textarea ||
                        target === title ||
                        target === typeSelector ||
                        (typePopup && typePopup.contains(target))
                    );
                },

                ignoreMutation(mutation) {
                    // DOM 변경을 에디터가 무시하도록
                    return true;
                }
            };
        };
    },

    addCommands() {
        return {
            setCallout: (type = 'info', title = '', content = '') => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: { type, title, content }
                });
            }
        };
    }
});
