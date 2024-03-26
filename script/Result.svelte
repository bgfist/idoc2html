<script context="module" lang="ts">
    export interface ResultItem {
        code: string;
        title: string;
        description: string;
    }
</script>

<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let results: ResultItem[];

    const dispatcher = createEventDispatcher();

    let selectIdx = 0;
    $: currentResult = results[selectIdx];
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed left-0 right-0 top-0 bottom-0 bg-[hsla(0,0%,0%,0.6)] flex justify-center pt-63 items-start">
    <div class="bg-white rounded-16 p-20 pb-60 flex flex-col w-650 relative">
        <i
            class="mp-icon iconfont icon-a-18_close_normal mp-icon-solid-disableHoverColor absolute top-10 right-10"
            style="color:#333;font-size:22px;line-height:36px;width:40px;height:36px;"
            on:click={() => dispatcher('close')}
        ></i>

        <!-- tabs -->
        <div class="flex">
            {#each results as result, i}
                <div
                    class="px-10 {selectIdx === i ? 'rounded-4 bg-white text-gray' : ''}"
                    on:click={() => (selectIdx = i)}
                >
                    {result.title}
                </div>
            {/each}
        </div>
        <div class="">复制代码</div>
        <div class="">{currentResult.description}</div>
        <div class="h-800 overflow-auto">{currentResult.code}</div>
    </div>
</div>
