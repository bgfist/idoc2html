import * as _ from 'lodash';
import { SizeSpec, VNode, context } from './vnode';
import { LinearColor, RGBA, Node } from './page';
import { R, assert, filterEmpty, maxCountGroup } from './utils';

function getNormalColor(rgba: RGBA): string {
    let r = rgba.r / 255;
    let g = rgba.g / 255;
    let b = rgba.b / 255;
    let a = rgba.a;
    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let l = (max + min) / 2;
    let s = l === 0 || l === 1 ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (max === min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r:
                h = ((g - b) / (max - min)) % 6;
                break;
            case g:
                h = (b - r) / (max - min) + 2;
                break;
            case b:
                h = (r - g) / (max - min) + 4;
                break;
        }
        h = Math.round(h * 60);
    }
    s = Math.round(s * 100);
    l = Math.round(l * 100);
    return `[hsla(${h},${s}%,${l}%,${a})]`;
}

function getLinearColor(dom: VNode, color: LinearColor) {
    const { fromX, fromY, toX, toY, colorStops } = color.value;

    assert(colorStops.length >= 2, 'linear-gradient必须包含两个颜色节点');

    let angle = Math.round(Math.atan2(toY - fromY, toX - fromX) * (180 / Math.PI));
    angle = 90 - angle;
    if (angle < 0) {
        angle = 360 + angle;
    }
    const angleMap: { [key: number]: string } = {
        0: 'to-t',
        45: 'to-tr',
        90: 'to-r',
        135: 'to-br',
        180: 'to-b',
        225: 'to-bl',
        270: 'to-l',
        315: 'to-tl'
    };

    if (!angleMap[angle]) {
        console.error('暂不支持任意渐变角度', angle);
    }

    dom.classList.push(`bg-gradient-${angleMap[angle]}`);

    const getPercent = (position: number) => {
        const percent = Math.round(position * 100);
        if (percent % 5 !== 0) {
            return `[${percent}%]`;
        } else {
            return `${percent}%`;
        }
    }

    // 起点和终点的颜色
    const [start, ...stops] = colorStops;
    const end = stops.pop()!;
    // 起点颜色和位置
    dom.classList.push(`from-${getNormalColor(start.color)}`);
    if (start.position !== 0) {
        dom.classList.push(`from-${getPercent(start.position)}`);
    }
    // 如果有多个停止点，添加 via 类
    stops.forEach(stop => {
        dom.classList.push(`via-${getNormalColor(stop.color)}`);
        if (stop.position !== 0.5) {
            dom.classList.push(`via-${getPercent(stop.position)}`);
        }
    });
    // 终点颜色和位置
    dom.classList.push(`to-${getNormalColor(end.color)}`);
    if (end.position !== 1) {
        dom.classList.push(`to-${getPercent(end.position)}`);
    }
}

