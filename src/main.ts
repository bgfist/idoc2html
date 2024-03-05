import { Page } from "./page";
import { postprocess } from "./postprocess";
import { preprocess } from "./preprocess";
import { assert } from "./utils";
import { VNode } from "./vnode";
import * as _ from 'lodash';

function VNode2Code(vnode: VNode) {
    const { tagName = 'div', children } = vnode;
    const attributes = {
        ...vnode.attributes
    };
    vnode.classList.length && Object.assign(attributes, { class: vnode.classList.join(' ') });
    vnode.style && Object.assign(attributes, { style: Object.entries(vnode.style).map(([key, value]) => `${key}: ${value}`).join(';') });
    const attributesString = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ');

    if (children && children.length) {
        return `<${tagName}>${vnode.children?.map(VNode2Code).join('')}</${tagName}>`;
    } else if (vnode.textContent) {
        const textContent = _.isArray(vnode.textContent) ? _.map(vnode.textContent, VNode2Code).join('') : vnode.textContent;
        return `<${tagName} ${attributesString}>${textContent}</${tagName}>`;
    } else {
        return `<${tagName} ${attributesString} />`;
    }
}

function page2VNode(page: Page) {
    const root = page.layers;
    assert(root.basic.type === 'group' && root.basic.realType === 'Artboard', '页面根节点不对');

    // 先遍历整棵树，进行预处理，删除一些不必要的节点，将节点的前景背景样式都计算出来，对节点进行分类标记
    const vnode = preprocess(root, true)!;
    postprocess(vnode.children!, vnode);

    return vnode;
}

export function transform(page: Page) {
    return VNode2Code(page2VNode(page));
}