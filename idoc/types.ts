import * as _ from 'lodash';

function second<T>(x: [unknown, T]) {
    return x[1];
}

function maxCountGroup<T>(grouped: _.Dictionary<T[]>) {
    return _.maxBy(_.toPairs(grouped), item => second(item).length)![0];
}

// TODO: 处理图层zIndex，或者后面的会盖住前面的？

interface Page {
    size: {
        width: number;
        height: number;
    };
    layers: Node;
}

// 文本节点的特殊处理
// 1. 单行文本高度固定，要不要指定高度为lineHeight则看其下面是否有相邻节点
// 2. 多行文本高度不固定，如果文本框高度大于其子文本中任意一个文本，则为多行文本
// 3. 如果文本节点是父节点中唯一的一个节点，且父节点不是切图，则父节点宽度不固定，适用于按钮。除非两个相邻按钮宽度一致

interface Node {
    basic: Basic;
    bounds: Bounds;
    fill: Fill;
    text: Text;
    stroke: Stroke;
    effect: Effect;
    slice: Slice;
    sharedStyle: any;
    children: Node[];

    _index: number;
    _isHeader?: true;
    _isSafeArea?: true;
    _isSlice?: true;
    /** 此节点相交的节点，面积比它更小。可以做绝对定位，也可以做负的margin */
    _attachNodes?: Node[];
    /** 横向的flex盒子 */
    _isVirtualGroupX?: true;
    /** 竖向的flex盒子 */
    _isVirtualGroupY?: true;
    /** 高度由子节点自动撑开，或者是设备高度不确定 */
    _autoHeight?: true;
    /** 宽度由子节点自动撑开，或者是设备宽度不确定 */
    _autoWidth?: true;
}

interface Basic {
    id: string;
    sourceId: string;
    name: string;
    /**
     * group: ["Artboard", "Group"]
     * text: ["Text"] -> 文案
     * rect: ["ShapePath"] -> 按钮容器
     * path: ["ShapePath"] -> 切图
     * shape: ["Slice", "Shape"]
     * symbol: ["SymbolInstance"]
     * image: ["Image"] -> 占位图，由程序动态赋值图片
     */
    type: "group" | "text" | "rect" | "path" | "shape" | "symbol" | "image";
    realType: "Artboard" | "Group" | "Text" | "ShapePath" | "Slice" | "Shape" | "SymbolInstance" | "Image";
    opacity: number;
    imageID: string;
}

interface Bounds {
    left: number;
    top: number;
    width: number;
    height: number;
    // 这两个是计算出来的
    right: number;
    bottom: number;
}

interface Fill {
    colors: Color[];
}

interface Stroke {
    borders: Border[];
    radius: [number, number, number, number];
    dash: any[];
}

interface Effect {
    shadows: Shadow[];
}

interface Slice {
    bitmapURL: string;
    svgURL: string;
    realSliceWidth: number;
    realSliceHeight: number;
}

interface Shadow {
    type: "outside" | "inside";
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
    color: Color;
}

interface Text {
    styles: TextStyle[];
}

type Color = NormalColor | LinearColor;

interface NormalColor {
    type: "normal";
    value: {
        r: number;
        g: number;
        b: number;
        a: number;
    };
    name?: string;
}

interface LinearColor {
    type: "linearGradient";
    value: {
        fromX: number;
        fromY: number;
        toX: number;
        toY: number;
        colorStops: Array<{
            color: {
                r: number;
                g: number;
                b: number;
                a: number;
            },
            position: number;
        }>;
    };
}

interface TextStyle {
    value: string;
    font: {
        family: string;
        weight: string;
        size: string;
        color: Color;
    };
    space: {
        lineHeight: string;
        letterSpacing: number;
        paragraph: number;
    };
    fontStyles: {
        underLine: boolean;
        lineThrough: boolean;
        bold: boolean;
        italic: boolean;
    };
    align: "left" | "center";
}

interface Border {
    type: "center" | "inside";
    strokeWidth: number;
    color: Color;
}

export interface Dom {
    classList: string[];
    children?: Dom[];
}

function assert(condition: boolean, msg: string) {
    if (!condition) {
        throw new Error(msg);
    }
}

function getNodeStyle(node: Node, dom: Dom) {
    if (node.basic.type === "text" && node.basic.realType === "Text") {
        return getTextStyle(node, dom);
    }
    if (node.basic.type === "group" || node.basic.type === "rect" && node.basic.realType === "ShapePath") {
        return getGroupStyle(node, dom);
    }
    if (node.basic.type === 'path' && node.basic.realType === 'ShapePath'
        || node.basic.type === 'shape' && node.basic.realType === 'Slice') {
        return getSliceStyle(node, dom);
    }
}

function getTextStyle(node: Node, dom: Dom) {

}