export function preprocess(node: Node, level: number): VNode | null {
    // 去掉小数
    node.bounds = _.mapValues(node.bounds, n => Math.round(n));
    const vnode: VNode = {
        classList: [],
        bounds: {
            ...node.bounds,
            right: node.bounds.left + node.bounds.width,
            bottom: node.bounds.top + node.bounds.height,
        },
        index: context.index++,
    };

    // 根节点决定设计尺寸
    if (level === 0) {
        if (node.bounds.width === 375 || node.bounds.width === 750) {
            vnode.widthSpec = SizeSpec.Fixed;
            vnode.heightSpec = SizeSpec.Constrained;
        } else if (node.bounds.height === 375 || node.bounds.height === 750) {
            vnode.widthSpec = SizeSpec.Constrained;
            vnode.heightSpec = SizeSpec.Fixed;
        } else {
            throw new Error('暂不支持这种设计尺寸');
        }
        vnode.classList.push('w-[100vw] h-[100vh]');
    }
    // 处理顶层的symbol类型的node，一般是标题栏和底部安全区域
    else if (level === 1 && node.basic.type === 'symbol' && node.basic.realType === 'SymbolInstance') {
        node.children = [];
        if (node.bounds.top === 0 && node.bounds.left === 0) {
            vnode.tagName = 'com:header';
            vnode.widthSpec = SizeSpec.Constrained;
            vnode.heightSpec = SizeSpec.Auto;
        } else {
            vnode.classList.push('safearea-bottom');
            vnode.widthSpec = SizeSpec.Constrained;
            vnode.heightSpec = SizeSpec.Auto;
        }
    }
    // 将切图的children清空，切图只保留本身图片
    else if (
        node.slice.bitmapURL
    ) {
        node.children = [];
        // TODO: 处理切图尺寸和实际不一致的问题？
        vnode.classList.push(`w-${node.bounds.width} h-${node.bounds.height} bg-cover bg-[url(https://idoc.mucang.cn${(node.slice.bitmapURL)})]`);
        vnode.widthSpec = SizeSpec.Fixed;
        vnode.heightSpec = SizeSpec.Fixed;
    }
    // 占位图 
    else if (node.basic.type === 'image' && node.basic.realType === 'Image') {
        node.children = [];
        vnode.tagName = 'img';
        vnode.classList.push(`block w-${node.bounds.width} h-${node.bounds.height} object-cover`);
        (vnode.attributes ??= {}).src = "";
    }
    // 文本节点
    else if (node.basic.type === 'text' && node.basic.realType === 'Text') {
        // TODO: 如何处理其他样式
        // TODO: 字体大小/行高可以复用

        // 文本节点的特殊处理
        // 1. 单行文本高度固定，要不要指定高度为lineHeight则看其下面是否有相邻节点
        // 2. 多行文本高度不固定，如果文本框高度大于其子文本中任意一个文本，则为多行文本
        // 3. 如果文本节点是父节点中唯一的一个节点，且父节点不是切图，则父节点宽度不固定，适用于按钮。除非两个相邻按钮宽度一致

        const commonAlign = maxCountGroup(_.groupBy(node.text.styles, (text) => text.align));
        const textNodes = _.map(node.text.styles, (text) => {
            const textNode: VNode = {
                tagName: 'span',
                classList: [],
                bounds: {
                    ...vnode.bounds
                },
                index: context.index++,
            };
            textNode.textContent = text.value;
            if (text.font.color.type === "normal") {
                textNode.classList.push(`text-${getNormalColor(text.font.color.value)}`);
            } else if (text.font.color.type === "linearGradient") {
                console.warn('text节点不支持线性渐变,用第一个渐变色代替');
                textNode.classList.push(`text-${getNormalColor(text.font.color.value.colorStops[0].color)}`);
            }
            textNode.classList.push(`text-${text.font.size}/${text.space.lineHeight}`);
            if (text.space.letterSpacing) {
                textNode.classList.push(R`tracking-${text.space.letterSpacing}`);
            }
            const isBoldFont =
                text.font.family.indexOf('AlibabaPuHuiTiM') !== -1 ||
                text.font.family.indexOf('PingFangSC') !== -1 && text.font.weight === 'Medium';
            if (text.fontStyles.bold || isBoldFont) {
                textNode.classList.push('font-bold');
            }
            if (text.fontStyles.italic) {
                textNode.classList.push('italic');
            }
            if (text.fontStyles.underLine) {
                textNode.classList.push('underline');
            }
            if (text.fontStyles.lineThrough) {
                textNode.classList.push('line-through');
            }
            if (text.align !== commonAlign) {
                vnode.classList.push(`text-${text.align}`);
            }
            return textNode;
        });
        if (textNodes.length === 1) {
            _.assign(vnode, textNodes[0], {
                tagName: 'div',
            });
        } else {
            vnode.classList.push(`text-${commonAlign}`);
            vnode.textContent = textNodes;
        }
        _.remove(vnode.classList, 'text-left');

        const isMultiLine = +_.max(_.map(node.text.styles, n => n.space.lineHeight))! < node.bounds.height;
        if (isMultiLine) {
            vnode.widthSpec = SizeSpec.Fixed;
            vnode.heightSpec = SizeSpec.Auto;
        } else {
            vnode.widthSpec = SizeSpec.Auto;
            vnode.heightSpec = SizeSpec.Fixed;
        }
    }
    // 容器
    else if (
        node.basic.type === 'group' && node.basic.realType === 'Group' ||
        node.basic.type === 'rect' && node.basic.realType === 'ShapePath' ||
        node.basic.type === 'path' && node.basic.realType === 'ShapePath'
    ) {

    }
    // 其他不识别的节点全部清掉
    // 如果没有子节点也没有样式，清掉该节点
    else {
        return null;
    }

    // 处理外观样式
    if (!vnode.textContent) {
        if (node.fill && node.fill.colors && node.fill.colors.length) {
            // 只支持一个颜色
            const color = node.fill.colors[0];
            if (color.type === 'normal') {
                vnode.classList.push(`bg-${getNormalColor(color.value)}`);
            } else if (color.type === 'linearGradient') {
                getLinearColor(vnode, color);
            }
        }
        if (node.stroke && node.stroke.radius) {
            const [tl, tr, br, bl] = node.stroke.radius;
            const r1 = {
                tl, tr, br, bl
            };
            const t = tl === tr && ['tl', 'tr'];
            const r = tr === br && ['tr', 'br'];
            const b = br === bl && ['br', 'bl'];
            const l = bl === tl && ['bl', 'tl'];
            const addClasses = (key: string, value: number, exclude?: string[]) => {
                const calcV = (v: number) => v >= Math.min(node.bounds.width, node.bounds.height) ? 'full' : v;
                vnode.classList.push(R`rounded-${key}${calcV(value)}`);
                if (exclude) {
                    _.each(_.omit(r1, exclude), (v, k) => {
                        vnode.classList.push(R`rounded-${k}-${calcV(v!)}`);
                    });
                }
            };
            if (t && r && b && l) {
                addClasses('', tl);
            } else if (t && b) {
                addClasses('t', tl);
                addClasses('b', br);
            } else if (l && r) {
                addClasses('l', tl);
                addClasses('r', tr);
            } else if (t) {
                addClasses('t', tl, t);
            } else if (r) {
                addClasses('r', tr, r);
            } else if (b) {
                addClasses('b', br, b);
            } else if (l) {
                addClasses('l', bl, l);
            } else {
                addClasses('', 0, []);
            }
        }
        if (node.stroke && node.stroke.borders && node.stroke.borders.length) {
            // TODO: 暂时只支持一个border
            const border = node.stroke.borders[0];
            if (border.strokeWidth === 1) {
                vnode.classList.push('border');
            } else {
                vnode.classList.push(R`border-${border.strokeWidth}`);
            }
            if (border.color.type === "normal") {
                vnode.classList.push(`border-${getNormalColor(border.color.value)}`);
            } else if (border.color.type === "linearGradient") {
                console.warn('border不支持线性渐变,用第一个渐变色代替');
                vnode.classList.push(`border-${getNormalColor(border.color.value.colorStops[0].color)}`);
            }
        }
        if (node.effect && node.effect.shadows && node.effect.shadows.length) {
            const styles = _.map(node.effect.shadows, (shadow) => {
                let color!: RGBA;
                if (shadow.color.type === "linearGradient") {
                    console.warn('border不支持线性渐变,用第一个渐变色代替');
                    color = shadow.color.value.colorStops[0].color;
                } else if (shadow.color.type === "normal") {
                    color = shadow.color.value;
                }
                return `${shadow.type === 'inside' ? 'inset' : ''}${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.spread}px rgba(${color.r},${color.g},${color.b},${color.a})`;
            });
            (vnode.style ??= {}).boxShadow = styles.join(',');
        }
    }

    // 目前先这样处理，有slice节点，则删掉其他兄弟节点
    const sliceChild = _.find(node.children, (node) => node.basic.type === 'shape' && node.basic.realType === 'Slice');
    if (sliceChild) {
        node.children = [sliceChild];
    }

    const children = _.map(node.children, n => preprocess(n, level + 1)).filter(filterEmpty);
    if (children.length) {
        vnode.children = children;
    }

    return vnode;
}
