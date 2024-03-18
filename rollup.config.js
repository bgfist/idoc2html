const typescript = require('@rollup/plugin-typescript');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');

module.exports = {
    input: 'src/program/script.ts', // 你的项目入口文件
    output: {
        file: 'dist/script.js', // 输出的打包文件
        format: 'umd', // 输出格式，可选值有 'amd', 'cjs', 'es', 'iife', 'umd'
        sourcemap: true // 启用源码映射
    },
    plugins: [
        typescript(), // 使用 TypeScript 插件
        resolve(), // 帮助定位第三方模块
        commonjs() // 将 CommonJS 转换为 ES6
    ]
};
