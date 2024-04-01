/*
 * 抽取公共颜色
 */

export function extractColorPresets(code: string) {
    const colors: Record<string, string> = {};

    return {
        code: code.replace(/\[hsla\((.+?)\)\]/g, (sub, $1) => {
            const [h, s, l, a] = $1.split(',');
            let colorName = `${h}-${s.slice(0, -1)}-${l.slice(0, -1)}`;
            if (+a !== 1) {
                colorName += `-${+a * 100}`;
            }

            colors[colorName] = `hsla(${$1})`;
            return colorName;
        }),
        colors
    };
}
