import _ from 'lodash';
import { html2VNode } from '../differ/deCompile';
import { debug } from '../main/config';
import tailwindConfigTemplate from '../templates/tailwind.config.template';
import { VNode } from '../vnode';
import * as android from './android';
import * as flutter from './flutter';
import * as harmony from './harmony';
import * as html from './html';
import * as ios from './ios';
import * as jetpackCompose from './jetpackCompose';
import * as miniApp from './miniApp';
import * as reactNative from './reactNative';
import * as swiftUI from './swiftUI';
import { extractColorPresets } from './tailwind/extractColorPresets';

export enum TargetPlatform {
    html = 'html',
    miniApp = '小程序',
    flutter = 'Flutter',
    reactNative = 'React Native',
    android = 'Android',
    ios = 'iOS',
    harmony = '鸿蒙',
    swiftUI = 'SwiftUI',
    jetpackCompose = 'JetpackCompose'
}

export interface Generator {
    VNode2Code(vnode: VNode, level: number, recursive: boolean): string;
}

export interface Template {
    code: string;
    description: string;
    title: string;
}

export function html2Platform(
    targetPlatform: string,
    code: string,
    params: {
        useTailwindcss: boolean;
        extractColorPresets: boolean;
        useRemUnit: boolean;
        remBase: number;
    }
): Template[] {
    const generators: Record<string, Generator> = {
        html,
        miniApp,
        flutter,
        reactNative,
        android,
        ios,
        harmony,
        swiftUI,
        jetpackCompose
    };
    if (!generators[targetPlatform]) {
        throw new Error(`Unsupported target platform: ${targetPlatform}`);
    }

    function maskDebug<T extends (...args: any[]) => any>(fn: T) {
        return function (...args: any[]) {
            const { showId, showDirection, showSizeSpec } = debug;
            debug.showId = false;
            debug.showDirection = false;
            debug.showSizeSpec = false;

            function resetDebug() {
                debug.showId = showId;
                debug.showDirection = showDirection;
                debug.showSizeSpec = showSizeSpec;
            }

            let res;
            try {
                res = fn.apply(null, args);
            } catch (err) {
                resetDebug();
                throw err;
            }
            resetDebug();
            return res;
        } as T;
    }

    function generateTemplates() {
        let cssTemplate: Template | undefined;
        let htmlTemplate: Template | undefined;
        let configTemplate: Template | undefined;

        configTemplate = {
            code: tailwindConfigTemplate as any,
            title: 'taiwind.config.js',
            description: 'Tailwind配置文件'
        };
        if (params.extractColorPresets) {
            const res = extractColorPresets(code);
            code = res.code;

            if (!_.isEmpty(res.colors)) {
                const colorLines = JSON.stringify(res.colors, null, 8);
                configTemplate.code = configTemplate.code.replace(
                    'colors: {\n',
                    'colors: {\n' + colorLines.slice(2, -1)
                );
            }
        }
        if (targetPlatform === 'miniApp') {
            configTemplate.code = configTemplate.code.replace(`i + 'px'`, `i * 2 + 'rpx'`);
        } else if (targetPlatform === 'html' && params.useRemUnit) {
            configTemplate.code = configTemplate.code.replace(`i + 'px'`, `i / ${params.remBase} + 'rem'`);
        }

        const vnode = html2VNode(code);

        htmlTemplate = {
            code: generators[targetPlatform].VNode2Code(vnode, 0, true),
            title: 'index' + (targetPlatform === 'html' ? '.html' : '.wxml'),
            description: ''
        };

        return [htmlTemplate, configTemplate, cssTemplate].filter(t => t) as Template[];
    }

    return maskDebug(generateTemplates)();
}