function getGroupStyle(node: Node, dom: Dom) {

}

function getSliceStyle(node: Node, dom: Dom) {

}

function getFillColor(node: Node, dom: Dom) {
    const colors = node.fill?.colors;
    if (colors?.length) {
        return colors.map(color => {
            if (color.type === "normal") {
                dom.classList.push(`${node.basic.type === 'text' ? 'text' : 'bg'}-${getNormalColor(color.value)}`);
            } else if (color.type === "linearGradient") {
                if (node.basic.type === 'text') {
                    console.warn('text节点不支持线性渐变,用第一个渐变色代替');
                    dom.classList.push(`text-${getNormalColor(color.value.colorStops[0].color)}`);
                } else {
                    getLinearColor(dom, color);
                }
            }
        });
    }
}

function getNormalColor(rgba: { r: number; g: number; b: number; a: number }): string {
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

interface VNode {
    tagName?: string;
    classList: string[];
    children?: VNode[];
    textContent?: string | VNode[];
    style?: Record<string, string>;

    bounds: {
        left: number;
        right: number;
        top: number;
        bottom: number;
        width: number;
        height: number;
    };

    /** 层级 */
    index: number;

    /** 此节点相交的节点，面积比它更小。可以做绝对定位，也可以做负的margin */
    attachNodes?: VNode[];
    /** 横向的flex盒子 */
    isRow?: true;
    /** 竖向的flex盒子 */
    isColumn?: true;
    /** 高度由子节点自动撑开，或者是设备高度不确定 */
    autoHeight?: true;
    /** 宽度由子节点自动撑开，或者是设备宽度不确定 */
    autoWidth?: true;
}

const context = {
    index: 0,
};

function preprocess(node: Node, isRoot?: boolean): VNode {
    const vnode: VNode = {
        classList: [],
        bounds: {
            ...node.bounds,
            right: node.bounds.left + node.bounds.width,
            bottom: node.bounds.top + node.bounds.height,
        },
        index: context.index++,
    };

    if (isRoot) {
        if (node.bounds.width === 375 || node.bounds.width === 750) {
            vnode.autoHeight = true;
        } else if (node.bounds.height === 375 || node.bounds.height === 750) {
            vnode.autoWidth = true;
        } else {
            throw new Error('暂不支持这种设计尺寸');
        }
    };

    // 处理顶层的symbol类型的node，一般是标题栏和底部安全区域
    if (isRoot && node.basic.type === 'symbol' && node.basic.realType === 'SymbolInstance') {
        node.children = [];
        if (node.bounds.top === 0) {
            vnode.tagName = 'com:header';
        } else {
            vnode.classList.push('safearea-bottom');
        }
    }
    // 将切图的children清空，切图只保留本身图片
    else if (
        node.basic.type === 'path' && node.basic.realType === 'ShapePath'
        || node.basic.type === 'shape' && node.basic.realType === 'Slice'
    ) {
        node.children = [];
        // TODO: 处理切图尺寸和实际不一致的问题？
        vnode.classList.push(`w-${node.bounds.width} h-${node.bounds.height} bg-cover bg-[url(${(node.slice.bitmapURL)})]`);
    }
    // 文本节点
    else if (node.basic.type === 'text' && node.basic.realType === 'Text') {
        // TODO: 如何处理其他样式

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
                textNode.classList.push(`tracking-${text.space.letterSpacing}`);
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
            vnode.autoHeight = true;
        }
    }
    // 其他不识别的节点全部清掉
    // 如果没有子节点也没有样式，清掉该节点
    else {

    }

    return vnode;
}

function postprocess(vnode: VNode, level: number) {

}

