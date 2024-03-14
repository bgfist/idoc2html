/** 生成阶段 */
export enum BuildStage {
    /** 预处理，只生成外观样式，全部相对根节点绝对定位 */
    Pre = 1,
    /** 整理出节点的层级结构，生成一颗树，全部相对父节点绝对定位 */
    Tree = 2,
    /** 整理出节点的层级以及布局，全部采用flex布局 */
    Measure = 3
}

/** auto元素内容撑开策略 */
export enum AllocSpaceStrategy {
    /** 全部不撑开 */
    None = 0,
    /** 多行元素宽度固定，其他自动撑开 */
    Strict = 1,
    Symmetric = 2,
    Intelligent = 3,
}

/** 调试配置 */
export const debug = {
    /** 是否生成id属性 */
    showId: false,
    /** 是否生成尺寸类型 */
    showSizeSpec: false,
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
        experimentalZIndex: false,
    },
    /** 为auto元素分配更多空间，指定分配策略 */
    allocSpaceForAuto: {
        flexWrapItemFixedWidth: true,
        multiLineTextFixedWidth: false,
        listXStrategy: AllocSpaceStrategy.None
    },
    /** 黑名单节点id，将删掉这些节点 */
    blackListNodes: [] as string[]
};

type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;
export type Config = DeepPartial<typeof defaultConfig>;
