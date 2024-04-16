/** 生成阶段 */
export enum BuildStage {
    /** 预处理，只生成外观样式，全部相对根节点绝对定位 */
    Pre = 1,
    /** 整理出节点的层级结构，生成一颗树，全部相对父节点绝对定位 */
    Tree = 2,
    /** 整理出节点的层级以及布局，全部采用flex布局 */
    Measure = 3
}

/** 调试配置 */
export const debug = {
    /** 是否生成id属性 */
    showId: false,
    /** 是否生成尺寸类型 */
    showSizeSpec: false,
    /** 是否生成方向 */
    showDirection: false,
    /** 生成到哪一步 */
    buildToStage: BuildStage.Measure,
    /** 是否生成所有节点，包括Shape形状等可能无效的UI元素 */
    buildAllNodes: false,
    /** 是否保留设计稿的层级结构 */
    keepOriginalTree: false
};

/** 默认配置 */
export const defaultConfig = {
    /** 代码生成选项 */
    codeGenOptions: {
        /** 生成role属性 */
        role: true,
        /** 生成层级z-index */
        experimentalZIndex: true,
        /** 是否自动加上文本超出截断 */
        textClamp: false,
        /** 是否为列表加上超出滚动 */
        listOverflowAuto: false,
        /** 是否为内容超出元素预留一点边距 */
        overflowMargin: false,
        /** 为列表元素指定同样的固定高度/宽度 */
        listItemSizeFixed: false
    },
    /** 预处理选项 */
    treeOptions: {
        /** 删除切图的多余节点 */
        removeSliceSibings: true,
        /** 黑名单节点id，将删掉这些节点 */
        blackListNodes: [] as string[],
        /** 白名单节点，将保留这些节点 */
        whiteListNodes: [] as string[],
        /** 指定这些节点为绝对定位节点 */
        attachNodes: [] as string[],
        /** 是否先删掉幽灵节点，页面比较乱的可以指定为true */
        removeGhostNodes: true
    }
};

type DeepPartial<T> =
    T extends object ?
        {
            [P in keyof T]?: DeepPartial<T[P]>;
        }
    :   T;
export type Config = DeepPartial<typeof defaultConfig>;