function transformPageToDom(page: Page): Dom {
    const root = page.layers;
    assert(root.basic.type === 'group' && root.basic.realType === 'Artboard', '页面根节点不对');

    // 先遍历整棵树，进行预处理，删除一些不必要的节点，将节点的前景背景样式都计算出来，对节点进行分类标记
    preprocess(root, true);

    let nodes = root.children;

    nodes.forEach((node, i) => {
        node._index = i;
        node.bounds.right = node.bounds.left + node.bounds.width;
        node.bounds.bottom = node.bounds.top + node.bounds.height;
        // 处理顶层的symbol类型的node，一般是标题栏和底部安全区域
        if (node.basic.type === 'symbol' && node.basic.realType === 'SymbolInstance') {
            node.children = [];
            if (node.bounds.top === 0) {
                node._isHeader = true;
            } else {
                node._isSafeArea = true;
            }
        }
        // 将切图的children清空，切图只保留本身图片
        else if (
            node.basic.type === 'path' && node.basic.realType === 'ShapePath'
            || node.basic.type === 'shape' && node.basic.realType === 'Slice'
        ) {
            node.children = [];
            node._isSlice = true;
        } else {
            // 其他不识别的节点全部清掉
            // 如果没有子节点也没有样式，清掉该节点
        }
    });

    function isContainedWithinX(parent: Node, child: Node) {
        return (
            child.bounds.left >= parent.bounds.left &&
            child.bounds.right <= parent.bounds.right
        );
    }
    function isContainedWithinY(parent: Node, child: Node) {
        return (
            child.bounds.top >= parent.bounds.top &&
            child.bounds.bottom <= parent.bounds.bottom
        );
    }
    // 处理元素之间的包含关系
    function isContainedWithin(parent: Node, child: Node) {
        return isContainedWithinX(parent, child) && isContainedWithinY(parent, child);
    }
    function isOverlappingX(parent: Node, child: Node) {
        return (
            child.bounds.left <= parent.bounds.right &&
            child.bounds.right >= parent.bounds.left
        );
    }
    function isOverlappingY(parent: Node, child: Node) {
        return (
            child.bounds.top <= parent.bounds.bottom &&
            child.bounds.bottom >= parent.bounds.top
        );
    }
    // 处理元素之间的重叠关系
    function isOverlapping(parent: Node, child: Node) {
        return isOverlappingX(parent, child) && isOverlappingY(parent, child);
    }

    function findBestParent(node: Node, nodes: Node[]) {
        let bestParent: Node | null = null;
        let minArea = Infinity;
        let type: 'contained' | 'overlapping' = 'contained';
        const nodeArea = node.bounds.width * node.bounds.height;
        for (let potentialParent of nodes) {
            if (potentialParent === node) continue;
            if (isContainedWithin(potentialParent, node) && type === 'contained') {
                let area = potentialParent.bounds.width * potentialParent.bounds.height;
                if (area < minArea) {
                    minArea = area;
                    bestParent = potentialParent;
                }
            } else if (isOverlapping(potentialParent, node)) {
                type = 'overlapping';
                let area = potentialParent.bounds.width * potentialParent.bounds.height;
                if (area >= nodeArea && node._index > potentialParent._index && area < minArea) {
                    minArea = area;
                    bestParent = potentialParent;
                }
            }
        }
        return [bestParent, type] as const;
    }
    // 为每个节点找到最佳父节点，剩下的元素互不相交
    nodes = nodes.filter(node => {
        let [bestParent, type] = findBestParent(node, nodes);
        if (bestParent) {
            if (type === 'contained') {
                bestParent.children.push(node);
            } else {
                (bestParent._attachNodes ??= []).push(node);
            }
            return false;
        } else if (type === 'overlapping') {
            // 绝对定位元素
            (root._attachNodes ??= []).push(node);
            return false;
        } else {
            return true;
        }
    });

    function groupNodes(nodes: Node[]): Node[] {
        if (!nodes.length) return [];

        // 先考虑横着排，找高度最高的节点，往后面找底线不超过它的节点
        // 这些元素中，再划分竖着的盒子，只要横坐标重叠的元素，全部用一个竖盒子包裹
        const highestNode = _.maxBy(nodes, node => node.bounds.height)!;
        const [intersectingNodes, leftoverNodes] = _.partition(nodes, node => node.bounds.top <= highestNode.bounds.top && node.bounds.bottom <= highestNode.bounds.bottom);
        function groupNodesByOverlap(nodes: Node[]) {
            const groups: Node[][] = [];
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                let addedToGroup = false;
                // 检查节点是否已经属于某个组
                a: for (let n = 0; n < groups.length; n++) {
                    const group = groups[n];
                    for (let j = 0; j < group.length; j++) {
                        if (isOverlappingX(node, group[j])) {
                            // 如果有横坐标上的交叉，将节点添加到组中
                            group.push(node);
                            addedToGroup = true;
                            break a;
                        }
                    }
                }
                // 如果节点不属于任何组，创建一个新组
                if (!addedToGroup) {
                    groups.push([node]);
                }
            }
            return groups;
        }
        function getBounds(nodes: Node[]) {
            let minLeft = Infinity;
            let maxRight = -Infinity;
            let minTop = Infinity;
            let maxBottom = -Infinity;
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                minLeft = Math.min(minLeft, node.bounds.left);
                maxRight = Math.max(maxRight, node.bounds.right);
                minTop = Math.min(minTop, node.bounds.top);
                maxBottom = Math.max(maxBottom, node.bounds.bottom);
            }
            return {
                left: minLeft,
                top: minTop,
                right: maxRight,
                bottom: maxBottom,
                width: maxRight - minLeft,
                height: maxBottom - minTop,
            }
        }
        if (intersectingNodes.length > 1) {
            const groups = groupNodesByOverlap(intersectingNodes);
            const nodesx = groups.map(group => {
                if (group.length > 1) {
                    const column = {
                        _isVirtualGroupY: true,
                        bounds: getBounds(group),
                        // 从上到下
                        children: _.sortBy(group, n => n.bounds.top),
                    } as Node;
                    column.children = groupNodes(column.children);
                    return column;
                } else {
                    return group[0];
                }
            });
            const row = {
                _isVirtualGroupX: true,
                bounds: getBounds(nodesx),
                // 从左到右
                children: nodesx,
            } as Node;
            return [row, ...groupNodes(leftoverNodes)];
        } else {
            return [intersectingNodes[0], ...groupNodes(leftoverNodes)]
        }
    }

    root._isVirtualGroupY = true;
    root.children = groupNodes(root.children);

    const rootTree: Dom = {
        classList: [],
        children: []
    };
    getFillColor(root, rootTree);


    // 再考虑竖坐标互相包含的元素，这些元素可以用一个横向的盒子包起来

    // 再考虑剩下的孤儿元素，这些元素如果和其他兄弟节点相交，可以考虑将其设置为绝对定位

    // 要考虑有文案的元素，高度会自动撑开，所以高度不能写死，绝对定位也得重新考虑

    return rootTree;
}

