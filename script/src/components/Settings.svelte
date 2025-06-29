<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { BuildStage, debug, defaultConfig } from '../../../src';
    import _ from 'lodash';

    const dispatcher = createEventDispatcher();

    const cacheKey = 'iDocJson2HtmlSettings';
    const cacheSettings = JSON.parse(localStorage.getItem(cacheKey) || '{}');
    const defaultSettings = {
        /** 是否在新窗口中预览 */
        previewInNewWindow: false,
        /** 本地图片文件夹前缀 */
        localImagePrefix: './images/',
        /** tinypng api token */
        tinypngApiKey: '',
        debugOptions: debug,
        configOptions: defaultConfig
    };
    export const settings = _.merge(defaultSettings, cacheSettings as typeof defaultSettings);

    function onCloseClick() {
        const settings2 = _.cloneDeep(settings) as any;
        delete settings2.configOptions.treeOptions.blackListNodes;
        delete settings2.configOptions.treeOptions.whiteListNodes;
        localStorage.setItem(cacheKey, JSON.stringify(settings2));

        settings.configOptions.treeOptions.blackListNodes =
            settings.configOptions.treeOptions.blackListNodes.filter(id => _.trim(id));
        settings.configOptions.treeOptions.whiteListNodes =
            settings.configOptions.treeOptions.whiteListNodes.filter(id => _.trim(id));
        settings.configOptions.treeOptions.attachNodes =
            settings.configOptions.treeOptions.attachNodes.filter(id => _.trim(id));
        dispatcher('close');
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="fixed left-0 right-0 top-0 bottom-0 bg-[hsla(0,0%,0%,0.6)] flex justify-center pt-63 items-start">
    <div class="bg-white rounded-16 p-20 pb-60 flex flex-col w-650 relative">
        <i
            class="mp-icon iconfont icon-a-18_close_normal mp-icon-solid-disableHoverColor absolute top-10 right-10"
            style="color:#333;font-size:22px;line-height:36px;width:40px;height:36px;"
            on:click={onCloseClick}
        ></i>

        <div class="text-center mt-0 mb-8 text-26">选项配置</div>
        <div class="mb-8 text-21">基本选项</div>
        <label class="cursor-pointer flex items-center w-200">
            <input type="checkbox" class="w-15 h-15" bind:checked={settings.previewInNewWindow} />
            <span class="text-16/30 ml-6">在新窗口中预览</span>
        </label>
        <label class="flex items-center my-10 text-16/28">
            <span class="text-16/30 mr-20 italic">本地图片路径前缀</span>
            <input
                type="text"
                class="flex-1 rounded-6 py-0 px-8 border text-16/28"
                bind:value={settings.localImagePrefix}
            />
        </label>
        <!-- 有跨域问题 -->
        <!-- <label class="flex items-center my-10 text-16/28">
            <span class="text-16/30 mr-20 italic">TinyPNG API Key</span>
            <input
                type="text"
                class="flex-1 rounded-6 py-0 px-8 border text-16/28"
                bind:value={settings.tinypngApiKey}
            />
        </label> -->
        <div class="mt-20 mb-8 text-21">生成选项</div>
        <div class="flex flex-wrap">
            <label class="cursor-pointer flex items-center w-200">
                <input
                    type="checkbox"
                    class="w-15 h-15"
                    bind:checked={settings.configOptions.codeGenOptions.role}
                />
                <span class="text-16/30 ml-6">生成role属性</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input
                    type="checkbox"
                    class="w-15 h-15"
                    bind:checked={settings.configOptions.treeOptions.removeGhostNodes}
                />
                <span class="text-16/30 ml-6">删除幽灵节点</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input
                    type="checkbox"
                    class="w-15 h-15"
                    bind:checked={settings.configOptions.treeOptions.removeSliceSibings}
                />
                <span class="text-16/30 ml-6">删除切图多余节点</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input
                    type="checkbox"
                    class="w-15 h-15"
                    bind:checked={settings.configOptions.codeGenOptions.overflowMargin}
                />
                <span class="text-16/30 ml-6">为超出内容预留边距</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input
                    type="checkbox"
                    class="w-15 h-15"
                    bind:checked={settings.configOptions.codeGenOptions.textClamp}
                />
                <span class="text-16/30 ml-6">强制文本超出省略</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input
                    type="checkbox"
                    class="w-15 h-15"
                    bind:checked={settings.configOptions.codeGenOptions.listOverflowAuto}
                />
                <span class="text-16/30 ml-6">强制列表超出滚动</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input
                    type="checkbox"
                    class="w-15 h-15"
                    bind:checked={settings.configOptions.codeGenOptions.experimentalZIndex}
                />
                <span class="text-16/30 ml-6">开启zIndex检测</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input
                    type="checkbox"
                    class="w-15 h-15"
                    bind:checked={settings.configOptions.codeGenOptions.listItemSizeFixed}
                />
                <span class="text-16/30 ml-6">固定列表的高度/宽度</span>
            </label>
        </div>
        <input
            type="text"
            class="my-10 rounded-3 p-8 placeholder:text-[#999]"
            placeholder="参考根节点id"
            bind:value={settings.configOptions.treeOptions.refRootNode}
        />
        <textarea
            class="my-10 rounded-3 p-8 placeholder:text-[#999] resize-none"
            rows="4"
            placeholder="黑名单节点id，一行一个"
            value={settings.configOptions.treeOptions.blackListNodes.join('\n')}
            on:input={v =>
                (settings.configOptions.treeOptions.blackListNodes = v.currentTarget.value.split('\n'))}
        />
        <textarea
            class="my-10 rounded-3 p-8 placeholder:text-[#999] resize-none"
            rows="4"
            placeholder="白名单节点id，一行一个"
            value={settings.configOptions.treeOptions.whiteListNodes.join('\n')}
            on:input={v =>
                (settings.configOptions.treeOptions.whiteListNodes = v.currentTarget.value.split('\n'))}
        />
        <textarea
            class="mt-10 rounded-3 p-8 placeholder:text-[#999] resize-none"
            rows="2"
            placeholder="绝对定位节点id，一行一个"
            value={settings.configOptions.treeOptions.attachNodes.join('\n')}
            on:input={v =>
                (settings.configOptions.treeOptions.attachNodes = v.currentTarget.value.split('\n'))}
        />
        <div class="mt-20 mb-8 text-21">调试选项</div>
        <div class="flex flex-wrap">
            <label class="cursor-pointer flex items-center w-200">
                <input type="checkbox" class="w-15 h-15" bind:checked={settings.debugOptions.showId} />
                <span class="text-16/30 ml-6">显示id</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input type="checkbox" class="w-15 h-15" bind:checked={settings.debugOptions.showDirection} />
                <span class="text-16/30 ml-6">显示flex方向</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input type="checkbox" class="w-15 h-15" bind:checked={settings.debugOptions.showSizeSpec} />
                <span class="text-16/30 ml-6">显示尺寸类型</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input
                    type="checkbox"
                    class="w-15 h-15"
                    bind:checked={settings.debugOptions.keepOriginalTree}
                />
                <span class="text-16/30 ml-6">维持设计稿树结构</span>
            </label>
            <label class="cursor-pointer flex items-center w-200">
                <input type="checkbox" class="w-15 h-15" bind:checked={settings.debugOptions.buildAllNodes} />
                <span class="text-16/30 ml-6">生成设计稿所有节点</span>
            </label>
        </div>
        <div
            class="flex"
            style="
                white-space: nowrap;
                justify-content: space-between;
                line-height: 40px;
                border-top: 1px dashed;
                border-bottom: 1px dashed;
                margin-top: 20px;
                font-size: 14px;
                font-weight: bold;
            "
        >
            <div>编译到哪一步：</div>

            <label class="cursor-pointer flex items-center">
                <input
                    class="w-15 h-15"
                    name="buildToStage"
                    type="radio"
                    value={BuildStage.Pre}
                    bind:group={settings.debugOptions.buildToStage}
                />
                <span class="ml-4">只处理设计稿样式</span>
            </label>
            <label class="cursor-pointer flex items-center">
                <input
                    class="w-15 h-15"
                    name="buildToStage"
                    type="radio"
                    value={BuildStage.Tree}
                    bind:group={settings.debugOptions.buildToStage}
                />
                <span class="ml-4">生成一颗flex树</span>
            </label>
            <label class="cursor-pointer flex items-center">
                <input
                    class="w-15 h-15"
                    name="buildToStage"
                    type="radio"
                    value={BuildStage.Measure}
                    bind:group={settings.debugOptions.buildToStage}
                />
                <span class="ml-4">对flex进行测量布局</span>
            </label>
        </div>
    </div>
</div>
