import { VNode } from './types';

/** 节点遍历上下文 */
export const context = {
    index: 0,
    voidElementMarker: '$void',
    overflowWrapedMarker: '$overflowWrapped',
    overflowSiblingsNoShrink: '$overflowSiblingsNoShrink'
} as {
    index: number;
    root: VNode;
    voidElementMarker: string;
    overflowWrapedMarker: string;
    overflowSiblingsNoShrink: string;
};
