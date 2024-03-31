import * as _ from 'lodash';
import { Node } from './page';
import { VNode, context } from '../vnode';
import { getNodeArea, isContainedWithin, isImageNode, isOverlapping } from './helpers';
import { preprocess } from '.';

export function processSlice(node: Node, vnode: VNode, level: number) {
    // 目前先这样处理，有slice节点，则删掉其他兄弟节点
    const sliceChild = _.find(
        node.children,
        node => node.basic.type === 'shape' && node.basic.realType === 'Slice'
    );
    if (sliceChild) {
        let [slices, leftover] = _.partition(node.children, node => !!node.slice.bitmapURL);
        if (slices.length > 1) {
            console.warn('切图可能重复');
        }
        node.children = slices;
        leftover = _.filter(leftover, child => !isImageNode(child));

        // 去除跟切图有交叠的兄弟节点，但如果兄弟节点包含它，则不视为有交叠
        const isNodeInSlice = (n: Node) => {
            if (!isOverlapping(sliceChild, n)) {
                return false;
            }
            if (isContainedWithin(sliceChild, n) && getNodeArea(n) > getNodeArea(sliceChild) * 2) {
                return false;
            }
            return true;
        };
        const others = _.filter(leftover, n => !isNodeInSlice(n));
        console.debug(
            '保留切图的兄弟节点',
            others.map(child => child.basic.id + ',' + child.basic.type + ',' + child.basic.realType)
        );
        for (const other of others) {
            const n = preprocess(other, level + 1);
            if (n) {
                context.root.children.push(n);
            }
        }
        if (leftover.length) {
            console.debug(
                '删掉切图的兄弟节点',
                leftover.map(child => child.basic.type + ',' + child.basic.realType)
            );
        }
    }
}
