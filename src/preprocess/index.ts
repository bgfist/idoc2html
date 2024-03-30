import * as _ from 'lodash';
import { debug, defaultConfig } from '../main/config';
import { Color, Node } from './page';
import { filterEmpty } from '../utils';
import { SizeSpec, VNode, addRole, context, isEqualBox, newVNode } from '../vnode';
import { stylishBox } from './stylishBox';
import { stylishText } from './stylishText';
import {
    float2Int,
    getIntersectionBox,
    isContainedWithin,
    isImageNode,
    isSymbolNode,
    isTextNode
} from './helpers';

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
    // 将children限定在页面内，比如Image
    return _.filter(nodes, child => {
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
        bounds: {
            left: float2Int(node.bounds.left),
            top: float2Int(node.bounds.top),
            width: float2Int(node.bounds.width),
            height: float2Int(node.bounds.height),
            right: float2Int(node.bounds.left + node.bounds.width),
            bottom: float2Int(node.bounds.top + node.bounds.height)
        }
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

    node.children = processOverBoundsNodes(node, node.children, level);

    if (!debug.buildAllNodes) {
        // 目前先这样处理，有slice节点，则删掉其他兄弟节点
        const sliceChild = _.find(
            node.children,
            node => node.basic.type === 'shape' && node.basic.realType === 'Slice'
        );
        if (sliceChild) {
            let [slices, leftover] = _.partition(node.children, node => !!node.slice.bitmapURL);
            if (slices.length > 1) {
                console.warn('切图可能重复');
            }
            node.children = slices;
            leftover = processOverBoundsNodes(sliceChild, leftover, level);
            if (leftover.length) {
                console.debug('删掉切图的兄弟节点', leftover);
            }
        }
    }

    if (defaultConfig.codeGenOptions.experimentalZIndex) {
        const [hasRight, noRight] = _.partition(node.children, n => 'right' in n.bounds);

        if (hasRight.length) {
            node.children = hasRight
                .reverse()
                .map((n, i) => {
                    // @ts-ignore
                    n._index = i + 1;
                    return n;
                })
                .concat(
                    noRight.map(n => {
                        if (isTextNode(n)) {
                            // @ts-ignore
                            n._index = 10;
                        }
                        return n;
                    })
                );
        }
        // @ts-ignore
        if (node._index) {
            // @ts-ignore
            vnode.classList.push(`z-${node._index}`);
        }
    }

    vnode.children.push(..._.map(node.children, n => preprocess(n, level + 1)).filter(filterEmpty));

    return vnode;
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
