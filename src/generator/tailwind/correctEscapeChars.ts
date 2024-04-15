/*
 * 小程序不允许css中有转义字符
 */

/** text-16/30  => text-16 leading-30 */
function splitTextLineHeight(code: string) {
    return code.replace(/text-(\d+)\/(\d+)/g, 'text-$1 leading-$2');
}

/** left-1/2 => left-half */
function extractNumDivider(code: string) {
    return code.replace(/-1\/2/, '-half');
}
