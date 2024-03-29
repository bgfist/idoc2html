import * as html from './html';
import * as miniApp from './miniApp';
import * as flutter from './flutter';
import * as reactNative from './reactNative';
import * as android from './android';
import * as ios from './ios';
import * as harmony from './harmony';
import * as swiftUI from './swiftUI';
import * as jetpackCompose from './jetpackCompose';
import { VNode } from '../vnode';
import { html2VNode } from '../differ/deCompile';
import { extractTailwindStyle } from './tailwind/extractTailwindStyle';
import { debug } from '../main/config';

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

export function html2Platform(targetPlatform: string, code: string, useTailwindcss: boolean): Template[] {
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
        let jsTemplate: Template | undefined;

        if (targetPlatform === 'html' && useTailwindcss) {
            htmlTemplate = {
                code,
                title: 'index.html',
                description: ''
            };
            return [htmlTemplate];
        }

        const vnode = html2VNode(code);
        if (!useTailwindcss && (targetPlatform === 'html' || targetPlatform === 'miniApp')) {
            cssTemplate = {
                code: extractTailwindStyle(vnode),
                title: 'index' + targetPlatform === 'html' ? '.css' : '.wxss',
                description: ''
            };
        }

        htmlTemplate = {
            code: generators[targetPlatform].VNode2Code(vnode, 0, true),
            title: 'index' + targetPlatform === 'html' ? '.html' : '.wxml',
            description: ''
        };

        return [htmlTemplate, cssTemplate].filter(t => t) as Template[];
    }

    return maskDebug(generateTemplates)();
}
