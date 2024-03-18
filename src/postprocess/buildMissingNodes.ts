import * as _ from 'lodash';
import { defaultConfig } from '../config';
import { groupWith } from '../utils';
import {
    VNode,
    getIntersectionArea,
    isContainedWithin,
    isOverlapping,
    isTextNode,
    maybeBorder
} from '../vnode';
import { mergeNode } from './mergeNodes';

/** 寻找父节点，最小的包围盒子 */
function findBestParent(node: VNode, nodes: VNode[]) {
    let bestParent: VNode | null = null;
    let minArea = Infinity;
    for (const potentialParent of nodes) {
        if (potentialParent === node) continue;
        if (isContainedWithin(node, potentialParent)) {
            const area = potentialParent.bounds.width * potentialParent.bounds.height;
            if (area < minArea) {
                minArea = area;
                bestParent = potentialParent;
            }
        }
    }
    return bestParent;
}

function findBestIntersectNode(node: VNode, nodes: VNode[]) {
    let bestIntersectNode: VNode | null = null;
    let minArea = Infinity;
    const nodeArea = isTextNode(node) ? 100000000 : node.bounds.width * node.bounds.height;
    /** 面积低于此数值的直接绝对定位 */
    const attachPassArea = 5000;
    for (const potentialParent of nodes) {
        if (potentialParent === node) continue;
        if (isOverlapping(node, potentialParent)) {
            const area = potentialParent.bounds.width * potentialParent.bounds.height;

            if (nodeArea > attachPassArea) {
                const allowAttach =
                    area > nodeArea * 2 && getIntersectionArea(node, potentialParent) > nodeArea / 2;
                if (!allowAttach) continue;
            }

            if (area > nodeArea && area < minArea) {
                minArea = area;
                bestIntersectNode = potentialParent;
            }
        }
    }
    return bestIntersectNode;
}

/** 为每个节点找到最佳父节点，保证nodes互不相交 */
export function buildMissingNodes(parent: VNode) {
    let nodes = parent.children;
    if (!nodes.length) return;

    let [leafNodes, leftover] = _.partition(nodes, node => _.includes(defaultConfig.leafNodes, node.id!));

    if (leftover.length) {
        nodes = leftover;
    } else {
        leafNodes = [];
    }

    // 先将互相包含的节点选一个父节点出来
    const grouped = groupWith(nodes, (a, b) => isContainedWithin(a, b) && isContainedWithin(b, a));
    nodes = _.map(Array.from(grouped.values()), nodes => {
        const [node, ...leftover] = nodes;
        _.each(leftover, child => mergeNode(node, child));
        return node;
    });

    // 剩下的节点都是直接子节点, 互不包含
    nodes = nodes.filter(node => {
        const bestParent = findBestParent(node, nodes);
        if (bestParent) {
            if (isTextNode(bestParent)) {
                bestParent.attachNodes.push(node);
            } else {
                bestParent.children.push(node);
            }
            return false;
        } else {
            return true;
        }
    });

    nodes = nodes.concat(leafNodes);

    // 剩下的节点都是直接子节点, 互不交叉
    nodes = nodes.filter(node => {
        const bestIntersectNode = findBestIntersectNode(node, nodes);
        if (bestIntersectNode) {
            if (isTextNode(bestIntersectNode)) {
                //TODO: 文本节点有子节点？层级需要处理下，文本不能被遮住
            }

            (bestIntersectNode.attachNodes ??= []).push(node);
            return false;
        } else if (maybeBorder(node, parent)) {
            // 过小的元素有可能是边框,做成绝对定位
            (parent.attachNodes ??= []).push(node);
            return false;
        }

        return true;
    });

    parent.children = nodes;
}
