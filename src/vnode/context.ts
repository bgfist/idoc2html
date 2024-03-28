import { VNode } from './';

/** 节点遍历上下文 */
export const context = {
    index: 0,
    voidElementMarker: '$void',
    overflowWrapedMarker: '$overflowWrapped'
} as {
    index: number;
    root: VNode;
    voidElementMarker: string;
    overflowWrapedMarker: string;
};
