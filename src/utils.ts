import * as _ from 'lodash';

export function assert(condition: boolean, msg: string) {
    if (!condition) {
        debugger;
        throw new Error(msg);
    }
}

export function unreachable() {
    throw new Error('不可能执行到这！');
}

export function filterEmpty<T>(t: T | null | undefined): t is T {
    return !!t;
}

export function second<T>(x: [unknown, T]) {
    return x[1];
}

export function removeEle<T>(arr: T[], ele: T) {
    _.remove(arr, (item) => item === ele);
}

export function removeEles<T>(arr: T[], ele: T[]) {
    _.remove(arr, (item) => ele.indexOf(item) >= 0);
}

export function groupByWith<T, K>(arr: T[], iteratee: (item: T) => K, compare: (current: K, before: K) => boolean) {
    return arr.reduce((map, item) => {
        const key = iteratee(item);
        let found = false;
        for (const [k] of map) {
            if (compare(k, key)) {
                map.get(k)!.push(item);
                found = true;
                break;
            }
        }
        if (!found) {
            map.set(key, [item]);
        }
        return map;
    }, new Map<K, T[]>());
}

export function groupWith<T>(arr: T[], compare: (a: T, b: T) => boolean) {
    return groupByWith(arr, _.identity, compare);
}

const TOLERANCE = 2;
export function numEq(num1: number, num2: number) {
    return Math.abs(num1 - num2) <= TOLERANCE;
}
export function numGt(num1: number, num2: number) {
    return !numEq(num1, num2) && num1 > num2;
}
export function numGte(num1: number, num2: number) {
    return numEq(num1, num2) || num1 >= num2;
}
export function numLt(num1: number, num2: number) {
    return !numEq(num1, num2) && num1 < num2;
}
export function numLte(num1: number, num2: number) {
    return numEq(num1, num2) || num1 <= num2;
}

export function allNumsEqual(arr: number[]) {
    return _.uniqWith(arr, numEq).length === 1;
}
export function allElesIn<T>(arr: T[], exclude: T[]) {
    return _.difference(arr, exclude).length === 0;
}
export function anyElesIn<T>(arr: T[], exclude: T[]) {
    return _.difference(exclude, arr).length !== exclude.length;
}

/** 
 * 规范className
 * 
 * 将className中的负号前移
 * @param removeZero 是否去掉带0值的className
 */
export function normalizeClassName(className: string, removeZero: boolean) {
    return className.replace(/(\s?\S+?-)(-?\d+)(\s|$)/g, function (substring: string, ...[$1, $2, $3]: any[]) {
        if ($2[0] === '-') {
            $2 = $2.substring(1);
            $1 = '-' + $1;
        } else if (removeZero && $2[0] == 0) {
            return '';
        }
        return $1 + $2 + $3;
    });
}

export function R(strings: TemplateStringsArray, ...values: any[]) {
    // strings 是一个包含模板字符串静态部分的数组
    // values 是模板字符串中插入的表达式的值
    // 在这里可以添加自定义的逻辑来处理字符串和值
    let result = '';
    // 可以遍历 strings 数组和 values 数组来构建结果字符串
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            // 这里可以添加自定义的逻辑来处理每个值
            result += values[i];
        }
    }
    return normalizeClassName(result, true);
}

/** 将className中的负号前移 */
export function R2(strings: TemplateStringsArray, ...values: any[]) {
    // strings 是一个包含模板字符串静态部分的数组
    // values 是模板字符串中插入的表达式的值
    // 在这里可以添加自定义的逻辑来处理字符串和值
    let result = '';
    // 可以遍历 strings 数组和 values 数组来构建结果字符串
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            // 这里可以添加自定义的逻辑来处理每个值
            result += values[i];
        }
    }
    return normalizeClassName(result, false);
}