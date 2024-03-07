import { Page } from "./page";
import { postprocess } from "./postprocess";
import { preprocess } from "./preprocess";
import { assert } from "./utils";
import { VNode } from "./vnode";
import * as _ from 'lodash';

const TAB = '  ';
function VNode2Code(vnode: VNode, level: number): string {
    const tab = TAB.repeat(level);
    const { tagName = 'div', children } = vnode;
    let attributes = {
        ...vnode.attributes
    };
    vnode.classList.length && Object.assign(attributes, { class: vnode.classList.filter(Boolean).join(' ') });
    vnode.style && Object.assign(attributes, { style: Object.entries(vnode.style).map(([key, value]) => `${key}: ${value}`).join(';') });
    attributes = _.omitBy(attributes, v => _.isNil(v) || v === '');
    const attributesString = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ');

    if (children && children.length) {
        return `${tab}<${tagName} ${attributesString}>\n${vnode.children?.map(n => VNode2Code(n, level + 1)).join('\n')}\n${tab}</${tagName}>`;
    } else if (vnode.textContent) {
        if (!_.isArray(vnode.textContent)) {
            return `${tab}<${tagName} ${attributesString}>${vnode.textContent}</${tagName}>`;
        } else {
            return `${tab}<${tagName} ${attributesString}>${_.map(vnode.textContent, n => (VNode2Code(n, level + 1))).join('\n')}${tab}</${tagName}>`;
        }
    } else {
        return `${tab}<${tagName} ${attributesString} />`;
    }
}

function page2VNode(page: Page) {
    const root = page.layers || (page as unknown as Node);
    assert(root.basic.type === 'group' && root.basic.realType === 'Artboard', '页面根节点不对');

    // 先遍历整棵树，进行预处理，删除一些不必要的节点，将节点的前景背景样式都计算出来，对节点进行分类标记
    const vnode = preprocess(root, 0)!;
    postprocess(vnode);

    return vnode;
}

export function transform(page: Page) {
    return VNode2Code(page2VNode(page), 0);
}