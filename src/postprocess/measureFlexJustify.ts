import * as _ from 'lodash';
import { allNumsEqual, numEq, numGt, numLte } from '../utils';
import {
    Direction,
    R,
    SizeSpec,
    VNode,
    getClassList,
    isFlexWrapLike,
    isGeneratedNode,
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
        numEq(startGap, endGap) ? 'center'
        : numLte(startGap, endGap) ? 'start'
        : 'end';

    function insertFlex1Node() {
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
        let flex1GapIndex: number;
        // TODO: 生成多个flex1

        if (justifySide === 'start' || justifySide === 'center') {
            const gapsWithSide = [...gaps, endGap];
            const maxGap = _.max(gapsWithSide)!;
            // 优先让后面的撑开
            flex1GapIndex = _.lastIndexOf(gapsWithSide, maxGap);
            if (flex1GapIndex === gaps.length || maxGap === 0) {
                // 撑开最后面的边距说明边距过大，不需要撑开
                return;
            }
        } else {
            const gapsWithSide = [startGap, ...gaps];
            const maxGap = _.max(gapsWithSide)!;
            // 优先让前面的撑开
            flex1GapIndex = _.indexOf(gapsWithSide, maxGap);
            if (flex1GapIndex === 0 || maxGap === 0) {
                // 撑开最前面的边距说明边距过大，不需要撑开
                return;
            } else {
                flex1GapIndex--;
            }
        }

        const sf = parent.direction === Direction.Row ? 'top' : 'left';
        const ef = parent.direction === Direction.Row ? 'bottom' : 'right';
        const spec1 = parent.direction === Direction.Row ? 'width' : 'height';
        const spec2 = parent.direction === Direction.Row ? 'height' : 'width';
        const pos = Math.round(parent.bounds[sf] + parent.bounds[ef] / 2);
        const [eefn, ssfn] = ranges[flex1GapIndex + 1];

        // 只有两个子节点，中间要不要撑开？
        if (
            // isGeneratedNode(parent) &&
            gaps.length === 1 &&
            (gaps[0] < children[0].bounds[spec1] || gaps[0] < children[1].bounds[spec1])
        ) {
            // 间距比两个元素都大才支持撑开
            return;
        }

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

        return true;
    }

    function sideJustify() {
        // 由内容自动撑开，则必须具有最小尺寸，否则flex1无效
        // TODO: 这种情况下，高度可能不够，到底是撑开间隙，还是撑开某个元素
        const isParentAutoMinSize =
            parent[justifySpec] === SizeSpec.Auto &&
            getClassList(parent).some(className => className.startsWith(`min-${justifySpec.slice(0, 1)}-`));
        const needEqualGaps = equalMiddleGaps && (children.length > 2 || isListContainer(parent));

        const needFlex1 =
            (parent[justifySpec] === SizeSpec.Constrained || isParentAutoMinSize) &&
            // 2个及以上元素才需要用flex1做弹性拉伸
            children.length >= 2 &&
            !needEqualGaps;

        let insertedFlex1 = false;
        if (needFlex1) {
            insertedFlex1 = !!insertFlex1Node();
        }

        if (insertedFlex1) {
            // 都flex1了，父节点什么都不用设置
        } else if (justifySide === 'center') {
            if (parent[justifySpec] === SizeSpec.Auto) {
                parent.classList.push(R`p${xy}-${startGap}`);
            } else {
                parent.classList.push('justify-center');
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

        if (insertedFlex1) {
            // flex1全部往左margin
            gaps.unshift(startGap);
            _.each(children, (child, i) => {
                child.classList.push(R`m${ss}-${gaps[i]}`);
            });
            children[children.length - 1].classList.push(R`m${ee}-${endGap}`);
        } else if (needEqualGaps) {
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

    // 中间间隔相等
    if (equalMiddleGaps) {
        const sameGap = gaps[0];
        if (
            !numEq(sameGap, 0) &&
            !numEq(startGap, 0) &&
            numEq(startGap, endGap) &&
            numEq(startGap * 2, sameGap) &&
            parent[justifySpec] !== SizeSpec.Auto
        ) {
            parent.classList.push('justify-around');
            return;
        } else if (
            !numEq(sameGap, 0) &&
            numGt(sameGap, startGap) &&
            numGt(sameGap, endGap) &&
            parent[justifySpec] !== SizeSpec.Auto
        ) {
            if (parent[justifySpec] === SizeSpec.Constrained && isGeneratedNode(parent)) {
                // 这种情况太常见了，很多导致问题
                // TODO: 还可以优化
            } else {
                parent.classList.push(R`justify-between p${ss}-${startGap} p${ee}-${endGap}`);
                return;
            }
        }
    }
    sideJustify();
}