/** 生成flexbox布局 */
function virtualNode2Dom(node: Node): Dom {
    if (node._isHeader) {
        return {
            classList: [],
            children: []
        };
    }
    if (node._isSafeArea) {
        return {
            classList: ['safe-area'],
            children: []
        };
    }
    if (node._isVirtualGroupX) {
        const classList: string[] = ["flex"];

        // 只有一个子元素，只看是否居中
        if (node.children.length === 1) {
            const child = node.children[0];
            if (child.bounds.top - node.bounds.top > 0)
        } else {

            // 根据children在node中的位置计算flex对齐方式
            const margins = node.children.map(n => ({
                marginTop: n.bounds.top - node.bounds.top,
                marginBottom: node.bounds.bottom - n.bounds.bottom,
                marginDiff: n.bounds.top - node.bounds.top - (node.bounds.bottom - n.bounds.bottom)
            }));
            function countGroupsWithMoreThanOne(keyFn: (n) => number) {
                // 分组函数，将数字分到与其相差2以内的组
                function groupKey(num: number) {
                    return Math.floor(num / 2) * 2;
                }
                // 使用groupBy对数组进行分组
                const grouped = _.groupBy(margins, n => groupKey(keyFn(n)));

                return _.maxBy(_.values(grouped), g => g.length)!;
            }
            // 归组
            const marginTopArr = countGroupsWithMoreThanOne(m => m.marginTop);
            const marginBottomArr = countGroupsWithMoreThanOne(m => m.marginBottom);
            const marginDiffArr = countGroupsWithMoreThanOne(m => m.marginDiff);
            const maxCount = Math.max(marginTopArr.length, marginBottomArr.length, marginDiffArr.length);

            if (maxCount > 1 && maxCount)

                if (marginTopCount === 1 && marginBottomCount === 1) {
                    classList.push('items-stretch');
                    margins[0].marginTop && classList.push(`pt-${margins[0].marginTop}`);
                    margins[0].marginBottom && classList.push(`pb-${margins[0].marginBottom}`);
                } else if (marginTopCount === 1) {
                    classList.push('items-start');
                    margins[0].marginTop && classList.push(`pt-${margins[0].marginTop}`);
                } else if (marginBottomCount === 1) {
                    classList.push('items-end');
                    margins[0].marginBottom && classList.push(`pb-${margins[0].marginBottom}`);
                } else if (marginDiffCount === 1) {
                    classList.push('items-center');
                    const marginDiff = margins[0].marginDiff;
                    if (marginDiff) {
                        if (marginDiff > 0) {
                            classList.push(`mt-${marginDiff}`);
                        } else {
                            classList.push(`mb-${-marginDiff}`);
                        }
                    }
                } else {


                }
        }

        return {
            classList: ['flex'],
            children: node.children.map(n => virtualNode2Dom(node))
        };
    }
    // 叶子节点
    if (!node.children.length) {
        return {
            classList: [],
        };
    }

}

function isEqualBox(a: Node, b: Node) {
    return a.bounds.width === b.bounds.width && a.bounds.height === b.bounds.height;
}

/** 移除不必要的中间节点，比如宽高位置与父节点一样的，再合并样式 */
function mergeUnnessaryNodes(parent: Node): Node {
    const { children } = parent;
    if (children.length === 1) {
        if (isEqualBox(parent, children[0])) {
            // 这里要合并样式，将parent合并到child
            return children[0];
        }
    }
    if (children.length > 1) {
        parent.children = children.filter((child) => {
            const equal = isEqualBox(parent, child);
            if (!equal) {
                // 这里要合并样式，将child合并到parent
            }
            return !equal;
        });
    }

    return parent;
}