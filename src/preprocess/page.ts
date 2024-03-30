/** 幕客设计稿json结构 */
export interface Page {
    size: {
        width: number;
        height: number;
    };
    layers: Node;
}

export interface Node {
    basic: Basic;
    bounds: Bounds;
    fill: Fill;
    text: Text;
    stroke: Stroke;
    effect: Effect;
    slice: Slice;
    sharedStyle: any;
    children: Node[];
}

export interface Basic {
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
     * image: ["Image"] -> 占位图，由程序动态赋值图片
     *
     * [
     *  [ 'group', 'Artboard' ],
     *  [ 'group', 'Group' ],
     *  [ 'path', 'ShapePath' ],
     *  [ 'rect', 'ShapePath' ],
     *  [ 'text', 'Text' ],
     *  [ 'shape', 'Slice' ],
     *  [ 'oval', 'ShapePath' ],
     *  [ 'image', 'Image' ],
     *  [ 'mask', 'ShapePath' ],
     *  [ 'shape', 'Shape' ],
     *  [ 'mask', 'Shape' ],
     *  [ 'symbol', 'SymbolInstance' ]
     * ]
     */
    type: 'group' | 'text' | 'rect' | 'path' | 'shape' | 'symbol' | 'image' | 'mask' | 'oval';
    realType: 'Artboard' | 'Group' | 'Text' | 'ShapePath' | 'Slice' | 'Shape' | 'SymbolInstance' | 'Image';
    opacity: number;
    imageID: string;
}

export interface Bounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface Fill {
    colors: Color[];
}

export interface Stroke {
    borders?: Border[];
    radius: Radius;
    dash: any[];
}

export interface Effect {
    shadows: Shadow[];
    blur?: any;
}

export interface Slice {
    bitmapURL: string;
    svgURL: string;
    realSliceWidth: number;
    realSliceHeight: number;
}

export interface Shadow {
    type: 'outside' | 'inside';
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
    color: Color;
}

export interface Text {
    styles: TextStyle[];
}

export type Color = NormalColor | LinearColor;

export type Radius = [number, number, number, number];

export interface RGBA {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface NormalColor {
    type: 'normal';
    value: RGBA;
    name?: string;
}

export interface LinearColor {
    type: 'linearGradient';
    value: {
        fromX: number;
        fromY: number;
        toX: number;
        toY: number;
        colorStops: Array<{
            color: RGBA;
            position: number;
        }>;
    };
}

export interface TextStyle {
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
    align: 'left' | 'center';
}

export interface Border {
    type: 'center' | 'inside';
    strokeWidth: number;
    color: Color;
}
