import * as _ from 'lodash';
import { debug, defaultConfig } from '../main/config';
import { Color, Node } from './page';
import { filterEmpty } from '../utils';
import { SizeSpec, VNode, addRole, context, getClassName, newVNode } from '../vnode';
import { stylishBox } from './stylishBox';
import { stylishText } from './stylishText';
import {
    getIntersectionBox,
    getNodeBounds,
    isContainedWithin,
    isEqualBox,
    isImageNode,
    isSymbolNode,
    isTextNode
} from './helpers';
import { processSlice } from './slice';
import { processZIndex } from './zIndex';

function opacity2ColorAlpha(node: Node) {
    const opacity = node.basic.opacity;

    if (opacity === 1) {
        return;
    }

    function setColor(color: Color) {
        if (color.type === 'normal') {
            color.value.a = color.value.a * opacity;
        } else if (color.type === 'linearGradient') {
            _.each(color.value.colorStops, stop => {
                stop.color.a = stop.color.a * opacity;
            });
        }
    }

    if (node.fill && node.fill.colors) {
        _.each(node.fill.colors, setColor);
    }
    if (node.text && node.text.styles) {
        _.each(node.text.styles, s => setColor(s.font.color));
    }
    if (node.stroke && node.stroke.borders) {
        _.each(node.stroke.borders, b => setColor(b.color));
    }
    if (node.effect && node.effect.shadows) {
        _.each(node.effect.shadows, s => setColor(s.color));
    }
}

/** 检查元素是否肉眼不可见，这种元素可以删掉 */
function checkNearlyInvisible(node: Node) {}

function stylishRoot(node: Node, vnode: VNode) {
    context.root = vnode;
    addRole(vnode, 'page');
    vnode.widthSpec = SizeSpec.Constrained;
    vnode.heightSpec = SizeSpec.Auto;
    vnode.classList.push('w-full min-h-[100vh]');
}

// TODO: 有的symbol会重复很多，处理一下
function stylishSymbol(node: Node, vnode: VNode) {
    if (!debug.buildAllNodes) {
        node.children = [];
    }
    if (node.bounds.top === 0 && node.bounds.left === 0) {
        vnode.tagName = 'com:header';
        vnode.widthSpec = SizeSpec.Constrained;
        vnode.heightSpec = SizeSpec.Fixed;
    } else {
        vnode.classList.push('safearea-bottom');
        vnode.widthSpec = SizeSpec.Constrained;
        vnode.heightSpec = SizeSpec.Fixed;
    }
}

function stylishSlice(node: Node, vnode: VNode) {
    if (!debug.buildAllNodes) {
        node.children = [];
    }
    // TODO: 处理切图尺寸和实际不一致的问题？
    vnode.classList.push('bg-cover');
    vnode.classList.push(`bg-[url(https://idoc.mucang.cn${node.slice.bitmapURL})]`);
    // vnode.style['background-image'] = `url(https://idoc.mucang.cn${(node.slice.bitmapURL)})`;
    vnode.widthSpec = SizeSpec.Fixed;
    vnode.heightSpec = SizeSpec.Fixed;
}

function stylishImage(node: Node, vnode: VNode) {
    if (!debug.buildAllNodes) {
        node.children = [];
    }

    // 图片占满屏幕，一般是截的一个背景图
    if (isEqualBox(vnode, context.root)) {
        return null;
    }

    // vnode.classList.push('bg-cover');
    // vnode.style['background-image'] = "url()";
    // img元素不能有子节点，可以尝试包一层
    vnode.attachNodes = [
        newVNode({
            tagName: 'img',
            bounds: {
                ...vnode.bounds
            },
            widthSpec: SizeSpec.Constrained,
            heightSpec: SizeSpec.Constrained,
            classList: ['block object-cover w-full h-full'],
            attributes: {
                src: ''
            }
        })
    ];
    vnode.tagName = 'img';
    // 防止被当作幽灵节点删除
    vnode.classList = [context.voidElementMarker];
    vnode.widthSpec = SizeSpec.Fixed;
    vnode.heightSpec = SizeSpec.Fixed;
}

function processOverBoundsNodes(refNode: Node, nodes: Node[], level: number) {
    // TODO: 处理mask类型
    const masks = _.filter(nodes, node => node.basic.type === 'mask');
    if (masks.length) {
        if (masks.length > 1) {
            console.error(
                '发现多个mask节点',
                masks.map(n => n.basic.id + ',' + n.basic.realType)
            );
        }
        const mask = masks[0];
        if (!isEqualBox(mask, refNode)) {
            console.error('mask节点与父节点不一样大', mask.basic.id);
        }
    }

    // 将children限定在页面内，比如Image
    return _.filter(nodes, child => {
        if (masks.length || isImageNode(child)) {
            child.bounds = getIntersectionBox(child, refNode);
            return true;
        }
        if (!isContainedWithin(child, context.root)) {
            console.warn('节点超出页面范围,裁切至可见', child.basic.id);
            child.bounds = getIntersectionBox(child, context.root);
        }
        if (!isContainedWithin(child, refNode)) {
            console.warn('节点超出父节点范围,剥离至根节点', child.basic.id);
            const vnode = preprocess(child, level + 1);
            if (vnode) {
                context.root.children.push(vnode);
            }
            return false;
        }
        return true;
    });
}

