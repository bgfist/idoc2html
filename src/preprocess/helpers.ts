import { numEq } from '../utils';
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

type NodeBounds = Pick<Node, 'bounds'>;

export function getIntersectionBox(node: NodeBounds, parent: NodeBounds) {
    const { left, top, width, height } = node.bounds;
    const { left: pLeft, top: pTop, width: pWidth, height: pHeight } = parent.bounds;
    return {
        left: Math.max(left, pLeft),
        top: Math.max(top, pTop),
        width: Math.min(left + width, pLeft + pWidth) - Math.max(left, pLeft),
        height: Math.min(top + height, pTop + pHeight) - Math.max(top, pTop)
    };
}

export function isContainedWithin(node: NodeBounds, parent: NodeBounds) {
    const { left, top, width, height } = node.bounds;
    const { left: pLeft, top: pTop, width: pWidth, height: pHeight } = parent.bounds;
    return left >= pLeft && top >= pTop && left + width <= pLeft + pWidth && top + height <= pTop + pHeight;
}

export function isOverlapping(node: NodeBounds, parent: NodeBounds) {
    const { left, top, width, height } = node.bounds;
    const { left: pLeft, top: pTop, width: pWidth, height: pHeight } = parent.bounds;
    return left < pLeft + pWidth && left + width > pLeft && top < pTop + pHeight && top + height > pTop;
}

export function getNodeArea(a: NodeBounds) {
    return a.bounds.width * a.bounds.height;
}

/** 两个盒子是否一样大 */
export function isEqualBox(a: NodeBounds, b: NodeBounds) {
    return numEq(a.bounds.width, b.bounds.width) && numEq(a.bounds.height, b.bounds.height);
}

export function getNodeBounds(node: Node) {
    const left = float2Int(node.bounds.left);
    const top = float2Int(node.bounds.top);
    const width = float2Int(node.bounds.width);
    const height = float2Int(node.bounds.height);
    const right = left + width;
    const bottom = top + height;

    return {
        left,
        top,
        right,
        bottom,
        width,
        height
    };
}
