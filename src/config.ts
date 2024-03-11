export enum BuildStage {
    Pre = 1,
    Tree = 2,
    Measure = 3
}

/** 调试配置 */
export const debug = {
    showId: false,
    showSizeSpec: false,
    buildToStage: BuildStage.Measure,
    buildAllNodes: false
};

/** 默认配置 */
export const defaultConfig = {
    codeGenOptions: {
        role: true,
        experimentalZIndex: false
    },
};

type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;
export type Config = DeepPartial<typeof defaultConfig>;
