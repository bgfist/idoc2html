/** 抽取image名称预设 */
export function extractImagePresets(code: string) {
    return code.replace(/bg-\[url\(.*?([a-z0-9]+)\.png\)\]/g, 'bg-$1');
}
