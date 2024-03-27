<script lang="ts">
    export let previewUrl: string;

    let isResizing = false as false | 'w' | 'h';
    let previousX = 0;
    let previousY = 0;
    let resizableIframe: HTMLIFrameElement;
    const windowWidth = window.document.documentElement.clientWidth;
    const windowHeight = window.document.documentElement.clientHeight;

    function getDragDirection(e: MouseEvent) {
        return (e.currentTarget as HTMLElement).getAttribute('data-direction') as 'w' | 'h';
    }

    function onClick(e: MouseEvent) {
        const d = getDragDirection(e);
        if (d === 'w') {
            if (resizableIframe.clientWidth < windowWidth / 2) {
                resizableIframe.style.width = `${windowWidth}px`;
            } else {
                resizableIframe.style.width = `400px`;
            }
        } else {
            if (resizableIframe.clientHeight < windowHeight / 2) {
                resizableIframe.style.height = `${windowHeight}px`;
            } else {
                resizableIframe.style.height = `${windowHeight / 2}px`;
            }
        }
    }

    function onMouseDown(e: MouseEvent) {
        isResizing = getDragDirection(e);

        if (!isResizing) {
            return;
        }

        if (isResizing === 'w') {
            previousX = e.clientX;
        } else {
            previousY = e.clientY;
        }
    }

    function onMouseMove(e: MouseEvent) {
        if (!isResizing) return;

        if (getDragDirection(e) !== isResizing) {
            isResizing = false;
            return;
        }

        if (isResizing === 'w') {
            const deltaX = e.clientX - previousX;
            const newWidth = Math.max(resizableIframe.offsetWidth - deltaX, 100);
            resizableIframe.style.width = `${newWidth}px`;
            previousX = e.clientX;
        } else {
            const deltaY = e.clientY - previousY;
            const newHeight = Math.max(resizableIframe.offsetHeight - deltaY, 100);
            resizableIframe.style.height = `${newHeight}px`;
            previousY = e.clientY;
        }
    }

    function onMouseUp(e: MouseEvent) {
        // 避免再次触发点击事件
        e.preventDefault();
        isResizing = false;
    }

    window.addEventListener('resize', () => {
        resizableIframe.style.width = `${window.document.documentElement.clientWidth}px`;
        resizableIframe.style.height = `${window.document.documentElement.clientHeight}px`;
    });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="relative w-full h-full flex justify-end items-end">
    <div class="relative">
        <iframe
            title=""
            width={windowWidth}
            height={windowHeight}
            src={previewUrl}
            bind:this={resizableIframe}
        ></iframe>
        <div
            class="mp-collapse-toggle-btn"
            style="width: 30px; height: 60px; background: #ff296d;cursor:w-resize;position:absolute;left: 2px;top: 2px;transform:none;"
            data-direction="w"
            on:mousedown={onMouseDown}
            on:mousemove={onMouseMove}
            on:mouseup={onMouseUp}
        >
            <i
                data-direction="w"
                on:click|capture={onClick}
                class="mp-icon iconfont icon-a-12_leftarrow_small mp-icon-solid-disableHoverColor"
                style="font-size: 20px; line-height: 20px; width: 20px; height: 20px;rotate:180deg"
            ></i>
        </div>
        <div
            class="mp-collapse-toggle-btn"
            style="width: 60px; height: 30px; background: #ff296d;cursor:n-resize;position:absolute;left: 40px;top: 2px;transform:none;border-radius: 0 0 8px 8px;"
            data-direction="h"
            on:mousedown={onMouseDown}
            on:mousemove={onMouseMove}
            on:mouseup={onMouseUp}
        >
            <i
                data-direction="h"
                on:click={onClick}
                class="mp-icon iconfont icon-a-12_leftarrow_small mp-icon-solid-disableHoverColor"
                style="font-size: 20px; line-height: 20px; width: 20px; height: 20px;rotate: -90deg;"
            ></i>
        </div>
    </div>
</div>
