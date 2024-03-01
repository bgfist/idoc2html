import pageJson from './demo.json'

function traverse(node, callback) {
    callback(node);
    if (node.children) {
        node.children.forEach(node => {
            traverse(node, callback);
        });
    }
}

/**
 * 根据pageJson生成页面dom树
 */
function traverseNode(n, container) {
    n.children.sort((n1, n2) => n1.top > n2.top);

    let background, color, fontSize, lineHeight

    if (n.basic.type === 'group') {
        if (n.fill.colors) {
            background = h;
        }
    } else if (n.basic.type === 'text') {

    } else if (n.slice.bitmapURL) {

    } else {
        console.log('未处理的节点', n);
    }

    return {
        marginLeft: n.bounds.left,
        marginRight: n.bounds.right,
        marginTop: n.bounds.top,
        children: n.children.map(traverseNode)
    }
}

function main() {
    traverseNode(pageJson);
}