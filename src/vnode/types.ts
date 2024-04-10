/** 宽高尺寸类型 */
export enum SizeSpec {
    /** 固定, 如切图 */
    Fixed = 'Fixed',
    /** 由子节点撑开，如文本 */
    Auto = 'Auto',
    /** 由父节点分配，如flex1 */
    Constrained = 'Constrained'
}

/** flex方向 */
export enum Direction {
    /** 横向的flex盒子 */
    Row = 'Row',
    /** 竖向的flex盒子 */
    Column = 'Column'
}

export type Dimension = 'width' | 'height';

export type DimensionSpec = 'widthSpec' | 'heightSpec';

export type Side = 'start' | 'end' | 'center';

/** 节点用途 */
export type Role =
    | ''
    | 'page'
    | 'border'
    | 'divider'
    | 'list-x'
    | 'list-y'
    | 'list-wrap'
    | 'list-item'
    | 'scroller'
    | 'btn'
    | 'tab'
    | 'dialog'
    | 'table-body'
    | 'table-row';

/** 可渲染的虚拟节点 */
export interface VNode {
    id?: string;
    tagName?: string;
    classList: string[];
    attributes: Record<string, string>;
    children: VNode[];
    textContent?: string | VNode[];
    textMultiLine?: boolean;
    style: Record<string, string>;
    role: Role[];

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

    /** 此节点相交的节点，面积比它更小。可以做绝对定位，也可以做负的margin */
    attachNodes: VNode[];

    __temp: {
        textListAlign?: {
            type: Side;
            num: number;
        };
        flex1Placeholder?: boolean;
    };
}
