import * as _ from 'lodash';
import { BuildStage, debug, defaultConfig } from '../main/config';
import { VNode, isOriginalGhostNode, isTextNode } from '../vnode';
import { buildTree } from './build';
import { measureTree } from './measure';

// TODO: 仍可优化
function ghostNodeCanUnwrap(vnode: VNode) {
    // 只有一个文本节点，则最好不要拆解这个幽灵节点，可能是用来对齐的
    if (vnode.children.length && _.every(vnode.children, isTextNode)) {
        return false;
    }
    return true;
}

/** 对节点树进行重建/重组/布局 */
export function postprocess(vnode: VNode) {
    if (!debug.keepOriginalTree) {
        function unwrapAllNodes(vnode: VNode) {
            const vnodes: VNode[] = [];
            const collectVNodes = (vnode: VNode) => {
                vnodes.push(vnode);

                if (
                    defaultConfig.removeGhostNodes &&
                    isOriginalGhostNode(vnode) &&
                    !ghostNodeCanUnwrap(vnode)
                ) {
                    // 这一层不能拆解，往下可以继续拆，只要都在这个盒子里就行
                    vnode.children = unwrapAllNodes(vnode);
                    return;
                }

                _.each(vnode.children, collectVNodes);
                vnode.children = [];
            };
            _.each(vnode.children, collectVNodes);
            return vnodes;
        }

        vnode.children = unwrapAllNodes(vnode);
    }

    if (debug.buildToStage >= BuildStage.Tree) {
        buildTree(vnode);
    }

    if (debug.buildToStage >= BuildStage.Measure) {
        measureTree(vnode);
    }
}
