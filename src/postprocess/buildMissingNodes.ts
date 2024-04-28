import * as _ from 'lodash';
import { debug, defaultConfig } from '../main/config';
import { groupWith } from '../utils';
import {
    Direction,
    VNode,
    getBorderWidth,
    getClassName,
    getNodeArea,
    isContainedWithin,
    isContainedWithinX,
    isContainedWithinY,
    isIntersectOverHalf,
    isOriginalGhostNode,
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
            const parentArea = getNodeArea(potentialParent);
            if (parentArea < minArea) {
                minArea = parentArea;
                bestParent = potentialParent;
            }
        }
    }
    return bestParent;
}

// TODO: 检查什么情况下需要用绝对定位，有时候用负的margin更好
function checkAttachPossible(node: VNode, potentialParent: VNode, nodeArea: number, parentArea: number) {
    if (parentArea <= nodeArea) {
        return false;
    }

    // x方向重叠，检查重叠宽度占父盒子比例，即x向插入深度, 深入超过一半，则认为是附着，不然用负的margin过多
    if (
        isContainedWithinY(node, potentialParent) &&
        isIntersectOverHalf(node, potentialParent, Direction.Row)
    ) {
        return true;
    }

    // y方向重叠，检查重叠高度占父盒子比例，即y向插入深度, 深入超过一半，则认为是附着，不然用负的margin过多
    if (
        isContainedWithinX(node, potentialParent) &&
        isIntersectOverHalf(node, potentialParent, Direction.Column)
    ) {
        return true;
    }

    return false;
}

function findBestIntersectNode(node: VNode, nodes: VNode[]) {
    let bestIntersectNode: VNode | null = null;
    let minArea = Infinity;
    const nodeArea = getNodeArea(node);
    /** 面积低于此数值的直接绝对定位 */
    const attachPassArea = 5000;
    for (const potentialParent of nodes) {
        if (potentialParent === node) continue;
        if (isOverlapping(node, potentialParent)) {
            const parentArea = getNodeArea(potentialParent);

            if (nodeArea > attachPassArea) {
                const allowAttach = checkAttachPossible(node, potentialParent, nodeArea, parentArea);
                if (!allowAttach) continue;
            }

            if (parentArea > nodeArea && parentArea < minArea) {
                minArea = parentArea;
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

    nodes = mergeSameSizeBox(nodes);

    // 去除无样式空盒子
    if (defaultConfig.treeOptions.removeGhostNodes) {
        nodes = removeGhostNodesPre(nodes);
    }

    // 剩下的节点都是直接子节点, 互不包含
    nodes = buildContainTree(nodes);

    // 剩下的节点都是直接子节点, 互不交叉
    nodes = buildAttachTree(parent, nodes);

    // 去除背景与父亲完全融合的中间盒子
    if (defaultConfig.treeOptions.removeGhostNodes) {
        nodes = removeGhostNodesPost(parent, nodes);
    }

    parent.children = nodes;
}

function mergeSameSizeBox(nodes: VNode[]) {
    // 先将互相包含的节点选一个父节点出来
    const grouped = groupWith(nodes, (a, b) => isContainedWithin(a, b) && isContainedWithin(b, a));
    return _.map(Array.from(grouped.values()), nodes => {
        const [node, ...leftover] = nodes;
        _.each(leftover, child => {
            console.debug('合并一样大的兄弟节点', node.id, child.id);
            mergeNode(node, child);
            node.children = _.concat(node.children, child.children);
        });
        return node;
    });
}

/** 寻找父节点，最小的包围盒子 */
function buildContainTree(nodes: VNode[]) {
    return nodes.filter(node => {
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
}

function buildAttachTree(parent: VNode, nodes: VNode[]) {
    return nodes.filter(node => {
        if (defaultConfig.treeOptions.attachNodes.includes(node.id!)) {
            parent.attachNodes.push(node);
            return false;
        }

        const bestIntersectNode = findBestIntersectNode(node, nodes);
        if (bestIntersectNode) {
            if (isTextNode(bestIntersectNode) && isTextNode(node)) {
                // 两个文本有重叠，一般是设计稿的误差
                return true;
            }

            bestIntersectNode.attachNodes.push(node);
            return false;
        } else if (maybeBorder(node, parent)) {
            // 过小的元素有可能是边框,做成绝对定位
            parent.attachNodes.push(node);
            return false;
        }

        return true;
    });
}

/** 删除幽灵节点，这些节点本身没样式 */
function removeGhostNodesPre(nodes: VNode[]) {
    return _.filter(nodes, n => {
        if (isOriginalGhostNode(n) && n.children.length === 0) {
            return false;
        }
        return true;
    });
}

/** 删除幽灵节点，这些节点本身背景跟父节点一样 */
function removeGhostNodesPost(parent: VNode, nodes: VNode[]) {
    // NOTE: 暂不考虑背景跟父节点一样却还跟其他节点有交叠的情况，那种表现很怪异，一半融合一半不融合
    // 一种情况例外，就是恰好它交叠的几个元素拼到一起给它兜住了

    function isGhostNode(vnode: VNode) {
        return !vnode.textContent && _.isEmpty(vnode.style);
    }

    if (!isGhostNode(parent)) {
        return nodes;
    }

    function getBgHSLA(n: VNode) {
        const bgHSLA = getClassName(n).match(/bg-\[hsla\((.+?)\)\]/);
        if (!bgHSLA) {
            return;
        }
        const hsla = bgHSLA[1];
        return hsla;
    }

    const parentBgHSLA = getBgHSLA(parent);
    if (!parentBgHSLA) {
        return nodes;
    }
    const alpha = _.last(parentBgHSLA.split(','))!;
    const isSemiTransparent = alpha.startsWith('0.');
    if (isSemiTransparent) {
        return nodes;
    }

    const parentBorderWidth = getBorderWidth(parent);
    function canBlendInParentBg(node: VNode) {
        // 节点刚好跟边框重叠
        if (
            node.bounds.top < parent.bounds.top + parentBorderWidth ||
            node.bounds.bottom > parent.bounds.bottom - parentBorderWidth ||
            node.bounds.left < parent.bounds.left + parentBorderWidth ||
            node.bounds.right > parent.bounds.right - parentBorderWidth
        ) {
            return false;
        }

        if (getBgHSLA(node) === parentBgHSLA) {
            // 再看边框是否能融合
            const borderHSLA = getClassName(node).match(/border-\[hsla\((.+?)\)\]/);
            if (!borderHSLA) {
                return true;
            } else {
                return borderHSLA[1] === parentBgHSLA;
            }
        } else {
            return false;
        }
    }

    function checkOverlapComboBg(nodes: VNode[], node: VNode) {
        // TODO
        return true;
    }

    const toRemove: VNode[] = nodes.slice();
    const toKeep: VNode[] = [];

    let found = false;
    while (toRemove.length) {
        const node = toRemove.pop()!;
        if (
            isGhostNode(node) &&
            canBlendInParentBg(node) &&
            checkOverlapComboBg(nodes, node) &&
            // 不能破坏原有层级
            (!debug.keepOriginalTree || _.every(node.children, child => _.includes(parent.children, child)))
        ) {
            console.debug('遇到背景和父亲一样的幽灵节点，删除', node.id);
            found = true;
            toRemove.push(...node.children);
        } else {
            toKeep.push(node);
        }
    }

    if (found) {
        // 重新安排父节点
        return buildAttachTree(parent, buildContainTree(toKeep));
    }
    return toKeep;
}
