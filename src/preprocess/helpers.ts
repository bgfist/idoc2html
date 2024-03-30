import { Node } from './page';

export function isTextNode(node: Node) {
    return node.basic.type === 'text' && node.basic.realType === 'Text';
}

export function isImageNode(node: Node) {
    return node.basic.type === 'image' && node.basic.realType === 'Image';
}

export function isSymbolNode(node: Node) {
    return node.basic.type === 'symbol' && node.basic.realType === 'SymbolInstance';
}

export function float2Int(n: number) {
    return Math.round(n);
}

/** 保留两位小数 */
export function float2Fixed(n: number) {
    return Math.round(n * 100) / 100;
}

export function getIntersectionBox(node: Pick<Node, 'bounds'>, parent: Pick<Node, 'bounds'>) {
    const { left, top, width, height } = node.bounds;
    const { left: pLeft, top: pTop, width: pWidth, height: pHeight } = parent.bounds;
    return {
        left: Math.max(left, pLeft),
        top: Math.max(top, pTop),
        width: Math.min(left + width, pLeft + pWidth) - Math.max(left, pLeft),
        height: Math.min(top + height, pTop + pHeight) - Math.max(top, pTop)
    };
}

export function isContainedWithin(node: Pick<Node, 'bounds'>, parent: Pick<Node, 'bounds'>) {
    const { left, top, width, height } = node.bounds;
    const { left: pLeft, top: pTop, width: pWidth, height: pHeight } = parent.bounds;
    return left >= pLeft && top >= pTop && left + width <= pLeft + pWidth && top + height <= pTop + pHeight;
}
