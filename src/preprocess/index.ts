import * as _ from 'lodash';
import { debug, defaultConfig } from '../config';
import { Color, Node } from '../page';
import { filterEmpty } from '../utils';
import { SizeSpec, VNode, addRole, context, isEqualBox, newVNode } from '../vnode';
import { stylishBox } from './stylishBox';
import { stylishText } from './stylishText';

function floats2Int(node: Node) {
    node.bounds = _.mapValues(node.bounds, n => Math.round(n));
}

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
    vnode.classList.push(`bg-cover bg-[url(https://idoc.mucang.cn${node.slice.bitmapURL})]`);
    // (vnode.style??={}).backgroundImage = `url(https://idoc.mucang.cn${(node.slice.bitmapURL)})`;
    vnode.widthSpec = SizeSpec.Fixed;
    vnode.heightSpec = SizeSpec.Fixed;
}

function stylishImage(node: Node, vnode: VNode) {
    if (!debug.buildAllNodes) {
        node.children = [];

        // 图片占满屏幕，一般是截的一个背景图
        if (isEqualBox(vnode, context.root)) {
            return null;
        }
    }

    // vnode.classList.push('bg-cover');
    // (vnode.style ??= {}).backgroundImage = "url()";
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
    // 防止被当作幽灵节点删除
    vnode.classList = ['$ghost'];
    vnode.widthSpec = SizeSpec.Fixed;
    vnode.heightSpec = SizeSpec.Fixed;
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
            ...node.bounds,
            right: node.bounds.left + node.bounds.width,
            bottom: node.bounds.top + node.bounds.height
        }
    });

    // 根节点决定设计尺寸
    if (level === 0) {
        stylishRoot(node, vnode);
    }
    // 处理顶层的symbol类型的node，一般是标题栏和底部安全区域
    else if (level === 1 && node.basic.type === 'symbol' && node.basic.realType === 'SymbolInstance') {
        // stylishSymbol(node, vnode);
    }
    // 将切图的children清空，切图只保留本身图片
    else if (node.slice.bitmapURL) {
        stylishSlice(node, vnode);
    }
    // 占位图
    else if (node.basic.type === 'image' && node.basic.realType === 'Image') {
        stylishImage(node, vnode);
    }
    // 文本节点
    else if (node.basic.type === 'text' && node.basic.realType === 'Text') {
        stylishText(node, vnode);
    }
    // 容器
    else if (
        (node.basic.type === 'group' && node.basic.realType === 'Group') ||
        (node.basic.type === 'rect' && node.basic.realType === 'ShapePath') ||
        (node.basic.type === 'path' && node.basic.realType === 'ShapePath') ||
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
    if (!vnode.textContent) {
        stylishBox(node, vnode);
    }

    if (!debug.buildAllNodes) {
        // 目前先这样处理，有slice节点，则删掉其他兄弟节点
        const sliceChild = _.find(
            node.children,
            node => node.basic.type === 'shape' && node.basic.realType === 'Slice'
        );
        if (sliceChild) {
            node.children = _.filter(node.children, node => !!node.slice.bitmapURL);
            if (node.children.length > 1) {
                console.warn('切图可能重复');
            }
        }
    }

    // 将children限定在父容器内，比如Image
    node.children = _.map(node.children, child => {
        const top = Math.max(child.bounds.top, node.bounds.top);
        const left = Math.max(child.bounds.left, node.bounds.left);
        const bottom = Math.min(child.bounds.top + child.bounds.height, node.bounds.top + node.bounds.height);
        const right = Math.min(child.bounds.left + child.bounds.width, node.bounds.left + node.bounds.width);
        child.bounds.top = top;
        child.bounds.left = left;
        child.bounds.width = right - left;
        child.bounds.height = bottom - top;
        // 去掉小数
        floats2Int(child);
        return child;
    });

    if (defaultConfig.codeGenOptions.experimentalZIndex) {
        const [hasRight, noRight] = _.partition(node.children, n => 'right' in n.bounds);
        node.children = hasRight
            .reverse()
            .map((n, i) => {
                // @ts-ignore
                n._index = i + 1;
                return n;
            })
            .concat(noRight);

        // @ts-ignore
        if (node._index) {
            // @ts-ignore
            vnode.classList.push(`z-${node._index}`);
        } else if (vnode.textContent) {
            vnode.classList.push('z-10');
        }
    }

    const children = _.map(node.children, n => preprocess(n, level + 1)).filter(filterEmpty);
    if (children.length) {
        vnode.children = children;
    }

    return vnode;
}
