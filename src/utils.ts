import * as _ from 'lodash';

export function assert(condition: boolean, msg: string) {
    if (!condition) {
        throw new Error(msg);
    }
}

export function filterEmpty<T>(t: T | null | undefined): t is T {
    return !!t;
}

export function second<T>(x: [unknown, T]) {
    return x[1];
}

export function maxCountGroup<T>(grouped: _.Dictionary<T[]>) {
    return _.maxBy(_.toPairs(grouped), item => second(item).length)![0];
}
