/** 宽高尺寸类型 */
export enum SizeSpec {
    /** 未知 */
    Unknown = 'Unknown',
    /** 固定 */
    Fixed = 'Fixed',
    /** 由子节点撑开 */
    Auto = 'Auto',
    /** 由父节点分配，如flex1 */
    Constrained = 'Constrained',
};

export enum Direction {
    /** 未知 */
    Unknown = 'Unknown',
    /** 横向的flex盒子 */
    Row = 'Row',
    /** 竖向的flex盒子 */
    Column = 'Column',
};

export type Role = 'border' | 'list' | 'scroller' | 'btn' | 'tab' | 'dialog';

export interface VNode {
    tagName?: string;
    classList: string[];
    attributes?: Record<string, string>;
    children?: VNode[];
    textContent?: string | VNode[];
    style?: Record<string, string>;
    role?: Role;

    bounds: {
        left: number;
        right: number;
        top: number;
        bottom: number;
        width: number;
        height: number;
    };
    widthSpec?: SizeSpec;
    heightSpec?: SizeSpec;
    direction?: Direction;

    /** 层级 */
    index: number;

    /** 此节点相交的节点，面积比它更小。可以做绝对定位，也可以做负的margin */
    attachNodes?: VNode[];
}

export const context = {
    index: 0,
};