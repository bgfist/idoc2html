import * as _ from 'lodash';

// TODO: 处理图层zIndex，或者后面的会盖住前面的？

interface Page {
    size: {
        width: number;
        height: number;
    };
    layers: Node;
}

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
    _isVirtualGroupX?: true;
    _isVirtualGroupY?: true;
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
     * image: ["Image"]
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

export interface Tree {
    bounds?: {
        left: number;
        right: number;
        top: number;
        bottom: number;
    };
    classList: string[];
    children: Tree[];
}

function assert(condition: boolean, msg: string) {
    if (!condition) {
        throw new Error(msg);
    }
}

function getNodeStyle(node: Node, dom: Tree) {
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

function getTextStyle(node: Node, dom: Tree) {

}

function getGroupStyle(node: Node, dom: Tree) {
    
}

function getSliceStyle(node: Node, dom: Tree) {
    
}

function getFillColor(node: Node, dom: Tree) {
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

function getLinearColor(dom: Tree, color: LinearColor) {
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

function transformPageToTree(page: Page): Tree {
    const root = page.layers;
    assert(root.basic.type === 'group' && root.basic.realType === 'Artboard', '页面根节点不对');

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

    // 按top升序排序
    // _.sortBy(nodes, node => [node.bounds.top, node.bounds.left]);

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
                        children: group,
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
                children: nodesx,
            } as Node;
            return [row, ...groupNodes(leftoverNodes)];
        } else {
            return [intersectingNodes[0], ...groupNodes(leftoverNodes)]
        }
    }

    root._isVirtualGroupY = true;
    root.children = groupNodes(root.children);

    const rootTree: Tree = {
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
function virtualNode2Tree(node: Node): Tree {

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