/** 预先生成带前景背景样式的盒子 */
export function preprocess(node: Node, level: number): VNode | null {
    // TODO: 幕客给的json不够详细，有的节点不可见却还是放出来了
    if (defaultConfig.blackListNodes.includes(node.basic.id)) {
        return null;
    }

    if (node.bounds.height <= 0 || node.bounds.width <= 0) {
        console.warn('遇到无用空节点,忽略');
        return null;
    }

    if (!node.basic.opacity) {
        console.warn('元素透明，但仍保留以维持原有层级');
    }

    // 将不透明度转成alpha
    opacity2ColorAlpha(node);

    const vnode = newVNode({
        id: node.basic.id,
        classList: [],
        bounds: getNodeBounds(node)
    });

    // 根节点决定设计尺寸
    if (level === 0) {
        checkUnknownNode(node);
        stylishRoot(node, vnode);
    }
    // 处理顶层的symbol类型的node，一般是标题栏和底部安全区域
    else if (level === 1 && isSymbolNode(node)) {
        // stylishSymbol(node, vnode);
    }
    // 将切图的children清空，切图只保留本身图片
    else if (node.slice.bitmapURL) {
        stylishSlice(node, vnode);
    }
    // 占位图
    else if (isImageNode(node)) {
        stylishImage(node, vnode);
    }
    // 文本节点
    else if (isTextNode(node)) {
        stylishText(node, vnode);
    } else if (node.basic.type === 'oval' && node.basic.realType === 'ShapePath') {
        // 椭圆形
        vnode.classList.push('rounded-[50%]');
    }
    // 容器
    else if (
        (node.basic.type === 'group' && node.basic.realType === 'Group') ||
        (node.basic.type === 'rect' && node.basic.realType === 'ShapePath') ||
        (node.basic.type === 'path' && node.basic.realType === 'ShapePath') ||
        (node.basic.type === 'mask' && node.basic.realType === 'ShapePath') ||
        (node.basic.type === 'mask' && node.basic.realType === 'Shape') ||
        (node.basic.type === 'symbol' && node.basic.realType === 'SymbolInstance')
    ) {
    }
    // 其他不识别的节点全部清掉
    // 如果没有子节点也没有样式，清掉该节点
    else {
        if (!debug.buildAllNodes) {
            return null;
        }
    }

    // 处理外观样式
    if (!isTextNode(node)) {
        stylishBox(node, vnode);
    }

    if (!debug.buildAllNodes) {
        processSlice(node, vnode, level);
    }

    node.children = processOverBoundsNodes(node, node.children, level);

    if (defaultConfig.codeGenOptions.experimentalZIndex) {
        processZIndex(node, vnode);
    }

    vnode.children.push(..._.map(node.children, n => preprocess(n, level + 1)).filter(filterEmpty));

    return vnode;
}

/** 如果有节点跟页面一样大，且背景是hsla(0,0,0,0.5)这种，就认为它是弹窗 */
export function pickOnlyDialogIfDetected(vnode: VNode) {
    if (isEqualBox(vnode, context.root)) {
        const bgHSLA = getClassName(vnode).match(/bg-\[hsla\((.+?)\)\]/);
        if (bgHSLA) {
            const [h, s, l, a] = bgHSLA[1].split(',');
            if (h === '0' && s === '0%' && l === '0%' && +a < 0.9 && +a > 0.3) {
                console.debug('检测到弹窗节点');
                addRole(vnode, 'dialog');
                vnode.classList.push('fixed left-0 right-0 top-0 bottom-0');
                return vnode;
            }
        }
    }

    for (const child of vnode.children) {
        if (pickOnlyDialogIfDetected(child)) {
            return child;
        }
    }
    return null;
}

function checkUnknownNode(node: Node) {
    const knownTypes = [
        ['group', 'Artboard'],
        ['group', 'Group'],
        ['path', 'ShapePath'],
        ['rect', 'ShapePath'],
        ['text', 'Text'],
        ['shape', 'Slice'],
        ['oval', 'ShapePath'],
        ['image', 'Image'],
        ['mask', 'ShapePath'],
        ['shape', 'Shape'],
        ['mask', 'Shape'],
        ['symbol', 'SymbolInstance']
    ];
    if (!_.find(knownTypes, t => t[0] === node.basic.type && t[1] === node.basic.realType)) {
        console.warn('未知的节点类型', node.basic.type, node.basic.realType, node.basic.id);
    }
    _.each(node.children, checkUnknownNode);
}
