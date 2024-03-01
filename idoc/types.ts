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


    _isHeader?: true;
    _isSafeArea?: true;
    _isSlice?: true;
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

    const rootTree: Tree = {
        classList: [],
        children: []
    };
    getFillColor(root, rootTree);


    let nodes = root.children;
    // 按top和left升序排序
    nodes.sort((a, b) => {
        return a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left;
    });

    nodes.forEach(node => {
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

    // 处理元素之间的包含关系
    function isContainedWithin(parent: Node, child: Node) {
        return (
            child.bounds.left >= parent.bounds.left &&
            child.bounds.top >= parent.bounds.top &&
            child.bounds.left + child.bounds.width <= parent.bounds.left + parent.bounds.width &&
            child.bounds.top + child.bounds.height <= parent.bounds.top + parent.bounds.height
        );
    }
    function findBestParent(node: Node, nodes: Node[]) {
        let bestParent: Node | null = null;
        let minArea = Infinity;
        for (let potentialParent of nodes) {
            if (isContainedWithin(potentialParent, node) && potentialParent !== node) {
                let area = potentialParent.bounds.width * potentialParent.bounds.height;
                if (area < minArea) {
                    minArea = area;
                    bestParent = potentialParent;
                }
            }
        }
        return bestParent;
    }
    // 为每个节点找到最佳父节点
    nodes = nodes.filter(node => {
        let bestParent = findBestParent(node, nodes);
        if (bestParent) {
            bestParent.children.push(node);
            return false;
        } else {
            return true;
        }
    });

    // 先考虑横坐标互相包含的元素，这些元素可以用一个竖向的盒子包起来
    // ！：如果这些元素宽高一致(是克隆体)，那我们很可能遇到了那种flex-wrap多行的列表，这时应该考虑flex-wrap布局

    // 再考虑竖坐标互相包含的元素，这些元素可以用一个横向的盒子包起来
    
    // 再考虑剩下的孤儿元素，这些元素如果和其他兄弟节点相交，可以考虑将其设置为绝对定位
    
    // 要考虑有文案的元素，高度会自动撑开，所以高度不能写死，绝对定位也得重新考虑

    return rootTree;
}