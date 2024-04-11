import * as _ from 'lodash';
import { BuildStage, debug } from '../main/config';
import { VNode } from '../vnode';
import { buildTree } from './build';
import { measureTree } from './measure';

/** 对节点树进行重建/重组/布局 */
export function postprocess(vnode: VNode) {
    if (debug.buildToStage >= BuildStage.Tree) {
        buildTree(vnode);
    }

    if (debug.buildToStage >= BuildStage.Measure) {
        measureTree(vnode);
    }
}
