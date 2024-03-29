// 小程序样式不支持转义字符，需要抽取[]任意值给个名字，text-16/20改成两个class，top-1/2和translate-1/2换个名字
// px转成rpx

import _ from 'lodash';
import { defaultConfig } from '../main/config';
import { VNode, getClassName } from '../vnode';

const TAB = '  ';

/**
 * 根据vnode信息生成wxml代码
 *
 * @param vnode
 * @param level
 * @param recursive 是否递归生成
 * @returns
 */
export function VNode2Code(vnode: VNode, level: number, recursive: boolean): string {
    const tab = TAB.repeat(level);
    let {
        tagName = 'div',
        classList,
        style,
        attributes,
        children,
        attachNodes,
        textContent = '',
        role
    } = vnode;

    tagName = replaceTagName(tagName);

    const prependAttrs: Record<string, string> = {};
    if (defaultConfig.codeGenOptions.role) {
        prependAttrs['role'] = _.uniq(role).join(',');
    }
    attributes = {
        ...prependAttrs,
        ...attributes
    };

    if (classList.length) {
        Object.assign(attributes, { class: getClassName(vnode) });
    }
    if (style) {
        Object.assign(attributes, {
            style: Object.entries(style)
                .map(([key, value]) => `${key}: ${value}`)
                .join(';')
        });
    }
    attributes = _.omitBy(attributes, v => _.isNil(v) || v === '');
    const attributesString = Object.entries(attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');

    children = _.concat(children || [], attachNodes || []);

    if (_.isArray(textContent)) {
        textContent = `\n${_.map(textContent, n => VNode2Code(n, level + 1, recursive)).join('\n')}\n${tab}`;
    }

    if (children && children.length && recursive) {
        // 文本节点可能有依附的绝对定位元素, 文本保持最高层级
        if (textContent) {
            textContent = `\n${tab}${TAB}<div class="relative z-10">${textContent}</div>`;
        }
        return `${tab}<${tagName} ${attributesString}>${textContent}\n${children.map(n => VNode2Code(n, level + 1, recursive)).join('\n')}\n${tab}</${tagName}>`;
    }
    return `${tab}<${tagName} ${attributesString}>${textContent}</${tagName}>`;
}

function replaceTagName(tagName: string) {
    if (tagName === 'div') {
        return 'view';
    } else if (tagName === 'span') {
        return 'text';
    } else if (tagName === 'img') {
        return 'image';
    }
    return tagName;
}
