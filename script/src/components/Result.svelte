<script context="module" lang="ts">
    export interface ResultItem {
        code: string;
        title: string;
        description: string;
    }
</script>

<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { makeToast } from '../utils';

    export let results: ResultItem[];

    const dispatcher = createEventDispatcher();

    let selectIdx = 0;
    $: currentResult = results[selectIdx];

    function onCopyCodeClick() {
        navigator.clipboard.writeText(currentResult.code).then(
            () => {
                makeToast('复制成功', { fontSize: '80px', border: 'success', time: 500 });
            },
            function (err) {
                makeToast('复制失败!', { fontSize: '80px', border: 'error' });
            }
        );
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed left-0 right-0 top-0 bottom-0 bg-[hsla(0,0%,0%,0.6)]">
    <div
        class="bg-white rounded-16 p-20 pt-50 flex flex-col w-800 absolute top-60 bottom-60 left-1/2"
        style="transform: translateX(-50%);"
    >
        <i
            class="mp-icon iconfont icon-a-18_close_normal mp-icon-solid-disableHoverColor absolute top-10 right-10"
            style="color:#333;font-size:22px;line-height:36px;width:40px;height:36px;"
            on:click={() => dispatcher('close')}
        ></i>

        <!-- tabs -->
        <div
            class="flex text-16/30 rounded-6 bg-gray-60 overflow-x-auto text-white border-2 border-gray-60 border-solid"
        >
            {#each results as result, i}
                <div
                    class="px-10 {selectIdx === i ? 'rounded-6 bg-white text-[#2e2f30]' : 'cursor-pointer'}"
                    on:click={() => (selectIdx = i)}
                >
                    {result.title}
                </div>
            {/each}
        </div>
        <div
            class="my-10 flex items-center justify-center bg-[#ff296d] text-16/36 text-white rounded-6 cursor-pointer"
            data-id="generateBtn"
            on:click={onCopyCodeClick}
        >
            复制代码
        </div>
        <div class="">{currentResult.description}</div>
        <div class="flex-1 overflow-auto whitespace-pre-wrap text-[#d4d4d4] bg-[#1e293b] text-14/24 p-10">
            {currentResult.code}
        </div>
    </div>
</div>
