import { Node } from '../page';

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
