/** 宽高尺寸类型 */
export enum SizeSpec {
    /** 未知 */
    Unknown = 0,
    /** 固定 */
    Fixed = 1,
    /** 由子节点撑开 */
    Auto = 2,
    /** 由父节点分配，如flex1 */
    Constrained = 3,
};

export interface VNode {
    tagName?: string;
    classList: string[];
    attributes?: Record<string, string>;
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
    widthSpec?: SizeSpec;
    heightSpec?: SizeSpec;

    /** 层级 */
    index: number;

    /** 此节点相交的节点，面积比它更小。可以做绝对定位，也可以做负的margin */
    attachNodes?: VNode[];
    /** 横向的flex盒子 */
    isRow?: true;
    /** 竖向的flex盒子 */
    isColumn?: true;
}

export const context = {
    index: 0,
};