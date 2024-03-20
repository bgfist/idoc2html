import * as _ from 'lodash';
import { allNumsEqual, numEq, numGt, numLte, removeEle } from '../utils';
import {
    Direction,
    R,
    SizeSpec,
    VNode,
    getClassList,
    isFlexWrapLike,
    isListContainer,
    newVNode
} from '../vnode';

/** 生成justify-content */
export function measureFlexJustify(parent: VNode) {
    const children = parent.children;

    const ssf = parent.direction === Direction.Row ? 'left' : 'top';
    const eef = parent.direction === Direction.Row ? 'right' : 'bottom';
    const ss = ssf[0];
    const ee = eef[0];
    const xy = parent.direction === Direction.Row ? 'x' : 'y';
    const justifySpec = parent.direction === Direction.Row ? 'widthSpec' : 'heightSpec';

    // 根据children在node中的位置计算flex主轴布局
    const ranges = _.zip(
        [...children.map(n => n.bounds[ssf]), parent.bounds[eef]],
        [parent.bounds[ssf], ...children.map(n => n.bounds[eef])]
    ) as [number, number][];
    const gaps = ranges.map(([p, n]) => p - n);
    const startGap = gaps.shift()!;
    const endGap = gaps.pop()!;
    const equalMiddleGaps = allNumsEqual(gaps);
    let justifySide =
        numEq(startGap, endGap) && !numEq(startGap, 0) ? 'center'
        : numLte(startGap, endGap) ? 'start'
        : 'end';

    function maybeInsertFlex1() {
        if (parent[justifySpec] === SizeSpec.Auto) {
            if (
                !getClassList(parent).some(className =>
                    className.startsWith(`min-${justifySpec.slice(0, 1)}-`)
                )
            ) {
                // 由内容自动撑开，则必须具有最小尺寸，否则flex1无效
                return;
            }
        } else if (parent[justifySpec] !== SizeSpec.Constrained) {
            // 只有constrained才需要撑开
            return;
        }

        if (gaps.length < 2) {
            // 2个及以上元素才需要用flex1做弹性拉伸
            return;
        }

        if (equalMiddleGaps) {
            // 间距相等的不需要撑开
            return;
        }

        let flex1MinSize = parent[justifySpec] === SizeSpec.Auto;

        // 居中布局的话，除非中间有特别大的间距超过两侧的间距，才需要撑开
        if (justifySide === 'center') {
            if (numGt(_.max(gaps)!, startGap * 2)) {
                // 为了保持居中，也得给个最小尺寸
                flex1MinSize = true;
            } else {
                return;
            }
        }

        // 可以通过flex1实现和stretch类似的效果
        const flex1GapIndex = (() => {
            // TODO: 生成多个flex1
            const maxGap = _.max(gaps)!;
            // 优先让后面的撑开
            return _.lastIndexOf(gaps, maxGap);
        })();

        const sf = parent.direction === Direction.Row ? 'top' : 'left';
        const ef = parent.direction === Direction.Row ? 'bottom' : 'right';
        const spec1 = parent.direction === Direction.Row ? 'width' : 'height';
        const spec2 = parent.direction === Direction.Row ? 'height' : 'width';
        const pos = Math.round(parent.bounds[sf] + parent.bounds[ef] / 2);
        const [eefn, ssfn] = ranges[flex1GapIndex + 1];

        const flex1Vnode = newVNode({
            bounds: {
                [sf]: pos,
                [ef]: pos,
                [ssf]: ssfn,
                [eef]: eefn,
                [spec1]: eefn - ssfn,
                [spec2]: 0
            } as any,
            classList: [],
            [`${spec1}Spec`]: SizeSpec.Constrained,
            [`${spec2}Spec`]: SizeSpec.Fixed
        });
        if (flex1MinSize) {
            flex1Vnode.classList.push(R`min-${spec1.slice(0, 1)}-${flex1Vnode.bounds[spec1]}`);
        }

        // 将flex1元素的左右gap设为0
        gaps.splice(flex1GapIndex, 1, 0, 0);
        // 插入flex1元素
        children.splice(flex1GapIndex + 1, 0, flex1Vnode);
    }

    function sideJustify() {
        maybeInsertFlex1();

        if (justifySide === 'center') {
            parent.classList.push('justify-center');
            if (parent[justifySpec] === SizeSpec.Auto) {
                parent.classList.push(R`p${xy}-${startGap}`);
            }
        } else if (justifySide === 'start') {
            if (parent[justifySpec] === SizeSpec.Auto) {
                parent.classList.push(R`p${ee}-${endGap}`);
            }
        } else if (justifySide === 'end') {
            parent.classList.push('justify-end');
            if (parent[justifySpec] === SizeSpec.Auto) {
                parent.classList.push(R`p${ss}-${startGap}`);
            }
        }

        if (equalMiddleGaps && (children.length > 2 || isListContainer(parent))) {
            parent.classList.push(R`space-${xy}-${gaps[0]}`);

            if (justifySide === 'start') {
                parent.classList.push(R`p${ss}-${startGap}`);
            } else if (justifySide === 'end') {
                parent.classList.push(R`p${ee}-${endGap}`);
            }
        } else {
            if (justifySide === 'center') {
                _.each(children.slice(1), (child, i) => {
                    child.classList.push(R`m${ss}-${gaps[i]}`);
                });
            } else if (justifySide === 'start') {
                gaps.unshift(startGap);
                _.each(children, (child, i) => {
                    child.classList.push(R`m${ss}-${gaps[i]}`);
                });
            } else if (justifySide === 'end') {
                gaps.push(endGap);
                _.each(children, (child, i) => {
                    child.classList.push(R`m${ee}-${gaps[i]}`);
                });
            }
        }

        // 对所有灵活伸缩的元素设置flex1
        _.each(children, child => {
            if (child[justifySpec] === SizeSpec.Constrained) {
                child.classList.push('flex-1');
            }
        });
    }

    if (justifySpec === 'widthSpec' && parent[justifySpec] === SizeSpec.Auto) {
        // 对多行元素需要设置固定尺寸
        _.each(children, child => {
            if (isFlexWrapLike(child) && child[justifySpec] === SizeSpec.Auto) {
                child[justifySpec] = SizeSpec.Fixed;
            }
        });
    }

    // 已经在扩充auto元素尺寸时指定过了
    parent.classList = getClassList(parent);
    const specifiedSide = parent.classList.find(className => className.startsWith('justify-'));
    if (specifiedSide) {
        // if (specifiedSide === 'justify-center' && numEq(startGap, 0)) {
        //     console.warn('父容器指定我居中显示，但实际我需要justify-between');
        //     removeEle(parent.classList, specifiedSide);
        // } else {
        removeEle(parent.classList, specifiedSide);
        justifySide = specifiedSide.split('justify-')[1];
        sideJustify();
        return;
        // }
    }

    if (parent[justifySpec] === SizeSpec.Auto) {
        sideJustify();
    }
    // 一个子元素, 或者子元素之间紧挨在一起视同为一个元素
    else if (!gaps.length || (equalMiddleGaps && numEq(gaps[0], 0))) {
        // TODO: 单行居中，多行居左?
        // children.length === 1 && justifySpec === 'widthSpec' && isFlexWrapLike(children[0])
        sideJustify();
    }
    // 中间间隔相等
    else if (equalMiddleGaps) {
        const sameGap = gaps[0];

        if (numEq(startGap, endGap) && numEq(startGap * 2, gaps[0]) && !numEq(startGap, 0)) {
            parent.classList.push('justify-around');
        } else if (numGt(sameGap, startGap) && numGt(sameGap, endGap)) {
            parent.classList.push(R`justify-between p${ss}-${startGap} p${ee}-${endGap}`);
        } else {
            sideJustify();
        }
    } else {
        sideJustify();
    }
}
